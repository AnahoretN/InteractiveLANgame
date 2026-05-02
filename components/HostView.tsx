import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from './Button';
import { Smartphone, ArrowRight, Settings, Users, Activity, Copy, RefreshCw, Plus, Check, Crown, Monitor } from 'lucide-react';
import { Team, P2PSMessage, BuzzEventMessage, MessageCategory, BroadcastMessage, TeamsSyncMessage, CommandsListMessage, GetCommandsMessage } from '../types';
import { useSessionSettings } from '../hooks/useSessionSettings';
import { useP2PHost } from '../hooks/useP2PHost';
import { useHostModals } from '../hooks/useHostModals';
import { HostModals } from './host';
import type { GamePack, GameType } from './host/OptimizedGameSelectorModal';
import type { Round, Theme, RoundType } from './host/PackEditor';
import { TeamListItem, SimpleClientItem, NoTeamSection, ConnectedClient } from './host/OptimizedListItems';
import { storage, STORAGE_KEYS, generateHostUniqueId } from '../hooks/useLocalStorage';
import { useSyncEffects } from '../hooks/useSyncEffects';
import { generateUUID, getHealthBgColor } from '../utils';
import { DraggableQRCode } from './shared/DraggableQRCode';
import { GameSession } from './host/GameSession';
import { preloadCriticalComponents } from '../utils/lazyLoad';

