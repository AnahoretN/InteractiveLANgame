/**
 * Team Status Manager
 *
 * A comprehensive system for managing team states during gameplay.
 * Replaces the scattered team state logic across GamePlay, ScreenView, and useTeamStates.
 *
 * ## Team Statuses
 *
 * 1. INACTIVE (Gray) - Default state, cannot buzz
 * 2. ACTIVE (Yellow) - Eligible to buzz, can become Answering
 * 3. ANSWERING (Green, 15% scaled) - Currently answering, only one team at a time
 * 4. PENALTY (Red) - Answered incorrectly, cannot answer this question
 *
 * ## Status Transitions
 *
 * INACTIVE -> ACTIVE: When green timer starts, or manual LMB click
 * INACTIVE -> ANSWERING: Manual LMB click (bypasses ACTIVE)
 * ACTIVE -> ANSWERING: First valid buzz, or manual LMB click
 * ACTIVE -> INACTIVE: When green timer expires
 * ANSWERING -> INACTIVE: Correct button, or manual LMB click (if timer inactive)
 * ANSWERING -> PENALTY: Incorrect button
 * PENALTY -> INACTIVE: Manual LMB click, or question closes
 *
 * ## Reset Conditions
 *
 * All teams -> INACTIVE when:
 * - Answer is revealed in question window
 * - Host opens lobby, pack cover, or round cover page
 * - Question window closes
 */

import { useState, useCallback, useRef, useEffect } from 'react';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Clash sub-status types
 */
export enum ClashSubStatus {
  /** First team to press in the simultaneous window */
  FIRST_CLASH = 'first_clash',
  /** Other teams that pressed within the simultaneous window */
  SIMPLE_CLASH = 'simple_clash',
}

/**
 * The possible states for a team during gameplay
 */
export enum TeamStatus {
  /** Default state - team cannot buzz, gray card */
  INACTIVE = 'inactive',
  /** Team can buzz to become answering - yellow card */
  ACTIVE = 'active',
  /** Team is currently answering - green card, scaled 15% */
  ANSWERING = 'answering',
  /** Team answered incorrectly - red card, cannot buzz this question */
  PENALTY = 'penalty',
  /** Team is in clash phase (animating to determine who gets to answer) */
  CLASH = 'clash',
}

/**
 * Per-team state tracking
 */
export interface TeamState {
  /** Current status of the team */
  status: TeamStatus;
  /** Previous status before becoming ANSWERING (for manual revert) */
  previousStatus: TeamStatus;
  /** Whether this team has attempted to answer this question */
  hasAttempted: boolean;
  /** Timestamp when this status was applied */
  statusSince: number;
  /** For CLASH status: whether this team was first or subsequent in the clash */
  clashSubStatus?: ClashSubStatus;
  /** For FIRST_CLASH: whether this team has already been first clash this question */
  hasBeenFirstClash?: boolean;
}

/**
 * Overall game state affecting team statuses
 */
export interface TeamGameState {
  /** Whether the green response timer is currently active */
  isResponseTimerActive: boolean;
  /** Whether a question is currently open */
  isQuestionOpen: boolean;
  /** Whether the answer is currently revealed */
  isAnswerRevealed: boolean;
  /** Current screen being displayed */
  currentScreen: string;
}

/**
 * Configuration for the team status manager
 */
export interface TeamStatusManagerConfig {
  /** All team IDs in the game */
  teamIds: string[];
  /** Callback when team states change */
  onTeamStatesChange?: (states: Map<string, TeamState>) => void;
  /** Callback when answering team changes */
  onAnsweringTeamChange?: (teamId: string | null) => void;
  /** Whether simultaneous buzz detection is enabled */
  simultaneousBuzzEnabled?: boolean;
  /** Time window for simultaneous buzz detection (seconds) */
  simultaneousBuzzThreshold?: number;
}

/**
 * Return value for useTeamStatusManager hook
 */
export interface UseTeamStatusManagerReturn {
  /** Current state for each team */
  teamStates: Map<string, TeamState>;
  /** IDs of teams currently in ACTIVE status (memoized - only updates when actual set changes) */
  activeTeamIds: Set<string>;
  /** Get the status of a specific team */
  getTeamStatus: (teamId: string) => TeamStatus;
  /** Check if a team is in a specific status */
  isTeamStatus: (teamId: string, status: TeamStatus) => boolean;
  /** Get the current answering team ID */
  getAnsweringTeam: () => string | null;
  /** Check if response timer is currently active */
  isResponseTimerActive: () => boolean;

