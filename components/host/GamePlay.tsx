/**
 * GamePlay Component
 *
 * Full "Jeopardy-style" game implementation with intro sequence:
 * - Screen 1: Pack cover with name
 * - Screen 2: Themes titles (for reading by host)
 * - Screen 3: Round intro with cover
 * - Screen 4: Game board with themes and point cards
 *
 * Features:
 * - Question modal with media support
 * - Buzzer activation with timer settings
 * - Scoring with keyboard controls (Space = correct, Control = wrong)
 * - Team scores displayed in top panel
 */

import React, { memo, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { flushSync } from 'react-dom';
import { Volume2 } from 'lucide-react';
import type { GamePack } from './OptimizedGameSelectorModal';
import type { Round, Theme, Question } from './PackEditor';
import { Team } from '../../types';
import { restorePackBlobUrlsFromStorage, restoreBlobFromStorage } from '../../utils/mediaManager';
import {
  calculateQuestionFontSize,
  calculateAnswerFontSizeMobile,
  calculateAnswerFontSizeDesktop,
  calculateThemeCardFontSize,
  calculateThemeGrid,
  type GameScreen,
  type SuperGameBet,
  type SuperGameAnswer,
  type BuzzerState,
  GameBoardExtended,
  ShowWinnerScreen as ModalShowWinnerScreen,
  type TeamScore as ModalTeamScore
} from './game';
import { QuestionModal as ModalQuestionModal } from './game/modals';
import { SuperGameQuestionModal, SuperGameAnswersModal } from './game/SuperGameModals';
// DebugMediaStreamer removed - using syncMediaStreamer instead
import { streamMediaFilesSynchronously, clearTransferredMediaCache } from '../../utils/syncMediaStreamer';
import { useHostMessageSequencer } from '../../utils/hostMessageSequencer';
// New team status management system
import {
  useTeamStatusManager,
  useTeamContextMenu,
  TeamStatus,
  type TeamState,
} from '../../hooks/useTeamStatusManager';
import { TeamCardContextMenu, useTeamCardClicks } from '../shared/TeamCardContextMenu';

interface TeamScore {
  teamId: string;
  teamName: string;
  score: number;
}

// Re-export TeamScore from types for compatibility
export type { TeamScore } from '../../../types';

interface GamePlayProps {
  pack: GamePack;
  teams: Team[];
  onBackToLobby?: () => void;
  onBuzzerStateChange: (state: BuzzerState) => void;
  onBuzzTriggered: (teamId: string | null) => void;
  onClearBuzzes?: () => void;  // Clear buzzed clients when transitioning to response phase
  buzzedTeamId: string | null;
  buzzedTeamIds?: Set<string>;  // Teams that recently buzzed (for white flash effect)
  lateBuzzTeamIds?: Set<string>;  // Teams that buzzed after answering team was set (blue flash)
  answeringTeamId?: string | null;  // Team that gets to answer the question
  onAnsweringTeamChange?: (teamId: string | null) => void;  // Callback to reset answering team
  // Super Game props (optional for backward compatibility)
  onBroadcastMessage?: (message: unknown) => void;  // Broadcast message to all clients (no-op without network)
  superGameBets?: SuperGameBet[];  // Bets received from mobile clients
  superGameAnswers?: SuperGameAnswer[];  // Answers received from mobile clients
  onSuperGamePhaseChange?: (phase: 'idle' | 'placeBets' | 'showQuestion' | 'showWinner') => void;  // Track super game phase
  onSuperGameMaxBetChange?: (maxBet: number) => void;  // Track max bet for super game
  onRequestStateSync?: () => void;  // Trigger to resend current state to clients
  stateSyncTrigger?: number;  // Trigger value that changes when state sync is requested
  // Active/inactive players props
  activeTeamIds?: Set<string>;  // Players who can BUZZ to become answering (active = blue, inactive = white)
  answeringTeamLockedIn?: boolean;  // Answering team is locked (answered incorrectly/correctly)
  onUpdateActiveTeamIds?: (teamIds: Set<string>) => void;  // Callback to update active team IDs
  showQRCode?: boolean;  // QR code visibility state
  sessionSettings?: {  // Session settings for simultaneous buzz
    simultaneousBuzzEnabled?: boolean;
    simultaneousBuzzThreshold?: number;
  };
  demoScreenConnected?: boolean;  // If true, demo screen controls timer phase transitions
  switchToResponsePhaseSignal?: number | null;  // Trigger value to switch from reading to response phase (from demo screen)
  onPhaseSwitchComplete?: () => void;  // Callback to reset the signal after processing
}

export const GamePlay = memo(({
  pack,
  teams,
  onBackToLobby: _onBackToLobby,
  onBuzzerStateChange,
  onBuzzTriggered,
  onClearBuzzes,
  buzzedTeamId,
  buzzedTeamIds,
  lateBuzzTeamIds,
  answeringTeamId,
  onAnsweringTeamChange,
  onBroadcastMessage,
  superGameBets: externalSuperGameBets,
  superGameAnswers: externalSuperGameAnswers,
  onSuperGamePhaseChange,
  onSuperGameMaxBetChange,
  onRequestStateSync,
  stateSyncTrigger,
  activeTeamIds = new Set(),
  answeringTeamLockedIn = false,
  onUpdateActiveTeamIds,
  showQRCode = false,
  sessionSettings,
  demoScreenConnected = false,
  switchToResponsePhaseSignal,
  onPhaseSwitchComplete,
}: GamePlayProps) => {
  // Game state
  const [currentScreen, setCurrentScreen] = useState<GameScreen>('cover');
  const previousScreenRef = useRef<GameScreen>('cover');
  const [currentRoundIndex, setCurrentRoundIndex] = useState(0);
  const [answeredQuestions, setAnsweredQuestions] = useState<Set<string>>(new Set());

  // Stabilize teams prop to prevent unnecessary useEffect recreations
  const prevTeamsIdsRef = useRef<string>('');
  const stabilizedTeams = useMemo(() => {
    const currentIds = teams.map(t => t.id).sort().join(',');
    if (currentIds !== prevTeamsIdsRef.current) {
      prevTeamsIdsRef.current = currentIds;
      return teams;
    }
    return (GamePlay as any)._stabilizedTeams || teams;
  }, [teams]);
  (GamePlay as any)._stabilizedTeams = stabilizedTeams;

  const [teamScores, setTeamScores] = useState<TeamScore[]>(
    stabilizedTeams.map(t => ({ teamId: t.id, teamName: t.name, score: 0 }))
  );

  // Ref to store teamScores for immediate access in broadcastGameState
  // This prevents stale closure issues when score changes
  const teamScoresRef = useRef<TeamScore[]>([]);
  // Initialize ref with initial state
  teamScoresRef.current = teamScores;

  // Keep ref in sync with state
  useEffect(() => {
    teamScoresRef.current = teamScores;
  }, [teamScores]);

  // Stabilize teamIds to prevent unnecessary useEffect recreations
  const teamIds = useMemo(() => stabilizedTeams.map(t => t.id), [stabilizedTeams]);

  // Super Game state
  const [selectedSuperThemeId, setSelectedSuperThemeId] = useState<string | null>(null);
  const [disabledSuperThemeIds, setDisabledSuperThemeIds] = useState<Set<string>>(new Set());
  const [superGameBets, setSuperGameBets] = useState<SuperGameBet[]>([]);
  const [superGameAnswers, setSuperGameAnswers] = useState<SuperGameAnswer[]>([]);
  const [selectedSuperAnswerTeam, setSelectedSuperAnswerTeam] = useState<string | null>(null);

  // Question modal state
  const [activeQuestion, setActiveQuestion] = useState<{
    question: Question;
    theme: Theme;
    points: number;
    roundName?: string;
  } | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [, setBuzzerActive] = useState(false);
  const buzzerActiveRef = useRef(false); // Track buzzer active state for sendBuzzerState
  const [highlightedQuestion, setHighlightedQuestion] = useState<string | null>(null);


  // Sequence counter for ordered messaging
  const sequenceCounterRef = useRef(0);

  // Refs for timer and cleanup
  const buzzerDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const responseWindowRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateUpdateRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Ref for broadcast throttling (avoid excessive updates)
  const lastBroadcastRef = useRef<number>(0);
  const lastScreenChangeRef = useRef<number>(0);
  const lastScrollBroadcastRef = useRef<number>(0);
  const broadcastThrottleMs = 100; // Minimum time between broadcasts
  const screenChangeBroadcastMs = 50; // Shorter throttle for screen changes
  const scrollBroadcastThrottleMs = 35; // Fast throttle for smooth scrolling on demo screen

  // Refs for double-press tracking (R/E for round navigation)
  const doublePressRef = useRef<{ lastKey: string; lastTime: number }>({ lastKey: '', lastTime: 0 });

  // Ref for themes scroll container
  const themesScrollRef = useRef<HTMLDivElement>(null);
  const scrollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [themesScrollPosition, setThemesScrollPosition] = useState<number>(0);

  // Ref to store current response timer remaining value (for checking if buzzer should be reactivated)
  const responseTimerRemainingRef = useRef<number>(0);

  // Ref to store stable callback for buzzer state changes
  const onBuzzerStateChangeRef = useRef(onBuzzerStateChange);
  onBuzzerStateChangeRef.current = onBuzzerStateChange;

  // ============================================================================
  // NEW: Team Status Manager
  // ============================================================================
  const teamStatusManager = useTeamStatusManager({
    teamIds: teamIds,
    onTeamStatesChange: (states) => {
      // Broadcast team state changes to demo screen
      // This will be called automatically when team states change
    },
    onAnsweringTeamChange: onAnsweringTeamChange,
    simultaneousBuzzEnabled: sessionSettings?.simultaneousBuzzEnabled ?? true,
    simultaneousBuzzThreshold: sessionSettings?.simultaneousBuzzThreshold ?? 0.5,
  });

  // Ref to store teamStatusManager for handleScoreChange to avoid stale closures
  // MUST be after teamStatusManager declaration
  const teamStatusManagerRef = useRef(teamStatusManager);
  teamStatusManagerRef.current = teamStatusManager;

  const teamContextMenu = useTeamContextMenu(teamStatusManager);
  const teamCardClicks = useTeamCardClicks(teamStatusManager, teamContextMenu, teamStatusManager.isResponseTimerActive);

  // Ref to store current buzzer state for broadcastGameState
  const buzzerStateRef = useRef<{
    active: boolean;
    timerPhase?: 'reading' | 'response' | 'complete' | 'inactive';
    readingTimerRemaining: number;
    responseTimerRemaining: number;
    handicapActive: boolean;
    handicapTeamId?: string;
    isPaused: boolean;
    readingTimeTotal?: number;
    responseTimeTotal?: number;
    timerColor?: 'yellow' | 'green' | 'gray';
    timerBarColor?: string;
    timerTextColor?: string;
  }>({
    active: false,
    timerPhase: 'inactive',
    readingTimerRemaining: 0,
    responseTimerRemaining: 0,
    handicapActive: false,
    isPaused: false,
    readingTimeTotal: 0,
    responseTimeTotal: 30,
    timerColor: 'gray',
    timerBarColor: 'bg-gray-500',
    timerTextColor: 'text-gray-300'
  });

  // Ref to store function for switching to response phase (called from demo screen signal)
  const switchToResponsePhaseRef = useRef<(() => void) | null>(null);

  // Ref to track last processed phase switch signal to prevent duplicate processing
  const lastProcessedSignalRef = useRef<number | null>(null);

  // Ref to track last broadcast buzzer state (to avoid unnecessary updates)
  const lastBroadcastBuzzerStateRef = useRef<{
    active: boolean;
    timerPhase?: 'reading' | 'response' | 'complete' | 'inactive';
    isPaused: boolean;
    readingTimerRemaining: number;
    responseTimerRemaining: number;
  }>({
    active: false,
    timerPhase: 'inactive',
    isPaused: false,
    readingTimerRemaining: 0,
    responseTimerRemaining: 0
  });

  // State for timer pause control
  const [timerPaused, setTimerPaused] = useState(false);

  // Ref for timer paused state to access in closures
  const timerPausedRef = useRef(false);
  timerPausedRef.current = timerPaused;

  // Stable session ID for message sequencer (created once to prevent infinite re-renders)
  const stableSessionId = useMemo(() => `game-session-${Date.now()}`, []);

  // Initialize host message sequencer for ordered messaging
  const hostSequencer = useHostMessageSequencer({
    sessionId: stableSessionId,
    historySize: 1000,
    debug: false // Set to true for debugging message sequencing
  });

  // Wrapper for onBroadcastMessage that adds sequence numbers
  const broadcastMessage = useCallback((message: any) => {
    if (!onBroadcastMessage) return;

    // Add sequence number to the message
    // IMPORTANT: Spread message FIRST to preserve type and other fields
    // Don't add id/timestamp/senderId here - useP2PHost will add them
    const sequencedMessage = hostSequencer.prepareMessage({
      ...message  // Just spread the message, let useP2PHost add service fields
    });

    onBroadcastMessage(sequencedMessage);
  }, [onBroadcastMessage, hostSequencer]);

  // Ref to track when QuestionModal is managing the timer (don't send updates from GamePlay)
  const questionModalActiveRef = useRef(false);

  // Track score change type for displaying result message
  const [scoreChangeType, setScoreChangeType] = useState<'wrong' | 'correct' | null>(null);

  // Restore blob URLs when pack changes
  useEffect(() => {
    const restoreBlobUrls = async () => {
      if (pack) {
        console.log('🔄 GamePlay - Restoring blob URLs for pack:', pack.name);
        await restorePackBlobUrlsFromStorage(pack);
        console.log('✅ GamePlay - Blob URLs restored successfully');
      }
    };

    restoreBlobUrls();
  }, [pack.id]); // Only restore when pack ID changes

  // Get current round
  const currentRound = useMemo((): Round | undefined => {
    if (!pack.rounds || currentRoundIndex >= pack.rounds.length) return undefined;
    return pack.rounds[currentRoundIndex];
  }, [pack.rounds, currentRoundIndex]);

  // Reset super game state when entering selectSuperThemes screen
  useEffect(() => {
    if (currentScreen === 'selectSuperThemes') {
      setDisabledSuperThemeIds(new Set());
      setSelectedSuperThemeId(null);
    }
  }, [currentScreen]);

  // Auto-select the remaining theme when only one is left - NO auto-transition
  // Theme is selected automatically, but screen transition requires manual Space press
  useEffect(() => {
    if (currentScreen === 'selectSuperThemes' && currentRound) {
      const themeCount = currentRound.themes?.length || 0;
      const remainingCount = themeCount - disabledSuperThemeIds.size;

      if (remainingCount === 1 && !selectedSuperThemeId) {
        const remainingTheme = currentRound.themes?.find((t: Theme) => !disabledSuperThemeIds.has(t.id));
        if (remainingTheme) {
          setSelectedSuperThemeId(remainingTheme.id);
          // Note: No auto-transition to placeBets - user must press Space
        }
      }
    }
  }, [currentScreen, disabledSuperThemeIds, currentRound, selectedSuperThemeId]);

  // Auto-transition to superQuestion when all teams have placed bets - REMOVED
  // Now requires manual Space press to advance from placeBets to superQuestion

  // Ref to track the last active question that was set (for broadcastGameState)
  const lastActiveQuestionRef = useRef<{
    question: Question;
    theme: Theme;
    points: number;
    roundName?: string;
  } | null>(null);

  // Function to broadcast current game state to ScreenView
  const broadcastGameState = useCallback(async (force: boolean = false) => {
    if (!broadcastMessage) {
      console.log('[GamePlay] broadcastGameState called but onBroadcastMessage is null');
      return;
    }

    // Use ref value for activeQuestion to avoid stale closures
    const currentActiveQuestion = lastActiveQuestionRef.current;

    // CRITICAL: Stream media files BEFORE broadcasting game state
    // This ensures media transfer messages arrive BEFORE game state updates
    if (currentActiveQuestion) {
      console.log('[GamePlay] 🎬 Streaming media files before broadcast');
      await streamMediaFilesSynchronously(
        { question: currentActiveQuestion.question }, // Pass the actual question object
        broadcastMessage,
        '24724687-f15a-4c40-8dd3-dc3be3ae4737' // Use actual host ID
      );
      console.log('[GamePlay] ✅ Media streaming completed');
    }

    // Throttle broadcasts to avoid excessive updates (max 1 per 100ms)
    // BUT: Always allow broadcast when screen just changed (within 50ms of screen change)
    // OR when force=true (for critical updates like question open)
    const now = Date.now();
    const timeSinceLastBroadcast = now - lastBroadcastRef.current;
    const timeSinceScreenChange = now - lastScreenChangeRef.current;

    // Allow broadcast if:
    // 1. It's been long enough since last broadcast, OR
    // 2. Screen just changed (within screenChangeBroadcastMs), OR
    // 3. Forced broadcast (for critical updates)
    const shouldBroadcast = timeSinceLastBroadcast >= broadcastThrottleMs ||
                           timeSinceLastBroadcast === 0 ||
                           timeSinceScreenChange < screenChangeBroadcastMs ||
                           force;

    if (!shouldBroadcast && timeSinceLastBroadcast > 0) {
      console.log(`[GamePlay] Broadcast throttled - only ${timeSinceLastBroadcast}ms since last (min ${broadcastThrottleMs}ms)`);
      return; // Skip this broadcast - too soon
    }

    lastBroadcastRef.current = now;
    console.log('[GamePlay] Broadcasting game state' + (force ? ' (FORCED)' : ''));

    // Debug logging for activeQuestion
    if (!currentActiveQuestion && activeQuestion) {
      console.warn('[GamePlay] ⚠️ activeQuestion state exists but ref is null!', {
        stateQuestion: activeQuestion.question?.text?.slice(0, 30),
        refQuestion: currentActiveQuestion?.question?.text?.slice(0, 30)
      });
    }

    // Prepare full themes data for all screens
    const allThemes = pack.rounds?.flatMap((round, roundIndex) =>
      (round.themes || []).map(theme => ({
        id: theme.id,
        name: theme.name,
        color: theme.color,
        textColor: theme.textColor,
        roundNumber: round.number,
        roundName: round.name,
        questions: (theme.questions || []).map(q => ({
          id: q.id,
          points: q.points,
          answered: isQuestionAnswered(q.id, theme.id)
        }))
      }))
    ) || [];

    // Prepare board data (themes and questions for current round)
    const boardData = currentRound ? {
      themes: (currentRound.themes || []).map(theme => ({
        id: theme.id,
        name: theme.name,
        color: theme.color,
        textColor: theme.textColor,
        questions: (theme.questions || []).map(q => ({
          id: q.id,
          points: q.points,
          answered: isQuestionAnswered(q.id, theme.id)
        }))
      }))
    } : null;

    // Broadcast comprehensive game state for ScreenView
    // When activeQuestion exists, ensure currentScreen is 'board' for demo screen
    const broadcastScreen = currentActiveQuestion ? 'board' : currentScreen;
    console.log('[GamePlay] Broadcasting screen:', broadcastScreen, '(original:', currentScreen, ')');
    console.log('[GamePlay] Broadcasting with activeQuestion:', !!currentActiveQuestion);
    if (currentActiveQuestion) {
      console.log('[GamePlay] Broadcasting activeQuestion details:', {
        questionId: currentActiveQuestion.question.id,
        text: currentActiveQuestion.question.text?.slice(0, 30),
        hasMedia: !!currentActiveQuestion.question.media,
        hasAnswerMedia: !!currentActiveQuestion.question.answerMedia,
        points: currentActiveQuestion.points,
        themeName: currentActiveQuestion.theme.name
      });
    }
    console.log('[GamePlay] Broadcasting with showAnswer:', showAnswer);
    // Only log warning when this is unexpected (not during normal screen changes)
    if (!currentActiveQuestion && force && currentScreen !== 'cover' && currentScreen !== 'themes') {
      console.warn('[GamePlay] ⚠️ Forced broadcast without activeQuestion');
    }

    // Increment sequence counter for this message
    sequenceCounterRef.current++;
    const currentSequence = sequenceCounterRef.current;

    const broadcastPayload = {
      type: 'GAME_STATE_UPDATE',
      sequence: currentSequence, // Add sequence number for ordering
      state: {
        currentScreen: broadcastScreen,
        currentRoundIndex,
        activeQuestion: currentActiveQuestion ? {
          text: currentActiveQuestion.question.text,
          media: currentActiveQuestion.question.media,
          answer: currentActiveQuestion.question.answerText,
          answerMedia: currentActiveQuestion.question.answerMedia,
          points: currentActiveQuestion.points,
          themeName: currentActiveQuestion.theme.name,
          roundName: currentActiveQuestion.roundName,
          questionId: currentActiveQuestion.question.id, // Add question ID for proper comparison
          // Hint data for demo screen
          hint: currentActiveQuestion.question.hint ? {
            text: currentActiveQuestion.question.hint.text,
            media: currentActiveQuestion.question.hint.media,
            answers: currentActiveQuestion.question.hint.answers,
            correctAnswer: currentActiveQuestion.question.hint.correctAnswer
          } : undefined
        } : null,
        showAnswer,
        showHint,
        // Debug logging
        _debug: {
          showAnswer,
          showHint,
          questionId: currentActiveQuestion?.question.id,
          timestamp: Date.now()
        }
      },
      currentQuestion: currentActiveQuestion ? {
        id: currentActiveQuestion.question.id,
        text: currentActiveQuestion.question.text,
        media: currentActiveQuestion.question.media,
        answerText: currentActiveQuestion.question.answerText,
        answerMedia: currentActiveQuestion.question.answerMedia,
        points: currentActiveQuestion.points
      } : null,
      teamScores: teamScoresRef.current.map(t => ({ id: t.teamId, name: t.teamName, score: t.score })),
        buzzerState: (() => {
          const current = buzzerStateRef.current;
          const last = lastBroadcastBuzzerStateRef.current;

          // Check if buzzer state has significantly changed
          const activeChanged = current?.active !== last?.active;
          const phaseChanged = current?.timerPhase !== last?.timerPhase;
          const pausedChanged = current?.isPaused !== last?.isPaused;
          const readingChanged = Math.abs((current?.readingTimerRemaining || 0) - (last?.readingTimerRemaining || 0)) > 0.5;
          const responseChanged = Math.abs((current?.responseTimerRemaining || 0) - (last?.responseTimerRemaining || 0)) > 0.5;

          const hasSignificantChange = activeChanged || phaseChanged || pausedChanged || readingChanged || responseChanged;

          // Always include on force broadcast or if significantly changed
          if (force || hasSignificantChange) {
            // Update last broadcast state
            lastBroadcastBuzzerStateRef.current = {
              active: current?.active ?? false,
              timerPhase: current?.timerPhase || 'inactive',
              isPaused: current?.isPaused || false,
              readingTimerRemaining: current?.readingTimerRemaining || 0,
              responseTimerRemaining: current?.responseTimerRemaining || 0
            };

            return {
              active: current?.active ?? false,
              timerPhase: current?.timerPhase || 'inactive',
              readingTimerRemaining: current?.readingTimerRemaining || 0,
              responseTimerRemaining: current?.responseTimerRemaining || 0,
              handicapActive: current?.handicapActive || false,
              handicapTeamId: current?.handicapTeamId,
              isPaused: current?.isPaused || false,
              readingTimeTotal: current?.readingTimeTotal ?? 5,
              responseTimeTotal: currentRound?.responseWindow ?? 30,
              timerColor: current?.timerPhase === 'reading' ? 'yellow' : current?.timerPhase === 'response' ? 'green' : 'gray',
              timerBarColor: current?.timerPhase === 'reading' ? 'bg-yellow-500' : current?.timerPhase === 'response' ? 'bg-green-500' : 'bg-gray-500',
              timerTextColor: current?.timerPhase === 'reading' ? 'text-yellow-300' : current?.timerPhase === 'response' ? 'text-green-300' : 'text-gray-300'
            };
          }

          // Return undefined to skip buzzerState in this broadcast
          return undefined;
        })(),
        answeringTeamId,
        // Add teams for lobby display on demo screen
        teams: teams.map(t => ({ id: t.id, name: t.name, color: t.color })),
        currentRound: currentRound ? {
          id: currentRound.id,
          name: currentRound.name,
          number: currentRound.number,
          type: currentRound.type,
          cover: currentRound.cover,
          // Timer settings - demo screen needs these to calculate timer independently
          readingTimePerLetter: currentRound.readingTimePerLetter,
          responseWindow: currentRound.responseWindow,
          handicapEnabled: currentRound.handicapEnabled,
          handicapDelay: currentRound.handicapDelay
        } : null,
        // Add all themes data for themes screen
        allThemes: allThemes,
        // Add board data for board screen
        boardData: boardData,
        // Add pack cover for cover screen
        packCover: (() => {
          console.log('[GamePlay] Broadcasting pack cover:', {
            hasCover: !!pack.cover,
            coverType: pack.cover?.type,
            coverValue: pack.cover?.value?.slice(0, 60) || 'none',
            packName: pack.name
          });
          return pack.cover;
        })(),
        packName: pack.name,
        // Add super game data
        selectedSuperThemeId,
        disabledSuperThemeIds: Array.from(disabledSuperThemeIds),
        superGameBets: superGameBets.map(b => ({
          teamId: b.teamId,
          bet: b.bet,
          ready: b.ready
        })),
        superGameAnswers: superGameAnswers.map(a => ({
          teamId: a.teamId,
          answer: a.answer,
          revealed: a.revealed
        })),
        selectedSuperAnswerTeam,
        // Add team states for player panel colors - NEW FORMAT with clash support
        teamStates: (() => {
          const states: Record<string, string[]> = {
            inactive: [],
            active: [],
            answering: [],
            penalty: [],
            clash: [],
          };
          // Also include clash sub-statuses for detailed collision info
          const clashSubStatuses: Record<string, string[]> = {
            first_clash: [],
            simple_clash: [],
          };
          for (const [teamId, state] of teamStatusManager.teamStates.entries()) {
            if (state.status === 'clash') {
              states.clash.push(teamId);
              // Add to sub-status for collision type
              if (state.clashSubStatus) {
                clashSubStatuses[state.clashSubStatus].push(teamId);
              }
            } else {
              states[state.status].push(teamId);
            }
          }
          // Merge clash sub-statuses into main states object
          return { ...states, ...clashSubStatuses };
        })(),
        // Add QR code state
        showQRCode: showQRCode,
        // Add highlighted question for visual feedback
        highlightedQuestion: highlightedQuestion,
        // Add themes scroll position for sync
        themesScrollPosition: themesScrollPosition
      };

    // Log broadcast with showAnswer info
    console.log('[GamePlay] 📡 Broadcasting GAME_STATE_UPDATE:', {
      showAnswer: broadcastPayload.state.showAnswer,
      showHint: broadcastPayload.state.showHint,
      hasActiveQuestion: !!currentActiveQuestion,
      questionId: currentActiveQuestion?.question.id,
      screen: broadcastScreen,
      teamStates: broadcastPayload.teamStates,
      teamScoresCount: broadcastPayload.teamScores?.length || 0,
      teamScores: broadcastPayload.teamScores?.map(t => ({ id: t.id.slice(0, 12), name: t.name, score: t.score }))
    });

    broadcastMessage(broadcastPayload);

    console.log('[GamePlay] Broadcast sent successfully - teamStates:', {
      teamStates: broadcastPayload.teamStates,
      hasTeamStates: !!broadcastPayload.teamStates,
      teamStatesKeys: broadcastPayload.teamStates ? Object.keys(broadcastPayload.teamStates) : []
    });
    console.log('[GamePlay] Broadcast sent successfully', {
      buzzerPhase: buzzerStateRef.current?.timerPhase,
      isPaused: buzzerStateRef.current?.isPaused,
      activeQuestion: !!activeQuestion,
      timeSinceLastBroadcast: `${timeSinceLastBroadcast}ms`,
      teamStates: (() => {
        const states: Record<string, string[]> = {
          inactive: [],
          active: [],
          answering: [],
          penalty: [],
          clash: [],
          first_clash: [],
          simple_clash: [],
        };
        for (const [teamId, state] of teamStatusManager.teamStates.entries()) {
          if (state.status === 'clash') {
            states.clash.push(teamId);
            if (state.clashSubStatus) {
              states[state.clashSubStatus].push(teamId);
            }
          } else {
            states[state.status].push(teamId);
          }
        }
        return states;
      })()
    });
  }, [currentScreen, currentRoundIndex, showAnswer, teamScores, answeringTeamId, currentRound, broadcastMessage, pack, selectedSuperThemeId, disabledSuperThemeIds, superGameBets, superGameAnswers, selectedSuperAnswerTeam, teamStatusManager, showQRCode, themesScrollPosition, highlightedQuestion]); // Removed activeQuestion - now using ref to avoid stale closures

  // Function to switch from reading to response phase (called from demo screen TIMER_PHASE_SWITCH message)
  // This is a stable callback that uses refs to access current values
  const switchToResponsePhase = useCallback(() => {
    const currentPhase = buzzerStateRef.current?.timerPhase;

    // Only switch if we're in reading phase
    if (currentPhase !== 'reading') {
      console.log('[GamePlay] switchToResponsePhase: Not in reading phase, ignoring switch request. Current phase:', currentPhase);
      return;
    }

    console.log('[GamePlay] ⚡ switchToResponsePhase: Switching to response phase (from demo screen signal)');

    // Get round settings for handicap calculation
    const handicapEnabled = currentRound?.handicapEnabled ?? false;
    const handicapDelay = currentRound?.handicapDelay ?? 1;
    const responseWindow = currentRound?.responseWindow ?? 30;

    // Find leading team for handicap
    const leadingTeamScore = teamScores.length > 0 ? Math.max(...teamScores.map(t => t.score)) : 0;
    const leadingTeam = teamScores.find(t => t.score === leadingTeamScore);

    // Clear existing timers
    if (buzzerDelayRef.current) clearTimeout(buzzerDelayRef.current);
    if (responseWindowRef.current) clearTimeout(responseWindowRef.current);
    if (stateUpdateRef.current) clearInterval(stateUpdateRef.current);

    // Clear early buzzes from reading phase
    onClearBuzzes?.();
    onBuzzTriggered(null);

    // Start response phase with handicap if needed
    const responseRemaining = responseWindow;
    responseTimerRemainingRef.current = responseRemaining;

    const needsHandicap = handicapEnabled && handicapDelay > 0 && leadingTeam;

    // Update buzzer state to response phase
    buzzerStateRef.current = {
      active: true,
      timerPhase: 'response',
      readingTimerRemaining: 0,
      responseTimerRemaining: responseRemaining,
      handicapActive: needsHandicap,
      handicapTeamId: needsHandicap ? leadingTeam?.teamId : undefined,
      isPaused: timerPausedRef.current,
      readingTimeTotal: buzzerStateRef.current?.readingTimeTotal || 0,
      responseTimeTotal: responseWindow,
      timerColor: 'green',
      timerBarColor: 'bg-green-500',
      timerTextColor: 'text-green-300'
    };

    // Send buzzer state update to demo screen and mobile clients
    onBuzzerStateChangeRef.current(buzzerStateRef.current);

    if (needsHandicap && handicapDelay > 0) {
      // Start with handicap active - leader team is inactive
      console.log('[GamePlay] 🟡 Handicap active - leader team must wait', handicapDelay, 'seconds');
      buzzerActiveRef.current = false;

      setTimeout(() => {
        // Handicap ended - activate all teams
        buzzerActiveRef.current = true;
        setBuzzerActive(true); // Also update state
        console.log('[GamePlay] 🟢 Activating all teams (after handicap ends)');
        teamStatusManager.updateGameState({ isResponseTimerActive: true });
        setTimeout(() => broadcastGameState(true), 0);

        // Update buzzer state without handicap
        buzzerStateRef.current = {
          ...buzzerStateRef.current,
          handicapActive: false,
          handicapTeamId: undefined
        };
        onBuzzerStateChangeRef.current(buzzerStateRef.current);
      }, handicapDelay * 1000);
    } else {
      // No handicap - activate all teams immediately
      buzzerActiveRef.current = true;
      setBuzzerActive(true); // Also update state
      console.log('[GamePlay] 🟢 Activating all teams (green timer starts)');
      teamStatusManager.updateGameState({ isResponseTimerActive: true });
      setTimeout(() => broadcastGameState(true), 0);
    }

    // Start response timer countdown
    stateUpdateRef.current = setInterval(() => {
      if (!timerPausedRef.current) {
        responseTimerRemainingRef.current = Math.max(0, responseTimerRemainingRef.current - 0.1);

        if (responseTimerRemainingRef.current <= 0) {
          responseTimerRemainingRef.current = 0;
          if (stateUpdateRef.current) {
            clearInterval(stateUpdateRef.current);
            stateUpdateRef.current = null;
          }
          buzzerActiveRef.current = false;
          teamStatusManager.updateGameState({ isResponseTimerActive: false });

          buzzerStateRef.current = {
            active: false,
            timerPhase: 'complete',
            readingTimerRemaining: 0,
            responseTimerRemaining: 0,
            handicapActive: false,
            isPaused: false,
            readingTimeTotal: buzzerStateRef.current?.readingTimeTotal || 0,
            responseTimeTotal: responseWindow,
            timerColor: 'gray',
            timerBarColor: 'bg-gray-500',
            timerTextColor: 'text-gray-300'
          };
          onBuzzerStateChangeRef.current(buzzerStateRef.current);
        } else {
          // Update with new remaining time
          buzzerStateRef.current.responseTimerRemaining = responseTimerRemainingRef.current;
        }
      }
    }, 100);

    // Set timeout for response phase completion
    const totalResponseTime = responseWindow * 1000;
    buzzerDelayRef.current = setTimeout(() => {
      if (stateUpdateRef.current) {
        clearInterval(stateUpdateRef.current);
        stateUpdateRef.current = null;
      }
      buzzerActiveRef.current = false;
      teamStatusManager.updateGameState({ isResponseTimerActive: false });

      buzzerStateRef.current = {
        active: false,
        timerPhase: 'complete',
        readingTimerRemaining: 0,
        responseTimerRemaining: 0,
        handicapActive: false,
        isPaused: false,
        readingTimeTotal: buzzerStateRef.current?.readingTimeTotal || 0,
        responseTimeTotal: responseWindow,
        timerColor: 'gray',
        timerBarColor: 'bg-gray-500',
        timerTextColor: 'text-gray-300'
      };
      onBuzzerStateChangeRef.current(buzzerStateRef.current);
    }, totalResponseTime);

    console.log('[GamePlay] ✅ switchToResponsePhase completed');
  }, [currentRound, teamScores, onClearBuzzes, onBuzzTriggered, teamStatusManager, broadcastGameState]);

  // Store the function in ref for external access (backward compatibility)
  switchToResponsePhaseRef.current = switchToResponsePhase;

  // Debug: Log when showAnswer changes
  useEffect(() => {
    console.log('[GamePlay] 🔄 showAnswer changed:', {
      showAnswer,
      hasActiveQuestion: !!activeQuestion,
      questionId: activeQuestion?.question.id,
      timestamp: Date.now()
    });
  }, [showAnswer, activeQuestion]);

  // Handle team score change from context menu - broadcast to all devices
  const handleTeamScoreChange = useCallback((teamId: string, newScore: number) => {
    setTeamScores(prev => prev.map(t => {
      if (t.teamId === teamId) {
        return { ...t, score: newScore };
      }
      return t;
    }));
    // Broadcast updated scores to all devices immediately
    setTimeout(() => broadcastGameState(true), 0);
  }, [broadcastGameState]);

  // Broadcast team status changes to all devices when changed via context menu
  const prevTeamStatesRef = useRef<string>('');
  useEffect(() => {
    // Create a string representation of current team states
    const currentStatesStr = Array.from(teamStatusManager.teamStates.entries())
      .map(([id, state]) => `${id}:${state.status}`)
      .sort()
      .join(',');

    // Only broadcast if states actually changed
    if (currentStatesStr !== prevTeamStatesRef.current) {
      prevTeamStatesRef.current = currentStatesStr;
      // Broadcast updated team states to all devices
      setTimeout(() => broadcastGameState(true), 0);
    }
  }, [teamStatusManager.teamStates, broadcastGameState]);

  // Sync activeTeamIds with teamStatusManager.activeTeamIds for HostView BUZZ handling
  useEffect(() => {
    if (onUpdateActiveTeamIds) {
      onUpdateActiveTeamIds(teamStatusManager.activeTeamIds);
    }
  }, [teamStatusManager.activeTeamIds, onUpdateActiveTeamIds]);

  // Handle BUZZ events from HostView through teamStatusManager
  // Track previously buzzed teams to detect new buzzes
  const prevBuzzedTeamIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!buzzedTeamIds) return;

    const currentBuzzed = Array.from(buzzedTeamIds);
    const prevBuzzed = prevBuzzedTeamIdsRef.current;

    // Find newly buzzed teams (in current but not in previous)
    const newBuzzes = currentBuzzed.filter(teamId => !prevBuzzed.has(teamId));

    // Handle each new buzz through teamStatusManager
    for (const teamId of newBuzzes) {
      const teamStatus = teamStatusManager.getTeamStatus(teamId);
      console.log('[GamePlay] 🎯 Handling BUZZ through teamStatusManager:', {
        teamId: teamId.slice(0, 12),
        teamStatus,
        isResponseTimerActive: teamStatusManager.isResponseTimerActive(),
        simultaneousBuzzEnabled: sessionSettings?.simultaneousBuzzEnabled,
        simultaneousThreshold: sessionSettings?.simultaneousBuzzThreshold
      });
      const result = teamStatusManager.handleTeamBuzz(teamId);
      console.log('[GamePlay] 🎯 BUZZ handle result:', result);
    }

    // Update ref for next comparison
    prevBuzzedTeamIdsRef.current = new Set(currentBuzzed);
  }, [buzzedTeamIds, teamStatusManager, sessionSettings]);

  // Handle buzzer state changes from QuestionModal (media playback auto-pause)
  const handleQuestionModalBuzzerStateChange = useCallback((state: {
    active: boolean;
    timerPhase?: 'reading' | 'response' | 'complete' | 'inactive';
    readingTimerRemaining: number;
    responseTimerRemaining: number;
    handicapActive: boolean;
    handicapTeamId?: string;
    isPaused: boolean;
    readingTimeTotal?: number;
    responseTimeTotal?: number;
  }) => {
    console.log('[GamePlay] QuestionModal buzzer state change:', state);

    // Update buzzerStateRef with new state from QuestionModal
    if (buzzerStateRef.current) {
      buzzerStateRef.current.active = state.active;
      buzzerStateRef.current.timerPhase = state.timerPhase;
      buzzerStateRef.current.readingTimerRemaining = state.readingTimerRemaining;
      buzzerStateRef.current.responseTimerRemaining = state.responseTimerRemaining;
      buzzerStateRef.current.handicapActive = state.handicapActive;
      buzzerStateRef.current.handicapTeamId = state.handicapTeamId;
      buzzerStateRef.current.isPaused = state.isPaused;

      // IMPORTANT: Use totals from QuestionModal if provided, otherwise calculate locally
      // QuestionModal calculates these based on actual question text and settings
      if (state.readingTimeTotal !== undefined) {
        buzzerStateRef.current.readingTimeTotal = state.readingTimeTotal;
      } else if (!buzzerStateRef.current.readingTimeTotal) {
        // Fallback to calculation if QuestionModal didn't provide it
        if (activeQuestion && currentRound) {
          const questionTextLetters = (activeQuestion.question.text || '').replace(/[^a-zA-Zа-яА-ЯёЁ]/g, '').length;
          const hasMedia = activeQuestion.question.media?.type === 'audio' ||
                           activeQuestion.question.media?.type === 'video' ||
                           activeQuestion.question.media?.type === 'youtube';
          // Same calculation as in QuestionModal: media questions get 50% reading time
          buzzerStateRef.current.readingTimeTotal = hasMedia
            ? Math.max(1, questionTextLetters * currentRound.readingTimePerLetter * 0.5)
            : Math.max(1, questionTextLetters * currentRound.readingTimePerLetter);
        }
      }

      if (state.responseTimeTotal !== undefined) {
        buzzerStateRef.current.responseTimeTotal = state.responseTimeTotal;
      } else if (!buzzerStateRef.current.responseTimeTotal) {
        // Fallback to calculation if QuestionModal didn't provide it
        if (activeQuestion && currentRound) {
          buzzerStateRef.current.responseTimeTotal = currentRound.responseWindow || 30;
        }
      }

      // IMPORTANT: Sync timerPausedRef with isPaused state from QuestionModal
      // This ensures the GamePlay timer respects the pause state from QuestionModal
      timerPausedRef.current = state.isPaused;

      // CRITICAL: Update buzzerStateRef.current with QuestionModal's ACTUAL current values
      // This prevents GamePlay from broadcasting stale timer values
      buzzerStateRef.current.readingTimerRemaining = state.readingTimerRemaining;
      buzzerStateRef.current.responseTimerRemaining = state.responseTimerRemaining;
      buzzerStateRef.current.active = state.active;
      buzzerStateRef.current.timerPhase = state.timerPhase;
      buzzerStateRef.current.handicapActive = state.handicapActive;
      buzzerStateRef.current.handicapTeamId = state.handicapTeamId;

      // Update colors based on timer phase (host is authoritative)
      buzzerStateRef.current.timerColor = state.timerPhase === 'reading' ? 'yellow' : state.timerPhase === 'response' ? 'green' : 'gray';
      buzzerStateRef.current.timerBarColor = state.timerPhase === 'reading' ? 'bg-yellow-500' : state.timerPhase === 'response' ? 'bg-green-500' : 'bg-gray-500';
      buzzerStateRef.current.timerTextColor = state.timerPhase === 'reading' ? 'text-yellow-300' : state.timerPhase === 'response' ? 'text-green-300' : 'text-gray-300';
    }

    // Don't sync timerPaused here - let the useEffect handle it to avoid duplicate updates
    // The useEffect below will handle syncing timerPaused state and broadcasting

    // Notify parent component - this sends TIMER_STATE messages
    // NO NEED to call broadcastGameState() here - it causes duplicate messages and UI flicker
    onBuzzerStateChange(buzzerStateRef.current);
  }, [onBuzzerStateChange]);

  // Handle timer pause state changes from QuestionModal (manual pause button)
  const handleTimerPauseChange = useCallback((isPaused: boolean) => {
    console.log('[GamePlay] Timer pause state changed:', isPaused);
    // Use setTimeout to avoid setState during render of another component
    setTimeout(() => {
      setTimerPaused(isPaused);
    }, 0);
    timerPausedRef.current = isPaused;

    // Update buzzer state to sync with demo screen
    const timerPhase = buzzerStateRef.current?.timerPhase || 'inactive';
    const newState = {
      active: !isPaused && (timerPhase === 'reading' || timerPhase === 'response'), // Active when not paused and in valid timer phase
      timerPhase: timerPhase,
      readingTimerRemaining: buzzerStateRef.current?.readingTimerRemaining || 0,
      responseTimerRemaining: buzzerStateRef.current?.responseTimerRemaining || 0,
      handicapActive: buzzerStateRef.current?.handicapActive || false,
      handicapTeamId: buzzerStateRef.current?.handicapTeamId,
      isPaused: isPaused,
      // Add total times from current round settings (authoritative source)
      readingTimeTotal: buzzerStateRef.current?.readingTimeTotal || buzzerStateRef.current?.readingTimerRemaining || 0,
      responseTimeTotal: currentRound?.responseWindow || buzzerStateRef.current?.responseTimerRemaining || 30, // Always prefer current round value
      // Add colors based on timer phase (host is authoritative)
      timerColor: (timerPhase === 'reading' ? 'yellow' : timerPhase === 'response' ? 'green' : 'gray') as 'yellow' | 'green' | 'gray',
      timerBarColor: timerPhase === 'reading' ? 'bg-yellow-500' : timerPhase === 'response' ? 'bg-green-500' : 'bg-gray-500',
      timerTextColor: timerPhase === 'reading' ? 'text-yellow-300' : timerPhase === 'response' ? 'text-green-300' : 'text-gray-300'
    };
    buzzerStateRef.current = newState;
    onBuzzerStateChange(newState);
    // NO broadcastGameState() call here - onBuzzerStateChange already sends TIMER_STATE
  }, [onBuzzerStateChange, currentRound]); // Add currentRound dependency for responseWindow

  // Sync buzzerStateRef.isPaused with timerPaused state and broadcast
  useEffect(() => {
    if (buzzerStateRef.current && activeQuestion && !showAnswer) {
      // Only update and broadcast if the pause state actually changed
      if (buzzerStateRef.current.isPaused !== timerPaused) {
        buzzerStateRef.current.isPaused = timerPaused;

        console.log('[GamePlay] Syncing pause state:', {
          isPaused: timerPaused,
          timerPhase: buzzerStateRef.current.timerPhase,
          fullState: buzzerStateRef.current
        });

        onBuzzerStateChange(buzzerStateRef.current);
        // Also broadcast GAME_STATE_UPDATE to ensure demo screen gets pause state
        broadcastGameState(true); // Force broadcast to ensure immediate delivery
      }
    }
  }, [timerPaused, activeQuestion, showAnswer, onBuzzerStateChange, broadcastGameState]);

  // Broadcast current screen to demo screen when screen changes (without triggering full state update cycle)
  // REMOVED: Now handled by main broadcastGameState which includes currentScreen in dependencies
  // This prevents duplicate broadcasts and ensures full state is always sent

  // Function to broadcast current super game state
  const broadcastSuperGameState = useCallback(() => {
    if (!broadcastMessage) return;

    if (currentScreen === 'placeBets' && currentRound) {
      // Update parent phase
      onSuperGamePhaseChange?.('placeBets');

      // Get the selected theme
      const selectedTheme = selectedSuperThemeId
        ? currentRound.themes?.find((t: Theme) => t.id === selectedSuperThemeId)
        : null;

      // Calculate max bet (highest score among teams) - use ref for latest scores
      const currentScores = teamScoresRef.current;
      const maxScore = Math.max(...currentScores.map(t => t.score), 0);
      const maxBet = maxScore > 0 ? maxScore : 100;

      // Broadcast state sync to clients
      broadcastMessage({
        type: 'SUPER_GAME_STATE_SYNC',
        phase: 'placeBets',
        themeId: selectedTheme?.id,
        themeName: selectedTheme?.name,
        maxBet: maxBet,
        teamScores: currentScores.map(t => ({ id: t.teamId, name: t.teamName, score: t.score })),
      });
    } else if (currentScreen === 'superQuestion' && currentRound && selectedSuperThemeId) {
      // Update parent phase
      onSuperGamePhaseChange?.('showQuestion');

      // Get the selected theme and question
      const selectedTheme = currentRound.themes?.find(t => t.id === selectedSuperThemeId);
      const question = selectedTheme?.questions?.[0];

      if (selectedTheme && question) {
        const currentScores = teamScoresRef.current;
        broadcastMessage({
          type: 'SUPER_GAME_STATE_SYNC',
          phase: 'showQuestion',
          themeId: selectedTheme.id,
          themeName: selectedTheme.name,
          questionText: question.text || '',
          questionMedia: question.media,
          teamScores: currentScores.map(t => ({ id: t.teamId, name: t.teamName, score: t.score })),
        });
      }
    } else if (currentScreen === 'superAnswers') {
      onSuperGamePhaseChange?.('showWinner');
      // Clients go to idle when host views answers
      broadcastMessage({
        type: 'SUPER_GAME_STATE_SYNC',
        phase: 'idle',
      });
    } else if (currentScreen === 'showWinner') {
      onSuperGamePhaseChange?.('showWinner');
      // Clients go to idle when host views winner
      broadcastMessage({
        type: 'SUPER_GAME_STATE_SYNC',
        phase: 'idle',
      });
    } else if (['board', 'cover', 'themes', 'round', 'placeBets'].includes(currentScreen)) {
      onSuperGamePhaseChange?.('idle');
      broadcastMessage({
        type: 'SUPER_GAME_STATE_SYNC',
        phase: 'idle',
      });
    }
  }, [currentScreen, broadcastMessage, onSuperGamePhaseChange, currentRound, selectedSuperThemeId, teamScores]);

  // Reset bets state when entering placeBets screen
  useEffect(() => {
    if (currentScreen === 'placeBets') {
      setSuperGameBets([]);
    }
  }, [currentScreen]);

  // Reset answers state when entering superQuestion screen
  useEffect(() => {
    if (currentScreen === 'superQuestion') {
      setSuperGameAnswers([]);
    }
  }, [currentScreen]);

  // Handle state sync request from client - rebroadcast current state when trigger changes
  useEffect(() => {
    if (stateSyncTrigger !== undefined && stateSyncTrigger > 0) {
      console.log('[GamePlay] State sync requested, broadcasting current state');
      broadcastGameState(true); // Force broadcast with teams
      broadcastSuperGameState();
    }
  }, [stateSyncTrigger, broadcastSuperGameState]);

  // Sync external bets from mobile clients
  useEffect(() => {
    if (externalSuperGameBets) {
      setSuperGameBets(externalSuperGameBets);
    }
  }, [externalSuperGameBets]);

  // Sync external answers from mobile clients
  useEffect(() => {
    if (externalSuperGameAnswers) {
      setSuperGameAnswers(externalSuperGameAnswers);
    }
  }, [externalSuperGameAnswers]);

  // Update buzzerStateRef when buzzer state changes
  useEffect(() => {
    // Only update inactive state - active timer phases are managed by the timer logic
    if (!activeQuestion || showAnswer) {
      buzzerStateRef.current = {
        active: false,
        timerPhase: 'inactive',
        readingTimerRemaining: 0,
        responseTimerRemaining: 0,
        handicapActive: false,
        isPaused: false,
        readingTimeTotal: 0,
        responseTimeTotal: 30, // Default response time
        timerColor: 'gray',
        timerBarColor: 'bg-gray-500',
        timerTextColor: 'text-gray-300'
      };
      setTimerPaused(false);
    }
    // Don't override timerPhase when question is active - let timer logic manage it
  }, [activeQuestion, showAnswer]);

  // Broadcast game state when CRITICAL values change
  // UI-only values like themesScrollPosition and highlightedQuestion are handled separately
  useEffect(() => {
    console.log('[GamePlay] 🔄 Critical state changed, broadcasting:', {
      currentRoundIndex,
      hasActiveQuestion: !!activeQuestion,
      questionId: activeQuestion?.question?.id,
      showAnswer,
      showHint,
      answeringTeamId
    });
    broadcastGameState(true); // Force broadcast only for critical changes
    console.log('[GamePlay] Broadcast triggered by critical state change');
  }, [
    currentRoundIndex,
    activeQuestion,
    showAnswer,
    showHint,
    answeringTeamId
  ]); // Team states (wrongAnswerTeams, activeTeamIds, clashingTeamIds) handled in separate useEffect

  // Light broadcasts for UI state changes (highlights only - scroll has separate 35ms throttle)
  useEffect(() => {
    console.log('[GamePlay] 🔄 UI state changed (highlight), scheduling light broadcast');
    broadcastGameState(false); // Normal broadcast for UI changes
  }, [
    highlightedQuestion
  ]);

  // NOTE: We DON'T sync answeringTeamId with teamStatusManager here anymore
  // teamStatusManager is the single source of truth for team statuses
  // answeringTeamId is only used by the buzzer system in HostView
  // When a team buzzes, HostView sets answeringTeamId, and teamStatusManager
  // should be updated separately via user clicking on team cards

  // Immediate broadcast on screen changes (bypass throttling)
  useEffect(() => {
    if (currentScreen) {
      console.log('[GamePlay] Screen changed to:', currentScreen, '- broadcasting immediately');
      lastScreenChangeRef.current = Date.now(); // Mark as screen change to bypass throttling
      broadcastGameState();
    }
  }, [currentScreen]); // This ensures screen changes are broadcast immediately without throttling

  // Separate throttling for themes scroll position (35ms for smooth scrolling on demo screen)
  useEffect(() => {
    // Only send scroll updates when on themes screen
    if (currentScreen !== 'themes') return;

    const now = Date.now();
    const timeSinceLastScrollBroadcast = now - lastScrollBroadcastRef.current;

    if (timeSinceLastScrollBroadcast >= scrollBroadcastThrottleMs) {
      lastScrollBroadcastRef.current = now;

      if (broadcastMessage) {
        console.log('[GamePlay] 📜 Sending scroll position to demo screen:', themesScrollPosition);
        broadcastMessage({
          type: 'GAME_STATE_UPDATE',
          sequence: sequenceCounterRef.current++,
          state: {
            currentScreen,
          },
          // Send only scroll position to avoid full broadcast overhead
          themesScrollPosition,
        });
      }
    }
  }, [themesScrollPosition, currentScreen, broadcastMessage, scrollBroadcastThrottleMs]);

  // Initial broadcast when component mounts to ensure teamScores are sent immediately
  useEffect(() => {
    console.log('[GamePlay] Initial broadcast on mount');
    lastScreenChangeRef.current = Date.now(); // Mark as screen change to bypass throttling
    broadcastGameState();
  }, []); // Empty deps - run only on mount

  // REMOVED: Periodic buzzer state broadcast - this was causing timer flicker on demo screen
  // Demo screen now handles countdown locally from initial TIMER_STATE messages
  // Only state changes (pause, phase change, etc.) trigger updates

  // Clear super game state on clients when transitioning away from super game screens
  useEffect(() => {
    const prevScreen = previousScreenRef.current;
    const superGameScreens: GameScreen[] = ['placeBets', 'superQuestion', 'superAnswers', 'showWinner'];

    // Valid transitions within super game (should NOT clear state)
    const validSuperGameTransitions: Record<string, string[]> = {
      'placeBets': ['superQuestion'],
      'superQuestion': ['superAnswers'],
      'superAnswers': ['showWinner'],
      'showWinner': [],
    };

    // Check if we're leaving a super game screen
    const wasInSuperGame = superGameScreens.includes(prevScreen);
    const isInSuperGame = superGameScreens.includes(currentScreen);

    if (wasInSuperGame) {
      // Check if this is a valid transition within super game
      const allowedTargets = validSuperGameTransitions[prevScreen] || [];
      const isValidTransition = allowedTargets.includes(currentScreen);

      // If we're leaving super game entirely (not a valid internal transition)
      if (!isInSuperGame || !isValidTransition) {
        if (broadcastMessage) {
          broadcastMessage({ type: 'SUPER_GAME_CLEAR' });
        }
      }
    }

    // Update previous screen ref
    previousScreenRef.current = currentScreen;
  }, [currentScreen, onBroadcastMessage]);

  // Sync teamScores with teams prop - important for when new teams are created during game
  useEffect(() => {
    setTeamScores(prev => {
      // Add new teams that aren't in prev yet
      const existingIds = new Set(prev.map(t => t.teamId));
      const newTeams = teams
        .filter(t => !existingIds.has(t.id))
        .map(t => ({ teamId: t.id, teamName: t.name, score: 0 }));

      // Remove teams that no longer exist (keep their scores in case they rejoin)
      // Actually keep all for now to preserve scores
      const combined = [...prev];

      // Add new teams
      for (const newTeam of newTeams) {
        combined.push(newTeam);
      }

      // Update team names for existing teams
      for (const team of combined) {
        const teamInfo = teams.find(t => t.id === team.teamId);
        if (teamInfo) {
          team.teamName = teamInfo.name;
        }
      }

      // Update ref immediately for broadcastGameState to use
      teamScoresRef.current = combined;
      return combined;
    });
  }, [teams]);

  // Helper function to compare Sets by content
  const areSetsEqual = useCallback((setA: Set<string>, setB: Set<string>): boolean => {
    if (setA.size !== setB.size) return false;
    for (const item of setA) {
      if (!setB.has(item)) return false;
    }
    return true;
  }, []);

  // Broadcast updated maxBet to clients when team scores change (during super game)
  useEffect(() => {
    if (currentScreen === 'placeBets') {
      // Calculate max bet (highest score among teams)
      const maxScore = Math.max(...teamScores.map(t => t.score), 0);
      const maxBet = maxScore > 0 ? maxScore : 100;

      broadcastMessage({
        type: 'SUPER_GAME_STATE_SYNC',
        phase: 'placeBets',
        maxBet: maxBet,
      });
    }
  }, [teamScores, currentScreen, onBroadcastMessage]);

  // Navigate between screens with Space
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if question modal is open or CTRL pressed
      if (activeQuestion) return;
      if (e.ctrlKey || e.key === 'Control') return;

      if (e.key === ' ') {
        e.preventDefault();
        // Check if current round is super by directly accessing pack.rounds array
        // This avoids stale closure issues with useMemo
        const roundAtIndex = pack.rounds?.[currentRoundIndex];
        const isSuperRound = roundAtIndex?.type === 'super';

        setCurrentScreen(prev => {
          const nextScreen = (() => {
            switch (prev) {
              case 'cover': return isSuperRound ? 'selectSuperThemes' : 'themes';
              case 'themes':
                // Always show round cover
                return 'round';
              case 'round':
                // For super rounds, go to selectSuperThemes first; for normal rounds, go to board
                return isSuperRound ? 'selectSuperThemes' : 'board';
              case 'selectSuperThemes':
                // After excluding themes, go to placeBets
                return 'placeBets';
              case 'placeBets':
                // Always proceed to superQuestion when Space is pressed
                return 'superQuestion';
              case 'board': return 'board'; // Stay on board
              case 'superQuestion': return 'superAnswers';
              case 'superAnswers': return 'showWinner';
              case 'showWinner': return 'showWinner'; // Stay on winner screen
              default: return prev;
            }
          })();

          // useEffect will handle broadcast automatically
          console.log('[GamePlay] Screen changing to:', nextScreen);
          return nextScreen;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeQuestion, currentRoundIndex, pack.rounds, selectedSuperThemeId, superGameBets, teamScores]);

  // Track themes scroll position for ScreenView sync
  useEffect(() => {
    if (currentScreen === 'themes' && themesScrollRef.current) {
      const handleScroll = () => {
        if (themesScrollRef.current) {
          setThemesScrollPosition(themesScrollRef.current.scrollTop);
        }
      };

      const scrollElement = themesScrollRef.current;
      scrollElement?.addEventListener('scroll', handleScroll);

      return () => {
        scrollElement?.removeEventListener('scroll', handleScroll);
      };
    }
  }, [currentScreen]);

  // Handle continuous scroll with ArrowDown/ArrowUp on themes screen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only on themes screen, not when question modal is open
      if (currentScreen !== 'themes' || activeQuestion) return;
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;

      e.preventDefault();

      // Start scrolling if not already scrolling
      if (!scrollIntervalRef.current) {
        const SCROLL_SPEED = 100; // pixels per second
        const pixelsPerFrame = SCROLL_SPEED / 60; // 60 FPS
        const direction = e.key === 'ArrowDown' ? 1 : -1;

        scrollIntervalRef.current = setInterval(() => {
          if (themesScrollRef.current) {
            themesScrollRef.current.scrollTop += pixelsPerFrame * direction;
          }
        }, 1000 / 60);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        // Stop scrolling
        if (scrollIntervalRef.current) {
          clearInterval(scrollIntervalRef.current);
          scrollIntervalRef.current = null;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current);
      }
    };
  }, [currentScreen, activeQuestion]);

  // Handle double-press R (next round) and E (previous round) for round preview
  // Uses e.code to work with any keyboard layout
  useEffect(() => {
    const DOUBLE_PRESS_THRESHOLD = 400; // ms between presses

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle when question modal is open
      if (activeQuestion) return;

      // Use e.code instead of e.key to work with any keyboard layout
      // KeyR = physical R key, KeyE = physical E key (regardless of layout)
      const code = e.code;
      if (code !== 'KeyR' && code !== 'KeyE') return;

      const now = Date.now();
      const { lastKey, lastTime } = doublePressRef.current;

      // Check if same key was pressed twice within threshold
      if (lastKey === code && (now - lastTime) < DOUBLE_PRESS_THRESHOLD) {
        e.preventDefault();

        const totalRounds = pack.rounds?.length || 0;

        if (code === 'KeyR') {
          // Next round - only if there is a next round
          if (currentRoundIndex < totalRounds - 1) {
            const nextRoundIndex = currentRoundIndex + 1;
            setCurrentRoundIndex(nextRoundIndex);
            // Always go to round preview
            setCurrentScreen('round');
            // Immediate broadcast to prevent screen jumping
            setTimeout(() => broadcastGameState(), 10);
          }
        } else if (code === 'KeyE') {
          // Previous round - only if there is a previous round
          if (currentRoundIndex > 0) {
            const prevRoundIndex = currentRoundIndex - 1;
            setCurrentRoundIndex(prevRoundIndex);
            // Always go to round preview
            setCurrentScreen('round');
          }
        }

        // Reset to prevent triple-press
        doublePressRef.current = { lastKey: '', lastTime: 0 };
      } else {
        doublePressRef.current = { lastKey: code, lastTime: now };
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeQuestion, pack.rounds, currentRoundIndex]);

  // Handle number keys 1-9 for direct round preview
  // Uses e.code to work with any keyboard layout
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle when question modal is open
      if (activeQuestion) return;

      // Check for digit keys 1-9 using e.code (Digit1-Digit9)
      const code = e.code;
      const digitMatch = code.match(/^Digit([1-9])$/);

      if (digitMatch) {
        const roundNumber = parseInt(digitMatch[1], 10);
        const totalRounds = pack.rounds?.length || 0;

        // Only proceed if this round exists (1-indexed)
        if (roundNumber <= totalRounds) {
          e.preventDefault();
          // Convert to 0-indexed
          const targetRoundIndex = roundNumber - 1;
          setCurrentRoundIndex(targetRoundIndex);
          // Always go to round preview when selecting a specific round
          setCurrentScreen('round');
          // Immediate broadcast to prevent screen jumping
          setTimeout(() => broadcastGameState(), 10);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeQuestion, pack.rounds]);

  // Handle Space to show answer and P to pause timer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Space shows answer - always works when question is open
      if ((e.key === ' ' || e.code === 'Space') && activeQuestion && !showAnswer) {
        e.preventDefault();
        setShowAnswer(true);
        setBuzzerActive(false);
buzzerActiveRef.current = false;
        processingWrongAnswerRef.current = false;
        const newState = {
          active: false,
          timerPhase: 'inactive' as const,
          readingTimerRemaining: 0,
          responseTimerRemaining: 0,
          handicapActive: false,
          isPaused: false,
          readingTimeTotal: 0,
          responseTimeTotal: 30, // Default response time
          timerColor: 'gray' as const,
          timerBarColor: 'bg-gray-500',
          timerTextColor: 'text-gray-300'
        };
        buzzerStateRef.current = newState;
        onBuzzerStateChange(newState);
        setTimerPaused(false);

        // CRITICAL: Immediately broadcast state to demo screen when showing answer
        // This ensures instant sync between host and demo screen
        console.log('[GamePlay] 📡 Showing answer - broadcasting immediately to demo screen');
        broadcastGameState(true); // Force broadcast for instant sync

        // Deactivate all teams when answer is shown
        console.log('[GamePlay] ⚫ Deactivating all teams (answer shown)');
        teamStatusManager.updateGameState({ isResponseTimerActive: false });
      }

      // P key pauses/resumes timer
      if ((e.key === 'p' || e.key === 'P' || e.code === 'KeyP') && activeQuestion && !showAnswer) {
        e.preventDefault();
        const newPausedState = !timerPaused;

        // Update ref immediately for interval to use
        timerPausedRef.current = newPausedState;

        // Use flushSync to update state synchronously
        flushSync(() => {
          setTimerPaused(newPausedState);
        });

        // Send TIMER_STATE immediately (for mobile clients and demo screen)
        const newState = {
          ...buzzerStateRef.current,
          isPaused: newPausedState
        };
        buzzerStateRef.current = newState;
        onBuzzerStateChange(newState);

        // Don't call broadcastGameState here - let useEffect handle it
        // This prevents duplicate broadcasts and ensures consistency
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeQuestion, showAnswer, onBuzzerStateChange, timerPaused]); // Removed broadcastGameState to prevent circular dependency

  // Handle closing question with any key after answer shown
  useEffect(() => {
    if (!activeQuestion || !showAnswer) return;

    const handleClose = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        closeQuestion();
      }
    };

    window.addEventListener('keydown', handleClose);
    return () => window.removeEventListener('keydown', handleClose);
  }, [activeQuestion, showAnswer]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (buzzerDelayRef.current) clearTimeout(buzzerDelayRef.current);
      if (responseWindowRef.current) clearTimeout(responseWindowRef.current);
    };
  }, []);

  // Activate buzzers when question opens - with periodic state updates
  useEffect(() => {
    console.log('[GamePlay] 🚀 Timer useEffect running:', {
      activeQuestion: !!activeQuestion,
      showAnswer,
      currentRound: currentRound?.name,
      teamsCount: stabilizedTeams.length
    });
    if (activeQuestion && !showAnswer) {
      // Get round timer settings
      const readingTimePerLetter = currentRound?.readingTimePerLetter ?? 0.05;
      const responseWindow = currentRound?.responseWindow ?? 30;
      const handicapEnabled = currentRound?.handicapEnabled ?? false;
      const handicapDelay = currentRound?.handicapDelay ?? 1;

      // Calculate reading time based on question text length
      const questionTextLetters = (activeQuestion.question.text || '').replace(/[^a-zA-Zа-яА-ЯёЁ]/g, '').length;
      // Apply 0.5x multiplier for media files (same logic as QuestionModal)
      const hasMedia = activeQuestion.question.media?.type === 'audio' || activeQuestion.question.media?.type === 'video' || activeQuestion.question.media?.type === 'youtube';
      const readingTime = readingTimePerLetter > 0
        ? (hasMedia ? questionTextLetters * readingTimePerLetter * 0.5 : questionTextLetters * readingTimePerLetter)
        : 0;

      // Find leading team for handicap
      const leadingTeamScore = teamScores.length > 0 ? Math.max(...teamScores.map(t => t.score)) : 0;
      const leadingTeam = teamScores.find(t => t.score === leadingTeamScore);

      // Clear existing timers
      if (buzzerDelayRef.current) clearTimeout(buzzerDelayRef.current);
      if (responseWindowRef.current) clearTimeout(responseWindowRef.current);
      if (stateUpdateRef.current) clearInterval(stateUpdateRef.current);

      // Initialize timer state
      let currentPhase: 'reading' | 'response' | 'complete' = readingTime > 0 ? 'reading' : 'response';
      let readingRemaining = readingTime;
      let responseRemaining = responseWindow;
      let handicapActive = false;

      // Initialize ref with response window value
      responseTimerRemainingRef.current = responseWindow;

      // Helper to send buzzer state
      const sendBuzzerState = (silent = false) => {
        const isHandicapActiveForTeam = handicapActive && leadingTeam?.teamId;
        // Timer is active only if buzzer is active AND in a running phase
        const isActive = buzzerActiveRef.current && (currentPhase === 'reading' || currentPhase === 'response');
        const state = {
          active: isActive,
          timerPhase: currentPhase,
          readingTimerRemaining: Math.max(0, readingRemaining),
          responseTimerRemaining: Math.max(0, responseRemaining),
          handicapActive: handicapActive,
          handicapTeamId: isHandicapActiveForTeam ? leadingTeam?.teamId : undefined,
          isPaused: timerPausedRef.current, // Use ref to get current value
          // Add total times for demo screen display
          readingTimeTotal: readingTime,
          responseTimeTotal: responseWindow,
          // Add colors (host is authoritative)
          timerColor: currentPhase === 'reading' ? 'yellow' : currentPhase === 'response' ? 'green' : 'gray',
          timerBarColor: currentPhase === 'reading' ? 'bg-yellow-500' : currentPhase === 'response' ? 'bg-green-500' : 'bg-gray-500',
          timerTextColor: currentPhase === 'reading' ? 'text-yellow-300' : currentPhase === 'response' ? 'text-green-300' : 'text-gray-300'
        };

        if (!silent) {
          console.log('[GamePlay] Sending buzzer state:', {
            timerPhase: state.timerPhase,
            readingTimerRemaining: state.readingTimerRemaining,
            responseTimerRemaining: state.responseTimerRemaining,
            isPaused: state.isPaused,
            active: state.active,
            handicapActive: state.handicapActive,
            timerColor: state.timerColor
          });
        }

        buzzerStateRef.current = state;
        onBuzzerStateChangeRef.current(state);
      };

      // Function to switch from reading to response phase (called from demo screen signal)
      const switchToResponsePhase = () => {
        if (currentPhase !== 'reading') {
          console.log('[GamePlay] Not in reading phase, ignoring switch request');
          return;
        }

        console.log('[GamePlay] ⚡ Switching to response phase (from demo screen signal)');

        // Clear reading timer
        readingRemaining = 0;
        currentPhase = 'response';

        // Clear early buzzes from reading phase
        onClearBuzzes?.();
        onBuzzTriggered(null);

        // Update ref with current response remaining when entering response phase
        responseTimerRemainingRef.current = responseRemaining;

        // Check if handicap needed when transitioning to response
        if (handicapEnabled && handicapDelay > 0 && leadingTeam) {
          handicapActive = true;
          // Send state with handicap active
          sendBuzzerState();

          // Handicap timer runs in parallel
          setTimeout(() => {
            handicapActive = false;
            setBuzzerActive(true);
            buzzerActiveRef.current = true;
            console.log('[GamePlay] 🟡 Activating all teams (after handicap ends)');
            teamStatusManager.updateGameState({ isResponseTimerActive: true });
            setTimeout(() => broadcastGameState(true), 0);
            sendBuzzerState();
          }, handicapDelay * 1000);
        } else {
          setBuzzerActive(true);
          buzzerActiveRef.current = true;
          console.log('[GamePlay] 🟡 Activating all teams (green timer starts)');
          teamStatusManager.updateGameState({ isResponseTimerActive: true });
          setTimeout(() => broadcastGameState(true), 0);
          sendBuzzerState();
        }
      };

      // Store the function in ref for external access
      switchToResponsePhaseRef.current = switchToResponsePhase;

      // Initial state
      const initiallyActive = currentPhase === 'response';
      const needsHandicap = handicapEnabled && handicapDelay > 0 && leadingTeam && initiallyActive;

      if (needsHandicap) {
        handicapActive = true;
      }

      setBuzzerActive(initiallyActive && !handicapActive);
      buzzerActiveRef.current = initiallyActive && !handicapActive;

      console.log('[GamePlay] Timer initialized - Initial state:', {
        currentPhase,
        readingTime,
        responseWindow,
        timerPaused: timerPausedRef.current,
        initialBuzzerState: buzzerStateRef.current
      });

      sendBuzzerState();

      // If handicap is needed and we start in response phase, schedule its end
      if (needsHandicap && handicapDelay > 0) {
        setTimeout(() => {
          handicapActive = false;
          setBuzzerActive(true);
          buzzerActiveRef.current = true;
          // Activate all teams when green timer starts (after handicap ends)
          console.log('[GamePlay] 🟡 Activating all teams (after handicap ends)');
          teamStatusManager.updateGameState({ isResponseTimerActive: true });
          // CRITICAL: Broadcast team state changes to demo screen
          setTimeout(() => broadcastGameState(true), 0);
          sendBuzzerState();
        }, handicapDelay * 1000);
      } else if (initiallyActive && !needsHandicap) {
        // Starting directly in response phase without handicap - activate teams immediately
        console.log('[GamePlay] 🟡 Activating all teams (starting in response phase)');
        teamStatusManager.updateGameState({ isResponseTimerActive: true });
        // CRITICAL: Broadcast team state changes to demo screen
        setTimeout(() => broadcastGameState(true), 0);
      }

      // Periodic state update (every 100ms)
      stateUpdateRef.current = setInterval(() => {
        // Always send buzzer state updates to demo screen, even when paused
        // This ensures demo screen stays synchronized with host state
        if (!timerPausedRef.current) {
          if (currentPhase === 'reading') {
            readingRemaining -= 0.1;
          if (readingRemaining <= 0) {
            readingRemaining = 0;

            // If demo screen is connected, wait for TIMER_PHASE_SWITCH message
            // Otherwise, auto-transition to response phase
            if (!demoScreenConnected) {
              currentPhase = 'response';

            // Clear early buzzes from reading phase - they don't count
            onClearBuzzes?.();
            onBuzzTriggered(null);

            // Update ref with current response remaining when entering response phase
            responseTimerRemainingRef.current = responseRemaining;

            // Check if handicap needed when transitioning to response
            if (handicapEnabled && handicapDelay > 0 && leadingTeam) {
              handicapActive = true;
              // Send state with handicap active (buzzer disabled for leading team)
              sendBuzzerState();

              // Handicap timer runs in parallel
              setTimeout(() => {
                handicapActive = false;
                setBuzzerActive(true);
                buzzerActiveRef.current = true;
                // Activate all teams when green timer starts (after handicap ends)
                console.log('[GamePlay] 🟡 Activating all teams (after handicap ends)');
                teamStatusManager.updateGameState({ isResponseTimerActive: true });
                // CRITICAL: Broadcast team state changes to demo screen
                setTimeout(() => broadcastGameState(true), 0);
                sendBuzzerState();
              }, handicapDelay * 1000);
            } else {
              setBuzzerActive(true);
              buzzerActiveRef.current = true;
              // Activate all teams when green timer starts
              console.log('[GamePlay] 🟡 Activating all teams (green timer starts)');
              teamStatusManager.updateGameState({ isResponseTimerActive: true });
              // CRITICAL: Broadcast team state changes to demo screen
              setTimeout(() => broadcastGameState(true), 0);
              sendBuzzerState();
            }
            } // End of if (!demoScreenConnected)
          } // End of if (readingRemaining <= 0)
        } // ← Закрытие if (currentPhase === 'reading')
        } else if (currentPhase === 'response') {
          responseRemaining -= 0.1;
          // Update ref with current value for immediate access in handleScoreChange
          responseTimerRemainingRef.current = responseRemaining;
          if (responseRemaining <= 0) {
            responseRemaining = 0;
            currentPhase = 'complete';
            setBuzzerActive(false);
            buzzerActiveRef.current = false;
            // Deactivate all teams when time expires
            console.log('[GamePlay] ⚫ Deactivating all teams (timer expired)');
            teamStatusManager.updateGameState({ isResponseTimerActive: false });
            sendBuzzerState(); // Send final state when timer expires
          }
        } // ← Закрытие if (!timerPausedRef.current)

        // NO network updates every tick - clients handle countdown locally
        // Only update ref for local use
        buzzerStateRef.current.readingTimerRemaining = Math.max(0, readingRemaining);
        buzzerStateRef.current.responseTimerRemaining = Math.max(0, responseRemaining);
      }, 100);

      // Periodic sync every 5 seconds to correct any drift on clients (silent mode)
      syncIntervalRef.current = setInterval(() => {
        if (currentPhase !== 'complete') {
          sendBuzzerState(true); // Silent mode - no console spam
        }
      }, 5000);

      // Set cleanup for when timers would naturally end
      const totalResponseTime = responseWindow > 0 ? (readingTime + responseWindow) * 1000 : 0;
      if (totalResponseTime > 0) {
        buzzerDelayRef.current = setTimeout(() => {
          if (stateUpdateRef.current) {
            clearInterval(stateUpdateRef.current);
            stateUpdateRef.current = null;
          }
          if (syncIntervalRef.current) {
            clearInterval(syncIntervalRef.current);
            syncIntervalRef.current = null;
          }
          setBuzzerActive(false);
          buzzerActiveRef.current = false;
          // Deactivate all teams when time expires
          console.log('[GamePlay] ⚫ Deactivating all teams (timer expired in cleanup)');
          teamStatusManager.updateGameState({ isResponseTimerActive: false });
          sendBuzzerState();
        }, totalResponseTime);
      }
    }

    return () => {
      console.log('[GamePlay] 🧹 Timer useEffect cleanup called');
      if (buzzerDelayRef.current) clearTimeout(buzzerDelayRef.current);
      if (responseWindowRef.current) clearTimeout(responseWindowRef.current);
      if (stateUpdateRef.current) clearInterval(stateUpdateRef.current);
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;

      // Only deactivate buzzer if question is closed or showAnswer is true
      // Don't deactivate if useEffect is just being recreated due to prop changes
      const shouldDeactivateBuzzer = !activeQuestion || showAnswer;

      if (shouldDeactivateBuzzer) {
        setBuzzerActive(false);
        buzzerActiveRef.current = false;
        // DON'T deactivate teams in cleanup - this causes issues when teamScores changes
        // Teams should only be deactivated when timer expires or question explicitly closes
        onBuzzerStateChangeRef.current({
          active: false,
          timerPhase: 'inactive',
          readingTimerRemaining: 0,
          responseTimerRemaining: 0,
          handicapActive: false,
          isPaused: false,
          timerColor: 'gray' as const,
          timerBarColor: 'bg-gray-500',
          timerTextColor: 'text-gray-300'
        });
      } else {
        console.log('[GamePlay] 🔄 Skipping buzzer deactivation in cleanup - question still active');
      }
    };
  }, [activeQuestion, showAnswer, currentRound, stabilizedTeams, demoScreenConnected]);

  // Handle external signal to switch to response phase (from demo screen)
  useEffect(() => {
    if (switchToResponsePhaseSignal !== null && switchToResponsePhaseSignal !== lastProcessedSignalRef.current) {
      console.log('[GamePlay] 📨 Received switchToResponsePhaseSignal:', switchToResponsePhaseSignal);
      lastProcessedSignalRef.current = switchToResponsePhaseSignal;
      switchToResponsePhase();
      // Reset the signal after processing to prevent multiple triggers
      onPhaseSwitchComplete?.();
    }
  }, [switchToResponsePhaseSignal, switchToResponsePhase, onPhaseSwitchComplete]);

  // Close question modal
  const closeQuestion = useCallback(() => {
    console.log('[GamePlay] 🔼 closeQuestion called', {
      hasActiveQuestion: !!activeQuestion,
      questionId: activeQuestion?.question.id,
      showAnswer,
      timestamp: Date.now()
    });

    if (activeQuestion) {
      // Mark question as answered
      const key = `${currentRound?.id}-${activeQuestion.theme.id}-${activeQuestion.question.id}`;
      setAnsweredQuestions(prev => new Set(prev).add(key));
    }
    setActiveQuestion(null);
    // CRITICAL: Clear ref immediately to ensure broadcastGameState sends activeQuestion: null
    lastActiveQuestionRef.current = null;
    questionModalActiveRef.current = false; // QuestionModal closed, GamePlay can manage timer
    // Clear transferred media cache when question closes
    clearTransferredMediaCache();
    setShowAnswer(false);
    setShowHint(false); // Reset hint state when question closes
    setBuzzerActive(false);
    buzzerActiveRef.current = false;

    console.log('[GamePlay] 🔼 closeQuestion: state updated, broadcasting should trigger');

    // Send buzzer state update to inform demo screen that timer is now inactive
    if (buzzerStateRef.current) {
      buzzerStateRef.current = {
        active: false,
        timerPhase: 'inactive',
        readingTimerRemaining: 0,
        responseTimerRemaining: 0,
        handicapActive: false,
        handicapTeamId: undefined,
        isPaused: false,
        readingTimeTotal: 0,
        responseTimeTotal: currentRound?.responseWindow ?? 30,
        timerColor: 'gray',
        timerBarColor: 'bg-gray-500',
        timerTextColor: 'text-gray-300'
      };
      onBuzzerStateChangeRef.current(buzzerStateRef.current);
    }

    // Reset all team states when question closes
    teamStatusManager.updateGameState({ isResponseTimerActive: false });
    teamStatusManager.resetAllTeams();

    const closeState = {
      active: false,
      timerPhase: 'inactive' as const,
      readingTimerRemaining: 0,
      responseTimerRemaining: 0,
      handicapActive: false,
      isPaused: false,
      readingTimeTotal: 0,
      responseTimeTotal: 30, // Default response time
      timerColor: 'gray' as const,
      timerBarColor: 'bg-gray-500',
      timerTextColor: 'text-gray-300'
    };
    buzzerStateRef.current = closeState;
    onBuzzerStateChange(closeState);
    setTimerPaused(false);
    onBuzzTriggered(null);
    // Broadcast to demo screen that question is closed
    broadcastGameState(true);
    // Reset answering team when question closes
    if (onAnsweringTeamChange) {
      onAnsweringTeamChange(null);
    }
  }, [activeQuestion, currentRound, onBuzzerStateChange, onBuzzTriggered, onAnsweringTeamChange, broadcastGameState, teamStatusManager]);

  // Check if question is answered
  const isQuestionAnswered = useCallback((questionId: string, themeId: string) => {
    const key = `${currentRound?.id}-${themeId}-${questionId}`;
    return answeredQuestions.has(key);
  }, [answeredQuestions, currentRound]);

  // Reset score change type when question changes
  useEffect(() => {
    setScoreChangeType(null);
  }, [activeQuestion]);

  // Stable callback for showing answer to prevent infinite re-renders
  const handleShowAnswer = useCallback(() => {
    console.log('[GamePlay] handleShowAnswer called, setting showAnswer to true');
    setShowAnswer(true);
    // Deactivate all teams when answer is shown
    console.log('[GamePlay] ⚫ Deactivating all teams (answer shown via button)');
    teamStatusManager.updateGameState({ isResponseTimerActive: false });
    // CRITICAL: Immediately broadcast state to demo screen when showing answer
    console.log('[GamePlay] 📡 Showing answer - broadcasting immediately to demo screen');
    broadcastGameState(true); // Force broadcast for instant sync
  }, [broadcastGameState]);

  const handleScoreChange = useCallback((change: 'wrong' | 'correct') => {
    if (!activeQuestion) return;

    const points = activeQuestion.points;
    const currentTeamStatusManager = teamStatusManagerRef.current;

    // SIMPLIFIED: Always use answeringTeamId if set, otherwise try to find from teamStatusManager
    let targetTeamId: string | null = answeringTeamId || null;

    // Only check teamStatusManager if answeringTeamId is not set
    if (!targetTeamId) {
      // Use the method from teamStatusManager which should have the latest state
      targetTeamId = currentTeamStatusManager.getAnsweringTeam();
    }

    // Debug logging
    const allStates = Array.from(currentTeamStatusManager.teamStates.entries()).map(([id, state]) => ({
      id: id.slice(0, 12),
      status: state.status
    }));
    console.log('[GamePlay] handleScoreChange called:', {
      change,
      points,
      answeringTeamId,
      targetTeamId,
      getAnsweringTeamResult: currentTeamStatusManager.getAnsweringTeam()?.slice(0, 12),
      allTeamStates: allStates
    });

    // Apply score change - NO CONDITIONS except having a target team
    if (targetTeamId) {
      if (change === 'wrong') {
        setTeamScores(prev => {
          const updated = prev.map((team: TeamScore) => {
            if (team.teamId === targetTeamId) {
              const newScore = team.score - points;
              console.log(`[GamePlay] ❌ Deducting ${points} points from team ${team.teamName}: ${team.score} -> ${newScore}`);
              return { ...team, score: newScore };
            }
            return team;
          });
          // Update ref immediately for broadcastGameState to use
          teamScoresRef.current = updated;
          return updated;
        });
        setScoreChangeType('wrong');
        currentTeamStatusManager.handleIncorrectAnswer();
      } else {  // correct
        setTeamScores(prev => {
          const updated = prev.map((team: TeamScore) => {
            if (team.teamId === targetTeamId) {
              const newScore = team.score + points;
              console.log(`[GamePlay] ✅ Adding ${points} points to team ${team.teamName}: ${team.score} -> ${newScore}`);
              return { ...team, score: newScore };
            }
            return team;
          });
          // Update ref immediately for broadcastGameState to use
          teamScoresRef.current = updated;
          return updated;
        });
        setScoreChangeType('correct');
        currentTeamStatusManager.handleCorrectAnswer();

        // Deactivate all teams on correct answer
        console.log('[GamePlay] ⚫ Deactivating all teams (correct answer)');
        currentTeamStatusManager.updateGameState({ isResponseTimerActive: false });

        // Auto-show answer when correct answer is given
        console.log('[GamePlay] ✅ Correct answer - auto-showing answer');
        setShowAnswer(true);

        // Turn off buzzer on correct answer
        setBuzzerActive(false);
        buzzerActiveRef.current = false;

        const newState = {
          active: false,
          timerPhase: 'inactive' as const,
          readingTimerRemaining: 0,
          responseTimerRemaining: 0,
          handicapActive: false,
          isPaused: false,
          readingTimeTotal: 0,
          responseTimeTotal: 30,
          timerColor: 'gray' as const,
          timerBarColor: 'bg-gray-500',
          timerTextColor: 'text-gray-300'
        };
        buzzerStateRef.current = newState;
        onBuzzerStateChange(newState);
        setTimerPaused(false);
      }

      // Send updated team states to demo screen
      broadcastGameState(false);
    } else {
      console.warn('[GamePlay] ⚠️ No answering team found - cannot change score!');
      console.warn('[GamePlay] Teams:', teamScores.map(t => ({ id: t.teamId.slice(0, 12), name: t.teamName, score: t.score })));
    }
  }, [activeQuestion, answeringTeamId, onBuzzerStateChange, broadcastGameState, teamScores]);

  // Open question
  const openQuestion = useCallback(async (question: Question, theme: Theme, points: number) => {
    const key = `${theme.id}-${question.id}`;

    // Восстанавливаем blob URL для медиа файлов вопроса перед открытием
    if (question.media?.localFile?.mediaId) {
      const restoredUrl = await restoreBlobFromStorage(question.media.localFile.mediaId);
      if (restoredUrl) {
        question.media.url = restoredUrl;
        console.log('✅ Question media blob URL restored:', question.media.localFile.mediaId);
      }
    }

    if (question.answerMedia?.localFile?.mediaId) {
      const restoredUrl = await restoreBlobFromStorage(question.answerMedia.localFile.mediaId);
      if (restoredUrl) {
        question.answerMedia.url = restoredUrl;
        console.log('✅ Answer media blob URL restored:', question.answerMedia.localFile.mediaId);
      }
    }

    console.log('🎯 GamePlay - Opening question:', {
      questionId: question.id,
      questionText: question.text?.slice(0, 50),
      theme: theme.name,
      points: points,
      mediaData: question.media,
      mediaUrl: question.media?.url,
      mediaType: question.media?.type,
      timerPaused: timerPaused,
      timerPausedRef: timerPausedRef.current
    });

    // Reset team states when opening a new question
    // Use flushSync to ensure state is synchronously updated before continuing
    console.log('[GamePlay] 🔒 Resetting team states for new question');
    flushSync(() => {
      teamStatusManager.resetForNewQuestion();
    });

    // Reset answering team when opening a new question
    if (onAnsweringTeamChange) {
      onAnsweringTeamChange(null);
    }

    // Set initial pause state - pause if question has media
    const hasMedia = !!(question.media && question.media.url && question.media.url.trim() !== '');
    const initialPauseState = hasMedia;

    console.log('[GamePlay] Opening question with initial pause state:', {
      hasMedia,
      initialPauseState,
      questionId: question.id,
      mediaUrl: question.media?.url
    });
    // Highlight the question for 1 second, then open modal
    setHighlightedQuestion(key);
    setTimeout(() => {
      setHighlightedQuestion(null);

      // Create the new active question object
      const newActiveQuestion = { question, theme, points, roundName: currentRound?.name };

      // Use flushSync to force synchronous state update
      // This ensures activeQuestion is updated before broadcast
      flushSync(() => {
        setActiveQuestion(newActiveQuestion);
        lastActiveQuestionRef.current = newActiveQuestion; // Update ref immediately
        console.log('[GamePlay] ✅ Updated lastActiveQuestionRef:', {
          question: newActiveQuestion.question?.text?.slice(0, 30),
          theme: newActiveQuestion.theme.name,
          questionId: newActiveQuestion.question?.id,
          hasMedia: !!newActiveQuestion.question?.media,
          hasAnswerMedia: !!newActiveQuestion.question?.answerMedia,
          mediaUrl: newActiveQuestion.question?.media?.url,
          mediaType: newActiveQuestion.question?.media?.type,
          hasLocalFile: !!newActiveQuestion.question?.media?.localFile,
          localFileId: newActiveQuestion.question?.media?.localFile?.mediaId
        });
        questionModalActiveRef.current = true; // QuestionModal open, will manage timer values
        setShowAnswer(false);
        setShowHint(false); // Reset hint state when opening new question
        setBuzzerActive(false);
        buzzerActiveRef.current = false;
        // CRITICAL: Reset phase switch signal when opening new question to prevent false triggers
        onPhaseSwitchComplete?.();
        // CRITICAL: Deactivate teams when opening question (yellow timer = reading phase)
        // Teams will be activated only when green timer starts (demo screen sends TIMER_PHASE_SWITCH)
        teamStatusManager.updateGameState({ isResponseTimerActive: false });
      });

      // Now broadcast immediately after state is guaranteed to be updated
      console.log('[GamePlay] Broadcasting new question after flushSync');

      // Initialize buzzerStateRef for new question BEFORE broadcast
      if (buzzerStateRef.current) {
        const questionTextLetters = (question.text || '').replace(/[^a-zA-Zа-яА-ЯёЁ]/g, '').length;
        const hasMedia = question.media?.type === 'audio' || question.media?.type === 'video' || question.media?.type === 'youtube';
        const calculatedReadingTime = currentRound?.readingTimePerLetter > 0
          ? (hasMedia ? questionTextLetters * currentRound.readingTimePerLetter * 0.5 : questionTextLetters * currentRound.readingTimePerLetter)
          : 0;
        const newReadingTime = Math.max(calculatedReadingTime, 1.0);

        buzzerStateRef.current = {
          ...buzzerStateRef.current,
          active: !initialPauseState,
          timerPhase: newReadingTime > 0 ? 'reading' : 'response',
          readingTimerRemaining: newReadingTime,
          responseTimerRemaining: currentRound?.responseWindow || 30,
          handicapActive: false,
          handicapTeamId: undefined,
          isPaused: initialPauseState,
          readingTimeTotal: newReadingTime,
          responseTimeTotal: currentRound?.responseWindow || 30,
          timerColor: newReadingTime > 0 ? 'yellow' : 'green',
          timerBarColor: newReadingTime > 0 ? 'bg-yellow-500' : 'bg-green-500',
          timerTextColor: newReadingTime > 0 ? 'text-yellow-300' : 'text-green-300'
        };

        console.log('[GamePlay] ✅ Initialized buzzerStateRef for new question:', {
          isPaused: initialPauseState,
          timerPhase: buzzerStateRef.current.timerPhase,
          readingTime: newReadingTime,
          responseTimeTotal: currentRound?.responseWindow || 30,
          hasMedia
        });

        // CRITICAL: Send initial buzzer state to demo screen immediately
        // This ensures demo screen starts with correct pause state
        console.log('[GamePlay] 📡 Sending initial buzzer state to demo screen:', buzzerStateRef.current);
        onBuzzerStateChange(buzzerStateRef.current);

        // CRITICAL: Also broadcast game state to ensure demo screen has complete state
        // This includes the correct buzzerState with isPaused
        console.log('[GamePlay] 📡 Broadcasting game state with correct buzzer state');
        broadcastGameState(true); // Force broadcast to ensure immediate delivery
      }

      // NOTE: Both TIMER_STATE and GAME_STATE_UPDATE are now sent
      // TIMER_STATE: for immediate timer sync
      // GAME_STATE_UPDATE: for complete state including pause state
    }, 1000);
  }, [currentRound?.name, onAnsweringTeamChange, onUpdateActiveTeamIds, broadcastGameState]); // Added broadcastGameState for proper state sync

  return (
    <>
      {/* DebugMediaStreamer removed - using syncMediaStreamer in broadcastGameState instead */}

      {/* Player Panel - Always visible on top layer */}
      <div className="fixed top-0 left-0 right-0 z-[100] h-auto px-1 bg-gray-900/50 flex items-center justify-center gap-1 py-1">
        {teamScores.map(team => {
          // Get team status from new status manager
          const teamStatus = teamStatusManager.getTeamStatus(team.teamId);
          const isAnsweringTeam = answeringTeamId === team.teamId;
          const isBuzzed = buzzedTeamIds?.has(team.teamId) || false;
          const isLateBuzz = lateBuzzTeamIds?.has(team.teamId) || false;

          // Debug logging for buzz effect
          if (isBuzzed) {
            console.log('[GamePlay] 🟢 Team buzzed:', {
              teamName: team.teamName,
              teamId: team.teamId.slice(0, 12),
              teamStatus,
              isInactiveBuzz: isBuzzed && teamStatus === TeamStatus.INACTIVE
            });
          }

          // Check if team has placed bet in super game
          const hasPlacedBet = currentScreen === 'placeBets' && superGameBets.find(b => b.teamId === team.teamId)?.ready;
          // Check if team has submitted answer in super game (during question phase)
          const hasSubmittedAnswer = currentScreen === 'superQuestion' && superGameAnswers.find(a => a.teamId === team.teamId)?.answer;

          // Determine final card state and classes
          // Visual effect when inactive team presses BUZZ: scale-90 (10% smaller) and 50% lighter
          const isInactiveBuzz = isBuzzed && teamStatus === TeamStatus.INACTIVE;

          let cardClasses: string;
          if (hasPlacedBet || hasSubmittedAnswer) {
            cardClasses = 'bg-green-500/30 border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.5)] scale-105';
          } else if (isInactiveBuzz && teamStatus === TeamStatus.INACTIVE) {
            // Special styling for inactive team that pressed BUZZ
            cardClasses = 'bg-gray-100/50 border-gray-300 shadow-[0_0_10px_rgba(255,255,255,0.3)] scale-90';
          } else {
            // Use team status manager for all other cases (including CLASH with sub-statuses)
            cardClasses = teamStatusManager.getTeamCardClasses(team.teamId);
          }

          return (
            <div
              key={team.teamId}
              onClick={(e) => teamCardClicks.onCardClick(team.teamId, e)}
              onContextMenu={(e) => teamCardClicks.onCardContextMenu(team.teamId, e)}
              className={`px-6 py-2 rounded-lg border-2 transition-all relative cursor-pointer hover:scale-105 ${cardClasses}`}
            >
            <div className="text-center">
              <div className="text-2xl font-bold text-white">{team.teamName}</div>
              <div className="h-px bg-gray-600 my-1"></div>
              <div className={`text-2xl font-bold ${
                teamStatus === TeamStatus.PENALTY ? 'text-red-400' : team.score >= 0 ? 'text-white' : 'text-red-400'
              }`}>
                {team.score}
              </div>
            </div>
          </div>
          );
        })}
      </div>

      {/* Main Content */}
      <div className="h-screen bg-gray-950 text-gray-100 overflow-hidden cursor-default">
      {/* Game Board Container - fixed position, starts below player panel */}
      {currentScreen === 'board' && currentRound && (
        <div className="fixed inset-0 top-24 bottom-0 left-0 right-0 cursor-default">
          <GameBoardExtended
            round={currentRound}
            teamScores={teamScores}
            onQuestionClick={openQuestion}
            isQuestionAnswered={isQuestionAnswered}
            highlightedQuestion={highlightedQuestion}
          />
        </div>
      )}

      {/* Other Screens Container - centered overlay */}
      {currentScreen !== 'board' && (
        <div className="fixed inset-0 top-6 flex items-center justify-center p-4 cursor-default">
          {/* Screen 1: Pack Cover */}
          {currentScreen === 'cover' && (
            <div className="text-center animate-in fade-in zoom-in duration-500 flex flex-col items-center justify-center">
              <div className="flex flex-col items-center gap-[25px]">
                <div className="h-[70vh] w-[85vw] flex items-center justify-center">
                  {pack.cover?.value ? (
                    <img
                      src={pack.cover.value}
                      alt={pack.name}
                      className="h-full w-auto object-cover rounded-2xl shadow-2xl cursor-default"
                    />
                  ) : (
                    <div className="aspect-video h-full flex items-center justify-center bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl shadow-2xl cursor-default">
                      <span className="text-8xl font-black text-white/20">?</span>
                    </div>
                  )}
                </div>
                <h1 className="text-7xl font-black text-white uppercase tracking-wider">
                  {pack.name}
                </h1>
              </div>
            </div>
          )}

          {/* Screen 2: Themes List */}
          {currentScreen === 'themes' && (
            <div className="w-full max-w-6xl animate-in fade-in duration-500 flex flex-col items-center h-[85vh] cursor-default">
              {/* Themes title at top */}
              <h2 className="text-3xl font-bold text-center text-white mb-8 mt-20 uppercase tracking-wide shrink-0">
                Themes
              </h2>

              {/* Themes grid - 2 columns with scroll */}
              <div ref={themesScrollRef} className="grid grid-cols-2 gap-4 w-full px-4 overflow-y-auto flex-1">
                {pack.rounds?.map(round =>
                  round.themes?.map(theme => (
                    <div
                      key={`${round.id}-${theme.id}`}
                      className="rounded-lg p-6 shadow-lg flex flex-col items-center relative cursor-default"
                      style={{
                        backgroundColor: theme.color || '#3b82f6',
                        minHeight: '120px'
                      }}
                    >
                      <div className="text-base font-medium opacity-70 mb-2">Раунд {round.number}</div>
                      <h3
                        className="text-2xl font-bold text-center leading-tight absolute"
                        style={{
                          color: theme.textColor || '#ffffff',
                          top: '40%'
                        }}
                      >
                        {theme.name}
                      </h3>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

        {/* Screen 3: Round Intro */}
        {currentScreen === 'round' && currentRound && (
          <div className="text-center animate-in fade-in zoom-in duration-500 flex flex-col items-center justify-center cursor-default">
            <div className="flex flex-col items-center gap-[15px]">
              <div className="h-[70vh] w-[85vw] flex items-center justify-center">
                {currentRound.cover?.value ? (
                  <img
                    src={currentRound.cover.value}
                    alt={currentRound.name}
                    className="h-full w-auto object-cover rounded-2xl shadow-2xl cursor-default"
                  />
                ) : (
                  <div className="w-64 h-64 bg-gradient-to-br from-indigo-600 to-blue-600 rounded-full flex items-center justify-center shadow-2xl cursor-default">
                    <span className="text-6xl font-black text-white">{currentRound.number}</span>
                  </div>
                )}
              </div>
              <h2 className="text-7xl font-black text-white uppercase tracking-wider">{currentRound.name}</h2>
            </div>
          </div>
        )}
        </div>
      )}

      {/* Screen 4: Select Super Themes - Exclude themes */}
      {currentScreen === 'selectSuperThemes' && currentRound && (
        <div className="w-full h-full flex flex-col items-center justify-center animate-in fade-in duration-500 px-8">
          {/* Title */}
          <h2 className="text-5xl font-bold text-center text-white mb-4 uppercase tracking-wide">
            СУПЕР-ИГРА
          </h2>
          <p className="text-2xl text-gray-300 mb-8">Нажмите на темы, чтобы исключить их</p>

          {/* Themes grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6 max-w-5xl">
            {currentRound.themes?.map((theme) => {
              const isDisabled = disabledSuperThemeIds.has(theme.id);
              const remainingCount = (currentRound.themes?.length || 0) - disabledSuperThemeIds.size;

              return (
                <button
                  key={theme.id}
                  onClick={() => {
                    if (remainingCount <= 1) return; // Can't disable the last theme
                    setDisabledSuperThemeIds(prev => {
                      const newSet = new Set(prev);
                      if (newSet.has(theme.id)) {
                        newSet.delete(theme.id);
                      } else {
                        newSet.add(theme.id);
                      }
                      return newSet;
                    });
                  }}
                  disabled={remainingCount <= 1 && !isDisabled}
                  className={`relative rounded-lg p-8 border-2 transition-all ${
                    isDisabled
                      ? 'bg-gray-900/40 border-gray-700/50 opacity-40'
                      : 'bg-gray-900/80 border-yellow-500/30 hover:border-yellow-500 hover:bg-gray-800'
                  } ${remainingCount <= 1 && !isDisabled ? 'cursor-default' : 'cursor-pointer'}`}
                >
                  <h3 className={`text-2xl font-bold text-center ${
                    isDisabled ? 'text-gray-500' : 'text-yellow-400'
                  }`}>
                    {theme.name}
                  </h3>
                  {isDisabled && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-4xl text-gray-600">✕</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Remaining count */}
          <p className="text-xl text-gray-400 mt-8">
            Осталось тем: {currentRound.themes?.length && (currentRound.themes.length - disabledSuperThemeIds.size)}
          </p>
        </div>
      )}

      {/* Screen 5: Place Your Bets - Wait for teams to bet */}
      {currentScreen === 'placeBets' && currentRound && (() => {
        // Get the selected theme (auto-selected for super rounds)
        const remainingTheme = selectedSuperThemeId
          ? currentRound.themes?.find((t: Theme) => t.id === selectedSuperThemeId)
          : null;

        return (
          <div className="w-full h-full flex flex-col items-center justify-center animate-in fade-in duration-500 px-8">
            {/* Title */}
            <h2 className="text-7xl font-bold text-center text-white mb-8 uppercase tracking-wide">
              Place Your Bets
            </h2>
            <p className="text-4xl text-gray-300 mb-8">Theme: <span className="text-yellow-400 font-bold">{remainingTheme?.name}</span></p>
            <p className="text-2xl text-gray-400">Waiting for teams to place their bets...</p>
          </div>
        );
      })()}

      {/* Screen 6: Super Game - Show Question */}
      {currentScreen === 'superQuestion' && currentRound && (
        <SuperGameQuestionModal
          round={currentRound}
          selectedSuperThemeId={selectedSuperThemeId}
          onClose={() => {
            setCurrentScreen('superAnswers');
            // Immediate broadcast to prevent screen jumping
            setTimeout(() => broadcastGameState(), 10);
          }}
        />
      )}

      {/* Screen 7: Super Game - Answers */}
      {currentScreen === 'superAnswers' && currentRound && (
        <SuperGameAnswersModal
          round={currentRound}
          selectedSuperThemeId={selectedSuperThemeId}
          teamScores={teamScores}
          superGameBets={superGameBets}
          superGameAnswers={superGameAnswers}
          selectedSuperAnswerTeam={selectedSuperAnswerTeam}
          onTeamSelect={(teamId) => setSelectedSuperAnswerTeam(teamId)}
          onScoreChange={(teamId, correct) => {
            const bet = superGameBets.find(b => b.teamId === teamId)?.bet || 0;
            setTeamScores(prev => prev.map(t => {
              if (t.teamId === teamId) {
                return { ...t, score: t.score + (correct ? bet : -bet) };
              }
              return t;
            }));
            // Update superGameAnswers with isCorrect/isWrong flags
            setSuperGameAnswers(prev => prev.map(a => {
              if (a.teamId === teamId) {
                return { ...a, isCorrect: correct, isWrong: !correct };
              }
              return a;
            }));
          }}
          onClose={() => {
            setCurrentScreen('showWinner');
            // Immediate broadcast to prevent screen jumping
            setTimeout(() => broadcastGameState(), 10);
          }}
        />
      )}

      {/* Screen 8: Show Winner */}
      {currentScreen === 'showWinner' && (
        <ModalShowWinnerScreen
          teamScores={teamScores}
          onBroadcastMessage={broadcastMessage}
        />
      )}

      {/* Question Modal */}
      {activeQuestion && (
        <ModalQuestionModal
          question={activeQuestion.question}
          theme={activeQuestion.theme}
          points={activeQuestion.points}
          showAnswer={showAnswer}
          onShowHint={setShowHint}
          buzzedTeamId={buzzedTeamId}
          teamScores={teamScores}
          onClose={closeQuestion}
          onScoreChange={handleScoreChange}
          onShowAnswer={handleShowAnswer}
          scoreChangeType={scoreChangeType}
          readingTimePerLetter={currentRound?.readingTimePerLetter ?? 0.05}
          responseWindow={currentRound?.responseWindow ?? 30}
          handicapEnabled={currentRound?.handicapEnabled ?? false}
          handicapDelay={currentRound?.handicapDelay ?? 1}
          answeringTeamId={answeringTeamId}
          roundName={activeQuestion.roundName}
          onBuzzerStateChange={handleQuestionModalBuzzerStateChange}
          onTimerPauseChange={handleTimerPauseChange}
        />
      )}
      </div>

      {/* Team Card Context Menu - for manually setting team status */}
      <TeamCardContextMenu contextMenu={teamContextMenu} teamScores={teamScores} onTeamScoreChange={handleTeamScoreChange} />
    </>
  );
});

GamePlay.displayName = 'GamePlay';