// Helper function to get raw string from localStorage without JSON parsing
function getRawStorageValue(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export const HostView: React.FC = () => {
  const [hostId, setHostId] = useState<string>(() => {
    const saved = storage.get(STORAGE_KEYS.HOST_ID);
    return saved || 'host_' + Math.random().toString(36).substring(2, 10);
  });

  // Session ID (5 random chars) - displayed in lobby
  const [sessionId, setSessionId] = useState<string>(() => {
    const saved = storage.get<string>(STORAGE_KEYS.HOST_UNIQUE_ID);
    if (saved) {
      return saved.substring(0, 5);
    }
    const newId = generateHostUniqueId().substring(0, 5);
    storage.set(STORAGE_KEYS.HOST_UNIQUE_ID, newId);
    return newId;
  });

  // Host unique ID (12 chars) - used for client data binding
  const [hostUniqueId, setHostUniqueId] = useState<string>(() => {
    const saved = storage.get<string>(STORAGE_KEYS.HOST_UNIQUE_ID);
    return saved || generateHostUniqueId();
  });

  const [isSessionActive, setIsSessionActive] = useState<boolean>(false);
  // Ref to always have current value in callbacks without dependency issues
  const isSessionActiveRef = useRef<boolean>(false);
  isSessionActiveRef.current = isSessionActive;

  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [isLanMode, setIsLanMode] = useState<boolean>(true);
  const [ipInput, setIpInput] = useState<string>(() => {
    return storage.get(STORAGE_KEYS.LOCKED_IP) || '';
  });
  const [isIpLocked, setIsIpLocked] = useState<boolean>(() => {
    const storedIp = storage.get(STORAGE_KEYS.LOCKED_IP);
    // If IP is stored, consider it locked
    return storedIp !== null && storedIp !== '';
  });
  const [finalQrUrl, setFinalQrUrl] = useState<string>(() => {
    const saved = storage.get(STORAGE_KEYS.QR_URL) ?? '';
    // Validate saved URL - check for common corruptions like duplicated port
    if (saved && (saved.includes(':3000:3000') || saved.includes('%3A3000%3A3000'))) {
      console.warn('[HostView] Invalid URL in storage, clearing it');
      storage.remove(STORAGE_KEYS.QR_URL);
      return '';
    }
    return saved;
  });

  // State
  const [clients, setClients] = useState<Map<string, ConnectedClient>>(new Map());
  // Track the single connected ScreenView client (only one demo screen allowed)
  const [screenViewClient, setScreenViewClient] = useState<string | null>(null);
  // Ref for immediate access to current ScreenView peerId (avoids stale closure issues)
  const screenViewPeerIdRef = useRef<string | null>(null);
  // Refs to track previous values for preventing unnecessary broadcasts
  const prevClientsRef = useRef<Map<string, ConnectedClient>>(new Map());
  const prevTeamsRef = useRef<any[]>([]);
  const prevScreenViewClientsRef = useRef<Set<string>>(new Set());
  // Ref to store p2pHost for use in removeClient callback
  const p2pHostRef = useRef<any>(null);
  // Queue for pending TEAM_CONFIRMED messages (clientId -> teamId)
  const [pendingConfirmations, setPendingConfirmations] = useState<Map<string, string>>(new Map());
  // Queue for pending GET_COMMANDS requests (clientId requesting commands)
  const [pendingCommandsRequest, setPendingCommandsRequest] = useState<string | null>(null);

  // Wrapper to update clients - creates NEW Map to trigger React re-renders
  const updateClients = useCallback((updater: (prev: Map<string, ConnectedClient>) => void) => {
    setClients(prev => {
      // Create new Map from prev to ensure React detects changes
      const newMap = new Map(prev);
      // Apply updates to newMap
      updater(newMap);
      return newMap;
    });
  }, []);

  const [teams, setTeams] = useState<Team[]>(() => {
    const saved = storage.get<string>(STORAGE_KEYS.TEAMS);
    if (!saved) return [];
    try {
      const parsed = JSON.parse(saved);
      // Migrate old teams without lastUsedAt
      return parsed.map((t: Team) => ({ ...t, lastUsedAt: t.lastUsedAt || t.createdAt }));
    } catch { return []; }
  });

  // Commands/Rooms state - synchronized with teams for quick join feature
  const [commands, setCommands] = useState<Array<{ id: string; name: string }>>(() => {
    // First try to load from teams storage (preferred source)
    const savedTeams = storage.get<string>(STORAGE_KEYS.TEAMS);
    if (savedTeams && typeof savedTeams === 'string' && savedTeams.trim() !== '' && savedTeams !== 'null' && savedTeams !== 'undefined') {
      try {
        const parsed = JSON.parse(savedTeams);
        if (Array.isArray(parsed)) {
          return parsed.map((t: Team) => ({ id: t.id, name: t.name }));
        }
      } catch (e) {
        console.error('[HostView] Failed to parse teams from storage:', e);
      }
    }
    // Fallback to old commands storage for backward compatibility
    const saved = getRawStorageValue(STORAGE_KEYS.COMMANDS);
    if (!saved || typeof saved !== 'string' || saved.trim() === '' || saved === 'null' || saved === 'undefined') return [];
    try {
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error('[HostView] Failed to parse commands from storage:', e);
      // Clear corrupted data
      storage.remove(STORAGE_KEYS.COMMANDS);
      return [];
    }
  });

  // Team/Command editing state
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editingTeamName, setEditingTeamName] = useState<string>('');

  // Create team input state
  const [showCreateTeamInput, setShowCreateTeamInput] = useState<boolean>(false);
  const [newTeamName, setNewTeamName] = useState<string>('');

  // Track which clients have buzzed (clientId -> timestamp when they buzzed)
  const [buzzedClients, setBuzzedClients] = useState<Map<string, number>>(new Map());

  // Track which clients are currently buzzing (for lobby list visual flash effect)
  const [buzzingClientIds, setBuzingClientIds] = useState<Set<string>>(new Set());

  // Link copy animation state
  const [linkCopied, setLinkCopied] = useState<boolean>(false);
  const [screenLinkCopied, setScreenLinkCopied] = useState<boolean>(false);

  // Track which teams have buzzed (for visual flash effect) - only tracks recent buzzes
  const [buzzedTeamIds, setBuzzedTeamIds] = useState<Set<string>>(new Set());

  // Track late buzzes (teams that pressed after answering team was already determined)
  const [lateBuzzTeamIds, setLateBuzzTeamIds] = useState<Set<string>>(new Set());

  // Track players who were removed from queue (for re-adding to end on second BUZZ)
  const [removedFromQueueTeamIds, setRemovedFromQueueTeamIds] = useState<Set<string>>(new Set());

  // Track if Clash already occurred for current question (to prevent multiple Clash triggers)
  const [clashOccurredForQuestion, setClashOccurredForQuestion] = useState<boolean>(false);

  // Track active/inactive players for current question
  const [activeTeamIds, setActiveTeamIds] = useState<Set<string>>(new Set());  // Players who can BUZZ to become answering
  const [answeringTeamLockedIn, setAnsweringTeamLockedIn] = useState<boolean>(false);  // Answering team is locked (answered incorrectly/correctly)

  // Track buzzer state from GamePlay for GameSession
  const [buzzerState, setBuzzerState] = useState<{
    active: boolean;
    timerPhase?: 'reading' | 'response' | 'complete' | 'inactive';
    readingTimerRemaining: number;
    responseTimerRemaining: number;
    handicapActive: boolean;
    handicapTeamId?: string;
    isPaused?: boolean;
  }>({
    active: false,
    timerPhase: 'inactive',
    readingTimerRemaining: 0,
    responseTimerRemaining: 0,
    handicapActive: false,
    isPaused: false
  });

  // Modals state using custom hook
  const hostModals = useHostModals(); // Session starts only via "Start Session" button

  // Track the current answering team (the team that gets to answer the question)
  const [answeringTeamId, setAnsweringTeamId] = useState<string | null>(null);

  // Track previous timer phase to detect transitions
  const prevTimerPhaseRef = useRef<'reading' | 'response' | 'complete' | 'inactive' | null>(null);

  // Track last sent TIMER_STATE to avoid duplicate broadcasts
  const lastSentBuzzerStateRef = useRef<{
    active: boolean;
    timerPhase: string;
    readingTimerRemaining: number;
    responseTimerRemaining: number;
    isPaused: boolean;
  }>({
    active: false,
    timerPhase: 'inactive',
    readingTimerRemaining: 0,
    responseTimerRemaining: 0,
    isPaused: false
  });

  // Session version - changes when starting a new session, helps clients detect stale state
  // Load from storage or generate new one
  const [sessionVersion, setSessionVersion] = useState<string>(() => {
    const saved = storage.get(STORAGE_KEYS.SESSION_VERSION);
    return saved || `v_${Date.now()}`;
  });

  // Super Game state - track bets and answers from mobile clients
  const [superGameBets, setSuperGameBets] = useState<Array<{ teamId: string; bet: number; ready: boolean }>>([]);
  const [superGameAnswers, setSuperGameAnswers] = useState<Array<{ teamId: string; answer: string; revealed: boolean; submitted: boolean }>>([]);
  // Track super game phase for responding to GET_SUPER_GAME_STATE requests
  const [superGamePhase, setSuperGamePhase] = useState<'idle' | 'placeBets' | 'showQuestion' | 'showWinner'>('idle');
  const [superGameMaxBet, setSuperGameMaxBet] = useState<number>(100);
  // Trigger for state sync request (increments to trigger sync)
  const [stateSyncTrigger, setStateSyncTrigger] = useState<number>(0);

  // Clash mode state
  const [firstBuzzTimestamp, setFirstBuzzTimestamp] = useState<number | null>(null);
  const [clashingTeamIds, setClashingTeamIds] = useState<Set<string>>(new Set());
  const [clashPhase, setClashPhase] = useState<'idle' | 'waiting' | 'resolved'>('idle');

  // Session settings using custom hook
  const { settings: sessionSettings, updateSettings: updateSessionSettings } = useSessionSettings();

  // QR Code display
  const [showQRCode, setShowQRCode] = useState<boolean>(false);
  const [qrCodePosition, setQrCodePosition] = useState<{ x: number; y: number } | undefined>(undefined);

  // Signal to switch timer phase from reading to response (from demo screen)
  const [switchToResponsePhaseSignal, setSwitchToResponsePhaseSignal] = useState<number | null>(null);

  // Callback to reset the phase switch signal after processing
  const handlePhaseSwitchComplete = useCallback(() => {
    setSwitchToResponsePhaseSignal(null);
  }, []);

  // Define removeClient early (needed by P2P callbacks and UI)
  // clientId can be either:
  // - persistent client ID (client.id) when called from UI button
  // - peerId when called from onClientDisconnected
  const removeClient = useCallback((clientId: string) => {
    console.log('[HostView] removeClient called for ID:', clientId);

    setClients((prev: Map<string, ConnectedClient>) => {
      // First, check if clientId is already a peerId (key in the Map)
      let peerIdToRemove: string | null = prev.has(clientId) ? clientId : null;
      let clientName: string | null = null;

      // If not found as peerId, search by persistent ID (client.id) or peerId field
      if (!peerIdToRemove) {
        for (const [peerId, client] of prev.entries()) {
          if (client.id === clientId || client.peerId === clientId) {
            peerIdToRemove = peerId;
            clientName = client.name;
            break;
          }
        }
      } else {
        // clientId was a peerId, get the client name
        const client = prev.get(peerIdToRemove);
        if (client) {
          clientName = client.name;
        }
      }

      if (!peerIdToRemove) {
        console.warn('[HostView] Client not found for removal:', clientId);
        return prev; // Return unchanged if not found
      }

      console.log('[HostView] Removing client - ID:', clientId, 'name:', clientName, 'peerId:', peerIdToRemove);

      // Send disconnect message to client BEFORE removing from state
      // Only send KICKED message if this was initiated by host (not natural disconnect)
      // We can detect this by checking if the connection is still open
      const isHostInitiated = p2pHostRef.current?.getActiveConnections()?.includes(peerIdToRemove);

      if (isHostInitiated) {
        setTimeout(() => {
          try {
            p2pHostRef.current?.sendToClient(peerIdToRemove, {
              id: generateUUID(),
              category: 'control' as MessageCategory,
              timestamp: Date.now(),
              senderId: hostId,
              type: 'BROADCAST',
              payload: {
                message: 'KICKED',
                data: { reason: 'removed_by_host' }
              }
            });

            // Close P2P connection
            p2pHostRef.current?.disconnectClient(peerIdToRemove);
          } catch (err) {
            console.error('[HostView] Error sending kick message:', err);
          }
        }, 0);
      }

      // Remove from clients Map (using peerId as key)
      const updated = new Map(prev);
      updated.delete(peerIdToRemove);
      return updated;
    });
  }, [hostId]);

  // ============================================================
  // P2P Network Connection (WebRTC via PeerJS)
  // ============================================================

  // Get signalling server URL based on LAN mode
  const getSignallingServer = useCallback(() => {
    if (isLanMode) {
      // In LAN mode, always use local signalling server
      if (isIpLocked && ipInput && ipInput.trim() !== '') {
        return `ws://${ipInput}:9000`;
      }
      // Use localhost if no IP is locked
      return 'ws://localhost:9000';
    }
    return undefined; // Use default public server for Internet mode
  }, [isLanMode, isIpLocked, ipInput]);

  // Initialize P2P host connection
  const p2pHost = useP2PHost({
    hostId: hostId,
    isHost: true,
    isLanMode: isLanMode,
    signallingServer: getSignallingServer(),
    onMessage: useCallback((message: P2PSMessage, peerId: string) => {
      // Update lastSeen timestamp for ANY message from this client
      // This prevents active clients from being marked as stale and disconnected
      updateClients((prev: Map<string, ConnectedClient>) => {
        const client = prev.get(peerId);
        if (client) {
          client.lastSeen = Date.now();
        }
      });

      // Handle incoming messages from clients
      switch (message.type) {
        case 'BUZZ': {
          const buzzMsg = message as BuzzEventMessage;
          const teamId = buzzMsg.payload.teamId;
          const buzzTime = buzzMsg.payload.buzzTime;

          console.log('🔔 [HOST] BUZZ received!');
          console.log('🔔 [HOST] Client:', buzzMsg.payload.clientName, '(ID:', buzzMsg.payload.clientId + ')');
          console.log('🔔 [HOST] Team:', buzzMsg.payload.teamName, '(ID:', teamId + ')');
          console.log('🔔 [HOST] Buzz time:', new Date(buzzTime).toLocaleTimeString());
          console.log('🔔 [HOST] From peer:', peerId);

          // Use ref to get current buzzer state (not stale closure value)
          const currentBuzzerState = buzzerStateRef.current;

          console.log('🎮 [HOST] Current buzzer state:', currentBuzzerState.timerPhase);
          console.log('🎮 [HOST] Super game phase:', currentBuzzerState.superGamePhase);

          // Check if we're in response phase (green timer active)
          const isResponsePhase = currentBuzzerState.timerPhase === 'response';

          // Check if this team is blocked by handicap
          const isTeamBlockedByHandicap = currentBuzzerState.handicapActive && currentBuzzerState.handicapTeamId === teamId;

          // Check if buzzer is allowed for this team (response phase AND not blocked by handicap)
          const isBuzzerAllowed = isResponsePhase && !isTeamBlockedByHandicap;

          console.log('✅ [HOST] Buzzer allowed:', isBuzzerAllowed, '(response phase:', isResponsePhase, ', not blocked:', !isTeamBlockedByHandicap + ')');

          // Track buzzed clients using peerId (same as useP2PMessageHandlers)
          // peerId is used as key in clients Map and matches client.id in STATE_SYNC
          setBuzzedClients((prev: Map<string, number>) => {
            const newMap = new Map(prev).set(peerId, buzzTime);
            console.log('📝 [HOST] Updated buzzed clients, total:', newMap.size);
            return newMap;
          });

          // Get current active teams
          const currentActiveTeamIds = activeTeamIdsRef.current;
          const currentAnsweringTeamId = answeringTeamIdRef.current;

          // FIRST: Determine team active status for demo screen (check BEFORE isBuzzerAllowed)
          let isTeamActive = true; // Default: team is active
          let shouldSkipBuzzerLogic = false; // Skip game logic but still send BUZZ_EVENT

          if (teamId) {
            // Check if this is the answering team (they can't trigger actions)
            if (currentAnsweringTeamId === teamId) {
              isTeamActive = false; // Answering team is not "active" for BUZZ purposes
              shouldSkipBuzzerLogic = true;
            }
            // Check if this team is in the active teams set
            else if (!currentActiveTeamIds.has(teamId)) {
              isTeamActive = false; // Inactive team
              shouldSkipBuzzerLogic = true;
            }
          }

          console.log('[HostView] BUZZ - Team status check:', {
            teamId: teamId?.slice(0, 12),
            isTeamActive,
            shouldSkipBuzzerLogic,
            isBuzzerAllowed
          });

          // Apply visual effects for inactive/answering teams
          if (!isTeamActive && teamId) {
            setBuzzedTeamIds(prev => new Set(prev).add(teamId));
            setTimeout(() => {
              setBuzzedTeamIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(teamId);
                return newSet;
              });
            }, 500);
          }

          // Game logic only proceeds if buzzer is allowed and team is active
          if (isBuzzerAllowed && teamId) {
            if (shouldSkipBuzzerLogic) {
              // Skip game logic for inactive/answering teams, but BUZZ_EVENT will be sent below
            } else {

            // CLASH MODE LOGIC (simplified)
            // Only use simultaneous threshold if BOTH collisionEnabled AND simultaneousBuzzEnabled are true
            const simultaneousThreshold = (sessionSettings.collisionEnabled && sessionSettings.simultaneousBuzzEnabled)
              ? (sessionSettings.simultaneousBuzzThreshold * 1000) // Convert to ms
              : 0;
            const isClashModeEnabled = sessionSettings.collisionEnabled;

            console.log('[HostView] BUZZ - Clash check:', {
              collisionEnabled: sessionSettings.collisionEnabled,
              simultaneousBuzzEnabled: sessionSettings.simultaneousBuzzEnabled,
              isClashModeEnabled,
              simultaneousThreshold,
              clashOccurred: clashOccurredForQuestion
            });

            // Clash mode is only active when: collisionEnabled AND (simultaneousBuzzEnabled is false OR threshold is 0)
            // If collisionEnabled=true but simultaneousBuzzEnabled=false, use immediate mode (no clash window)
            if (simultaneousThreshold > 0 && !clashOccurredForQuestion && !currentAnsweringTeamId) {
              const currentFirstBuzzTimestamp = firstBuzzTimestampRef.current;
              const currentClashPhase = clashPhaseRef.current;
              const currentClashingTeamIds = clashingTeamIdsRef.current;

              // Check if this buzz is within the simultaneous press window
              const isWithinSimultaneousWindow = currentFirstBuzzTimestamp !== null &&
                (buzzTime - currentFirstBuzzTimestamp) <= simultaneousThreshold;

              if (currentFirstBuzzTimestamp === null && currentClashPhase === 'idle') {
                // FIRST PRESS - Start the simultaneous press window
                console.log('[HostView] CLASH - First press, starting window');
                setFirstBuzzTimestamp(buzzTime);
                setClashPhase('waiting');
                setClashingTeamIds(new Set([teamId]));

                // Set visual indicator - violet flash with "?" (not answering team yet)
                setBuzzedTeamIds(prev => new Set(prev).add(teamId));
                setTimeout(() => {
                  setBuzzedTeamIds(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(teamId);
                    return newSet;
                  });
                }, 500);

                // Set timeout to end simultaneous press window and resolve clash
                setTimeout(() => {
                  const finalClashingTeamIds = clashingTeamIdsRef.current;
                  console.log('[HostView] CLASH - Window ended, teams in clash:', Array.from(finalClashingTeamIds));

                  if (finalClashingTeamIds.size > 1) {
                    // CLASH DETECTED - Multiple teams pressed simultaneously
                    const teamIdsArray = Array.from(finalClashingTeamIds);

                    // Select ONE random answering team from all clashing teams
                    const shuffledForAnswer = [...teamIdsArray].sort(() => Math.random() - 0.5);
                    const selectedAnsweringTeam = shuffledForAnswer[0];

                    console.log('[HostView] CLASH DETECTED - Teams:', teamIdsArray, 'Selected:', selectedAnsweringTeam);

                    // Only set answering team if none exists yet (prevent hijacking)
                    if (!currentAnsweringTeamId) {
                      setAnsweringTeamId(selectedAnsweringTeam);
                      // DON'T deactivate teams yet - wait for clash window to end
                      console.log('[HostView] CLASH - Answering team selected, but NOT deactivating yet');
                    }

                    // Mark that Clash occurred for this question
                    setClashOccurredForQuestion(true);

                    // Clear clash state - show answering team, not order numbers
                    setFirstBuzzTimestamp(null);
                    setClashingTeamIds(new Set());
                    setClashPhase('idle');

                    // NOW deactivate all teams after clash window ends
                    console.log('[HostView] CLASH - Window ended, deactivating all teams');
                    setActiveTeamIds(new Set());

                  } else if (finalClashingTeamIds.size === 1) {
                    // NO CLASH - Only one team pressed during window, they get to answer
                    const singleTeamId = Array.from(finalClashingTeamIds)[0];

                    // Only set answering team if none exists yet (prevent hijacking)
                    if (!currentAnsweringTeamId) {
                      setAnsweringTeamId(singleTeamId);
                      // DON'T deactivate teams yet - wait for clash window to end
                      console.log('[HostView] CLASH - Answering team selected, but NOT deactivating yet');
                    }

                    // Mark that Clash window occurred for this question (even without actual clash)
                    setClashOccurredForQuestion(true);

                    // Reset clash state
                    setFirstBuzzTimestamp(null);
                    setClashingTeamIds(new Set());
                    setClashPhase('idle');

                    // NOW deactivate all teams after clash window ends
                    console.log('[HostView] CLASH - Window ended, deactivating all teams');
                    setActiveTeamIds(new Set());

                  } else {
                    // No teams in clash window - reset
                    setFirstBuzzTimestamp(null);
                    setClashingTeamIds(new Set());
                    setClashPhase('idle');
                  }
                }, simultaneousThreshold);

              } else if (isWithinSimultaneousWindow && currentClashPhase === 'waiting') {
                // WITHIN SIMULTANEOUS WINDOW - Another team pressed
                console.log('[HostView] CLASH - Within window, adding team:', teamId);
                setClashingTeamIds(prev => new Set(prev).add(teamId));

                // Set visual indicator - violet flash with "?"
                setBuzzedTeamIds(prev => new Set(prev).add(teamId));
                setTimeout(() => {
                  setBuzzedTeamIds(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(teamId);
                    return newSet;
                  });
                }, 500);
              }
            } else {
              // NO CLASH MODE (or clash disabled/threshold=0 or answering team exists) - First active team to press becomes answering team
              // Only proceed if no answering team exists yet
              if (!currentAnsweringTeamId) {
                console.log('[HostView] NO CLASH MODE - Setting answering team:', teamId);
                setAnsweringTeamId(teamId);
                // Deactivate all teams when someone becomes answering
                setActiveTeamIds(new Set());
                // Mark that we processed a buzz for this question (prevents reprocessing)
                setClashOccurredForQuestion(true);

                // Visual feedback - green flash for answering team
                setBuzzedTeamIds(prev => new Set(prev).add(teamId));
                setTimeout(() => {
                  setBuzzedTeamIds(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(teamId);
                    return newSet;
                  });
                }, 500);
              } else {
                console.log('[HostView] NO CLASH MODE - Answering team already exists:', currentAnsweringTeamId, 'ignoring buzz from:', teamId);
              }
            }
          }
          } else {
            // Buzz during non-response phase or when team is blocked by handicap - just visual flash
            if (teamId) {
              setBuzzedTeamIds(prev => new Set(prev).add(teamId));
              setTimeout(() => {
                setBuzzedTeamIds(prev => {
                  const newSet = new Set(prev);
                  newSet.delete(teamId);
                  return newSet;
                });
              }, 500);
            }
          }

          // Get client.id (persistent ID) from clients Map for consistent identification
          const client = clients.get(peerId);
          const clientIdForDisplay = client?.id || peerId; // Use persistent ID if available, fallback to peerId

          console.log('[HostView] BUZZ_EVENT sending:', {
            peerId,
            clientId: client?.id,
            peerIdInClient: client?.peerId,
            clientIdForDisplay,
            clientName: buzzMsg.payload.clientName,
            teamId,
            isTeamActive, // Add isTeamActive to log
            clientsMapSize: clients.size,
            screenViewPeerId: screenViewPeerIdRef.current
          });

          // Add clientId to buzzingClientIds for lobby list visual flash effect (clears after 500ms)
          setBuzingClientIds(prev => new Set(prev).add(clientIdForDisplay));

          // Send BUZZ event to demo screen for visual feedback
          // Use client.id (persistent ID) to match with gameState.clients
          const buzzEvent: Omit<P2PSMessage, 'id' | 'timestamp' | 'senderId'> = {
            category: MessageCategory.EVENT,
            type: 'BUZZ_EVENT',
            payload: {
              clientId: clientIdForDisplay,
              clientName: buzzMsg.payload.clientName,
              teamId: teamId,
              isTeamActive: isTeamActive, // Whether the team is active (can press BUZZ)
              buzzTime: buzzTime
            }
          };

          // Use ref for immediate access (avoids stale closure issues)
          const currentScreenViewPeerId = screenViewPeerIdRef.current;
          if (currentScreenViewPeerId) {
            const sent = p2pHost.sendToClient(currentScreenViewPeerId, buzzEvent);
            if (sent) {
              console.log('[HostView] BUZZ_EVENT sent to demo screen:', currentScreenViewPeerId);
            } else {
              console.log('[HostView] BUZZ_EVENT not sent - sendToClient returned false', {
                screenViewPeerId: currentScreenViewPeerId,
                activeConnections: p2pHost.getActiveConnections?.() || []
              });
            }
          } else {
            console.log('[HostView] BUZZ_EVENT not sent - no demo screen peerId', {
              screenViewPeerId: currentScreenViewPeerId
            });
          }

          setTimeout(() => {
            setBuzingClientIds(prev => {
              const newSet = new Set(prev);
              newSet.delete(clientIdForDisplay);
              return newSet;
            });
          }, 500);
          break;
        }
        case 'JOIN_TEAM': {
          // Client joined a team - update client if already exists, or add new one
          const { clientName, teamId } = message.payload;
          console.log('[HostView] JOIN_TEAM received from', peerId, 'name:', clientName, 'team:', teamId);
          updateClients((prev: Map<string, ConnectedClient>) => {
            const existingClient = prev.get(peerId);
            if (existingClient) {
              // Client exists (was added at handshake), update with NEW object to trigger React re-render
              console.log('[HostView] Updating existing client team:', existingClient.name, 'to:', teamId);
              const updatedClient: ConnectedClient = {
                ...existingClient,
                teamId: teamId,
                name: clientName,
                lastSeen: Date.now()
              };
              prev.set(peerId, updatedClient);
            } else {
              // Client doesn't exist yet (shouldn't happen with new handshake logic, but kept for compatibility)
              console.log('[HostView] Creating new client for JOIN_TEAM:', clientName);
              const newClient: ConnectedClient = {
                id: peerId,
                peerId: peerId,
                name: clientName,
                joinedAt: Date.now(),
                lastSeen: Date.now(),
                teamId: teamId,
                connectionQuality: {
                  rtt: 0,
                  packetLoss: 0,
                  jitter: 0,
                  lastPing: Date.now(),
                  healthScore: 100
                }
              };
              prev.set(peerId, newClient);
            }
          });
          // Queue confirmation to be sent via useEffect (avoid closure issue)
          setPendingConfirmations((prev: Map<string, string>) => new Map(prev).set(peerId, teamId || ''));
          // Trigger lobby sync to demo screen (player joined team)
          setStateSyncTrigger(prev => prev + 1);
          console.log('[HostView] Queued TEAM_CONFIRMED for', peerId);
          break;
        }
        case 'TEAM_UPDATE': {
          // New team created by client
          const { teamId, teamName } = message.payload;
          // Check if team already exists
          const existingTeam = teams.find(t => t.name === teamName);
          if (!existingTeam) {
            // Add new team
            const newTeam: Team = {
              id: teamId,
              name: teamName,
              createdAt: Date.now(),
              lastUsedAt: Date.now()
            };
            setTeams(prev => [...prev, newTeam]);
            // Broadcasting is handled by useEffect below
          }
          break;
        }
        case 'CREATE_TEAM': {
          // Client creates a new team and joins it
          const { clientId, clientName, teamName } = message.payload;
          console.log('[HostView] CREATE_TEAM received from', peerId, 'clientName:', clientName, 'teamName:', teamName);

          // Generate a unique team ID
          const newTeamId = 'team_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);

          // Check if team already exists
          const existingTeam = teams.find(t => t.name === teamName);
          if (!existingTeam) {
            // Add new team
            const newTeam: Team = {
              id: newTeamId,
              name: teamName,
              createdAt: Date.now(),
              lastUsedAt: Date.now()
            };
            setTeams(prev => [...prev, newTeam]);
            console.log('[HostView] Created new team:', newTeam.name, 'id:', newTeamId);
          } else {
            console.log('[HostView] Team already exists:', existingTeam.name);
          }

          // Add client to lobby with the new team
          updateClients((prev: Map<string, ConnectedClient>) => {
            const existingClient = prev.get(peerId);
            if (existingClient) {
              // Client exists, update with NEW object to trigger React re-render
              const updatedClient: ConnectedClient = {
                ...existingClient,
                teamId: newTeamId,
                name: clientName
              };
              prev.set(peerId, updatedClient);
            } else {
              // New client - add to lobby
              // Use peerId as client.id for consistency with JOIN_TEAM and BUZZ_EVENT
              const newClient: ConnectedClient = {
                id: peerId,
                peerId: peerId,
                name: clientName,
                joinedAt: Date.now(),
                lastSeen: Date.now(),
                teamId: newTeamId,
                connectionQuality: {
                  rtt: 0,
                  packetLoss: 0,
                  jitter: 0,
                  lastPing: Date.now(),
                  healthScore: 100
                }
              };
              prev.set(peerId, newClient);
            }
          });

          // Queue confirmation to be sent
          setPendingConfirmations((prev: Map<string, string>) => new Map(prev).set(peerId, newTeamId));
          // Trigger lobby sync to demo screen (team created)
          setStateSyncTrigger(prev => prev + 1);
          console.log('[HostView] Queued TEAM_CONFIRMED for CREATE_TEAM', peerId, 'teamId:', newTeamId);
          break;
        }
        case 'GET_COMMANDS': {
          setPendingCommandsRequest(peerId);
          break;
        }
        case 'SUPER_GAME_BET': {
          // Client placed a bet in super game
          const existingIndex = superGameBets.findIndex((b: { teamId: string }) => b.teamId === message.payload.teamId);
          if (existingIndex >= 0) {
            setSuperGameBets((prev: Array<{ teamId: string; bet: number; ready: boolean }>) => prev.map((b: { teamId: string; bet: number; ready: boolean }, i: number) =>
              i === existingIndex ? { ...b, bet: message.payload.bet, ready: true } : b
            ));
          } else {
            setSuperGameBets((prev: Array<{ teamId: string; bet: number; ready: boolean }>) => [...prev, { teamId: message.payload.teamId, bet: message.payload.bet, ready: true }]);
          }
          break;
        }
        case 'SUPER_GAME_ANSWER': {
          // Client submitted an answer in super game
          const existingIndex = superGameAnswers.findIndex((a: { teamId: string }) => a.teamId === message.payload.teamId);
          if (existingIndex >= 0) {
            setSuperGameAnswers((prev: Array<{ teamId: string; answer: string; revealed: boolean; submitted: boolean }>) => prev.map((a: { teamId: string; answer: string; revealed: boolean; submitted: boolean }, i: number) =>
              i === existingIndex ? { ...a, answer: message.payload.answer, submitted: true } : a
            ));
          } else {
            setSuperGameAnswers((prev: Array<{ teamId: string; answer: string; revealed: boolean; submitted: boolean }>) => [...prev, {
              teamId: message.payload.teamId,
              answer: message.payload.answer,
              revealed: false,
              submitted: true
            }]);
          }
          break;
        }
        case 'TIMER_PHASE_SWITCH': {
          // Demo screen is requesting host to switch timer phase
          // This happens when demo screen's local timer finishes yellow phase
          console.log('[HostView] TIMER_PHASE_SWITCH received from demo screen:', message.payload);

          // Only process if we're in reading phase and switching to response
          // Use ref to get current state without stale closure issues
          const currentPhase = buzzerStateRef.current?.timerPhase;
          if (message.payload.fromPhase === 'reading' && message.payload.toPhase === 'response' && currentPhase === 'reading') {
            console.log('[HostView] Processing timer phase switch from demo screen');

            // Trigger the phase switch in GamePlay via signal
            setSwitchToResponsePhaseSignal(prev => prev + 1);
          } else {
            console.log('[HostView] Ignoring TIMER_PHASE_SWITCH - not in reading phase. Current phase:', currentPhase);
          }
          break;
        }
        case 'STATE_SYNC_REQUEST': {
          console.log('[HostView] STATE_SYNC_REQUEST received from:', peerId);
          // Client requested full state sync
          setStateSyncTrigger(prev => prev + 1);

          // Send immediate state sync
          const stateSync = {
            category: MessageCategory.SYNC,
            type: 'STATE_SYNC',
            payload: {
              isSessionActive: isSessionActiveRef.current,
              buzzerState: buzzerState,
              teams: teams || [],
              clients: Array.from(clients.values())
                .filter((client: ConnectedClient) => !client.id.startsWith('screen_'))
                .map((client: ConnectedClient) => ({
                id: client.id,
                peerId: client.peerId,
                name: client.name,
                teamId: client.teamId,
                connectionQuality: client.connectionQuality
              })),
              currentQuestion: null,
              answeringTeamId: answeringTeamId,
              activeTeamIds: Array.from(activeTeamIds),
              answeringTeamLockedIn: answeringTeamLockedIn
            }
          };
          p2pHost.sendToClient(peerId, stateSync);
          break;
        }
        case 'MODERATOR_ACTION': {
          // Handle moderator control actions
          console.log('[HostView] Moderator action received:', message.payload);
          const { action, data } = message.payload;

          // Handle different moderator actions
          switch (action) {
            case 'correct_answer':
              // Award points to answering team
              if (answeringTeamId) {
                console.log('[HostView] Moderator: Correct answer for team', answeringTeamId);
                // Trigger correct answer logic in GameSession via state change
                // This will be handled by GameSession component
              }
              break;
            case 'incorrect_answer':
              // Deduct points from answering team
              if (answeringTeamId) {
                console.log('[HostView] Moderator: Incorrect answer for team', answeringTeamId);
              }
              break;
            case 'show_answer':
              // Show the correct answer
              console.log('[HostView] Moderator: Show answer requested');
              break;
            case 'start_question':
            case 'skip_question':
            case 'award_points':
            case 'deduct_points':
            case 'timer_control':
              console.log('[HostView] Moderator action:', action, data);
              break;
          }
          break;
        }
        default:
                      }
                  }, [updateClients, superGameBets, superGameAnswers, isSessionActive, buzzerState, teams, clients, answeringTeamId, activeTeamIds, answeringTeamLockedIn, sessionSettings, clashOccurredForQuestion]),
    onClientConnected: useCallback((clientId: string, data: { name: string; teamId?: string; persistentClientId?: string }) => {
      console.log('[HostView] Client connected via handshake:', clientId, 'name:', data.name, 'persistentId:', data.persistentClientId, 'teamId:', data.teamId);
      console.log('[HostView] Is ScreenView check:', {
        isScreenViewName: data.name === 'ScreenView',
        hasPersistentId: !!data.persistentClientId,
        persistentIdStartsWithScreen: data.persistentClientId?.startsWith('screen_'),
        willAddToScreenView: data.name === 'ScreenView' || (data.persistentClientId && data.persistentClientId.startsWith('screen_'))
      });

          // Check if this is a ScreenView - track separately and send initial state
      if (data.name === 'ScreenView' || (data.persistentClientId && data.persistentClientId.startsWith('screen_'))) {
        // Disconnect old demo screen if exists
        if (screenViewClient && screenViewClient !== clientId) {
          p2pHost.disconnectClient(screenViewClient);
        }
        // Set new demo screen as the only one
        setScreenViewClient(clientId);
        // Update ref immediately for BUZZ_EVENT handler
        screenViewPeerIdRef.current = clientId;
        // Add ScreenView to clients Map so it can be found dynamically
        updateClients((clientsMap: Map<string, ConnectedClient>) => {
          clientsMap.set(clientId, {
            id: data.persistentClientId || clientId,
            peerId: clientId,
            name: data.name,
            joinedAt: Date.now(),
            lastSeen: Date.now(),
            teamId: data.teamId || null,
            connectionQuality: {
              rtt: 0,
              packetLoss: 0,
              jitter: 0,
              lastPing: Date.now(),
              healthScore: 100
            }
          });
          console.log('[HostView] ScreenView added to clients Map:', {
            peerId: clientId,
            persistentId: data.persistentClientId,
            totalClients: clientsMap.size
          });
        });
        // Initial state will be sent by useEffect below
        return;
      }

      // Note: Sending commands to new client is handled by useEffect below
      // to avoid circular dependency with p2pHost initialization

      // Check if this is a returning client (same persistent ID)
      if (data.persistentClientId) {
        // Look for existing client with this persistent ID (including disconnected clients)
        let oldPeerId: string | null = null;
        let existingClient: ConnectedClient | null = null;

        for (const [peerId, client] of clients.entries()) {
          if (client.id === data.persistentClientId) {
            oldPeerId = peerId;
            existingClient = client;
            break;
          }
        }

        if (existingClient && oldPeerId) {
          console.log('[HostView] Returning client detected:', existingClient.name, 'old peerId:', oldPeerId, 'new peerId:', clientId, 'teamId:', data.teamId);

          // Update existing client's peer ID and last seen
          updateClients((prev: Map<string, ConnectedClient>) => {
            const client = prev.get(oldPeerId!);
            if (client) {
              // Remove from old peer ID
              prev.delete(oldPeerId!);
              // Add with new peer ID
              client.peerId = clientId;
              client.lastSeen = Date.now();
              client.name = data.name; // Update name in case it changed
              // Update teamId only if it's a proper team ID (starts with "team_")
              // Temporary team names from localStorage should not override the client's team
              if (data.teamId && data.teamId.startsWith('team_')) {
                client.teamId = data.teamId;
              }
              prev.set(clientId, client);
            }
          });

          // Queue TEAM_CONFIRMED for returning client only if they have a proper team ID
          // Don't queue for temporary team names - client will receive proper ID through normal flow
          if (data.teamId && data.teamId.startsWith('team_')) {
            setPendingConfirmations((prev: Map<string, string>) => new Map(prev).set(clientId, data.teamId!));
          } else if (data.teamId && !data.teamId.startsWith('team_')) {
            console.log('[HostView] Skipping team confirmation for returning client with temporary team ID:', data.teamId);
          }

          // CRITICAL: Restore team if it doesn't exist (after host page reload)
          // When host reloads, teams list is lost but clients still have their teamId
          // IMPORTANT: Only restore if teamId is a proper team ID (starts with "team_")
          // Temporary team names should NOT be restored - client will get proper ID through normal flow
          if (data.teamId && data.name && data.teamId.startsWith('team_')) {
            const teamExists = teams.some(t => t.id === data.teamId);
            if (!teamExists) {
              console.log('[HostView] Restoring missing team for reconnecting client:', data.teamId, 'name:', data.name);
              setTeams((prev: Team[]) => {
                // Check if team was already added (avoid duplicates during rapid reconnects)
                if (prev.some(t => t.id === data.teamId)) {
                  return prev;
                }
                // Create team with current timestamp - use team name from client's stored data
                // The team name is extracted from the teamId or from a previous sync
                return [...prev, {
                  id: data.teamId!,
                  name: data.name, // Will be updated when client syncs teams
                  createdAt: Date.now(),
                  lastUsedAt: Date.now()
                }];
              });
            }
          } else if (data.teamId && !data.teamId.startsWith('team_')) {
            console.log('[HostView] Skipping team restoration for temporary team ID:', data.teamId, '- client will receive proper ID through normal flow');
          }

          return;
        }

        // New client with persistent ID - add immediately for reconnection support
        console.log('[HostView] New client with persistent ID, adding to client list:', data.name, 'persistentId:', data.persistentClientId);
        updateClients((prev: Map<string, ConnectedClient>) => {
          const newClient: ConnectedClient = {
            id: data.persistentClientId!,
            peerId: clientId,
            name: data.name,
            joinedAt: Date.now(),
            lastSeen: Date.now(),
            teamId: (data.teamId && data.teamId.startsWith('team_')) ? data.teamId : null,
            connectionQuality: {
              rtt: 0,
              packetLoss: 0,
              jitter: 0,
              lastPing: Date.now(),
              healthScore: 100
            }
          };
          prev.set(clientId, newClient);
        });

        // If client already has a proper team ID, queue confirmation
        // Don't queue for temporary team names - client will receive proper ID through CREATE_TEAM flow
        if (data.teamId && data.teamId.startsWith('team_')) {
          setPendingConfirmations((prev: Map<string, string>) => new Map(prev).set(clientId, data.teamId!));
        } else if (data.teamId && !data.teamId.startsWith('team_')) {
          console.log('[HostView] Skipping team confirmation for temporary team ID:', data.teamId);
        }

        // CRITICAL: Restore team if it doesn't exist (after host page reload)
        // When host reloads, teams list is lost but clients still have their teamId from localStorage
        // IMPORTANT: Only restore if teamId is a proper team ID (starts with "team_")
        // Temporary team names should NOT be restored - client will get proper ID through normal flow
        if (data.teamId && data.name && data.teamId.startsWith('team_')) {
          const teamExists = teams.some(t => t.id === data.teamId);
          if (!teamExists) {
            console.log('[HostView] Restoring missing team for new client with persistent ID:', data.teamId, 'name:', data.name);
            setTeams((prev: Team[]) => {
              // Check if team was already added (avoid duplicates during rapid reconnects)
              if (prev.some(t => t.id === data.teamId)) {
                return prev;
              }
              // Create team with current timestamp - use team name from client's stored data
              // The team name is extracted from the teamId or from a previous sync
              return [...prev, {
                id: data.teamId!,
                name: data.name, // Will be updated when client syncs teams
                createdAt: Date.now(),
                lastUsedAt: Date.now()
              }];
            });
          }
        } else if (data.teamId && !data.teamId.startsWith('team_')) {
          console.log('[HostView] Skipping team restoration for temporary team ID:', data.teamId, '- client will receive proper ID through normal flow');
        }

        return;
      }

      // New client without persistent ID - add to lobby with peerId as id
      // This allows BUZZ events to work before JOIN_TEAM
      console.log('[HostView] New client without persistent ID, adding to lobby with peerId:', clientId);
      updateClients((prev: Map<string, ConnectedClient>) => {
        const newClient: ConnectedClient = {
          id: clientId, // Use peerId as id for now
          peerId: clientId,
          name: data.name,
          joinedAt: Date.now(),
          lastSeen: Date.now(),
          teamId: data.teamId,
          connectionQuality: {
            rtt: 0,
            packetLoss: 0,
            jitter: 0,
            lastPing: Date.now(),
            healthScore: 100
          }
        };
        prev.set(clientId, newClient);
        console.log('[HostView] Client added to Map, total clients:', prev.size);
      });
    }, [clients, updateClients, setPendingConfirmations]),
                onClientDisconnected: useCallback((clientId: string) => {
      // Clear demo screen if this was it
      if (screenViewClient === clientId) {
        setScreenViewClient(null);
        screenViewPeerIdRef.current = null;
      }
      removeClient(clientId);
    }, [screenViewClient, removeClient]),
                onError: useCallback((error: Error) => {
      console.error('[HostView] P2P error:', error);
    }, []),
              });

  // Update p2pHost ref whenever p2pHost changes (for use in removeClient)
  useEffect(() => {
    p2pHostRef.current = p2pHost;
  }, [p2pHost]);

  // Keep commands array in sync with teams array
  // This ensures that commands created by guests are also available for GET_COMMANDS requests
  useEffect(() => {
    const teamCommands = teams.map(t => ({ id: t.id, name: t.name }));
    // Only update if different to avoid unnecessary updates
    const currentIds = commands.map(c => c.id).sort().join(',');
    const newIds = teamCommands.map(c => c.id).sort().join(',');
    if (currentIds !== newIds) {
      setCommands(teamCommands);
    }
  }, [teams]);

  // Use sync effects for teams and commands (storage persistence)
  useSyncEffects({
    teams,
    commands,
    p2pHost,
  });

  const lastBroadcastRef = useRef<number>(0);
  const lastBroadcastStateRef = useRef<string>('');

  // Send pending TEAM_CONFIRMED messages when p2pHost is ready
  useEffect(() => {
    if (p2pHost.isReady && pendingConfirmations.size > 0) {
      console.log('[HostView] Sending pending confirmations:', pendingConfirmations.size);
      pendingConfirmations.forEach((teamId: string, clientId: string) => {
        const conn = p2pHost.connectedClients.find(id => id === clientId);
        console.log('[HostView] Sending TEAM_CONFIRMED to', clientId, 'connection open:', !!conn, 'payload:', { clientId, teamId });
        p2pHost.sendToClient(clientId, {
          category: MessageCategory.STATE,
          type: 'TEAM_CONFIRMED',
          payload: {
            clientId: clientId,
            teamId: teamId
          }
        });
        console.log('[HostView] Sent TEAM_CONFIRMED to', clientId, 'with teamId:', teamId);
      });
      // Clear the queue after sending
      setPendingConfirmations(new Map());
    }
  }, [p2pHost.isReady, pendingConfirmations, p2pHost.sendToClient]);

  // Handle pending GET_COMMANDS requests
  useEffect(() => {
    if (p2pHost.isReady && pendingCommandsRequest && commands.length > 0) {
      const commandsSync: Omit<CommandsListMessage, 'id' | 'timestamp' | 'senderId'> = {
        category: MessageCategory.SYNC,
        type: 'COMMANDS_LIST',
        payload: {
          commands: commands
        }
      };
      p2pHost.sendToClient(pendingCommandsRequest, commandsSync);
      // Clear the request after sending
      setPendingCommandsRequest(null);
    } else if (p2pHost.isReady && pendingCommandsRequest && commands.length === 0) {
      // Send empty commands list
      const commandsSync: Omit<CommandsListMessage, 'id' | 'timestamp' | 'senderId'> = {
        category: MessageCategory.SYNC,
        type: 'COMMANDS_LIST',
        payload: {
          commands: []
        }
      };
      p2pHost.sendToClient(pendingCommandsRequest, commandsSync);
      setPendingCommandsRequest(null);
    }
  }, [p2pHost.isReady, pendingCommandsRequest, commands, p2pHost.sendToClient]);

  // Create command - adds to teams, commands are synced automatically
  const handleCreateCommand = useCallback((name: string) => {
    const teamId = 'team_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    const newTeam: Team = {
      id: teamId,
      name,
      createdAt: Date.now(),
      lastUsedAt: Date.now()
    };

    // Add to teams array (commands will be synced automatically via useEffect)
    setTeams(prev => [...prev, newTeam]);

    console.log('[HostView] Created team:', newTeam.name, 'id:', teamId);
  }, []);

  // Update command name (rename) - updates teams, commands are synced automatically
  const handleRenameCommand = useCallback((commandId: string, newName: string) => {
    setTeams(prev => prev.map(t => t.id === commandId ? { ...t, name: newName } : t));
    console.log('[HostView] Renamed team/command:', commandId, 'to', newName);
  }, []);

  // Delete command - removes from teams, commands are synced automatically
  const handleDeleteCommand = useCallback((commandId: string) => {
    // Remove teamId from clients
    setClients(clientsPrev => {
      const updated = new Map(clientsPrev);
      updated.forEach((client) => {
        if (client.teamId === commandId) {
          client.teamId = undefined;
        }
      });
      return updated;
    });
    // Remove from teams array (commands will be synced automatically via useEffect)
    setTeams(prev => prev.filter(t => t.id !== commandId));
    console.log('[HostView] Deleted team/command:', commandId);
  }, []);

  // Note: Teams and commands storage/broadcast effects are now handled by useSyncEffects hook

  // Send commands to newly connected clients (when they connect via handshake)
  // This is tracked by watching for clients that are in the handshake phase
  // Also sends commands to ScreenView clients when they connect or when commands change
  const commandsRef = useRef(commands);
  commandsRef.current = commands; // Keep ref updated without triggering effect
  const prevCommandsLengthRef = useRef(0);
  const prevClientsSizeRef = useRef(0);

  useEffect(() => {
    // Check if anything changed that requires sending commands
    const commandsChanged = commands.length !== prevCommandsLengthRef.current;
    const clientsChanged = clients.size !== prevClientsSizeRef.current;

    // Update refs for next comparison
    prevCommandsLengthRef.current = commands.length;
    prevClientsSizeRef.current = clients.size;

    // Only send if commands changed OR a new ScreenView connected
    if (!commandsChanged && !clientsChanged) return;

    if (!p2pHost.isReady) return;

    const currentCommands = commandsRef.current;
    const commandsSync: Omit<CommandsListMessage, 'id' | 'timestamp' | 'senderId'> = {
      category: MessageCategory.SYNC,
      type: 'COMMANDS_LIST',
      payload: {
        commands: currentCommands
      }
    };

    // Send to ALL connected ScreenView clients (handles reconnections)
    const screenViewPeerIds = Array.from(clients.entries())
      .filter(([_, client]) => client.name === 'ScreenView' || client.id.startsWith('screen_'))
      .map(([peerId, _]) => peerId);

    screenViewPeerIds.forEach(screenViewPeerId => {
      if (p2pHost.connectedClients.includes(screenViewPeerId)) {
        console.log('[HostView] Sending COMMANDS_LIST to demo screen:', {
          commandsCount: currentCommands.length,
          screenViewPeerId
        });
        p2pHost.sendToClient(screenViewPeerId, commandsSync);
      }
    });
  }, [commands.length, p2pHost.isReady, clients.size]);

  // Sync lobby state (clients + teams) to ScreenView when changed
  // This ensures demo screen shows players in teams on lobby page
  // Also sends isSessionActive state to demo screen for proper mode switching
  // NOTE: This runs in BOTH lobby and game modes to keep demo screen client list updated
  useEffect(() => {
    if (!p2pHost.isReady) return;

    const clientsArray = Array.from(clients.values())
      .filter((client: ConnectedClient) => !client.id.startsWith('screen_'));

    console.log('[HostView] Syncing lobby state to demo screen:', {
      isSessionActive,
      clientsCount: clientsArray.length,
      clients: clientsArray.map(c => ({ id: c.id, peerId: c.peerId, name: c.name, teamId: c.teamId })),
      p2pConnectedClients: p2pHost.connectedClients
    });

    const stateSync: Omit<P2PSMessage, 'id' | 'timestamp' | 'senderId'> = {
      category: MessageCategory.SYNC,
      type: 'STATE_SYNC',
      payload: {
        isSessionActive: isSessionActive,
        buzzerState: buzzerState,
        teams: teams || [],
        clients: clientsArray.map((client: ConnectedClient) => ({
          id: client.id,
          peerId: client.peerId,
          name: client.name,
          teamId: client.teamId,
          connectionQuality: client.connectionQuality
        })),
        currentQuestion: null,
        answeringTeamId: null,
        activeTeamIds: [],
        answeringTeamLockedIn: false
      }
    };

    // Send to ALL connected ScreenView clients (find dynamically each time)
    // This handles demo screen reconnections correctly
    const screenViewPeerIds = Array.from(clients.entries())
      .filter(([_, client]) => client.name === 'ScreenView' || client.id.startsWith('screen_'))
      .map(([peerId, _]) => peerId);

    console.log('[HostView] Found screenViewPeerIds:', screenViewPeerIds);

    screenViewPeerIds.forEach(screenViewPeerId => {
      const isInConnected = p2pHost.connectedClients.includes(screenViewPeerId);
      console.log('[HostView] Checking demo screen:', {
        screenViewPeerId,
        isInConnected,
        allConnectedClients: p2pHost.connectedClients
      });
      if (isInConnected) {
        const sent = p2pHost.sendToClient(screenViewPeerId, stateSync);
        console.log('[HostView] STATE_SYNC send result:', {
          screenViewPeerId,
          sent,
          isSessionActive
        });
      } else {
        console.warn('[HostView] Demo screen not in connectedClients:', {
          screenViewPeerId,
          connectedClients: p2pHost.connectedClients
        });
      }
    });
  }, [clients.size, teams.length, stateSyncTrigger, p2pHost.isReady, isSessionActive, p2pHost.connectedClients, buzzerState]);

  // Update invitation URL when settings change
  useEffect(() => {
    if (!isIpLocked && !isLanMode) {
      // Internet mode - use public signalling server
      // Format: http://localhost:3000#/mobile?host=HOST_ID&session=SESSION_ID
      // NO signalling parameter - client will use default public server
      const inviteUrl = `${window.location.origin}#/mobile?host=${encodeURIComponent(hostId)}&session=${encodeURIComponent(sessionId)}`;
      setFinalQrUrl(inviteUrl);
      storage.set(STORAGE_KEYS.QR_URL, inviteUrl);
    } else if (isIpLocked && isLanMode && ipInput) {
      // LAN mode - update URL when session ID changes
      const inviteUrl = `http://${ipInput}:3000#/mobile?host=${encodeURIComponent(hostId)}&signalling=${encodeURIComponent(ipInput)}&session=${encodeURIComponent(sessionId)}`;
      setFinalQrUrl(inviteUrl);
      storage.set(STORAGE_KEYS.QR_URL, inviteUrl);
    }
  }, [hostId, isLanMode, isIpLocked, sessionId, ipInput]);

  // Clear old signalling parameter from storage when switching to Internet mode
  useEffect(() => {
    if (!isLanMode) {
      // Switching to Internet mode - clear signalling param from URL
      const currentUrl = window.location.href;
      // Remove signalling parameter if present
      const urlWithoutSignalling = currentUrl.replace(/[?&]signalling=[^&]*/g, '');
      if (urlWithoutSignalling !== currentUrl) {
        window.location.href = urlWithoutSignalling;
      }
    }
  }, [isLanMode]);

  // Handle clear cache - clears host cache and reloads page
  const handleClearCache = useCallback(() => {
    // Clear all storage for host
    storage.clearAll();

    // Reload page to start fresh
    window.location.reload();
  }, []);

  // Handle copy screen link
  const handleCopyScreenLink = useCallback(() => {
    if (!finalQrUrl) return;

    // Replace #/mobile with #/screen
    const screenUrl = finalQrUrl.replace('#/mobile', '#/screen');
    navigator.clipboard.writeText(screenUrl);
    setScreenLinkCopied(true);
    setTimeout(() => setScreenLinkCopied(false), 2000);
  }, [finalQrUrl]);

  // Helper to merge selected packs into a single session pack
  const mergedSessionPack = useMemo((): GamePack | undefined => {
    const selectedPacksList = hostModals.selectedPacks.filter(p => hostModals.selectedPackIds.includes(p.id));
    if (selectedPacksList.length === 0) return undefined;

    // Helper to count rounds
    const getRoundCount = (pack: GamePack): number => {
      return pack.rounds?.length || 0;
    };

    // Find max round count across all packs
    const maxRounds = Math.max(...selectedPacksList.map((p: GamePack) => getRoundCount(p)), 0);

    // Merge packs into a single session pack
    const mergedRounds: Round[] = [];

    for (let roundNum = 1; roundNum <= maxRounds; roundNum++) {
      const mergedThemes: Theme[] = [];

      // Collect round settings from the first pack that has this round
      let roundSettings: {
        name?: string;
        type?: RoundType;
        cover?: { type: 'url' | 'file'; value: string };
        readingTimePerLetter?: number;
        responseWindow?: number;
        handicapEnabled?: boolean;
        handicapDelay?: number;
      } = {};

      selectedPacksList.forEach(pack => {
        const round = pack.rounds?.[roundNum - 1];
        if (round) {
          // Copy round settings from first pack that has them
          if (Object.keys(roundSettings).length === 0) {
            roundSettings = {
              name: round.name,
              type: round.type,
              cover: round.cover,
              readingTimePerLetter: round.readingTimePerLetter,
              responseWindow: round.responseWindow,
              handicapEnabled: round.handicapEnabled,
              handicapDelay: round.handicapDelay,
            };
          }

          if (round.themes) {
            round.themes.forEach((theme: Theme) => {
              // Create unique theme ID per pack to avoid conflicts
              const uniqueThemeId = `${pack.id}-${theme.id}`;
              mergedThemes.push({
                ...theme,
                id: uniqueThemeId,
              });
            });
          }
        }
      });

      if (mergedThemes.length > 0) {
        mergedRounds.push({
          id: generateUUID(),
          number: roundNum,
          name: roundSettings.name || `Round ${roundNum}`,
          type: roundSettings.type,
          cover: roundSettings.cover,
          readingTimePerLetter: roundSettings.readingTimePerLetter,
          responseWindow: roundSettings.responseWindow,
          handicapEnabled: roundSettings.handicapEnabled,
          handicapDelay: roundSettings.handicapDelay,
          themes: mergedThemes,
        });
      }
    }

    // Create merged pack for session
    const sessionPack: GamePack = {
      id: generateUUID(),
      name: selectedPacksList.length === 1
        ? selectedPacksList[0].name
        : `Session (${selectedPacksList.map((p: GamePack) => p.name).join(', ')})`,
      gameType: hostModals.selectedGame,
      rounds: mergedRounds,
      createdAt: Date.now(),
      // Use cover from first selected pack if available
      ...('cover' in selectedPacksList[0] && selectedPacksList[0].cover ? { cover: selectedPacksList[0].cover } : {}),
    };

    return sessionPack;
  }, [hostModals.selectedPacks, hostModals.selectedPackIds, hostModals.selectedGame]);

  // Drag and drop state
  const [draggedClientId, setDraggedClientId] = useState<string | null>(null);

  // Keep refs in sync with state
  const teamsRef = useRef<Team[]>([]);
  const buzzerStateRef = useRef(buzzerState);
  const answeringTeamIdRef = useRef<string | null>(answeringTeamId);
  const firstBuzzTimestampRef = useRef<number | null>(null);
  const clashingTeamIdsRef = useRef<Set<string>>(new Set());
  const clashPhaseRef = useRef<'idle' | 'waiting' | 'resolved'>('idle');
  const activeTeamIdsRef = useRef<Set<string>>(new Set());
  const answeringTeamLockedInRef = useRef<boolean>(false);

  // Keep all refs in sync with state - combined for better performance
  useEffect(() => {
    teamsRef.current = teams;
    buzzerStateRef.current = buzzerState;
    answeringTeamIdRef.current = answeringTeamId;
    firstBuzzTimestampRef.current = firstBuzzTimestamp;
    clashingTeamIdsRef.current = clashingTeamIds;
    clashPhaseRef.current = clashPhase;
    activeTeamIdsRef.current = activeTeamIds;
    answeringTeamLockedInRef.current = answeringTeamLockedIn;
  }, [teams, buzzerState, answeringTeamId, firstBuzzTimestamp, clashingTeamIds, clashPhase, activeTeamIds, answeringTeamLockedIn]);

  // Clean up buzzed clients after 3 seconds
  useEffect(() => {
    const BUZZ_DURATION = 3000; // 3 seconds
    const interval = setInterval(() => {
      const now = Date.now(); // Пересчитываем now при каждом вызове интервала
      setBuzzedClients(prev => {
        const updated = new Map(prev);
        for (const [clientId, timestamp] of prev.entries()) {
          if (now - timestamp > BUZZ_DURATION) {
            updated.delete(clientId);
          }
        }
        return updated;
      });
    }, 500); // Check every 500ms

    return () => clearInterval(interval);
  }, []);

  // Clean up disconnected clients after 60 seconds
  // Only removes clients that are both stale AND not in P2P connected list
  useEffect(() => {
    const DISCONNECT_TIMEOUT = 60000; // 60 seconds
    const interval = setInterval(() => {
      const now = Date.now();
      const connectedPeerIds = new Set(p2pHost?.connectedClients || []);

      setClients(prev => {
        const updated = new Map(prev);
        for (const [peerId, client] of updated.entries()) {
          const isStale = now - client.lastSeen > DISCONNECT_TIMEOUT;
          const isP2PConnected = connectedPeerIds.has(peerId);

          // Only remove if BOTH stale AND not in P2P connected list
          // This prevents removing active clients that are sending PING messages
          if (isStale && !isP2PConnected) {
            console.log('[HostView] Removing stale client:', client.name, 'peerId:', peerId,
              '(lastSeen:', now - client.lastSeen, 'ms ago, P2P connected:', isP2PConnected, ')');
            updated.delete(peerId);
          } else if (isStale && isP2PConnected) {
            // Client is stale but P2P layer says they're connected - this is a sync issue
            // Update lastSeen to prevent false disconnection
            console.log('[HostView] Stale client but P2P connected, updating lastSeen:', client.name, 'peerId:', peerId);
            client.lastSeen = now;
          }
        }
        return updated;
      });
    }, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, [p2pHost?.connectedClients]);

  // Update lastSeen for all connected clients periodically
  // This runs regardless of session state to keep connections alive
  useEffect(() => {
    const interval = setInterval(() => {
      setClients(prev => {
        const connectedPeerIds = new Set(p2pHost?.connectedClients || []);
        const now = Date.now();
        let hasChanges = false;

        // Check if any client needs updating
        for (const [peerId, client] of prev.entries()) {
          if (connectedPeerIds.has(peerId)) {
            // Only update if lastSeen would actually change (avoid unnecessary updates)
            if (now - client.lastSeen > 1000) { // Only update if last changed > 1s ago
              hasChanges = true;
              break;
            }
          }
        }

        if (!hasChanges) return prev; // No changes, return same reference

        // Create updated map only if there are changes
        const updated = new Map(prev);
        for (const [peerId, client] of updated.entries()) {
          // Update lastSeen for clients that are still connected
          // This prevents active clients from being marked as stale
          if (connectedPeerIds.has(peerId) && now - client.lastSeen > 1000) {
            updated.set(peerId, {
              ...client,
              lastSeen: now
            });
          }
        }
        return updated;
      });
    }, 5000); // Update every 5 seconds

    return () => clearInterval(interval);
  }, [p2pHost]);

  // Save host ID
  useEffect(() => {
    storage.set(STORAGE_KEYS.HOST_ID, hostId);
  }, [hostId]);

  // Network status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Preload critical components after mount
  useEffect(() => {
    // Preload components that are likely to be used during session
    const timer = setTimeout(() => {
      preloadCriticalComponents();
    }, 1000); // Delay to prioritize initial render

    return () => clearTimeout(timer);
  }, []);

  // Triple ESC to exit session
  useEffect(() => {
    if (!isSessionActive) return;

    let escPressCount = 0;
    let escTimeout: NodeJS.Timeout | null = null;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        escPressCount++;

        // Clear previous timeout
        if (escTimeout) {
          clearTimeout(escTimeout);
        }

        // If pressed 3 times, exit session
        if (escPressCount >= 3) {
          setIsSessionActive(false);
          escPressCount = 0;
          escTimeout = null;
          return;
        }

        // Reset count if no third press within 1 second
        escTimeout = setTimeout(() => {
          escPressCount = 0;
          escTimeout = null;
        }, 1000);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (escTimeout) {
        clearTimeout(escTimeout);
      }
    };
  }, [isSessionActive]);

  // Handle Q key for QR code toggle (global)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'q' || e.key === 'Q' || e.key === 'й' || e.key === 'Й') {
        // Only toggle if not in an input field
        if (
          !(
            e.target instanceof HTMLInputElement ||
            e.target instanceof HTMLTextAreaElement ||
            (e.target as HTMLElement).isContentEditable
          )
        ) {
          e.preventDefault();
          setShowQRCode(prev => !prev);
          console.log(!showQRCode ? '📱 Showing QR code' : '❌ Hiding QR code');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showQRCode]);

  // Broadcast QR code state and position to ScreenView
  useEffect(() => {
    if (p2pHost.isReady) {
      p2pHost.broadcast({
        category: 'state' as MessageCategory,
        type: 'QR_CODE_STATE',
        payload: {
          showQRCode: showQRCode,
          position: qrCodePosition
        }
      });
    }
  }, [showQRCode, qrCodePosition, p2pHost.isReady, p2pHost.broadcast]);

  // Calculate stats (excluding ScreenView)
  const clientStats = useMemo(() => {
    const clientsArray = Array.from(clients.values()).filter(client => !client.id.startsWith('screen_')) as ConnectedClient[];
    const active = clientsArray.length;
    const avgQuality = 100; // Default quality when no network
    return { active, total: clientsArray.length, avgQuality: Math.round(avgQuality) };
  }, [clients]);

  // Helper function to sync buzzer state via broadcast
  const handleBuzzerStateChange = useCallback((state: { active: boolean; timerPhase?: 'reading' | 'response' | 'complete' | 'inactive'; readingTimerRemaining: number; responseTimerRemaining: number; handicapActive: boolean; handicapTeamId?: string; isPaused?: boolean; readingTimeTotal?: number; responseTimeTotal?: number; timerBarColor?: string; timerTextColor?: string }) => {
    const timerPhase = state.timerPhase || 'inactive';
    const isPaused = state.isPaused ?? false;

    // Memoization: Check if state changed significantly to avoid duplicate broadcasts
    const lastSent = lastSentBuzzerStateRef.current;
    const phaseChanged = lastSent.timerPhase !== timerPhase;
    const activeChanged = lastSent.active !== state.active;
    const pausedChanged = lastSent.isPaused !== isPaused;

    // Determine action type
    let action: 'config' | 'pause' | 'resume' | 'stop' | undefined;
    if (timerPhase === 'inactive') {
      action = 'stop';
    } else if (phaseChanged || activeChanged) {
      action = 'config'; // Initial config or phase change
    } else if (pausedChanged) {
      action = isPaused ? 'pause' : 'resume';
    }

    // Calculate time differences (only for config action)
    const readingDiff = Math.abs(lastSent.readingTimerRemaining - state.readingTimerRemaining);
    const responseDiff = Math.abs(lastSent.responseTimerRemaining - state.responseTimerRemaining);

    // Only broadcast if:
    // - Phase changed, OR
    // - Active state changed, OR
    // - Pause state changed, OR
    // - Timer changed significantly (> 0.3 seconds)
    const significantChange = phaseChanged || activeChanged || pausedChanged ||
      (timerPhase === 'reading' && readingDiff > 0.3) ||
      (timerPhase === 'response' && responseDiff > 0.3);

    if (!significantChange) {
      // Skip broadcast - no significant change
      console.log('[HostView] TIMER_STATE skipped (no significant change):', {
        timerPhase,
        readingTime: state.readingTimerRemaining,
        responseTime: state.responseTimerRemaining,
        readingDiff,
        responseDiff
      });
      // IMMEDIATELY update buzzerStateRef for use in message handlers
      buzzerStateRef.current = {
        active: state.active,
        timerPhase: state.timerPhase,
        readingTimerRemaining: state.readingTimerRemaining,
        responseTimerRemaining: state.responseTimerRemaining,
        handicapActive: state.handicapActive,
        handicapTeamId: state.handicapTeamId,
        isPaused: state.isPaused
      };
      // Still update local state for GameSession (defer to avoid render conflict)
      setTimeout(() => setBuzzerState({
        active: state.active,
        timerPhase: state.timerPhase,
        readingTimerRemaining: state.readingTimerRemaining,
        responseTimerRemaining: state.responseTimerRemaining,
        handicapActive: state.handicapActive,
        handicapTeamId: state.handicapTeamId,
        isPaused: state.isPaused
      }), 0);
      return;
    }

    console.log('[HostView] TIMER_STATE broadcasting:', {
      timerPhase,
      readingTime: state.readingTimerRemaining,
      responseTime: state.responseTimerRemaining,
      readingTimeTotal: state.readingTimeTotal,
      responseTimeTotal: state.responseTimeTotal,
      isPaused: state.isPaused,
      action,
      reason: phaseChanged ? 'phase changed' : activeChanged ? 'active changed' : pausedChanged ? 'paused changed' : 'timer changed'
    });

    // Calculate colors based on timer phase
    const timerBarColor = state.timerBarColor || (timerPhase === 'reading' ? 'bg-yellow-500' : timerPhase === 'response' ? 'bg-green-500' : 'bg-gray-500');
    const timerTextColor = state.timerTextColor || (timerPhase === 'reading' ? 'text-yellow-300' : timerPhase === 'response' ? 'text-green-300' : 'text-gray-300');

    // IMMEDIATELY update buzzerStateRef for use in message handlers (no delay!)
    buzzerStateRef.current = {
      active: state.active,
      timerPhase: state.timerPhase,
      readingTimerRemaining: state.readingTimerRemaining,
      responseTimerRemaining: state.responseTimerRemaining,
      handicapActive: state.handicapActive,
      handicapTeamId: state.handicapTeamId,
      isPaused: state.isPaused
    };

    // Store buzzer state locally for GameSession (defer to avoid render conflict)
    setTimeout(() => setBuzzerState({
      active: state.active,
      timerPhase: state.timerPhase,
      readingTimerRemaining: state.readingTimerRemaining,
      responseTimerRemaining: state.responseTimerRemaining,
      handicapActive: state.handicapActive,
      handicapTeamId: state.handicapTeamId,
      isPaused: state.isPaused
    }), 0);

    // Update last sent state ref
    lastSentBuzzerStateRef.current = {
      active: state.active,
      timerPhase: timerPhase,
      readingTimerRemaining: state.readingTimerRemaining,
      responseTimerRemaining: state.responseTimerRemaining,
      isPaused: state.isPaused ?? false
    };

    // Broadcast buzzer state to all clients
    if (p2pHost.isReady) {
      const payload = {
        action,
        active: state.active,
        timerPhase: state.timerPhase || 'inactive',
        readingTimerRemaining: state.readingTimerRemaining,
        responseTimerRemaining: state.responseTimerRemaining,
        readingTimeTotal: state.readingTimeTotal,
        responseTimeTotal: state.responseTimeTotal,
        isPaused: state.isPaused,
        handicapActive: state.handicapActive,
        handicapTeamId: state.handicapTeamId,
        timerBarColor,
        timerTextColor
      };
      console.log('[HostView] Broadcasting TIMER_STATE payload:', payload);
      p2pHost.broadcast({
        category: MessageCategory.STATE,
        type: 'TIMER_STATE',
        payload
      });
    }

    // Reset state only when ENTERING response phase (not every update)
    const prevPhase = prevTimerPhaseRef.current;
    if (state.timerPhase === 'response' && state.active && prevPhase !== 'response') {
      // Reset clash state when entering response phase (new question)
      // Use setTimeout to avoid setState during render
      setTimeout(() => {
        setFirstBuzzTimestamp(null);
        setClashingTeamIds(new Set());
        setClashPhase('idle');
        // Reset removed from queue state
        setRemovedFromQueueTeamIds(new Set());
        // Reset clash occurred flag for new question
        setClashOccurredForQuestion(false);
      }, 0);
    }

    // Update previous timer phase
    if (state.timerPhase) {
      prevTimerPhaseRef.current = state.timerPhase;
    }
  }, [p2pHost.isReady, p2pHost.broadcast]);

  // Memoized callback for updating active team IDs (prevents infinite re-render loop)
  const handleUpdateActiveTeamIds = useCallback((teamIds: Set<string>) => {
    // Only update if the Set actually changed (by content, not by reference)
    const currentIds = Array.from(activeTeamIds).sort().join(',');
    const newIds = Array.from(teamIds).sort().join(',');
    if (currentIds !== newIds) {
      console.log('[HostView] ✅ Updating activeTeamIds:', Array.from(teamIds));
      // Use setTimeout to avoid setState during render
      setTimeout(() => setActiveTeamIds(teamIds), 0);
    }
  }, [activeTeamIds]);

  // Helper function to broadcast arbitrary message (kept for interface compatibility)
  const broadcastMessage = useCallback((message: unknown) => {
    console.log('[HostView] broadcastMessage called with:', message);

    // Broadcast via P2P to all connected clients
    if (p2pHost.isReady) {
      // Convert to P2P message format
      const broadcastMsg: Omit<BroadcastMessage, 'id' | 'timestamp' | 'senderId'> = {
        category: MessageCategory.EVENT,
        type: 'BROADCAST',
        payload: message
      };

      console.log('[HostView] Broadcasting BROADCAST message:', broadcastMsg);
      p2pHost.broadcast(broadcastMsg);
    } else {
      console.log('[HostView] P2P host not ready, broadcast skipped');
    }
  }, [p2pHost.isReady, p2pHost.broadcast]);

  // Reset super game state when session starts/ends
  useEffect(() => {
    if (!isSessionActive) {
      setSuperGameBets([]);
      setSuperGameAnswers([]);
    }
  }, [isSessionActive]);

  // Delete a team
  const deleteTeam = useCallback((teamId: string) => {
    // Remove team from all clients FIRST (before updating teams)
    setClients(clientsPrev => {
      const updated = new Map(clientsPrev);
      updated.forEach((client) => {
        if (client.teamId === teamId) {
          client.teamId = undefined;
        }
      });
      return updated;
    });
    // Remove from teams array
    setTeams(prev => prev.filter(t => t.id !== teamId));
  }, []);

  // Rename a team
  const renameTeam = useCallback((teamId: string, newName: string) => {
    setTeams(prev => {
      const updated = prev.map(t => t.id === teamId ? { ...t, name: newName } : t);
      return updated;
    });
  }, []);

  const getClientTeamName = useCallback((clientId: string) => {
    const client = clients.get(clientId);
    if (!client?.teamId) return undefined;
    return teams.find(t => t.id === client.teamId)?.name;
  }, [clients, teams]);

  // Move client to team (drag and drop)
  const moveClientToTeam = useCallback((clientId: string, targetTeamId: string | undefined) => {
    setClients(prev => {
      const client = prev.get(clientId);
      if (client && client.teamId !== targetTeamId) {
        // Create new Map only if teamId actually changed
        const updated = new Map(prev);
        const updatedClient = updated.get(clientId);
        if (updatedClient) {
          updatedClient.teamId = targetTeamId;
        }
        return updated;
      }
      return prev;
    });
  }, []);

  // Drag handlers
  const handleDragStart = useCallback((clientId: string) => {
    setDraggedClientId(clientId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); // Allow drop
  }, []);

  const handleDropOnTeam = useCallback((targetTeamId: string | undefined) => {
    if (draggedClientId) {
      moveClientToTeam(draggedClientId, targetTeamId);
      setDraggedClientId(null);
    }
  }, [draggedClientId, moveClientToTeam]);

  const handleDragEnd = useCallback(() => {
    setDraggedClientId(null);
  }, []);

  // Connection status enum
  enum ConnectionStatus {
    DISCONNECTED = 'disconnected',
    INITIALIZING = 'initializing',
    WAITING = 'waiting',
    CONNECTING = 'connecting',
    CONNECTED = 'connected',
    RECONNECTING = 'reconnecting',
    ERROR = 'error'
  }

  // Current connection status (always CONNECTED since no network)
  const status = ConnectionStatus.CONNECTED;

  // --- LOBBY VIEW ---
  if (!isSessionActive) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col p-6 items-center justify-center">
        <div className="w-full max-w-7xl grid lg:grid-cols-2 gap-5 md:gap-7 animate-in fade-in duration-500 cursor-default">
          {/* LEFT COLUMN: Setup & QR */}
          <div className="flex flex-col space-y-3">
            {/* First row: IP input + LAN button + OK button */}
            <div className="bg-gray-900 border border-gray-800 p-4 rounded-lg shadow-lg cursor-default">
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={ipInput}
                  onChange={(e) => setIpInput(e.target.value)}
                  placeholder="192.168.1.x"
                  disabled={!isLanMode || isIpLocked}
                  className="flex-1 bg-gray-950 border border-gray-700 rounded-lg px-6 py-4 text-white text-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all placeholder:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <button
                  onClick={() => setIsLanMode(!isLanMode)}
                  className={`h-[60px] w-[91px] rounded-lg border-2 text-base font-medium transition-colors ${
                    isLanMode
                      ? 'bg-blue-600 hover:bg-blue-700 text-white border-blue-500'
                      : 'bg-gray-800 hover:bg-gray-700 text-gray-400 border-gray-700'
                  }`}
                >
                  LAN
                </button>
                <button
                  onClick={() => {
                    if (isIpLocked) {
                      // Unlock the IP
                      setIsIpLocked(false);
                      storage.remove(STORAGE_KEYS.LOCKED_IP);
                    } else if (ipInput.trim()) {
                      // Lock the IP
                      setIpInput(ipInput.trim());
                      setIsIpLocked(true);
                      storage.set(STORAGE_KEYS.LOCKED_IP, ipInput.trim());

                      // Generate invitation URL with connection parameters
                      // Format: http://IP:3000#/mobile?host=HOST_ID&signalling=IP&session=SESSION_ID
                      const inviteUrl = `http://${ipInput.trim()}:3000#/mobile?host=${encodeURIComponent(hostId)}&signalling=${encodeURIComponent(ipInput.trim())}&session=${encodeURIComponent(sessionId)}`;
                      setFinalQrUrl(inviteUrl);
                      storage.set(STORAGE_KEYS.QR_URL, inviteUrl);
                    }
                  }}
                  disabled={(!isIpLocked && !ipInput.trim()) || !isLanMode}
                  className={`h-[60px] w-[91px] rounded-lg border-2 text-base font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    isIpLocked
                      ? 'bg-gray-600 hover:bg-gray-700 text-white'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  {isIpLocked ? 'OK' : 'OK'}
                </button>
              </div>
            </div>

            {/* Session ID */}
            <div className="bg-gray-900 border border-gray-800 p-4 rounded-lg shadow-lg cursor-default">
              <div className="flex items-center gap-2">
                <label className="text-base font-semibold text-gray-400 uppercase tracking-wider">Session ID</label>
                <input
                  key={sessionId}
                  type="text"
                  value={sessionId}
                  className="flex-1 bg-gray-950 border border-gray-700 rounded-lg px-6 py-2.5 text-white text-lg text-center font-mono text-3xl tracking-widest"
                  readOnly
                />
                <button
                  onClick={() => {
                    // Generate random letters (can be uppercase or lowercase)
                    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
                    let newSessionId = '';
                    for (let i = 0; i < 5; i++) {
                      newSessionId += chars.charAt(Math.floor(Math.random() * chars.length));
                    }
                    setSessionId(newSessionId);
                    // Update host unique ID and storage
                    const newHostUniqueId = generateHostUniqueId();
                    storage.set(STORAGE_KEYS.HOST_UNIQUE_ID, newHostUniqueId);
                    setHostUniqueId(newHostUniqueId);
                    // Update QR URL with new session ID
                    if (isIpLocked && isLanMode && ipInput) {
                      const inviteUrl = `http://${ipInput}:3000#/mobile?host=${encodeURIComponent(hostId)}&signalling=${encodeURIComponent(ipInput)}&session=${encodeURIComponent(newSessionId)}`;
                      setFinalQrUrl(inviteUrl);
                      storage.set(STORAGE_KEYS.QR_URL, inviteUrl);
                    } else if (!isLanMode) {
                      const inviteUrl = `${window.location.origin}#/mobile?host=${encodeURIComponent(hostId)}&session=${encodeURIComponent(newSessionId)}`;
                      setFinalQrUrl(inviteUrl);
                      storage.set(STORAGE_KEYS.QR_URL, inviteUrl);
                    }
                  }}
                  className="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors flex items-center gap-2 text-lg font-medium"
                  title="Regenerate Session ID"
                >
                  <RefreshCw className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* QR Code */}
            <div className="relative aspect-square w-full bg-gray-900 border border-gray-800 rounded-lg shadow-2xl overflow-hidden flex flex-col items-center justify-center p-12 group cursor-default">
              <div className="absolute inset-0 bg-blue-600/5 blur-[80px] rounded-full pointer-events-none group-hover:bg-blue-600/10 transition-colors duration-500"></div>
              <div
                key={finalQrUrl}
                className="relative z-10 bg-white p-5 rounded-lg shadow-xl"
              >
                {!isIpLocked ? (
                  <div className="w-[456px] h-[456px] bg-gray-100 rounded-lg flex flex-col items-center justify-center text-center p-8 space-y-5">
                    <div className="w-20 h-20 bg-gray-200 rounded-full flex items-center justify-center">
                      <Settings className="w-12 h-12 text-gray-400" />
                    </div>
                    <p className="text-gray-600 font-medium text-xl">Enter IP address</p>
                    <p className="text-gray-400 text-lg">Then confirm to generate QR code</p>
                  </div>
                ) : (
                  <>
                    <QRCodeSVG value={finalQrUrl} size={456} level="H" includeMargin={true} />
                  </>
                )}
              </div>
              <div className="mt-6 text-center z-10 flex items-center justify-center gap-2">
                {/* Screen link button - same size as Copy invitation link */}
                <button
                  onClick={handleCopyScreenLink}
                  disabled={!finalQrUrl}
                  className={`relative flex items-center justify-center px-6 py-5 rounded-lg transition-all duration-200 ${
                    screenLinkCopied
                      ? 'bg-white text-blue-600'
                      : 'bg-blue-600 hover:bg-blue-700 text-white active:scale-95'
                  }`}
                  style={{ minWidth: '240px' }}
                >
                  <Monitor className="w-7 h-7" />
                  <span className="ml-3 font-medium text-lg">{screenLinkCopied ? 'Copied!' : 'Demo screen'}</span>
                </button>

                {/* Main invitation link button */}
                <button
                  onClick={() => {
                    if (finalQrUrl) {
                      navigator.clipboard.writeText(finalQrUrl);
                      setLinkCopied(true);
                      setTimeout(() => setLinkCopied(false), 2000);
                    }
                  }}
                  disabled={!finalQrUrl}
                  className={`relative flex items-center justify-center px-6 py-5 rounded-lg transition-all duration-200 pl-14 ${
                    linkCopied
                      ? 'bg-white text-blue-600'
                      : 'bg-blue-600 hover:bg-blue-700 text-white active:scale-95'
                  }`}
                  style={{ minWidth: '240px' }}
                >
                  <Copy className="absolute left-5 w-7 h-7" />
                  <span className="font-medium text-lg">{linkCopied ? 'Link copied!' : 'Copy invitation link'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: List */}
          <div className="flex flex-col h-full space-y-3">
             <div className="flex-1 bg-gray-900/80 backdrop-blur-sm border border-gray-800 rounded-lg p-5 flex flex-col min-h-[460px] shadow-xl cursor-default">
                <div className="flex justify-between items-center mb-2 border-b border-gray-800 pb-1">
                   <h2 className="text-3xl font-bold text-white flex items-center gap-2">
                     <Users className="w-6 h-6 text-blue-400" /> Lobby
                   </h2>
                   <div className="flex items-center gap-2">
                     <div className="bg-gray-800 px-6 py-3 rounded-full text-base font-mono text-blue-400 border border-blue-500/20">
                       {Array.from(clients.values()).filter(client => !client.id.startsWith('screen_')).length} Ready
                     </div>
                   </div>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 pr-1.5 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
                   {sessionSettings.noTeamsMode ? (
                     // No Teams Mode - show all players individually (excluding ScreenView)
                     Array.from(clients.values())
                       .filter((client: ConnectedClient) => !client.id.startsWith('screen_')) // Exclude ScreenView
                       .map((client: ConnectedClient) => (
                       <SimpleClientItem
                         key={client.id}
                         client={client}
                         isStale={(lastSeen) => {
                           // Consider client stale if not seen for 10 seconds
                           return Date.now() - lastSeen > 10000;
                         }}
                         hasBuzzed={buzzedClients.has(client.id)}
                         isBuzzing={buzzingClientIds.has(client.id)}
                         onRemove={removeClient}
                         getHealthBgColor={getHealthBgColor}
                       />
                     ))
                   ) : (
                     <>
                       {/* Show all teams (even empty ones) - memoized */}
                       {teams.map(team => {
                         const teamClients = Array.from(clients.values()).filter((c: ConnectedClient) => c.teamId === team.id);

                         return (
                           <TeamListItem
                             key={team.id}
                             team={team}
                             teamClients={teamClients}
                             isEditing={editingTeamId === team.id}
                             editingTeamName={editingTeamName}
                             isDraggingOver={draggedClientId !== null}
                             onDragOver={handleDragOver}
                             onDrop={() => handleDropOnTeam(team.id)}
                             onEditStart={() => {
                               setEditingTeamId(team.id);
                               setEditingTeamName(team.name);
                             }}
                             onRename={renameTeam}
                             onDelete={() => {
                               hostModals.showConfirmDialog(
                                 'Delete Team',
                                 `Are you sure you want to delete team "${team.name}"?`,
                                 'danger',
                                 () => {
                                   hostModals.closeConfirmDialog();
                                   deleteTeam(team.id);
                                 }
                               );
                             }}
                             onEditingNameChange={(name) => setEditingTeamName(name)}
                             onEditingIdSet={(id) => setEditingTeamId(id)}
                             buzzedClients={buzzedClients}
                             buzzingClientIds={buzzingClientIds}
                             isStale={() => false}
                             draggedClientId={draggedClientId}
                             onDragStart={handleDragStart}
                             onDragEnd={handleDragEnd}
                             onRemoveClient={removeClient}
                           />
                         );
                       })}

                       {/* Players without team - memoized */}
                       <NoTeamSection
                         noTeamClients={Array.from(clients.values()).filter((c: ConnectedClient) => !c.teamId)}
                         isDraggingOver={draggedClientId !== null}
                         onDragOver={handleDragOver}
                         onDrop={() => handleDropOnTeam(undefined)}
                         buzzedClients={buzzedClients}
                         buzzingClientIds={buzzingClientIds}
                         isStale={() => false}
                         draggedClientId={draggedClientId}
                         onDragStart={handleDragStart}
                         onDragEnd={handleDragEnd}
                         onRemoveClient={removeClient}
                         getHealthBgColor={getHealthBgColor}
                       />

                       {/* Create Team button - always visible */}
                       <div className="bg-gray-900/50 backdrop-blur-sm rounded-lg p-4">
                           {!showCreateTeamInput ? (
                             <button
                               onClick={() => setShowCreateTeamInput(true)}
                               className="w-full p-4 border-2 border-dashed border-gray-700 rounded-lg text-gray-500 text-lg hover:bg-gray-800/50 hover:text-gray-300 transition-colors flex items-center justify-center gap-2.5"
                             >
                               <Plus className="w-6 h-6 text-gray-400" />
                               <span>Create Team</span>
                             </button>
                           ) : (
                             <div className="flex items-center gap-2.5 p-4 bg-gray-800/50 rounded-lg border-2 border-blue-500/30">
                               <Plus className="w-6 h-6 text-blue-400" />
                               <input
                                 type="text"
                                 value={newTeamName}
                                 onChange={(e) => setNewTeamName(e.target.value)}
                                 onKeyDown={(e) => {
                                   if (e.key === 'Enter') {
                                     if (newTeamName.trim()) {
                                       handleCreateCommand(newTeamName.trim());
                                       setNewTeamName('');
                                       setShowCreateTeamInput(false);
                                     }
                                   } else if (e.key === 'Escape') {
                                     setShowCreateTeamInput(false);
                                     setNewTeamName('');
                                   }
                                 }}
                                 placeholder="Team name..."
                                 className="flex-1 bg-transparent text-white text-lg font-medium focus:outline-none"
                                 autoFocus
                               />
                               {newTeamName.trim() && (
                                 <button
                                   onClick={() => {
                                     handleCreateCommand(newTeamName.trim());
                                     setNewTeamName('');
                                     setShowCreateTeamInput(false);
                                   }}
                                   className="p-2.5 hover:bg-gray-700 rounded-lg text-green-400"
                                   title="Create team"
                                 >
                                   <Check className="w-6 h-6" />
                                 </button>
                               )}
                               <button
                                 onClick={() => {
                                   setShowCreateTeamInput(false);
                                   setNewTeamName('');
                                 }}
                                 className="p-2.5 hover:bg-gray-700 rounded-lg text-gray-400 text-lg"
                                 title="Cancel"
                               >
                                 ✕
                               </button>
                             </div>
                           )}
                         </div>
                     </>
                   )}
              </div>
             </div>

             {/* Selected game info */}
             <div className="bg-gray-900/50 border border-gray-800 rounded-lg px-4 py-3 flex items-center justify-between">
               <div className="flex items-center gap-2">
                 <div className="w-14 h-14 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center">
                   <span className="text-2xl font-bold">{hostModals.selectedGame === 'custom' ? 'СИ' : hostModals.selectedGame === 'quiz' ? 'К' : 'В'}</span>
                 </div>
                 <div>
                   <div className="text-xl font-medium text-white">
                     {hostModals.selectedGame === 'custom' ? 'Своя игра' : hostModals.selectedGame === 'quiz' ? 'Квиз' : 'Викторина'}
                   </div>
                   {hostModals.selectedPacks.length > 0 ? (
                     <div className="text-base text-gray-500">{hostModals.selectedPacks.length} pack{hostModals.selectedPacks.length > 1 ? 's' : ''} selected</div>
                   ) : (
                     <div className="text-base text-gray-600">No pack selected</div>
                   )}
                 </div>
               </div>
             </div>

             <div className="flex gap-2">
               <Button size="xl" variant="secondary" className="px-6" onClick={() => hostModals.openSettingsModal()} title="Session Settings">
                  <Settings className="w-8 h-8" />
               </Button>
               <Button size="xl" variant="secondary" className="px-5" onClick={() => hostModals.openGameSelector()} disabled={!isOnline || !isIpLocked}>
                  Select Game
               </Button>
               <Button size="xl" className="flex-1 text-lg shadow-blue-900/20" onClick={() => {
                 // Generate new session version to help clients detect this is a fresh session
                 const newVersion = `v_${Date.now()}`;
                 setSessionVersion(newVersion);
                 storage.set(STORAGE_KEYS.SESSION_VERSION, newVersion);
                 setIsSessionActive(true);
               }} disabled={!isOnline || !isIpLocked}>
                  Start Session <ArrowRight className="ml-3 w-7 h-7" />
               </Button>
             </div>
          </div>
        </div>

        {/* All Host Modals - Consolidated Component */}
        <HostModals
          showSettingsModal={hostModals.showSettingsModal}
          onCloseSettingsModal={() => hostModals.closeSettingsModal()}
          settings={sessionSettings}
          onSaveSettings={updateSessionSettings}
          onClearCache={handleClearCache}
          showGameSelector={hostModals.showGameSelector}
          onCloseGameSelector={() => hostModals.closeGameSelector()}
          onSaveGameSelection={hostModals.handleSaveGameSelection}
          selectedGame={hostModals.selectedGame}
          selectedPackIds={hostModals.selectedPackIds}
          selectedPacks={hostModals.selectedPacks}
          confirmDialog={hostModals.confirmDialog}
          onCloseConfirmDialog={() => hostModals.closeConfirmDialog()}
        />
      </div>
    );
  }

  // --- GAME SESSION ---
  return (
    <>
      <GameSession
        teams={teams}
        clients={clients}
        buzzedClients={buzzedClients}
        buzzedTeamIds={buzzedTeamIds}
        lateBuzzTeamIds={lateBuzzTeamIds}
        status={status}
        isOnline={isOnline}
        showQRCode={showQRCode}
        onBackToLobby={() => {
          setIsSessionActive(false);
        }}
        onClearBuzz={() => setBuzzedClients(new Map())}
        onBuzzerStateChange={handleBuzzerStateChange}
        buzzerState={buzzerState}
        gameType={hostModals.selectedGame}
        mergedPack={mergedSessionPack}
        noTeamsMode={sessionSettings.noTeamsMode}
        sessionSettings={sessionSettings}
        answeringTeamId={answeringTeamId}
        onAnsweringTeamChange={setAnsweringTeamId}
        onBroadcastMessage={broadcastMessage}
        superGameBets={superGameBets}
        superGameAnswers={superGameAnswers}
        onSuperGamePhaseChange={setSuperGamePhase}
        onSuperGameMaxBetChange={setSuperGameMaxBet}
        onRequestStateSync={() => setStateSyncTrigger(prev => prev + 1)}
        stateSyncTrigger={stateSyncTrigger}
        // Active/inactive players props
        activeTeamIds={activeTeamIds}
        answeringTeamLockedIn={answeringTeamLockedIn}
        onUpdateActiveTeamIds={handleUpdateActiveTeamIds}
        demoScreenConnected={!!screenViewPeerIdRef.current}
        switchToResponsePhaseSignal={switchToResponsePhaseSignal}
        onPhaseSwitchComplete={handlePhaseSwitchComplete}
      />

      {/* All Host Modals - Consolidated Component */}
      <HostModals
        showSettingsModal={false}
        onCloseSettingsModal={() => hostModals.closeSettingsModal()}
        settings={sessionSettings}
        onSaveSettings={updateSessionSettings}
        onClearCache={handleClearCache}
        showGameSelector={false}
        onCloseGameSelector={() => hostModals.closeGameSelector()}
        onSaveGameSelection={hostModals.handleSaveGameSelection}
        selectedGame={hostModals.selectedGame}
        selectedPackIds={hostModals.selectedPackIds}
        selectedPacks={hostModals.selectedPacks}
        confirmDialog={hostModals.confirmDialog}
        onCloseConfirmDialog={() => hostModals.closeConfirmDialog()}
      />

      {/* Draggable QR Code */}
      <DraggableQRCode
        hostId={hostId}
        isVisible={showQRCode}
        onClose={() => setShowQRCode(false)}
        onPositionChange={setQrCodePosition}
      />
    </>
  );
};