  /** Set a team's status with validation */
  setTeamStatus: (teamId: string, status: TeamStatus) => void;
  /** Force set a team's status without validation (for host manual override) */
  forceSetTeamStatus: (teamId: string, status: TeamStatus) => void;
  /** Set multiple teams' statuses at once */
  setMultipleTeamStatuses: (updates: Map<string, TeamStatus>) => void;

  /** Handle a buzz from a team */
  handleTeamBuzz: (teamId: string) => boolean;
  /** Handle Correct button click */
  handleCorrectAnswer: () => void;
  /** Handle Incorrect button click */
  handleIncorrectAnswer: () => void;

  /** Reset all teams to INACTIVE */
  resetAllTeams: () => void;
  /** Reset team states when question opens */
  resetForNewQuestion: () => void;

  /** Update game state (timer, question state, etc.) */
  updateGameState: (gameState: Partial<TeamGameState>) => void;

  /** Get CSS classes for a team card based on status */
  getTeamCardClasses: (teamId: string) => string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get the default team state (INACTIVE)
 */
function getDefaultTeamState(): TeamState {
  return {
    status: TeamStatus.INACTIVE,
    previousStatus: TeamStatus.INACTIVE,
    hasAttempted: false,
    statusSince: Date.now(),
  };
}

/**
 * Check if a status transition is valid
 */
function isValidTransition(
  fromStatus: TeamStatus,
  toStatus: TeamStatus,
  gameState: TeamGameState
): boolean {
  // INACTIVE can go to ACTIVE, ANSWERING (manual), or CLASH (simultaneous buzz)
  if (fromStatus === TeamStatus.INACTIVE) {
    return toStatus === TeamStatus.ACTIVE || toStatus === TeamStatus.ANSWERING || toStatus === TeamStatus.CLASH;
  }

  // ACTIVE can go to ANSWERING (buzz/manual), CLASH (simultaneous), or INACTIVE (timer expired)
  if (fromStatus === TeamStatus.ACTIVE) {
    return toStatus === TeamStatus.ANSWERING || toStatus === TeamStatus.CLASH || toStatus === TeamStatus.INACTIVE;
  }

  // CLASH can go to ANSWERING (won clash), INACTIVE (lost clash), or ACTIVE (if timer active)
  if (fromStatus === TeamStatus.CLASH) {
    return toStatus === TeamStatus.ANSWERING || toStatus === TeamStatus.INACTIVE || toStatus === TeamStatus.ACTIVE;
  }

  // ANSWERING can go to INACTIVE (correct/manual) or PENALTY (incorrect)
  if (fromStatus === TeamStatus.ANSWERING) {
    return toStatus === TeamStatus.INACTIVE || toStatus === TeamStatus.PENALTY;
  }

  // PENALTY can only go to INACTIVE (manual or question close)
  if (fromStatus === TeamStatus.PENALTY) {
    return toStatus === TeamStatus.INACTIVE;
  }

  return false;
}

/**
 * Get CSS classes for a team card based on status
 */
function getCardClassesForStatus(status: TeamStatus): string {
  switch (status) {
    case TeamStatus.INACTIVE:
      return 'bg-gray-100/40 border-gray-300 shadow-[0_0_10px_rgba(255,255,255,0.3)] transition-all';

    case TeamStatus.ACTIVE:
      return 'bg-yellow-500/30 border-yellow-400 shadow-[0_0_20px_rgba(234,179,8,0.6)] transition-all cursor-pointer hover:scale-105';

    case TeamStatus.ANSWERING:
      return 'bg-green-500/40 border-green-400 shadow-[0_0_20px_rgba(74,222,128,0.6)] scale-115 transition-all';

    case TeamStatus.PENALTY:
      return 'bg-red-500/30 border-red-400 shadow-[0_0_20px_rgba(239,68,68,0.5)] transition-all';

    case TeamStatus.CLASH:
      return 'clash-card border-yellow-400 shadow-[0_0_20px_rgba(234,179,8,0.6)] transition-all';

    default:
      return 'bg-gray-100/40 border-gray-300';
  }
}

// ============================================================================
// MAIN HOOK
// ============================================================================

/**
 * Hook for managing team statuses during gameplay
 *
 * @example
 * ```tsx
 * const teamStatusManager = useTeamStatusManager({
 *   teamIds: teams.map(t => t.id),
 *   onTeamStatesChange: (states) => {
 *     // Broadcast to demo screen
 *   },
 *   onAnsweringTeamChange: (teamId) => {
 *     // Update answering team state
 *   }
 * });
 *
 * // Handle buzz from client
 * teamStatusManager.handleTeamBuzz(clientTeamId);
 *
 * // Handle Correct button
 * teamStatusManager.handleCorrectAnswer();
 *
 * // Get card classes for rendering
 * const cardClasses = teamStatusManager.getTeamCardClasses(teamId);
 * ```
 */
export function useTeamStatusManager(
  config: TeamStatusManagerConfig
): UseTeamStatusManagerReturn {
  const { teamIds, onTeamStatesChange, onAnsweringTeamChange, simultaneousBuzzEnabled = true, simultaneousBuzzThreshold = 0.5 } = config;

  // Track state for each team
  const [teamStates, setTeamStates] = useState<Map<string, TeamState>>(() => {
    const initialStates = new Map<string, TeamState>();
    teamIds.forEach(id => {
      initialStates.set(id, getDefaultTeamState());
    });
    return initialStates;
  });

  // Track game state
  const gameStateRef = useRef<TeamGameState>({
    isResponseTimerActive: false,
    isQuestionOpen: false,
    isAnswerRevealed: false,
    currentScreen: 'cover',
  });

  // Track previous answering team for callbacks
  const prevAnsweringTeamRef = useRef<string | null>(null);

  // Track previous teamIds to detect actual changes (avoid infinite loop)
  const prevTeamIdsRef = useRef<string[]>([]);

  // Clash phase tracking
  const clashPhaseRef = useRef<'idle' | 'active' | 'resolving'>('idle');
  const firstClashTimestampRef = useRef<number | null>(null);
  const firstClashTeamIdRef = useRef<string | null>(null);
  const clashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track active team IDs (memoized - only updates when actual set changes)
  const [activeTeamIds, setActiveTeamIds] = useState<Set<string>>(new Set());
  const prevActiveTeamIdsRef = useRef<Set<string>>(new Set());

  // Sync teamIds when they change (add/remove teams)
  useEffect(() => {
    // Check if teamIds actually changed (by comparing sorted strings)
    const prevIdsStr = prevTeamIdsRef.current.slice().sort().join(',');
    const currIdsStr = teamIds.slice().sort().join(',');

    if (prevIdsStr === currIdsStr) {
      return; // No actual change, skip update
    }

    prevTeamIdsRef.current = [...teamIds];

    setTeamStates(prev => {
      const updated = new Map(prev);

      // Add new teams with default state
      teamIds.forEach(id => {
        if (!updated.has(id)) {
          updated.set(id, getDefaultTeamState());
        }
      });

      // Remove teams that no longer exist
      for (const id of updated.keys()) {
        if (!teamIds.includes(id)) {
          updated.delete(id);
        }
      }

      return updated;
    });
  }, [teamIds]);

  // Notify parent of answering team changes
  useEffect(() => {
    const currentAnswering = getAnsweringTeamFromStates(teamStates);
    if (currentAnswering !== prevAnsweringTeamRef.current) {
      console.log('[TeamStatusManager] Answering team changed:', {
        from: prevAnsweringTeamRef.current?.slice(0, 12),
        to: currentAnswering?.slice(0, 12)
      });
      prevAnsweringTeamRef.current = currentAnswering;
      onAnsweringTeamChange?.(currentAnswering);
    }
  }, [teamStates, onAnsweringTeamChange]);

  // Sync activeTeamIds when teamStates change (only when actual set changes)
  useEffect(() => {
    const newActiveTeamIds = new Set<string>();
    for (const [teamId, state] of teamStates.entries()) {
      if (state.status === TeamStatus.ACTIVE) {
        newActiveTeamIds.add(teamId);
      }
    }

    // Only update if the set actually changed
    const prevIds = Array.from(prevActiveTeamIdsRef.current).sort().join(',');
    const newIds = Array.from(newActiveTeamIds).sort().join(',');

    if (prevIds !== newIds) {
      prevActiveTeamIdsRef.current = newActiveTeamIds;
      setActiveTeamIds(newActiveTeamIds);
    }
  }, [teamStates]);

  /**
   * Get the current answering team from the states map
   */
  function getAnsweringTeamFromStates(states: Map<string, TeamState>): string | null {
    for (const [id, state] of states.entries()) {
      if (state.status === TeamStatus.ANSWERING) {
        return id;
      }
    }
    return null;
  }

  /**
   * Get all teams currently in CLASH status
   */
  function getClashTeams(states: Map<string, TeamState>): string[] {
    const clashTeams: string[] = [];
    for (const [id, state] of states.entries()) {
      if (state.status === TeamStatus.CLASH) {
        clashTeams.push(id);
      }
    }
    return clashTeams;
  }

  /**
   * Resolve clash phase - randomly pick winner among clash teams
   */
  const resolveClash = useCallback(() => {
    console.log('[TeamStatusManager] Resolving clash phase');
    clashPhaseRef.current = 'resolving';

    setTeamStates(prev => {
      const clashTeams = getClashTeams(prev);
      if (clashTeams.length === 0) {
        console.warn('[TeamStatusManager] No clash teams to resolve');
        clashPhaseRef.current = 'idle';
        firstClashTimestampRef.current = null;
        firstClashTeamIdRef.current = null;
        return prev;
      }

      // Randomly pick winner
      const winnerIndex = Math.floor(Math.random() * clashTeams.length);
      const winnerId = clashTeams[winnerIndex];
      const gameState = gameStateRef.current;

      console.log('[TeamStatusManager] Clash winner:', {
        winner: winnerId.slice(0, 12),
        totalTeams: clashTeams.length,
        isResponseTimerActive: gameState.isResponseTimerActive
      });

      const updated = new Map(prev);
      const fallbackStatus = gameState.isResponseTimerActive
        ? TeamStatus.ACTIVE
        : TeamStatus.INACTIVE;

      // Set winner to ANSWERING, others to fallback status
      for (const [id, state] of updated.entries()) {
        if (id === winnerId) {
          updated.set(id, {
            status: TeamStatus.ANSWERING,
            previousStatus: state.status,
            hasAttempted: true,
            statusSince: Date.now(),
          });
        } else if (state.status === TeamStatus.CLASH) {
          updated.set(id, {
            status: fallbackStatus,
            previousStatus: TeamStatus.CLASH,
            hasAttempted: state.hasAttempted,
            statusSince: Date.now(),
            clashSubStatus: undefined,
          });
        }
      }

      // Reset clash phase
      clashPhaseRef.current = 'idle';
      firstClashTimestampRef.current = null;
      firstClashTeamIdRef.current = null;

      return updated;
    });
  }, []);

  /**
   * Update a single team's status with optional validation
   * @param force - Skip transition validation (for host manual override via context menu)
   */
  const updateTeamStatus = useCallback((
    teamId: string,
    newStatus: TeamStatus,
    preservePrevious: boolean = false,
    force: boolean = false
  ) => {
    console.log(`[TeamStatusManager] updateTeamStatus called:`, {
      teamId: teamId.slice(0, 12),
      from: 'unknown',
      to: newStatus,
      isResponseTimerActive: gameStateRef.current.isResponseTimerActive
    });

    setTeamStates(prev => {
      const currentState = prev.get(teamId);
      if (!currentState) {
        console.warn(`[TeamStatusManager] Team not found: ${teamId.slice(0, 12)}`);
        return prev;
      }

      const gameState = gameStateRef.current;

      // Validate transition (skip if force is true)
      if (!force && !isValidTransition(currentState.status, newStatus, gameState)) {
        console.warn(`[TeamStatusManager] Invalid transition: ${currentState.status} -> ${newStatus} for team ${teamId.slice(0, 12)}`);
        return prev;
      }

      const logPrefix = force ? '[TeamStatusManager] FORCE' : '[TeamStatusManager]';
      console.log(`${logPrefix} Setting team ${teamId.slice(0, 12)} from ${currentState.status} to ${newStatus}`);

      // Update the target team's state
      const updated = new Map(prev);

      // Only one team can be ANSWERING at a time - only clear if forced (host manual action)
      if (newStatus === TeamStatus.ANSWERING && force) {
        let clearedAny = false;
        for (const [id, state] of updated.entries()) {
          if (id !== teamId && state.status === TeamStatus.ANSWERING) {
            // If response timer is active, make them ACTIVE, otherwise INACTIVE
            const fallbackStatus = gameState.isResponseTimerActive
              ? TeamStatus.ACTIVE
              : TeamStatus.INACTIVE;
            console.log(`[TeamStatusManager] Clearing ANSWERING from team ${id.slice(0, 12)} -> ${fallbackStatus}`);
            updated.set(id, {
              ...state,
              status: fallbackStatus,
              previousStatus: TeamStatus.ANSWERING,
            });
            clearedAny = true;
          }
        }
        if (clearedAny) {
          console.log(`[TeamStatusManager] Cleared existing answering team(s), isResponseTimerActive: ${gameState.isResponseTimerActive}`);
        }
      }
      updated.set(teamId, {
        status: newStatus,
        previousStatus: preservePrevious ? currentState.previousStatus : currentState.status,
        hasAttempted: currentState.hasAttempted || newStatus === TeamStatus.ANSWERING,
        statusSince: Date.now(),
      });

      return updated;
    });
  }, []);

  /**
   * Set a team's status (public API)
   */
  const setTeamStatus = useCallback((teamId: string, status: TeamStatus) => {
    updateTeamStatus(teamId, status);
  }, [updateTeamStatus]);

  /**
   * Force set a team's status without validation
   * Used by host via context menu for manual override
   */
  const forceSetTeamStatus = useCallback((teamId: string, status: TeamStatus) => {
    updateTeamStatus(teamId, status, false, true);
  }, [updateTeamStatus]);

  /**
   * Set multiple teams' statuses at once
   */
  const setMultipleTeamStatuses = useCallback((updates: Map<string, TeamStatus>) => {
    setTeamStates(prev => {
      const updated = new Map(prev);
      const gameState = gameStateRef.current;

      // First pass: validate all transitions and clear existing ANSWERING
      const answeringTeam = getAnsweringTeamFromStates(updated);
      const hasNewAnswering = Array.from(updates.values()).some(s => s === TeamStatus.ANSWERING);

      if (hasNewAnswering && answeringTeam) {
        const currentState = updated.get(answeringTeam);
        if (currentState) {
          // If response timer is active, make them ACTIVE, otherwise INACTIVE
          const fallbackStatus = gameState.isResponseTimerActive
            ? TeamStatus.ACTIVE
            : TeamStatus.INACTIVE;
          updated.set(answeringTeam, {
            ...currentState,
            status: fallbackStatus,
            previousStatus: TeamStatus.ANSWERING,
          });
        }
      }

      // Second pass: apply updates
      for (const [teamId, newStatus] of updates.entries()) {
        const currentState = updated.get(teamId);
        if (!currentState) continue;

        if (!isValidTransition(currentState.status, newStatus, gameState)) {
          console.warn(`[TeamStatusManager] Invalid transition: ${currentState.status} -> ${newStatus} for team ${teamId}`);
          continue;
        }

        updated.set(teamId, {
          status: newStatus,
          previousStatus: currentState.status,
          hasAttempted: currentState.hasAttempted || newStatus === TeamStatus.ANSWERING,
          statusSince: Date.now(),
        });
      }

      return updated;
    });
  }, []);

  /**
   * Get a team's current status
   */
  const getTeamStatus = useCallback((teamId: string): TeamStatus => {
    return teamStates.get(teamId)?.status ?? TeamStatus.INACTIVE;
  }, [teamStates]);

  /**
   * Check if a team is in a specific status
   */
  const isTeamStatus = useCallback((teamId: string, status: TeamStatus): boolean => {
    return getTeamStatus(teamId) === status;
  }, [getTeamStatus]);

  /**
   * Get the current answering team
   */
  const getAnsweringTeam = useCallback((): string | null => {
    const result = getAnsweringTeamFromStates(teamStates);
    console.log('[TeamStatusManager] getAnsweringTeam called:', {
      result: result?.slice(0, 12),
      allStates: Array.from(teamStates.entries()).map(([id, state]) => ({
        id: id.slice(0, 12),
        status: state.status
      }))
    });
    return result;
  }, [teamStates]);

  /**
   * Check if response timer is currently active
   */
  const isResponseTimerActive = useCallback((): boolean => {
    return gameStateRef.current.isResponseTimerActive;
  }, []);

  /**
   * Handle a buzz from a team
   * Returns true if the buzz was accepted (team became ANSWERING or CLASH)
   */
  const handleTeamBuzz = useCallback((teamId: string): boolean => {
    const currentState = teamStates.get(teamId);
    if (!currentState) return false;

    const gameState = gameStateRef.current;

    // Can only buzz if ACTIVE and response timer is active
    if (currentState.status !== TeamStatus.ACTIVE) {
      console.log(`[TeamStatusManager] Team ${teamId} cannot buzz - not ACTIVE (status: ${currentState.status})`);
      return false;
    }

    if (!gameState.isResponseTimerActive) {
      console.log(`[TeamStatusManager] Team ${teamId} cannot buzz - response timer not active`);
      return false;
    }

    // Check if there's already an answering team - buzz cannot replace it
    const existingAnswering = getAnsweringTeamFromStates(teamStates);
    if (existingAnswering) {
      console.log(`[TeamStatusManager] Team ${teamId} cannot buzz - team ${existingAnswering.slice(0, 12)} is already answering`);
      return false;
    }

    const now = Date.now();
    const currentPhase = clashPhaseRef.current;
    const firstTimestamp = firstClashTimestampRef.current;
    const firstTeamId = firstClashTeamIdRef.current;

    // SIMULTANEOUS BUZZ LOGIC
    if (simultaneousBuzzEnabled && simultaneousBuzzThreshold > 0) {
      if (currentPhase === 'idle') {
        // FIRST BUZZ - Start clash phase
        console.log('[TeamStatusManager] FIRST BUZZ - Starting clash phase');
        clashPhaseRef.current = 'active';
        firstClashTimestampRef.current = now;
        firstClashTeamIdRef.current = teamId;

        // Set team to CLASH with FIRST_CLASH substatus
        setTeamStates(prev => {
          const updated = new Map(prev);
          const teamState = updated.get(teamId);
          if (teamState) {
            updated.set(teamId, {
              ...teamState,
              status: TeamStatus.CLASH,
              previousStatus: teamState.status,
              hasAttempted: true,
              statusSince: now,
              clashSubStatus: ClashSubStatus.FIRST_CLASH,
              hasBeenFirstClash: true,
            });
          }
          return updated;
        });

        // Start clash timer
        if (clashTimerRef.current) {
          clearTimeout(clashTimerRef.current);
        }
        clashTimerRef.current = setTimeout(() => {
          resolveClash();
        }, simultaneousBuzzThreshold * 1000);

        return true;
      } else if (currentPhase === 'active' && firstTimestamp !== null) {
        // Check if within simultaneous window
        const timeSinceFirst = now - firstTimestamp;
        if (timeSinceFirst <= simultaneousBuzzThreshold * 1000) {
          // Within window - add to clash
          console.log('[TeamStatusManager] BUZZ within clash window - Adding to clash');
          setTeamStates(prev => {
            const updated = new Map(prev);
            const teamState = updated.get(teamId);
            if (teamState) {
              updated.set(teamId, {
                ...teamState,
                status: TeamStatus.CLASH,
                previousStatus: teamState.status,
                hasAttempted: true,
                statusSince: now,
                clashSubStatus: ClashSubStatus.SIMPLE_CLASH,
              });
            }
            return updated;
          });
          return true;
        } else {
          // Window expired - resolve clash first, then handle this buzz
          resolveClash();
          // This buzz will be handled in next cycle
          return false;
        }
      }
    }

    // NORMAL BUZZ (no simultaneous mode or clash phase inactive)
    updateTeamStatus(teamId, TeamStatus.ANSWERING);
    return true;
  }, [teamStates, updateTeamStatus, simultaneousBuzzEnabled, simultaneousBuzzThreshold, resolveClash]);

  /**
   * Handle Correct button click
   * - Award points to answering team (handled by caller)
   * - Reveal answer
   * - Reset all teams to INACTIVE
   */
  const handleCorrectAnswer = useCallback(() => {
    const answeringTeam = getAnsweringTeamFromStates(teamStates);

    if (answeringTeam) {
      console.log(`[TeamStatusManager] Correct answer by team ${answeringTeam}`);
    }

    // Reset all teams to INACTIVE
    setTeamStates(prev => {
      const updated = new Map<string, TeamState>();
      for (const [id, state] of prev.entries()) {
        updated.set(id, {
          ...getDefaultTeamState(),
          hasAttempted: state.hasAttempted, // Preserve attempted flag
        });
      }
      return updated;
    });

    // Mark answer as revealed
    gameStateRef.current.isAnswerRevealed = true;
  }, [teamStates]);

  /**
   * Handle Incorrect button click
   * - Deduct points from answering team (handled by caller)
   * - Set answering team to PENALTY
   * - Clear answering team
   * - Other ACTIVE teams can still buzz
   */
  const handleIncorrectAnswer = useCallback(() => {
    const answeringTeam = getAnsweringTeamFromStates(teamStates);

    if (!answeringTeam) {
      console.warn('[TeamStatusManager] No answering team for incorrect answer');
      return;
    }

    console.log(`[TeamStatusManager] Incorrect answer by team ${answeringTeam}`);

    // Set answering team to PENALTY
    setTeamStates(prev => {
      const updated = new Map(prev);
      const currentState = updated.get(answeringTeam);

      if (currentState) {
        updated.set(answeringTeam, {
          status: TeamStatus.PENALTY,
          previousStatus: currentState.previousStatus,
          hasAttempted: true,
          statusSince: Date.now(),
        });
      }

      return updated;
    });
  }, [teamStates]);

  /**
   * Reset all teams to INACTIVE
   */
  const resetAllTeams = useCallback(() => {
    console.log('[TeamStatusManager] Resetting all teams to INACTIVE');

    // Clear clash phase
    if (clashTimerRef.current) {
      clearTimeout(clashTimerRef.current);
      clashTimerRef.current = null;
    }
    clashPhaseRef.current = 'idle';
    firstClashTimestampRef.current = null;
    firstClashTeamIdRef.current = null;

    // Reset response timer flag to allow re-activation on next question
    gameStateRef.current.isResponseTimerActive = false;

    setTeamStates(prev => {
      const updated = new Map<string, TeamState>();
      for (const [id] of prev.entries()) {
        updated.set(id, getDefaultTeamState());
      }
      return updated;
    });
  }, []);

  /**
   * Reset team states when a new question opens
   */
  const resetForNewQuestion = useCallback(() => {
    console.log('[TeamStatusManager] Resetting for new question');
    gameStateRef.current.isAnswerRevealed = false;
    gameStateRef.current.isResponseTimerActive = false; // Reset for proper re-activation
    // Immediately deactivate ALL teams to ensure they're INACTIVE for new question
    // This works even if isResponseTimerActive is already false
    setTeamStates(prev => {
      const updated = new Map(prev);
      let deactivatedCount = 0;
      for (const [id, state] of updated.entries()) {
        if (state.status !== TeamStatus.INACTIVE) {
          updated.set(id, {
            ...state,
            status: TeamStatus.INACTIVE,
            statusSince: Date.now(),
          });
          deactivatedCount++;
        }
      }
      if (deactivatedCount > 0) {
        console.log(`[TeamStatusManager] resetForNewQuestion - Deactivated ${deactivatedCount} teams`);
      }
      return updated;
    });
  }, []);

  /**
   * Update game state (timer, question state, etc.)
   */
  const updateGameState = useCallback((updates: Partial<TeamGameState>) => {
    const previousState = { ...gameStateRef.current };
    gameStateRef.current = { ...gameStateRef.current, ...updates };

    console.log('[TeamStatusManager] updateGameState called:', {
      'updates.isResponseTimerActive': updates.isResponseTimerActive,
      'previousState.isResponseTimerActive': previousState.isResponseTimerActive,
      'current.isResponseTimerActive': gameStateRef.current.isResponseTimerActive,
      'typeof updates.isResponseTimerActive': typeof updates.isResponseTimerActive,
      'updates keys': Object.keys(updates),
    });

    // Handle response timer activation
    // Activate teams when isResponseTimerActive is true and teams are in INACTIVE status
    // Check the CURRENT state after update, not just what was in the updates object
    const isNowActive = gameStateRef.current.isResponseTimerActive;
    const wasActive = previousState.isResponseTimerActive;

    if (isNowActive && !wasActive) {
      // Response timer started - activate all non-PENALTY, non-ANSWERING teams
      console.log('[TeamStatusManager] Response timer active - activating teams');
      setTeamStates(prev => {
        let activatedCount = 0;
        const statusesBefore = Array.from(prev.entries()).map(([id, s]) => `${id.slice(0,8)}:${s.status}`);
        console.log('[TeamStatusManager] Team statuses before activation:', statusesBefore);
        const updated = new Map(prev);
        for (const [id, state] of updated.entries()) {
          // Activate all INACTIVE teams (even if they attempted before)
          // Skip PENALTY and ANSWERING teams
          if (state.status === TeamStatus.INACTIVE) {
            updated.set(id, {
              ...state,
              status: TeamStatus.ACTIVE,
              statusSince: Date.now(),
            });
            activatedCount++;
          }
        }
        const statusesAfter = Array.from(updated.entries()).map(([id, s]) => `${id.slice(0,8)}:${s.status}`);
        console.log(`[TeamStatusManager] Activated ${activatedCount} teams. Statuses after:`, statusesAfter);
        return updated;
      });
    } else if (!isNowActive && wasActive) {
      // Deactivate when transitioning from active to inactive
      console.log('[TeamStatusManager] Response timer deactivated - deactivating teams');
      setTeamStates(prev => {
        const updated = new Map(prev);
        let deactivatedCount = 0;
        for (const [id, state] of updated.entries()) {
          if (state.status === TeamStatus.ACTIVE) {
            updated.set(id, {
              ...state,
              status: TeamStatus.INACTIVE,
              statusSince: Date.now(),
            });
            deactivatedCount++;
          }
        }
        if (deactivatedCount > 0) {
          console.log(`[TeamStatusManager] Deactivated ${deactivatedCount} teams`);
        }
        return updated;
      });
    } else {
      console.log('[TeamStatusManager] updateGameState - no activation/deactivation needed');
    }

    // Handle screen transitions that reset teams
    const resetScreens = ['cover', 'themes', 'round', 'lobby'];
    if (updates.currentScreen && resetScreens.includes(updates.currentScreen)) {
      if (!resetScreens.includes(previousState.currentScreen)) {
        console.log(`[TeamStatusManager] Screen changed to ${updates.currentScreen} - resetting teams`);
        resetAllTeams();
      }
    }

    // Handle answer reveal
    if (updates.isAnswerRevealed && !previousState.isAnswerRevealed) {
      console.log('[TeamStatusManager] Answer revealed - resetting teams');
      resetAllTeams();
    }
  }, [resetAllTeams]);

  /**
   * Get CSS classes for a team card based on status
   */
  const getTeamCardClasses = useCallback((teamId: string): string => {
    const status = getTeamStatus(teamId);
    let classes = getCardClassesForStatus(status);

    // For CLASH status, set animation duration based on simultaneous buzz threshold
    if (status === TeamStatus.CLASH && simultaneousBuzzThreshold > 0) {
      const duration = simultaneousBuzzThreshold.toFixed(2);
      classes = `clash-card [--clash-duration:${duration}s]`;
    }

    return classes;
  }, [getTeamStatus, simultaneousBuzzThreshold]);

  // Use a ref to track the callback and avoid triggering on callback change
  const onTeamStatesChangeRef = useRef(onTeamStatesChange);
  onTeamStatesChangeRef.current = onTeamStatesChange;

  // Notify parent of state changes
  useEffect(() => {
    onTeamStatesChangeRef.current?.(teamStates);
  }, [teamStates]);

  // Cleanup clash timer on unmount
  useEffect(() => {
    return () => {
      if (clashTimerRef.current) {
        clearTimeout(clashTimerRef.current);
      }
    };
  }, []);

  return {
    teamStates,
    activeTeamIds,
    getTeamStatus,
    isTeamStatus,
    getAnsweringTeam,
    isResponseTimerActive,
    setTeamStatus,
    forceSetTeamStatus,
    setMultipleTeamStatuses,
    handleTeamBuzz,
    handleCorrectAnswer,
    handleIncorrectAnswer,
    resetAllTeams,
    resetForNewQuestion,
    updateGameState,
    getTeamCardClasses,
  };
}

// ============================================================================
// CONTEXT MENU HOOK
// ============================================================================

/**
 * Hook for managing the right-click context menu for team cards
 */
export interface UseTeamContextMenuReturn {
  /** Whether context menu is visible */
  isContextMenuVisible: boolean;
  /** Position of context menu */
  contextMenuPosition: { x: number; y: number } | null;
  /** Team ID that context menu is for */
  contextMenuTeamId: string | null;
  /** Show context menu for a team */
  showContextMenu: (teamId: string, x: number, y: number) => void;
  /** Hide context menu */
  hideContextMenu: () => void;
  /** Handle selecting a status from context menu */
  handleContextStatusSelect: (status: TeamStatus) => void;
}

export function useTeamContextMenu(
  teamStatusManager: UseTeamStatusManagerReturn
): UseTeamContextMenuReturn {
  const [isContextMenuVisible, setIsContextMenuVisible] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [contextMenuTeamId, setContextMenuTeamId] = useState<string | null>(null);

  const showContextMenu = useCallback((teamId: string, x: number, y: number) => {
    setContextMenuTeamId(teamId);
    setContextMenuPosition({ x, y });
    setIsContextMenuVisible(true);
  }, []);

  const hideContextMenu = useCallback(() => {
    setIsContextMenuVisible(false);
    setContextMenuPosition(null);
    setContextMenuTeamId(null);
  }, []);

  const handleContextStatusSelect = useCallback((status: TeamStatus) => {
    if (contextMenuTeamId) {
      // Use forceSetTeamStatus to bypass validation - host has full control via context menu
      teamStatusManager.forceSetTeamStatus(contextMenuTeamId, status);
    }
    hideContextMenu();
  }, [contextMenuTeamId, teamStatusManager, hideContextMenu]);

  return {
    isContextMenuVisible,
    contextMenuPosition,
    contextMenuTeamId,
    showContextMenu,
    hideContextMenu,
    handleContextStatusSelect,
  };
}
