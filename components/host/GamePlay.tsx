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
import type { GamePack } from './GameSelectorModal';
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
import { MediaStreamer } from './game/MediaStreamer';

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
  // Clash mode props
  clashingTeamIds?: Set<string>;  // Teams that are in clash mode
  // Active/inactive players props
  activeTeamIds?: Set<string>;  // Players who can BUZZ to become answering (active = blue, inactive = white)
  answeringTeamLockedIn?: boolean;  // Answering team is locked (answered incorrectly/correctly)
  onUpdateActiveTeamIds?: (teamIds: Set<string>) => void;  // Callback to update active team IDs
  showQRCode?: boolean;  // QR code visibility state
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
  clashingTeamIds = new Set(),
  activeTeamIds = new Set(),
  answeringTeamLockedIn = false,
  onUpdateActiveTeamIds,
  showQRCode = false,
}: GamePlayProps) => {
  // Game state
  const [currentScreen, setCurrentScreen] = useState<GameScreen>('cover');
  const previousScreenRef = useRef<GameScreen>('cover');
  const [currentRoundIndex, setCurrentRoundIndex] = useState(0);
  const [answeredQuestions, setAnsweredQuestions] = useState<Set<string>>(new Set());
  const [teamScores, setTeamScores] = useState<TeamScore[]>(
    teams.map(t => ({ teamId: t.id, teamName: t.name, score: 0 }))
  );

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
  const [, setBuzzerActive] = useState(false);
  const [highlightedQuestion, setHighlightedQuestion] = useState<string | null>(null);


  // Refs for timer and cleanup
  const buzzerDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const responseWindowRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateUpdateRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Ref for broadcast throttling (avoid excessive updates)
  const lastBroadcastRef = useRef<number>(0);
  const lastScreenChangeRef = useRef<number>(0);
  const broadcastThrottleMs = 100; // Minimum time between broadcasts
  const screenChangeBroadcastMs = 50; // Shorter throttle for screen changes

  // Refs for double-press tracking (R/E for round navigation)
  const doublePressRef = useRef<{ lastKey: string; lastTime: number }>({ lastKey: '', lastTime: 0 });

  // Ref for themes scroll container
  const themesScrollRef = useRef<HTMLDivElement>(null);
  const scrollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [themesScrollPosition, setThemesScrollPosition] = useState<number>(0);

  // Ref to track if we're processing a wrong answer (for queue logic)
  const processingWrongAnswerRef = useRef<boolean>(false);

  // Ref to store current response timer remaining value (for checking if buzzer should be reactivated)
  const responseTimerRemainingRef = useRef<number>(0);

  // Ref to store stable callback for updating active team IDs
  const onUpdateActiveTeamIdsRef = useRef(onUpdateActiveTeamIds);
  onUpdateActiveTeamIdsRef.current = onUpdateActiveTeamIds;

  // Ref to store stable callback for buzzer state changes
  const onBuzzerStateChangeRef = useRef(onBuzzerStateChange);
  onBuzzerStateChangeRef.current = onBuzzerStateChange;

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

  // State for timer pause control
  const [timerPaused, setTimerPaused] = useState(false);

  // Ref for timer paused state to access in closures
  const timerPausedRef = useRef(false);
  timerPausedRef.current = timerPaused;

  // Ref to track when QuestionModal is managing the timer (don't send updates from GamePlay)
  const questionModalActiveRef = useRef(false);

  // Track teams that answered wrong in current question (for red card display)
  const [wrongAnswerTeams, setWrongAnswerTeams] = useState<Set<string>>(new Set());

  // Track teams that have attempted to answer in current question (for activation/deactivation logic)
  const [attemptedTeamIds, setAttemptedTeamIds] = useState<Set<string>>(new Set());

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

  // Auto-select first theme for super rounds (removed selectSuperThemes screen)
  useEffect(() => {
    if (currentScreen === 'round' && currentRound?.type === 'super' && currentRound.themes && currentRound.themes.length > 0) {
      // Auto-select the first theme for super game
      if (!selectedSuperThemeId) {
        setSelectedSuperThemeId(currentRound.themes[0].id);
      }
    }
  }, [currentScreen, currentRound, selectedSuperThemeId]);

  // Auto-transition from round cover to selectSuperThemes for super rounds - REMOVED
  // Now requires manual Space press to advance

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
  const broadcastGameState = useCallback((force: boolean = false) => {
    if (!onBroadcastMessage) {
      console.log('[GamePlay] broadcastGameState called but onBroadcastMessage is null');
      return;
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

    // Use ref value for activeQuestion instead of state to avoid stale closures
    // This ensures we always use the latest activeQuestion value
    const currentActiveQuestion = lastActiveQuestionRef.current;

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
    console.log('[GamePlay] Broadcasting with showAnswer:', showAnswer);
    if (!currentActiveQuestion) {
      console.warn('[GamePlay] ⚠️ Broadcasting without activeQuestion, ref is null');
    }

    onBroadcastMessage({
      type: 'GAME_STATE_UPDATE',
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
          questionId: currentActiveQuestion.question.id // Add question ID for proper comparison
        } : null,
        showAnswer,
        teamScores: teamScores.map(t => ({ id: t.teamId, name: t.teamName, score: t.score })),
        buzzerState: {
          active: buzzerStateRef.current?.active || (buzzerStateRef.current?.timerPhase === 'reading' || buzzerStateRef.current?.timerPhase === 'response'),
          timerPhase: buzzerStateRef.current?.timerPhase || 'inactive',
          readingTimerRemaining: buzzerStateRef.current?.readingTimerRemaining || 0,
          responseTimerRemaining: buzzerStateRef.current?.responseTimerRemaining || 0,
          handicapActive: buzzerStateRef.current?.handicapActive || false,
          handicapTeamId: buzzerStateRef.current?.handicapTeamId,
          isPaused: buzzerStateRef.current?.isPaused || false,
          // Add total times from current round settings (authoritative source)
          readingTimeTotal: buzzerStateRef.current?.readingTimeTotal ?? 5,
          responseTimeTotal: currentRound?.responseWindow ?? 30, // Always use current round value
          // Add color information from host (authoritative source)
          timerColor: buzzerStateRef.current?.timerPhase === 'reading' ? 'yellow' : buzzerStateRef.current?.timerPhase === 'response' ? 'green' : 'gray',
          timerBarColor: buzzerStateRef.current?.timerPhase === 'reading' ? 'bg-yellow-500' : buzzerStateRef.current?.timerPhase === 'response' ? 'bg-green-500' : 'bg-gray-500',
          timerTextColor: buzzerStateRef.current?.timerPhase === 'reading' ? 'text-yellow-300' : buzzerStateRef.current?.timerPhase === 'response' ? 'text-green-300' : 'text-gray-300'
        },
        answeringTeamId,
        currentRound: currentRound ? {
          id: currentRound.id,
          name: currentRound.name,
          number: currentRound.number,
          type: currentRound.type,
          cover: currentRound.cover
        } : null,
        // Add all themes data for themes screen
        allThemes: allThemes,
        // Add board data for board screen
        boardData: boardData,
        // Add pack cover for cover screen
        packCover: pack.cover,
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
        // Add team states for player panel colors
        teamStates: {
          wrongAnswerTeams: Array.from(wrongAnswerTeams),
          activeTeamIds: Array.from(activeTeamIds),
          clashingTeamIds: Array.from(clashingTeamIds)
        },
        // Add QR code state
        showQRCode: showQRCode,
        // Add highlighted question for visual feedback
        highlightedQuestion: highlightedQuestion,
        // Add themes scroll position for sync
        themesScrollPosition: themesScrollPosition
      }
    });

    console.log('[GamePlay] Broadcast sent successfully', {
      buzzerPhase: buzzerStateRef.current?.timerPhase,
      isPaused: buzzerStateRef.current?.isPaused,
      activeQuestion: !!activeQuestion,
      timeSinceLastBroadcast: `${timeSinceLastBroadcast}ms`,
      teamStates: {
        wrongAnswerTeams: Array.from(wrongAnswerTeams),
        activeTeamIds: Array.from(activeTeamIds),
        clashingTeamIds: Array.from(clashingTeamIds)
      }
    });
  }, [currentScreen, currentRoundIndex, showAnswer, teamScores, answeringTeamId, currentRound, onBroadcastMessage, pack, selectedSuperThemeId, disabledSuperThemeIds, superGameBets, superGameAnswers, selectedSuperAnswerTeam, wrongAnswerTeams, activeTeamIds, clashingTeamIds, showQRCode, themesScrollPosition, highlightedQuestion]); // Removed activeQuestion - now using ref to avoid stale closures

  // Handle buzzer state changes from QuestionModal (media playback auto-pause)
  const handleQuestionModalBuzzerStateChange = useCallback((state: {
    active: boolean;
    timerPhase?: 'reading' | 'response' | 'complete' | 'inactive';
    readingTimerRemaining: number;
    responseTimerRemaining: number;
    handicapActive: boolean;
    handicapTeamId?: string;
    isPaused: boolean;
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

      // IMPORTANT: Preserve totals from QuestionModal unless they're missing
      // QuestionModal calculates these based on actual question text and settings
      if (!buzzerStateRef.current.readingTimeTotal || !buzzerStateRef.current.responseTimeTotal) {
        if (activeQuestion && currentRound) {
          const questionTextLetters = (activeQuestion.question.text || '').replace(/[^a-zA-Zа-яА-ЯёЁ]/g, '').length;
          const hasMedia = activeQuestion.question.media?.type === 'audio' ||
                           activeQuestion.question.media?.type === 'video' ||
                           activeQuestion.question.media?.type === 'youtube';
          // Same calculation as in QuestionModal: media questions get 50% reading time
          buzzerStateRef.current.readingTimeTotal = hasMedia
            ? Math.max(1, questionTextLetters * currentRound.readingTimePerLetter * 0.5)
            : Math.max(1, questionTextLetters * currentRound.readingTimePerLetter);
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

    // Sync timer paused state
    setTimerPaused(state.isPaused);

    // Notify parent component - this sends BUZZER_STATE messages
    // NO NEED to call broadcastGameState() here - it causes duplicate messages and UI flicker
    onBuzzerStateChange(buzzerStateRef.current);
  }, [onBuzzerStateChange]);

  // Handle timer pause state changes from QuestionModal (manual pause button)
  const handleTimerPauseChange = useCallback((isPaused: boolean) => {
    console.log('[GamePlay] Timer pause state changed:', isPaused);
    setTimerPaused(isPaused);
    timerPausedRef.current = isPaused;

    // Update buzzer state to sync with demo screen
    const timerPhase = buzzerStateRef.current?.timerPhase || 'inactive';
    const newState = {
      active: buzzerStateRef.current?.active || false,
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
    // NO broadcastGameState() call here - onBuzzerStateChange already sends BUZZER_STATE
  }, [onBuzzerStateChange, currentRound]); // Add currentRound dependency for responseWindow

  // Sync buzzerStateRef.isPaused with timerPaused state and broadcast
  useEffect(() => {
    if (buzzerStateRef.current && activeQuestion && !showAnswer) {
      buzzerStateRef.current.isPaused = timerPaused;

      console.log('[GamePlay] Syncing pause state:', {
        isPaused: timerPaused,
        timerPhase: buzzerStateRef.current.timerPhase,
        fullState: buzzerStateRef.current
      });

      onBuzzerStateChange(buzzerStateRef.current);
      // NO broadcastGameState() call here - onBuzzerStateChange already sends BUZZER_STATE
    }
  }, [timerPaused, activeQuestion, showAnswer, onBuzzerStateChange]); // Removed broadcastGameState dependency

  // Broadcast current screen to demo screen when screen changes (without triggering full state update cycle)
  // REMOVED: Now handled by main broadcastGameState which includes currentScreen in dependencies
  // This prevents duplicate broadcasts and ensures full state is always sent

  // Function to broadcast current super game state
  const broadcastSuperGameState = useCallback(() => {
    if (!onBroadcastMessage) return;

    if (currentScreen === 'placeBets' && currentRound) {
      // Update parent phase
      onSuperGamePhaseChange?.('placeBets');

      // Get the selected theme
      const selectedTheme = selectedSuperThemeId
        ? currentRound.themes?.find((t: Theme) => t.id === selectedSuperThemeId)
        : null;

      // Calculate max bet (highest score among teams)
      const maxScore = Math.max(...teamScores.map(t => t.score), 0);
      const maxBet = maxScore > 0 ? maxScore : 100;

      // Broadcast state sync to clients
      onBroadcastMessage({
        type: 'SUPER_GAME_STATE_SYNC',
        phase: 'placeBets',
        themeId: selectedTheme?.id,
        themeName: selectedTheme?.name,
        maxBet: maxBet,
        teamScores: teamScores.map(t => ({ id: t.teamId, name: t.teamName, score: t.score })),
      });
    } else if (currentScreen === 'superQuestion' && currentRound && selectedSuperThemeId) {
      // Update parent phase
      onSuperGamePhaseChange?.('showQuestion');

      // Get the selected theme and question
      const selectedTheme = currentRound.themes?.find(t => t.id === selectedSuperThemeId);
      const question = selectedTheme?.questions?.[0];

      if (selectedTheme && question) {
        onBroadcastMessage({
          type: 'SUPER_GAME_STATE_SYNC',
          phase: 'showQuestion',
          themeId: selectedTheme.id,
          themeName: selectedTheme.name,
          questionText: question.text || '',
          questionMedia: question.media,
          teamScores: teamScores.map(t => ({ id: t.teamId, name: t.teamName, score: t.score })),
        });
      }
    } else if (currentScreen === 'superAnswers') {
      onSuperGamePhaseChange?.('showWinner');
      // Clients go to idle when host views answers
      onBroadcastMessage({
        type: 'SUPER_GAME_STATE_SYNC',
        phase: 'idle',
      });
    } else if (currentScreen === 'showWinner') {
      onSuperGamePhaseChange?.('showWinner');
      // Clients go to idle when host views winner
      onBroadcastMessage({
        type: 'SUPER_GAME_STATE_SYNC',
        phase: 'idle',
      });
    } else if (['board', 'cover', 'themes', 'round', 'placeBets'].includes(currentScreen)) {
      onSuperGamePhaseChange?.('idle');
      onBroadcastMessage({
        type: 'SUPER_GAME_STATE_SYNC',
        phase: 'idle',
      });
    }
  }, [currentScreen, onBroadcastMessage, onSuperGamePhaseChange, currentRound, selectedSuperThemeId, teamScores]);

  // Update parent with super game phase AND broadcast state sync
  useEffect(() => {
    broadcastSuperGameState();
  }, [currentScreen, broadcastSuperGameState]);

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

  // Broadcast game state when important values change (EXCEPT currentScreen - handled separately)
  useEffect(() => {
    broadcastGameState(true); // Force broadcast for important state changes
    console.log('[GamePlay] Broadcast triggered by value change');
  }, [currentRoundIndex, activeQuestion, showAnswer, answeringTeamId, themesScrollPosition, highlightedQuestion]); // Added highlightedQuestion for visual feedback

  // Immediate broadcast on screen changes (bypass throttling)
  useEffect(() => {
    if (currentScreen) {
      console.log('[GamePlay] Screen changed to:', currentScreen, '- broadcasting immediately');
      lastScreenChangeRef.current = Date.now(); // Mark as screen change to bypass throttling
      broadcastGameState();
    }
  }, [currentScreen]); // This ensures screen changes are broadcast immediately without throttling

  // Initial broadcast when component mounts to ensure teamScores are sent immediately
  useEffect(() => {
    console.log('[GamePlay] Initial broadcast on mount');
    lastScreenChangeRef.current = Date.now(); // Mark as screen change to bypass throttling
    broadcastGameState();
  }, []); // Empty deps - run only on mount

  // REMOVED: Periodic buzzer state broadcast - this was causing timer flicker on demo screen
  // Demo screen now handles countdown locally from initial BUZZER_STATE messages
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
        if (onBroadcastMessage) {
          onBroadcastMessage({ type: 'SUPER_GAME_CLEAR' });
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

      return combined;
    });
  }, [teams]);

  // Broadcast updated maxBet to clients when team scores change (during super game)
  useEffect(() => {
    if (currentScreen === 'placeBets') {
      // Calculate max bet (highest score among teams)
      const maxScore = Math.max(...teamScores.map(t => t.score), 0);
      const maxBet = maxScore > 0 ? maxScore : 100;

      onBroadcastMessage({
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
              case 'cover': return isSuperRound ? 'placeBets' : 'themes';
              case 'themes':
                // Always show round cover
                return 'round';
              case 'round':
                // For super rounds, go to placeBets directly; for normal rounds, go to board
                return isSuperRound ? 'placeBets' : 'board';
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
      }

      // P key pauses/resumes timer
      if ((e.key === 'p' || e.key === 'P' || e.code === 'KeyP') && activeQuestion && !showAnswer) {
        e.preventDefault();
        const newPausedState = !timerPaused;
        setTimerPaused(newPausedState);

        // Update buzzer state with pause status
        const currentState = buzzerStateRef.current;
        const newState = {
          ...currentState,
          isPaused: newPausedState
        };
        buzzerStateRef.current = newState;
        onBuzzerStateChange(newState);

        // Immediately broadcast state to demo screen
        broadcastGameState();
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
    if (activeQuestion && !showAnswer) {
      // Get round timer settings
      const readingTimePerLetter = currentRound?.readingTimePerLetter ?? 0;
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
      const sendBuzzerState = () => {
        const isHandicapActiveForTeam = handicapActive && leadingTeam?.teamId;
        // Buzzer is active during response phase (regardless of handicap)
        // Handicap only blocks the specific leading team, not all teams
        const isActive = currentPhase === 'reading' || currentPhase === 'response';
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

        console.log('[GamePlay] Sending buzzer state:', {
          timerPhase: state.timerPhase,
          readingTimerRemaining: state.readingTimerRemaining,
          responseTimerRemaining: state.responseTimerRemaining,
          isPaused: state.isPaused,
          active: state.active,
          handicapActive: state.handicapActive,
          timerColor: state.timerColor
        });

        buzzerStateRef.current = state;
        onBuzzerStateChangeRef.current(state);
      };

      // Initial state
      const initiallyActive = currentPhase === 'response';
      const needsHandicap = handicapEnabled && handicapDelay > 0 && leadingTeam && initiallyActive;

      if (needsHandicap) {
        handicapActive = true;
      }

      setBuzzerActive(initiallyActive && !handicapActive);

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
          sendBuzzerState();
        }, handicapDelay * 1000);
      }

      // Periodic state update (every 100ms)
      stateUpdateRef.current = setInterval(() => {
        // Check if timer is paused - don't update time if paused
        if (!timerPausedRef.current) {
          if (currentPhase === 'reading') {
            readingRemaining -= 0.1;
          if (readingRemaining <= 0) {
            readingRemaining = 0;
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
                // Activate all teams when green timer starts (after handicap ends)
                const allTeamIds = new Set(teams.map(t => t.id));
                if (onUpdateActiveTeamIdsRef.current) {
                  onUpdateActiveTeamIdsRef.current(allTeamIds);
                }
                sendBuzzerState();
              }, handicapDelay * 1000);
            } else {
              setBuzzerActive(true);
              // Activate all teams when green timer starts
              const allTeamIds = new Set(teams.map(t => t.id));
              if (onUpdateActiveTeamIdsRef.current) {
                onUpdateActiveTeamIdsRef.current(allTeamIds);
              }
              sendBuzzerState();
            }
          }
        } else if (currentPhase === 'response') {
          responseRemaining -= 0.1;
          // Update ref with current value for immediate access in handleScoreChange
          responseTimerRemainingRef.current = responseRemaining;
          if (responseRemaining <= 0) {
            responseRemaining = 0;
            currentPhase = 'complete';
            setBuzzerActive(false);
            // Deactivate all teams when time expires
            if (onUpdateActiveTeamIdsRef.current) {
              onUpdateActiveTeamIdsRef.current(new Set());
            }
          }
        }
        }
      }, 100);

      // Set cleanup for when timers would naturally end
      const totalResponseTime = responseWindow > 0 ? (readingTime + responseWindow) * 1000 : 0;
      if (totalResponseTime > 0) {
        buzzerDelayRef.current = setTimeout(() => {
          if (stateUpdateRef.current) {
            clearInterval(stateUpdateRef.current);
            stateUpdateRef.current = null;
          }
          setBuzzerActive(false);
          // Deactivate all teams when time expires
          if (onUpdateActiveTeamIdsRef.current) {
            onUpdateActiveTeamIdsRef.current(new Set());
          }
          sendBuzzerState();
        }, totalResponseTime);
      }
    }

    return () => {
      if (buzzerDelayRef.current) clearTimeout(buzzerDelayRef.current);
      if (responseWindowRef.current) clearTimeout(responseWindowRef.current);
      if (stateUpdateRef.current) clearInterval(stateUpdateRef.current);
      setBuzzerActive(false);
      // DON'T deactivate teams in cleanup - this causes issues when teamScores changes
      // Teams should only be deactivated when timer expires or question explicitly closes
      onBuzzerStateChangeRef.current({
        active: false,
        timerPhase: 'inactive',
        readingTimerRemaining: 0,
        responseTimerRemaining: 0,
        handicapActive: false,
        isPaused: false
      });
    };
  }, [activeQuestion, showAnswer, currentRound, teams]);

  // Close question modal
  const closeQuestion = useCallback(() => {
    if (activeQuestion) {
      // Mark question as answered
      const key = `${currentRound?.id}-${activeQuestion.theme.id}-${activeQuestion.question.id}`;
      setAnsweredQuestions(prev => new Set(prev).add(key));
    }
    setActiveQuestion(null);
    lastActiveQuestionRef.current = null; // Clear ref when question closes
    questionModalActiveRef.current = false; // QuestionModal closed, GamePlay can manage timer
    setShowAnswer(false);
    setBuzzerActive(false);
    // Reset wrong answer teams when question closes
    setWrongAnswerTeams(new Set());
    // Reset attempted teams when question closes
    setAttemptedTeamIds(new Set());
    // Deactivate all teams when question closes
    if (onUpdateActiveTeamIdsRef.current) {
      onUpdateActiveTeamIdsRef.current(new Set());
    }
    processingWrongAnswerRef.current = false;
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
    broadcastGameState(true); // Force broadcast to ensure demo screen updates immediately
    // Reset answering team when question closes
    if (onAnsweringTeamChange) {
      onAnsweringTeamChange(null);
    }
  }, [activeQuestion, currentRound, onBuzzerStateChange, onBuzzTriggered, onAnsweringTeamChange, broadcastGameState]);

  // Check if question is answered
  const isQuestionAnswered = useCallback((questionId: string, themeId: string) => {
    const key = `${currentRound?.id}-${themeId}-${questionId}`;
    return answeredQuestions.has(key);
  }, [answeredQuestions, currentRound]);

  // Reset score change type when question changes
  useEffect(() => {
    setScoreChangeType(null);
  }, [activeQuestion]);
  const handleScoreChange = useCallback((change: 'wrong' | 'correct') => {
    if (!activeQuestion) return;

    const points = activeQuestion.points;
    // Use answeringTeamId if set, otherwise fall back to buzzedTeamId
    const targetTeamId = answeringTeamId || buzzedTeamId;

    if (change === 'wrong') {
      // Deduct points from answering team
      if (targetTeamId) {

        setTeamScores(prev => prev.map((team: TeamScore) => {
          if (team.teamId === targetTeamId) {
            return { ...team, score: team.score - points };
          }
          return team;
        }));
        setScoreChangeType('wrong');
        processingWrongAnswerRef.current = true;

        // Mark team as having answered wrong
        setWrongAnswerTeams(prev => new Set(prev).add(targetTeamId));

        // Mark as attempted IMMEDIATELY (synchronous update - create proper new Set)
        const updatedAttemptedIds = new Set([...attemptedTeamIds, targetTeamId]);
        setAttemptedTeamIds(updatedAttemptedIds);

        // Immediately activate other teams that haven't attempted yet (use UPDATED value)
        const newActiveTeamIds = new Set(teams.map(t => t.id).filter(id => id !== targetTeamId && !updatedAttemptedIds.has(id)));

        if (onUpdateActiveTeamIdsRef.current) {
          onUpdateActiveTeamIdsRef.current(newActiveTeamIds);
        }

        // Send updated team states to demo screen
        broadcastGameState(false); // Don't force - use throttle
      } else {

        // Keep buzzer active for other teams ONLY if timer is still running
        const currentResponseRemaining = buzzerStateRef.current?.responseTimerRemaining || 0;
        const isTimerStillRunning = currentResponseRemaining > 0 && buzzerStateRef.current?.active;

        if (isTimerStillRunning) {
          setBuzzerActive(true);
          const responseState = {
            active: true,
            timerPhase: 'response' as const,
            readingTimerRemaining: 0,
            responseTimerRemaining: currentResponseRemaining,
            handicapActive: false,
            isPaused: timerPaused,
            readingTimeTotal: 0,
            responseTimeTotal: currentRound?.responseWindow || 30, // Always use current round value
            timerColor: 'green' as const,
            timerBarColor: 'bg-green-500',
            timerTextColor: 'text-green-300'
          };
          buzzerStateRef.current = responseState;
          onBuzzerStateChange(responseState);
        } else {
          // Timer has expired - don't reactivate buzzer
          setBuzzerActive(false);
          const inactiveState = {
            active: false,
            timerPhase: 'inactive' as const,
            readingTimerRemaining: 0,
            responseTimerRemaining: 0,
            handicapActive: false,
            isPaused: false,
            readingTimeTotal: 0,
            responseTimeTotal: currentRound?.responseWindow || 30,
            timerColor: 'gray' as const,
            timerBarColor: 'bg-gray-500',
            timerTextColor: 'text-gray-300'
          };
          buzzerStateRef.current = inactiveState;
          onBuzzerStateChange(inactiveState);
        }

        // Clear answering team
        if (onAnsweringTeamChange) {
          onAnsweringTeamChange(null);
        }
      }
    } else if (change === 'correct') {
      // Add points to answering team
      if (targetTeamId) {

        setTeamScores(prev => prev.map((team: TeamScore) => {
          if (team.teamId === targetTeamId) {
            return { ...team, score: team.score + points };
          }
          return team;
        }));
        setScoreChangeType('correct');

        // Mark team as having attempted to answer
        setAttemptedTeamIds(prev => new Set(prev).add(targetTeamId));

        // Deactivate all teams - question is done, no more answers allowed
        if (onUpdateActiveTeamIdsRef.current) {
          onUpdateActiveTeamIdsRef.current(new Set());
        }

        // Clear answering team
        if (onAnsweringTeamChange) {
          onAnsweringTeamChange(null);
        }

        // Turn off buzzer - answer will be shown manually with Space
        setBuzzerActive(false);
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
      }
    }
  }, [activeQuestion, buzzedTeamId, answeringTeamId, onBuzzerStateChange, onAnsweringTeamChange, onUpdateActiveTeamIds, currentRound, attemptedTeamIds, teams]);

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

    // Reset answering team when opening a new question
    if (onAnsweringTeamChange) {
      onAnsweringTeamChange(null);
    }
    // Reset wrong answer teams when opening a new question
    setWrongAnswerTeams(new Set());
    // Reset attempted teams when opening a new question
    setAttemptedTeamIds(new Set());
    // Set initial pause state - pause if question has media
    const hasMedia = !!(question.media && question.media.url && question.media.url.trim() !== '');
    const initialPauseState = hasMedia;

    console.log('[GamePlay] Opening question with initial pause state:', {
      hasMedia,
      initialPauseState,
      questionId: question.id,
      mediaUrl: question.media?.url
    });
    // Deactivate all teams when opening a new question (will be activated when green timer starts)
    if (onUpdateActiveTeamIdsRef.current) {
      onUpdateActiveTeamIdsRef.current(new Set());
    }
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
          theme: newActiveQuestion.theme.name
        });
        questionModalActiveRef.current = true; // QuestionModal open, will manage timer values
        setShowAnswer(false);
        setBuzzerActive(false);
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
      }

      // NO broadcastGameState() call - BUZZER_STATE is sent by QuestionModal
      // This prevents duplicate messages that reset local countdown on demo screen
    }, 1000);
  }, [currentRound?.name, onAnsweringTeamChange, onUpdateActiveTeamIds]); // Removed broadcastGameState to prevent circular dependency

  // Handle team card click - set as answering team or toggle wrong answer state
  const handleTeamClick = useCallback((teamId: string) => {
    // If clicking on answering team, just clear it (make it gray, not red)
    if (answeringTeamId === teamId) {
      // Clear answering team when clicking on it - don't mark as wrong
      if (onAnsweringTeamChange) {
        onAnsweringTeamChange(null);
      }
    }
    // If clicking on a team that already has wrong answer, remove it from wrong set
    else if (wrongAnswerTeams.has(teamId)) {
      setWrongAnswerTeams(prev => {
        const newSet = new Set(prev);
        newSet.delete(teamId);
        return newSet;
      });
    }
    // Otherwise, set as answering team
    else if (onAnsweringTeamChange) {
      onAnsweringTeamChange(teamId);
    }
  }, [answeringTeamId, wrongAnswerTeams, onAnsweringTeamChange]);

  return (
    <>
      {/* Media Streamer - Transfers media files to demo screen */}
      {onBroadcastMessage && (
        <MediaStreamer
          activeQuestion={activeQuestion}
          onBroadcastMessage={(message) => onBroadcastMessage(message)}
          hostId={pack.id || 'host'}
        />
      )}

      {/* Player Panel - Always visible on top layer */}
      <div className="fixed top-0 left-0 right-0 z-[100] h-auto px-1 bg-gray-900/50 flex items-center justify-center gap-1 py-1">
        {teamScores.map(team => {
          // answeringTeamId takes priority (set by first buzz during response phase)
          const isAnsweringTeam = answeringTeamId === team.teamId;
          const isBuzzed = buzzedTeamIds?.has(team.teamId) || false;
          const isLateBuzz = lateBuzzTeamIds?.has(team.teamId) || false;
          const hasWrongAnswer = wrongAnswerTeams.has(team.teamId);

          // Clash mode status
          const isClashing = clashingTeamIds.has(team.teamId);

          // Check if team has placed bet in super game
          const hasPlacedBet = currentScreen === 'placeBets' && superGameBets.find(b => b.teamId === team.teamId)?.ready;
          // Check if team has submitted answer in super game (during question phase)
          const hasSubmittedAnswer = currentScreen === 'superQuestion' && superGameAnswers.find(a => a.teamId === team.teamId)?.answer;

          return (
            <div
              key={team.teamId}
              onClick={() => handleTeamClick(team.teamId)}
              className={`px-6 py-2 rounded-lg border-2 transition-all relative cursor-pointer hover:scale-105 ${
                hasWrongAnswer
                  ? 'bg-gray-100/40 border-gray-300 shadow-[0_0_10px_rgba(255,255,255,0.3)]'
                  : hasPlacedBet || hasSubmittedAnswer
                    ? 'bg-green-500/30 border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.5)] scale-105'
                    : isAnsweringTeam
                      ? 'bg-green-500/40 border-green-400 shadow-[0_0_20px_rgba(74,222,128,0.6)] scale-105'
                      : isClashing
                        ? 'bg-blue-500/40 border-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.8)] scale-105'
                        : activeTeamIds.has(team.teamId)
                          ? 'bg-yellow-500/30 border-yellow-400 shadow-[0_0_20px_rgba(234,179,8,0.6)]'
                          : 'bg-gray-100/40 border-gray-300 shadow-[0_0_10px_rgba(255,255,255,0.3)]'
              }`}
            >
            <div className="text-center">
              <div className="text-2xl font-bold text-white">{team.teamName}</div>
              <div className="h-px bg-gray-600 my-1"></div>
              <div className={`text-2xl font-bold ${
                team.score >= 0 ? 'text-white' : 'text-red-400'
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
                      className="rounded-xl p-6 shadow-lg flex flex-col items-center relative cursor-default"
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
          onBroadcastMessage={onBroadcastMessage}
        />
      )}

      {/* Question Modal */}
      {activeQuestion && (
        <ModalQuestionModal
          question={activeQuestion.question}
          theme={activeQuestion.theme}
          points={activeQuestion.points}
          showAnswer={showAnswer}
          buzzedTeamId={buzzedTeamId}
          teamScores={teamScores}
          onClose={closeQuestion}
          onScoreChange={handleScoreChange}
          onShowAnswer={() => setShowAnswer(true)}
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
    </>
  );
});

GamePlay.displayName = 'GamePlay';
