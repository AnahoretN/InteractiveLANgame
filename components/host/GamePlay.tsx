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
import { Volume2 } from 'lucide-react';
import type { GamePack } from './GameSelectorModal';
import type { Round, Theme, Question } from './PackEditor';
import { Team, type PeerMessage } from '../../types';

/**
 * Calculate dynamic font size for question text
 * @param text - The question text
 * @param baseSize - Base font size in rem (current size: 4 for mobile, 7 for desktop)
 * @returns Font size in rem (half of base to full base)
 */
function calculateQuestionFontSize(text: string, baseSize: number): number {
  const minSize = baseSize * 0.5;
  const maxLength = 200; // At 200+ chars, use minimum size
  const shortThreshold = 30; // Text length considered "short"

  const length = text.length;
  if (length <= shortThreshold) return baseSize;
  if (length >= maxLength) return minSize;

  // Linear interpolation between baseSize and minSize
  const ratio = (length - shortThreshold) / (maxLength - shortThreshold);
  return baseSize - (baseSize - minSize) * ratio;
}

/**
 * Calculate font size for answer options - mobile version
 * @param text - Answer text
 * @returns Font size in rem (max 1.5rem, min 0.75rem)
 */
function calculateAnswerFontSizeMobile(text: string): number {
  const baseSize = 1.5; // 1.5rem max for mobile
  const minSize = 0.75; // 0.75rem min for mobile
  const maxLength = 50; // At 50+ chars, use minimum size
  const shortThreshold = 5; // Text length considered "short"

  const length = text.length;
  if (length <= shortThreshold) return baseSize;
  if (length >= maxLength) return minSize;

  // Linear interpolation
  const ratio = (length - shortThreshold) / (maxLength - shortThreshold);
  return baseSize - (baseSize - minSize) * ratio;
}

/**
 * Calculate font size for answer options - desktop version
 * @param text - Answer text
 * @returns Font size in rem (max 3rem, min 1.5rem)
 */
function calculateAnswerFontSizeDesktop(text: string): number {
  const baseSize = 3; // 3rem max for desktop
  const minSize = 1.5; // 1.5rem min for desktop
  const maxLength = 50; // At 50+ chars, use minimum size
  const shortThreshold = 5; // Text length considered "short"

  const length = text.length;
  if (length <= shortThreshold) return baseSize;
  if (length >= maxLength) return minSize;

  // Linear interpolation
  const ratio = (length - shortThreshold) / (maxLength - shortThreshold);
  return baseSize - (baseSize - minSize) * ratio;
}

/**
 * Calculate dynamic font size for theme card text
 * @param text - The theme name
 * @param cardSizeFactor - Card size factor (1.0 for default, smaller for smaller cards)
 * @returns Font size in pixels
 */
function calculateThemeCardFontSize(text: string, cardSizeFactor: number = 1.0): number {
  const baseSize = 36; // Base font size in pixels (reduced by 25% from 48px)
  const shortThreshold = 8;   // Characters for full size
  const maxLength = 40;       // Characters for minimum size
  const minSizeRatio = 0.35;  // Minimum size is 35% of base

  const length = text.length;
  if (length <= shortThreshold) return baseSize * cardSizeFactor;
  if (length >= maxLength) return baseSize * minSizeRatio * cardSizeFactor;

  // Linear interpolation
  const ratio = (length - shortThreshold) / (maxLength - shortThreshold);
  return baseSize * cardSizeFactor * (1 - ratio * (1 - minSizeRatio));
}

/**
 * Calculate grid layout and card size based on number of themes
 * @param themeCount - Number of themes
 * @returns Object with columns, rows, container dimensions, and card size factor
 */
function calculateThemeGrid(themeCount: number) {
  const defaultColumns = 3;
  const defaultRows = 3;
  const defaultThemeCount = 9;
  const containerWidth = 1040;
  const containerHeight = 520;

  if (themeCount <= defaultThemeCount) {
    return {
      columns: defaultColumns,
      rows: defaultRows,
      width: containerWidth,
      height: containerHeight,
      cardSizeFactor: 1.0
    };
  }

  // Calculate scale factor for more themes
  const themeRatio = themeCount / defaultThemeCount;
  const scaleFactor = 1 / Math.sqrt(themeRatio);

  // Calculate new columns and rows
  let columns = defaultColumns;
  let rows = Math.ceil(themeCount / columns);

  if (rows > 5) {
    columns = Math.ceil(Math.sqrt(themeCount));
    rows = Math.ceil(themeCount / columns);
  }

  return {
    columns,
    rows,
    width: Math.round(containerWidth * scaleFactor * (columns / defaultColumns)),
    height: Math.round(containerHeight * scaleFactor * (rows / defaultRows)),
    cardSizeFactor: scaleFactor
  };
}

// Screens for intro sequence
export type GameScreen = 'cover' | 'themes' | 'round' | 'board' | 'selectSuperThemes' | 'placeBets' | 'superQuestion' | 'superAnswers' | 'showWinner';

interface TeamScore {
  teamId: string;
  teamName: string;
  score: number;
}

// Super Game state
interface SuperGameBet {
  teamId: string;
  bet: number;
  ready: boolean;
}

interface SuperGameAnswer {
  teamId: string;
  answer: string;
  revealed: boolean;
}

export interface BuzzerState {
  active: boolean;
  timerPhase: 'reading' | 'response' | 'complete' | 'inactive';
  readingTimerRemaining: number;
  responseTimerRemaining: number;
  handicapActive: boolean;
  handicapTeamId?: string; // Team that has handicap (leader)
}

interface GamePlayProps {
  pack: GamePack;
  teams: Team[];
  onBackToLobby?: () => void;
  onBuzzerStateChange: (state: BuzzerState) => void;
  onBuzzTriggered: (teamId: string | null) => void;
  onClearBuzzes?: () => void;  // Clear buzzed clients when transitioning to response phase
  buzzedTeamId: string | null;
  buzzedTeamIds?: Set<string>;  // Teams that recently buzzed (for white flash effect)
  answeringTeamId?: string | null;  // Team that gets to answer the question
  onAnsweringTeamChange?: (teamId: string | null) => void;  // Callback to reset answering team
  // Super Game props (optional for backward compatibility)
  onBroadcastMessage?: (message: PeerMessage) => void;  // Broadcast message to all clients
  superGameBets?: SuperGameBet[];  // Bets received from mobile clients
  superGameAnswers?: SuperGameAnswer[];  // Answers received from mobile clients
  onSuperGamePhaseChange?: (phase: 'idle' | 'placeBets' | 'showQuestion' | 'showWinner') => void;  // Track super game phase
  onSuperGameMaxBetChange?: (maxBet: number) => void;  // Track max bet for super game
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
  answeringTeamId,
  onAnsweringTeamChange,
  onBroadcastMessage,
  superGameBets: externalSuperGameBets,
  superGameAnswers: externalSuperGameAnswers,
  onSuperGamePhaseChange,
  onSuperGameMaxBetChange,
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
  } | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [, setBuzzerActive] = useState(false);
  const [highlightedQuestion, setHighlightedQuestion] = useState<string | null>(null);

  // Refs for timer and cleanup
  const buzzerDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const responseWindowRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateUpdateRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Refs for double-press tracking (R/E for round navigation)
  const doublePressRef = useRef<{ lastKey: string; lastTime: number }>({ lastKey: '', lastTime: 0 });

  // Ref for themes scroll container
  const themesScrollRef = useRef<HTMLDivElement>(null);
  const scrollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Get current round
  const currentRound = useMemo((): Round | undefined => {
    if (!pack.rounds || currentRoundIndex >= pack.rounds.length) return undefined;
    return pack.rounds[currentRoundIndex];
  }, [pack.rounds, currentRoundIndex]);

  // Reset super game state when entering selectSuperThemes screen
  useEffect(() => {
    if (currentScreen === 'selectSuperThemes') {
      setSelectedSuperThemeId(null);
      setDisabledSuperThemeIds(new Set());
    }
  }, [currentScreen]);

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

  // Update parent with super game phase AND broadcast state sync
  useEffect(() => {
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
      console.log('[GamePlay] Broadcasting SUPER_GAME_STATE_SYNC placeBets');
      onBroadcastMessage({
        type: 'SUPER_GAME_STATE_SYNC',
        phase: 'placeBets',
        themeId: selectedTheme?.id,
        themeName: selectedTheme?.name,
        maxBet: maxBet,
      });

      // Reset bets state
      setSuperGameBets([]);
    } else if (currentScreen === 'superQuestion' && currentRound && selectedSuperThemeId) {
      // Update parent phase
      onSuperGamePhaseChange?.('showQuestion');

      // Get the selected theme and question
      const selectedTheme = currentRound.themes?.find(t => t.id === selectedSuperThemeId);
      const question = selectedTheme?.questions?.[0];

      if (selectedTheme && question) {
        console.log('[GamePlay] Broadcasting SUPER_GAME_STATE_SYNC showQuestion');
        onBroadcastMessage({
          type: 'SUPER_GAME_STATE_SYNC',
          phase: 'showQuestion',
          themeId: selectedTheme.id,
          themeName: selectedTheme.name,
          questionText: question.text || '',
          questionMedia: question.media,
        });

        // Reset answers state
        setSuperGameAnswers([]);
      }
    } else if (currentScreen === 'superAnswers') {
      onSuperGamePhaseChange?.('showWinner');
      // Clients go to idle when host views answers
      console.log('[GamePlay] Broadcasting SUPER_GAME_STATE_SYNC idle (superAnswers)');
      onBroadcastMessage({
        type: 'SUPER_GAME_STATE_SYNC',
        phase: 'idle',
      });
    } else if (currentScreen === 'showWinner') {
      onSuperGamePhaseChange?.('showWinner');
      // Clients go to idle when host views winner
      console.log('[GamePlay] Broadcasting SUPER_GAME_STATE_SYNC idle (showWinner)');
      onBroadcastMessage({
        type: 'SUPER_GAME_STATE_SYNC',
        phase: 'idle',
      });
    } else if (['board', 'cover', 'themes', 'round', 'selectSuperThemes'].includes(currentScreen)) {
      onSuperGamePhaseChange?.('idle');
      console.log('[GamePlay] Broadcasting SUPER_GAME_STATE_SYNC idle (regular screens)');
      onBroadcastMessage({
        type: 'SUPER_GAME_STATE_SYNC',
        phase: 'idle',
      });
    }
  }, [currentScreen, onBroadcastMessage, onSuperGamePhaseChange, currentRound, selectedSuperThemeId, teamScores]);

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
          console.log('[GamePlay] Leaving super game or invalid transition, clearing state on clients:', prevScreen, '->', currentScreen);
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

      console.log('[GamePlay] Broadcasting updated maxBet:', maxBet, 'based on scores:', teamScores);
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
        console.log('[GamePlay] Space pressed - currentRound:', roundAtIndex?.name, 'type:', roundAtIndex?.type, 'index:', currentRoundIndex);

        setCurrentScreen(prev => {
          console.log('[GamePlay] isSuperRound:', isSuperRound, 'prev screen:', prev);

          const nextScreen = (() => {
            switch (prev) {
              case 'cover': return isSuperRound ? 'selectSuperThemes' : 'themes';
              case 'themes':
                // Always show round cover
                return 'round';
              case 'selectSuperThemes':
                // Only proceed to placeBets when exactly one theme remains (not disabled)
                const themeCount = currentRound?.themes?.length || 0;
                const remainingCount = themeCount - disabledSuperThemeIds.size;
                return remainingCount === 1 ? 'placeBets' : 'selectSuperThemes';
              case 'round':
                // For super rounds, skip board and go to selectSuperThemes
                return isSuperRound ? 'selectSuperThemes' : 'board';
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

          console.log('[GamePlay] Screen transition:', prev, '->', nextScreen);

          return nextScreen;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeQuestion, currentRoundIndex, pack.rounds, selectedSuperThemeId, superGameBets, teamScores]);

  // Handle continuous scroll with ArrowDown/ArrowUp on themes/superThemes screens
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only on themes or superThemes screens, not when question modal is open
      if ((currentScreen !== 'themes' && currentScreen !== 'selectSuperThemes') || activeQuestion) return;
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
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeQuestion, pack.rounds]);

  // Handle scoring with Space/Control
  useEffect(() => {
    if (!activeQuestion || !buzzedTeamId || showAnswer) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.code === 'Space') {
        // Correct answer - add points
        e.preventDefault();
        handleAnswerResult(true);
      } else if (e.key === 'Control' || e.ctrlKey) {
        // Wrong answer - subtract points
        e.preventDefault();
        handleAnswerResult(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeQuestion, buzzedTeamId, showAnswer]);

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
      const readingTime = readingTimePerLetter > 0 ? questionTextLetters * readingTimePerLetter : 0;

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

      // Helper to send buzzer state
      const sendBuzzerState = () => {
        const isHandicapActiveForTeam = handicapActive && leadingTeam?.teamId;
        onBuzzerStateChange({
          active: currentPhase === 'response' && !handicapActive,
          timerPhase: currentPhase,
          readingTimerRemaining: Math.max(0, readingRemaining),
          responseTimerRemaining: Math.max(0, responseRemaining),
          handicapActive: handicapActive,
          handicapTeamId: isHandicapActiveForTeam ? leadingTeam?.teamId : undefined
        });
      };

      // Initial state
      const initiallyActive = currentPhase === 'response';
      const needsHandicap = handicapEnabled && handicapDelay > 0 && leadingTeam && initiallyActive;

      if (needsHandicap) {
        handicapActive = true;
      }

      setBuzzerActive(initiallyActive && !handicapActive);
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
        if (currentPhase === 'reading') {
          readingRemaining -= 0.1;
          if (readingRemaining <= 0) {
            readingRemaining = 0;
            currentPhase = 'response';

            // Clear early buzzes from reading phase - they don't count
            onClearBuzzes?.();
            onBuzzTriggered(null);

            // Check if handicap needed when transitioning to response
            if (handicapEnabled && handicapDelay > 0 && leadingTeam) {
              handicapActive = true;
              // Send state with handicap active (buzzer disabled for leading team)
              sendBuzzerState();

              // Handicap timer runs in parallel
              setTimeout(() => {
                handicapActive = false;
                setBuzzerActive(true);
                sendBuzzerState();
              }, handicapDelay * 1000);
            } else {
              setBuzzerActive(true);
              sendBuzzerState();
            }
          }
        } else if (currentPhase === 'response') {
          responseRemaining -= 0.1;
          if (responseRemaining <= 0) {
            responseRemaining = 0;
            currentPhase = 'complete';
            setBuzzerActive(false);
          }
        }
        sendBuzzerState();
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
          sendBuzzerState();
        }, totalResponseTime);
      }
    }

    return () => {
      if (buzzerDelayRef.current) clearTimeout(buzzerDelayRef.current);
      if (responseWindowRef.current) clearTimeout(responseWindowRef.current);
      if (stateUpdateRef.current) clearInterval(stateUpdateRef.current);
      setBuzzerActive(false);
      onBuzzerStateChange({
        active: false,
        timerPhase: 'inactive',
        readingTimerRemaining: 0,
        responseTimerRemaining: 0,
        handicapActive: false
      });
    };
  }, [activeQuestion, showAnswer, currentRound, teamScores, onBuzzerStateChange]);

  // Handle answer result (correct/wrong) - DEPRECATED, now using handleScoreChange
  const handleAnswerResult = useCallback((correct: boolean) => {
    if (!buzzedTeamId || !activeQuestion) return;

    const points = activeQuestion.points;
    setTeamScores(prev => prev.map(team => {
      if (team.teamId === buzzedTeamId) {
        return {
          ...team,
          score: team.score + (correct ? points : -points)
        };
      }
      return team;
    }));

    setShowAnswer(true);
    setBuzzerActive(false);
    onBuzzerStateChange({
      active: false,
      timerPhase: 'inactive',
      readingTimerRemaining: 0,
      responseTimerRemaining: 0,
      handicapActive: false
    });
  }, [buzzedTeamId, activeQuestion, onBuzzerStateChange]);

  // Close question modal
  const closeQuestion = useCallback(() => {
    if (activeQuestion) {
      // Mark question as answered
      const key = `${currentRound?.id}-${activeQuestion.theme.id}-${activeQuestion.question.id}`;
      setAnsweredQuestions(prev => new Set(prev).add(key));
    }
    setActiveQuestion(null);
    setShowAnswer(false);
    setBuzzerActive(false);
    onBuzzerStateChange({
      active: false,
      timerPhase: 'inactive',
      readingTimerRemaining: 0,
      responseTimerRemaining: 0,
      handicapActive: false
    });
    onBuzzTriggered(null);
    // Reset answering team when question closes
    if (onAnsweringTeamChange) {
      onAnsweringTeamChange(null);
    }
  }, [activeQuestion, currentRound, onBuzzerStateChange, onBuzzTriggered, onAnsweringTeamChange]);

  // Track score change type for displaying result message
  const [scoreChangeType, setScoreChangeType] = useState<'wrong' | 'correct' | null>(null);

  // Reset score change type when question changes
  useEffect(() => {
    setScoreChangeType(null);
  }, [activeQuestion]);

  // Handle score change from keyboard (-, =)
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
      }
      setShowAnswer(true);
      setBuzzerActive(false);
      onBuzzerStateChange({
        active: false,
        timerPhase: 'inactive',
        readingTimerRemaining: 0,
        responseTimerRemaining: 0,
        handicapActive: false
      });
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
      }
      setShowAnswer(true);
      setBuzzerActive(false);
      onBuzzerStateChange({
        active: false,
        timerPhase: 'inactive',
        readingTimerRemaining: 0,
        responseTimerRemaining: 0,
        handicapActive: false
      });
    }
  }, [activeQuestion, buzzedTeamId, answeringTeamId, onBuzzerStateChange]);

  // Open question
  const openQuestion = useCallback((question: Question, theme: Theme, points: number) => {
    const key = `${theme.id}-${question.id}`;
    // Highlight the question for 1 second, then open modal
    setHighlightedQuestion(key);
    setTimeout(() => {
      setHighlightedQuestion(null);
      setActiveQuestion({ question, theme, points });
      setShowAnswer(false);
      setBuzzerActive(false);
    }, 1000);
  }, []);

  // Check if question is answered
  const isQuestionAnswered = useCallback((questionId: string, themeId: string) => {
    const key = `${currentRound?.id}-${themeId}-${questionId}`;
    return answeredQuestions.has(key);
  }, [answeredQuestions, currentRound]);

  return (
    <>
      {/* Player Panel - Always visible on top layer */}
      <div className="fixed top-0 left-0 right-0 z-[100] h-auto px-1 bg-gray-900/50 flex items-center justify-center gap-1 py-1">
        {teamScores.map(team => {
          const isAnsweringTeam = (buzzedTeamId === team.teamId && activeQuestion && !showAnswer) || answeringTeamId === team.teamId;
          const isBuzzed = buzzedTeamIds?.has(team.teamId) || false;
          // Check if team has placed bet in super game
          const hasPlacedBet = currentScreen === 'placeBets' && superGameBets.find(b => b.teamId === team.teamId)?.ready;
          // Check if team has submitted answer in super game
          const hasSubmittedAnswer = currentScreen === 'superGameAnswers' && superGameAnswers.find((a: { teamId: string; answer: string; revealed: boolean; submitted: boolean }) => a.teamId === team.teamId)?.submitted;

          return (
            <div
              key={team.teamId}
              className={`px-6 py-2 rounded-lg border-2 transition-all ${
                hasPlacedBet || hasSubmittedAnswer
                  ? 'bg-green-500/30 border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.5)] scale-105'
                  : isAnsweringTeam
                    ? 'bg-yellow-500/30 border-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.5)] scale-105'
                    : isBuzzed
                      ? 'bg-white/50 border-white shadow-[0_0_30px_rgba(255,255,255,0.8)] scale-105 animate-double-flash'
                      : 'bg-gray-800/50 border-gray-700'
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
              {hasPlacedBet && (
                <div className="text-green-400 text-xs font-bold mt-1">✓ Bet Placed</div>
              )}
              {hasSubmittedAnswer && (
                <div className="text-green-400 text-xs font-bold mt-1">✓ Answer Sent</div>
              )}
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
          <GameBoard
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

      {/* Screen 5: Select Super Game Themes (disable themes until one remains) */}
      {currentScreen === 'selectSuperThemes' && currentRound && (() => {
        const themeCount = currentRound.themes?.length || 0;
        const gridConfig = calculateThemeGrid(themeCount);
        const remainingCount = themeCount - disabledSuperThemeIds.size;

        return (
          <div className="w-full h-full flex flex-col items-center justify-center p-8">
            {/* Title */}
            <h2 className="text-4xl font-bold text-center text-white mb-6 uppercase tracking-wide">
              Exclude Themes
            </h2>

            {/* Themes grid - dynamic size based on theme count */}
            <div
              className="grid gap-5"
              style={{
                gridTemplateColumns: `repeat(${gridConfig.columns}, 1fr)`,
                gridTemplateRows: `repeat(${gridConfig.rows}, 1fr)`,
                width: `${gridConfig.width}px`,
                height: `${gridConfig.height}px`,
              }}
            >
              {currentRound.themes?.map(theme => {
                const isDisabled = disabledSuperThemeIds.has(theme.id);
                const fontSize = calculateThemeCardFontSize(theme.name, gridConfig.cardSizeFactor);
                const isLastRemaining = !isDisabled && remainingCount === 1;

                return (
                  <div
                    key={theme.id}
                    onClick={() => {
                      // Allow toggle on all themes
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
                    className={`rounded-xl shadow-lg flex flex-col items-center justify-center relative transition-all cursor-pointer ${
                      isDisabled
                        ? 'opacity-30 grayscale'
                        : isLastRemaining
                          ? 'ring-4 ring-green-400 scale-105'
                          : 'hover:scale-105'
                    }`}
                    style={{
                      backgroundColor: theme.color || '#3b82f6',
                      padding: `${Math.round(24 * gridConfig.cardSizeFactor)}px`,
                    }}
                  >
                    <h3
                      className="font-bold text-center leading-tight"
                      style={{
                        color: theme.textColor || '#ffffff',
                        fontSize: `${fontSize}px`,
                      }}
                    >
                      {theme.name}
                    </h3>
                    {/* Disabled indicator */}
                    {isDisabled && (
                      <div
                        className="absolute top-2 right-2 bg-red-500 rounded-full flex items-center justify-center shadow-lg"
                        style={{
                          width: `${Math.round(24 * gridConfig.cardSizeFactor)}px`,
                          height: `${Math.round(24 * gridConfig.cardSizeFactor)}px`,
                        }}
                      >
                        <span className="text-white font-bold" style={{ fontSize: `${Math.round(12 * gridConfig.cardSizeFactor)}px` }}>✕</span>
                      </div>
                    )}
                    {/* Last remaining indicator */}
                    {isLastRemaining && (
                      <div
                        className="absolute top-2 right-2 bg-green-500 rounded-full flex items-center justify-center shadow-lg"
                        style={{
                          width: `${Math.round(24 * gridConfig.cardSizeFactor)}px`,
                          height: `${Math.round(24 * gridConfig.cardSizeFactor)}px`,
                        }}
                      >
                        <span className="text-white font-bold" style={{ fontSize: `${Math.round(12 * gridConfig.cardSizeFactor)}px` }}>✓</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Screen 6: Place Your Bets - Wait for teams to bet */}
      {currentScreen === 'placeBets' && currentRound && (() => {
        // Get the selected theme (auto-selected when only one remains on selectSuperThemes screen)
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
          teamScores={teamScores}
          superGameAnswers={superGameAnswers}
          onSpacePressed={() => setCurrentScreen('superAnswers')}
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
          }}
          onSpacePressed={() => setCurrentScreen('showWinner')}
        />
      )}

      {/* Screen 8: Show Winner */}
      {currentScreen === 'showWinner' && (
        <ShowWinnerScreen
          teamScores={teamScores}
          onBroadcastMessage={onBroadcastMessage}
        />
      )}

      {/* Question Modal */}
      {activeQuestion && (
        <QuestionModal
          question={activeQuestion.question}
          theme={activeQuestion.theme}
          points={activeQuestion.points}
          showAnswer={showAnswer}
          buzzedTeamId={buzzedTeamId}
          teamScores={teamScores}
          onClose={closeQuestion}
          onScoreChange={handleScoreChange}
          scoreChangeType={scoreChangeType}
          readingTimePerLetter={currentRound?.readingTimePerLetter ?? 0.05}
          responseWindow={currentRound?.responseWindow ?? 30}
          handicapEnabled={currentRound?.handicapEnabled ?? false}
          handicapDelay={currentRound?.handicapDelay ?? 1}
          answeringTeamId={answeringTeamId}
        />
      )}
      </div>
    </>
  );
});

GamePlay.displayName = 'GamePlay';

// ============= SUB-COMPONENTS =============

interface GameBoardProps {
  round: Round;
  teamScores: TeamScore[];
  onQuestionClick: (question: Question, theme: Theme, points: number) => void;
  isQuestionAnswered: (questionId: string, themeId: string) => boolean;
  highlightedQuestion: string | null;
}

const GameBoard = memo(({ round, onQuestionClick, isQuestionAnswered, highlightedQuestion }: GameBoardProps) => {
  const themes = round.themes || [];
  const maxQuestions = Math.max(...themes.map(t => t.questions?.length || 0), 1);

  // Helper function to make color lighter (for question cards)
  const lightenColor = (hex: string, percent: number): string => {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;
    return '#' + (
      0x1000000 +
      (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
      (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
      (B < 255 ? (B < 1 ? 0 : B) : 255)
    ).toString(16).slice(1);
  };

  // Calculate actual grid dimensions
  const numThemes = Math.min(themes.length, 10);
  const numQuestions = maxQuestions;

  return (
    <div className="w-full h-full animate-in fade-in duration-500 p-1 cursor-default">
      {/* Themes column (1/8 width) + Questions grid (7/8 width) */}
      <div className="flex h-full gap-1">
        {/* Left column: Themes - 1/8 of screen width */}
        <div className="w-[12.5%] flex flex-col gap-1">
          {themes.map(theme => {
            const themeColor = theme.color || '#3b82f6';
            const themeTextColor = theme.textColor || '#ffffff';
            return (
              <div
                key={theme.id}
                className="flex-1 rounded-xl p-3 flex items-center justify-center shadow-lg cursor-default"
                style={{ backgroundColor: themeColor }}
              >
                <h3 className="font-bold text-center text-2xl leading-tight" style={{ color: themeTextColor }}>
                  {theme.name}
                </h3>
              </div>
            );
          })}
        </div>

        {/* Right area: Questions grid - dynamic rows/cols based on content */}
        <div
          className="flex-1"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${numQuestions}, 1fr)`,
            gridTemplateRows: `repeat(${numThemes}, 1fr)`,
            gap: '0.25rem',
          }}
        >
          {themes.map((theme, rowIdx) =>
            Array.from({ length: numQuestions }).map((_, colIdx) => {
              const question = theme?.questions?.[colIdx];
              const points = question?.points ?? (colIdx + 1) * 100;
              const isAnswered = question ? isQuestionAnswered(question.id, theme.id) : false;
              const themeColor = theme?.color || '#3b82f6';
              const themeTextColor = theme?.textColor || '#ffffff';
              const questionColor = theme ? lightenColor(themeColor, 20) : '#1f2937';
              const questionKey = question ? `${theme.id}-${question.id}` : null;
              const isHighlighted = highlightedQuestion === questionKey;

              return (
                <div key={`${rowIdx}-${colIdx}`}>
                  {question ? (
                    <button
                      onClick={() => !isAnswered && onQuestionClick(question, theme, points)}
                      disabled={isAnswered || isHighlighted}
                      className={`w-full h-full rounded-xl font-bold text-4xl transition-all shadow-lg ${
                        isAnswered
                          ? 'bg-gray-800/30 text-gray-700 cursor-not-allowed'
                          : isHighlighted
                            ? 'bg-yellow-500 text-white shadow-[0_0_30px_rgba(250,204,21,0.8)] scale-105 cursor-default'
                            : 'cursor-pointer'
                      }`}
                      style={
                        !isAnswered && !isHighlighted
                          ? { backgroundColor: questionColor, color: themeTextColor }
                          : undefined
                      }
                    >
                      {points}
                    </button>
                  ) : (
                    <div className="w-full h-full rounded-xl bg-gray-800/30 border border-dashed border-gray-700 cursor-default"></div>
                  )}
                </div>
              );
            })
          ).flat()}
        </div>
      </div>
    </div>
  );
});

GameBoard.displayName = 'GameBoard';

interface QuestionModalProps {
  question: Question;
  theme: Theme;
  points: number;
  showAnswer: boolean;
  buzzedTeamId: string | null;
  teamScores: TeamScore[];
  onClose: () => void;
  onScoreChange: (change: 'wrong' | 'correct') => void;
  scoreChangeType: 'wrong' | 'correct' | null;
  // Timer settings
  readingTimePerLetter: number;
  responseWindow: number;
  handicapEnabled: boolean;
  handicapDelay: number;
  answeringTeamId?: string | null;  // Team that gets to answer the question
}

const QuestionModal = memo(({
  question,
  theme,
  points,
  showAnswer,
  buzzedTeamId,
  teamScores,
  onClose: _onClose,
  onScoreChange,
  scoreChangeType,
  readingTimePerLetter,
  responseWindow,
  handicapEnabled,
  handicapDelay,
  answeringTeamId,
}: QuestionModalProps) => {
  const mediaUrl = question.media?.url;
  const mediaType = question.media?.type;

  const buzzedTeam = teamScores.find(t => t.teamId === buzzedTeamId);

  // Calculate reading time based on question text length (letters only, excluding spaces and punctuation)
  const questionTextLetters = (question.text || '').replace(/[^a-zA-Zа-яА-ЯёЁ]/g, '').length;
  const readingTime = readingTimePerLetter > 0 ? questionTextLetters * readingTimePerLetter : 0;

  // Find leading team for handicap
  const leadingTeamScore = teamScores.length > 0 ? Math.max(...teamScores.map(t => t.score)) : 0;
  teamScores.filter(t => t.score === leadingTeamScore); // Unused but kept for potential future use

  // Timer states
  const [readingTimerRemaining, setReadingTimerRemaining] = useState(readingTime);
  const [responseTimerRemaining, setResponseTimerRemaining] = useState(0);
  const [handicapTimerRemaining, setHandicapTimerRemaining] = useState(0);
  const [timerPhase, setTimerPhase] = useState<'reading' | 'response' | 'complete'>('reading');

  // Reset timers when question changes
  useEffect(() => {
    const newReadingTime = readingTimePerLetter > 0 ? questionTextLetters * readingTimePerLetter : 0;
    setReadingTimerRemaining(newReadingTime);
    setResponseTimerRemaining(responseWindow);
    setHandicapTimerRemaining(0);
    setTimerPhase(newReadingTime > 0 ? 'reading' : 'response');
  }, [question.id, readingTime, questionTextLetters, readingTimePerLetter, responseWindow]);

  // Single unified timer effect
  useEffect(() => {
    // Stop timer if answer shown
    if (showAnswer) {
      setTimerPhase('complete');
      setReadingTimerRemaining(0);
      setResponseTimerRemaining(0);
      setHandicapTimerRemaining(0);
      return;
    }

    // Don't run if complete
    if (timerPhase === 'complete') return;

    // Reading phase timer
    if (timerPhase === 'reading') {
      const interval = setInterval(() => {
        setReadingTimerRemaining((prev: number) => {
          if (prev <= 0.1) {
            // Reading time done, move to response phase
            setTimerPhase('response');
            return 0;
          }
          return prev - 0.1;
        });
      }, 100);
      return () => clearInterval(interval);
    }

    // Response window timer - only runs if responseWindow > 0
    if (timerPhase === 'response' && responseWindow > 0) {
      const interval = setInterval(() => {
        setResponseTimerRemaining((prev: number) => {
          if (prev <= 0.1) {
            setTimerPhase('complete');
            setHandicapTimerRemaining(0);
            return 0;
          }
          return prev - 0.1;
        });
        // Also decrease handicap timer
        setHandicapTimerRemaining((prev: number) => {
          if (prev <= 0.1) return 0;
          return prev - 0.1;
        });
      }, 100);
      return () => clearInterval(interval);
    }
  }, [timerPhase, readingTime, responseWindow, showAnswer, handicapEnabled, handicapDelay]);

  // Calculate progress for timer visualization - each timer fills the bar independently
  const timerProgress = (() => {
    if (timerPhase === 'reading') {
      // Reading Timer: from 0 to 100% based on readingTime
      if (readingTime > 0) {
        const elapsed = readingTime - readingTimerRemaining;
        return (elapsed / readingTime) * 100;
      }
      return 0;
    } else if (timerPhase === 'response') {
      // Response Timer: from 0 to 100% based on responseWindow
      if (responseWindow > 0) {
        const elapsed = responseWindow - responseTimerRemaining;
        return (elapsed / responseWindow) * 100;
      }
      return 100;
    }
    return 100;
  })();

  // Timer color based on phase
  const getTimerColor = () => {
    if (timerPhase === 'reading') return 'bg-yellow-500';
    if (timerPhase === 'response') return 'bg-green-500';
    return 'bg-gray-500';
  };

  // Modal positioned below player panel with margins
  const modalMaxHeight = 'calc(100vh - 140px)';
  const modalTop = '100px';

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '-') {
        onScoreChange('wrong');
      } else if (e.key === '=') {
        onScoreChange('correct');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onScoreChange]);

  // Calculate dynamic font sizes
  const currentQuestionText = showAnswer && question.answerText ? question.answerText : question.text;
  const questionFontSizeMobile = calculateQuestionFontSize(currentQuestionText, 3); // 3rem base for mobile
  const questionFontSizeDesktop = calculateQuestionFontSize(currentQuestionText, 5); // 5rem base for desktop

  // Calculate answer font sizes (independent of question font size)
  const answerFontSizes = question.answers?.map((answer) => ({
    mobile: calculateAnswerFontSizeMobile(answer),
    desktop: calculateAnswerFontSizeDesktop(answer)
  })) ?? [];

  return (
    <div className="fixed inset-0 z-[60] flex bg-black/80 backdrop-blur-sm animate-in fade-in duration-200 cursor-default" style={{ paddingTop: modalTop, paddingBottom: '20px' }}>
      <style>{`
        @media (min-width: 768px) {
          [data-qf="true"] { font-size: ${questionFontSizeDesktop}rem !important; }
          ${question.answers?.map((_, idx) => `[data-af-idx="${idx}"] { font-size: ${answerFontSizes[idx]?.desktop || 3.5}rem !important; }`).join(' ')}
          ${question.answers?.map((_, idx) => `[data-af-idx-noimg="${idx}"] { font-size: ${answerFontSizes[idx]?.desktop || 3.5}rem !important; }`).join(' ')}
        }
      `}</style>
      <div
        className="w-[90vw] mx-auto bg-gray-900 border-2 border-blue-500 rounded-2xl shadow-2xl flex flex-col overflow-hidden cursor-default"
        style={{ maxHeight: modalMaxHeight, minHeight: '48vh' }}
      >
        {/* Question Section (2/3) */}
        <div className="flex-1 flex flex-col border-b border-gray-700 min-h-0">
          {/* Header - Theme name, Points and Timer */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="text-xl font-bold text-white">{theme.name}</div>
              {timerPhase !== 'complete' && ((timerPhase === 'reading' && readingTime > 0) || (timerPhase === 'response' && responseWindow > 0)) && (
                <div className="text-xl font-bold text-white">
                  {timerPhase === 'reading' && (
                    <span className="text-yellow-300">{readingTimerRemaining.toFixed(1)}s</span>
                  )}
                  {timerPhase === 'response' && (
                    <span className="text-green-300">{responseTimerRemaining.toFixed(1)}s</span>
                  )}
                </div>
              )}
            </div>
            <div className="text-2xl font-black text-white">{points > 0 ? `+${points}` : points}</div>
          </div>

          {/* Timer bar - always visible but inactive when not timing */}
          <div className="bg-gray-700 w-full overflow-hidden" style={{ height: '16px' }}>
            {timerPhase !== 'complete' && ((timerPhase === 'reading' && readingTime > 0) || (timerPhase === 'response' && responseWindow > 0)) ? (
              <div
                className={`h-full transition-all duration-100 ease-linear ${getTimerColor()}`}
                style={{ width: `${timerProgress}%` }}
              />
            ) : null}
          </div>

          {/* Question content */}
          <div className="flex-1 flex items-center justify-center p-6 overflow-auto">
            <div className={`w-full h-full flex ${
              (showAnswer ? (question.answerMedia?.url) : mediaUrl) ? 'items-center justify-start' : 'items-center justify-center'
            }`}>
              {/* Media container on the left - 50% width when media exists */}
              {(showAnswer ? (question.answerMedia?.url) : mediaUrl) ? (
                <div className="w-1/2 h-full flex items-center justify-center p-4">
                  {showAnswer && question.answerMedia ? (
                    // Answer media
                    <>
                      {question.answerMedia.type === 'image' && (
                        <img
                          src={question.answerMedia.url}
                          alt="Answer media"
                          className="w-full h-auto object-contain rounded-lg shadow-xl"
                        />
                      )}
                      {question.answerMedia.type === 'video' && (
                        <video
                          src={question.answerMedia.url}
                          controls
                          className="w-full h-auto object-contain rounded-lg shadow-xl"
                        />
                      )}
                      {question.answerMedia.type === 'audio' && (
                        <div className="w-full flex items-center justify-center gap-4 bg-gray-800 rounded-lg p-4">
                          <Volume2 className="w-16 h-16 text-blue-400" />
                          <audio src={question.answerMedia.url} controls className="flex-1" />
                        </div>
                      )}
                    </>
                  ) : (
                    // Question media
                    <>
                      {mediaType === 'image' && (
                        <img
                          src={mediaUrl}
                          alt="Question media"
                          className="w-full h-auto object-contain rounded-lg shadow-xl"
                        />
                      )}
                      {mediaType === 'video' && (
                        <video
                          src={mediaUrl}
                          controls
                          className="w-full h-auto object-contain rounded-lg shadow-xl"
                        />
                      )}
                      {mediaType === 'audio' && (
                        <div className="w-full h-full flex items-center justify-center gap-4 bg-gray-800 rounded-lg">
                          <Volume2 className="w-16 h-16 text-blue-400" />
                          <audio src={mediaUrl} controls className="flex-1" />
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : null}

              {/* Right side: Question text container and answer options container */}
              {/* With image: 50% width each. Without image: 75% width total, centered */}
              {(showAnswer ? (question.answerMedia?.url) : mediaUrl) ? (
                <div className="w-1/2 h-full flex flex-col p-4">
                  {/* Question text container */}
                  <div className={`flex flex-col items-center justify-center p-4 ${
                    question.answers && question.answers.length > 0 ? 'flex-[19]' : 'flex-[39]'
                  }`}>
                    <h2
                      key={showAnswer ? 'answer' : 'question'}
                      className="font-bold text-white leading-[1.1] text-center"
                      style={{ fontSize: `${questionFontSizeMobile}rem` }}
                      data-qf="true"
                    >
                      {currentQuestionText}
                    </h2>
                  </div>

                  {/* Answer options container */}
                  {question.answers && question.answers.length > 0 && (
                    <div className="flex-[19] flex items-center justify-center p-4">
                      <div className="w-full h-full flex flex-wrap items-center justify-center gap-4">
                        {question.answers.map((answer, idx) => (
                          <div
                            key={idx}
                            style={{
                              width: '45%',
                              height: '45%',
                              fontSize: `${answerFontSizes[idx]?.mobile || 2}rem`
                            }}
                            className={`rounded-xl border-4 flex items-center justify-center text-center font-semibold ${
                              showAnswer && idx === question.correctAnswer
                                ? 'bg-green-500/30 border-green-500 text-green-300'
                                : 'bg-gray-800/50 border-gray-700 text-gray-400'
                            }`}
                            data-af-idx={idx}
                          >
                            {answer}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Without image: single centered container 75% width */
                <div className="w-3/4 h-full flex flex-col items-center justify-center p-4">
                  {/* Question text container */}
                  <div className={`w-full flex flex-col items-center justify-center p-4 ${
                    question.answers && question.answers.length > 0 ? 'flex-[19]' : 'flex-[39]'
                  }`}>
                    <h2
                      key={showAnswer ? 'answer' : 'question'}
                      className="font-bold text-white leading-[1.1] text-center"
                      style={{ fontSize: `${questionFontSizeMobile}rem` }}
                      data-qf="true"
                    >
                      {currentQuestionText}
                    </h2>
                  </div>

                  {/* Answer options container */}
                  {question.answers && question.answers.length > 0 && (
                    <div className="w-full flex-[19] flex items-center justify-center p-4">
                      <div className="w-full h-full flex flex-wrap items-center justify-center gap-4">
                        {question.answers.map((answer, idx) => (
                          <div
                            key={idx}
                            style={{
                              width: '45%',
                              height: '45%',
                              fontSize: `${answerFontSizes[idx]?.mobile || 2}rem`
                            }}
                            className={`rounded-xl border-4 flex items-center justify-center text-center font-semibold ${
                              showAnswer && idx === question.correctAnswer
                                ? 'bg-green-500/30 border-green-500 text-green-300'
                                : 'bg-gray-800/50 border-gray-700 text-gray-400'
                            }`}
                            data-af-idx-noimg={idx}
                          >
                            {answer}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Status bar - compact */}
        <div className="h-16 bg-gray-800/50 flex items-center justify-center px-6">
          {showAnswer && buzzedTeam && (scoreChangeType === 'correct' || scoreChangeType === 'wrong') ? (
            // Result message
            <div className="text-2xl font-bold">
              {scoreChangeType === 'correct' && (
                <span className="text-green-400">{buzzedTeam.teamName} gets {points} points!</span>
              )}
              {scoreChangeType === 'wrong' && (
                <span className="text-red-400">{buzzedTeam.teamName} loses {points} points!</span>
              )}
            </div>
          ) : buzzedTeam ? (
            // Team answering
            <div className="text-yellow-400 text-xl">{buzzedTeam.teamName} is answering...</div>
          ) : answeringTeamId ? (
            // Handicap phase - show who is answering
            <div className="text-yellow-400 font-bold text-2xl">
              Отвечает: {teamScores.find(t => t.teamId === answeringTeamId)?.teamName || 'Unknown'}
            </div>
          ) : (
            // Waiting for buzz
            <div className="text-gray-400 text-xl">Waiting for a player to buzz...</div>
          )}
        </div>
      </div>
    </div>
  );
});

QuestionModal.displayName = 'QuestionModal';

// ============= SUPER GAME QUESTION MODAL =============

interface SuperGameQuestionModalProps {
  round: Round;
  selectedSuperThemeId: string | null;
  teamScores: TeamScore[];
  superGameAnswers: SuperGameAnswer[];
  onSpacePressed: () => void;
}

const SuperGameQuestionModal = memo(({
  round,
  selectedSuperThemeId,
  teamScores,
  superGameAnswers,
  onSpacePressed,
}: SuperGameQuestionModalProps) => {
  // Get the selected theme
  const selectedTheme = round.themes?.find(t => t.id === selectedSuperThemeId);

  // Get the first question from the selected theme
  const question = selectedTheme?.questions?.[0];

  // Timer state for super game (60 seconds for answering)
  const RESPONSE_TIME = 60; // 60 seconds for teams to answer
  const [timerRemaining, setTimerRemaining] = useState(RESPONSE_TIME);
  const [timerActive, setTimerActive] = useState(false);

  // Start timer when component mounts
  useEffect(() => {
    setTimerActive(true);
    const interval = setInterval(() => {
      setTimerRemaining((prev: number) => {
        if (prev <= 0.1) {
          setTimerActive(false);
          return 0;
        }
        return prev - 0.1;
      });
    }, 100);

    return () => clearInterval(interval);
  }, []);

  // Handle Space key to advance
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        onSpacePressed();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onSpacePressed]);

  if (!selectedTheme || !question) {
    return (
      <div className="fixed top-24 left-0 right-0 bottom-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm">
        <div className="text-white text-2xl">No question available</div>
      </div>
    );
  }

  const mediaUrl = question.media?.url;
  const mediaType = question.media?.type;

  // Calculate dynamic font size
  const questionText = question.text || '';
  const questionFontSizeMobile = calculateQuestionFontSize(questionText, 3); // 3rem base for mobile
  const questionFontSizeDesktop = calculateQuestionFontSize(questionText, 5); // 5rem base for desktop

  // Calculate timer progress
  const timerProgress = ((RESPONSE_TIME - timerRemaining) / RESPONSE_TIME) * 100;

  // Modal positioned below player panel
  const modalMaxHeight = 'calc(100vh - 140px)';
  const modalTop = '100px';

  return (
    <div className="fixed inset-0 z-[60] flex bg-black/80 backdrop-blur-sm animate-in fade-in duration-200 cursor-default" style={{ paddingTop: modalTop, paddingBottom: '20px' }}>
      <style>{`
        @media (min-width: 768px) {
          [data-sg-qf="true"] { font-size: ${questionFontSizeDesktop}rem !important; }
        }
      `}</style>
      <div
        className="w-[90vw] mx-auto bg-gray-900 border-2 border-purple-500 rounded-2xl shadow-2xl flex flex-col overflow-hidden cursor-default"
        style={{ maxHeight: modalMaxHeight, minHeight: '48vh' }}
      >
        {/* Question Section */}
        <div className="flex-1 flex flex-col border-b border-gray-700 min-h-0">
          {/* Header - Theme name, Super Game label and Timer */}
          <div className="bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="text-xl font-bold text-white">{selectedTheme.name}</div>
              {timerActive && (
                <div className="text-xl font-bold text-white">
                  <span className="text-purple-200">{timerRemaining.toFixed(1)}s</span>
                </div>
              )}
            </div>
            <div className="text-2xl font-black text-white">SUPER GAME</div>
          </div>

          {/* Timer bar */}
          <div className="bg-gray-700 w-full overflow-hidden" style={{ height: '16px' }}>
            {timerActive ? (
              <div
                className="h-full transition-all duration-100 ease-linear bg-gradient-to-r from-purple-500 to-pink-500"
                style={{ width: `${timerProgress}%` }}
              />
            ) : null}
          </div>

          {/* Question content */}
          <div className="flex-1 flex items-center justify-center p-6 overflow-auto">
            <div className={`w-full h-full flex ${
              mediaUrl ? 'items-center justify-start' : 'items-center justify-center'
            }`}>
              {/* Media container on the left - 50% width when media exists */}
              {mediaUrl ? (
                <div className="w-1/2 h-full flex items-center justify-center p-4">
                  {mediaType === 'image' && (
                    <img
                      src={mediaUrl}
                      alt="Question media"
                      className="w-full h-auto object-contain rounded-lg shadow-xl"
                    />
                  )}
                  {mediaType === 'video' && (
                    <video
                      src={mediaUrl}
                      controls
                      className="w-full h-auto object-contain rounded-lg shadow-xl"
                    />
                  )}
                  {mediaType === 'audio' && (
                    <div className="w-full flex items-center justify-center gap-4 bg-gray-800 rounded-lg p-4">
                      <Volume2 className="w-16 h-16 text-purple-400" />
                      <audio src={mediaUrl} controls className="flex-1" />
                    </div>
                  )}
                </div>
              ) : null}

              {/* Question text */}
              {mediaUrl ? (
                <div className="w-1/2 h-full flex items-center justify-center p-4">
                  <h2
                    className="font-bold text-white leading-[1.1] text-center"
                    style={{ fontSize: `${questionFontSizeMobile}rem` }}
                    data-sg-qf="true"
                  >
                    {questionText}
                  </h2>
                </div>
              ) : (
                <div className="w-3/4 h-full flex items-center justify-center p-4">
                  <h2
                    className="font-bold text-white leading-[1.1] text-center"
                    style={{ fontSize: `${questionFontSizeMobile}rem` }}
                    data-sg-qf="true"
                  >
                    {questionText}
                  </h2>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Status bar - simple status message */}
        <div className="h-16 bg-gray-800/50 flex items-center justify-center px-6">
          <div className="text-center text-white text-lg">
            {superGameAnswers.length > 0 && superGameAnswers.length === teamScores.length ? (
              <span className="text-green-400 animate-pulse">All teams answered! Press Space to reveal answers</span>
            ) : (
              <span className="text-gray-400">Waiting for teams to answer... ({superGameAnswers.length}/{teamScores.length})</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

SuperGameQuestionModal.displayName = 'SuperGameQuestionModal';

// ============= SUPER GAME ANSWERS MODAL =============

interface SuperGameAnswersModalProps {
  round: Round;
  selectedSuperThemeId: string | null;
  teamScores: TeamScore[];
  superGameBets: SuperGameBet[];
  superGameAnswers: SuperGameAnswer[];
  selectedSuperAnswerTeam: string | null;
  onTeamSelect: (teamId: string) => void;
  onScoreChange: (teamId: string, correct: boolean) => void;
  onSpacePressed: () => void;
}

const SuperGameAnswersModal = memo(({
  round,
  selectedSuperThemeId,
  teamScores,
  superGameBets,
  superGameAnswers,
  selectedSuperAnswerTeam,
  onTeamSelect,
  onScoreChange,
  onSpacePressed,
}: SuperGameAnswersModalProps) => {
  // Get the selected theme and question
  const selectedTheme = round.themes?.find(t => t.id === selectedSuperThemeId);
  const question = selectedTheme?.questions?.[0];

  // Handle keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '=') {
        // Correct answer
        if (selectedSuperAnswerTeam) {
          onScoreChange(selectedSuperAnswerTeam, true);
        }
      } else if (e.key === '-') {
        // Wrong answer
        if (selectedSuperAnswerTeam) {
          onScoreChange(selectedSuperAnswerTeam, false);
        }
      } else if (e.key === ' ') {
        e.preventDefault();
        onSpacePressed();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedSuperAnswerTeam, onScoreChange, onSpacePressed]);

  if (!selectedTheme || !question) {
    return (
      <div className="fixed top-24 left-0 right-0 bottom-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm">
        <div className="text-white text-2xl">No question available</div>
      </div>
    );
  }

  const mediaUrl = question.media?.url;
  const mediaType = question.media?.type;

  // Calculate dynamic font size for question
  const questionText = question.text || '';
  const questionFontSize = calculateQuestionFontSize(questionText, 4);

  // Modal positioned below player panel (same as question modal)
  const modalMaxHeight = 'calc(100vh - 140px)';
  const modalTop = '100px';

  // Filter teams that had positive scores at the start (they remain visible even if score drops)
  // Use a ref to track initial teams when modal opens
  const initialPositiveTeamsRef = useRef<string[]>();
  if (!initialPositiveTeamsRef.current) {
    initialPositiveTeamsRef.current = teamScores.filter(t => t.score > 0).map(t => t.teamId);
  }
  const visibleTeamIds = initialPositiveTeamsRef.current;

  return (
    <div className="fixed inset-0 z-[60] flex bg-black/80 backdrop-blur-sm animate-in fade-in duration-200 cursor-default" style={{ paddingTop: modalTop, paddingBottom: '20px' }}>
      <style>{`
        @media (min-width: 768px) {
          [data-sg-af="true"] { font-size: ${questionFontSize}rem !important; }
        }
      `}</style>
      <div
        className="w-[90vw] mx-auto bg-gray-900 border-2 border-purple-500 rounded-2xl shadow-2xl flex flex-col overflow-hidden cursor-default"
        style={{ maxHeight: modalMaxHeight, minHeight: '48vh' }}
      >
        {/* Header - Theme name and Super Game label */}
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-6">
            <div className="text-xl font-bold text-white">{selectedTheme.name}</div>
          </div>
          <div className="text-2xl font-black text-white">SUPER GAME - ANSWERS</div>
        </div>

        {/* Top half - Question and Answer */}
        <div className="h-1/2 flex flex-col items-center justify-center p-6 border-b border-gray-700">
          {/* Question text centered */}
          <h2
            className="font-bold text-white leading-[1.1] text-center"
            data-sg-af="true"
          >
            {questionText}
          </h2>

          {/* Correct answer in green frame */}
          {question.answerText && (
            <div className="mt-6 p-4 bg-green-900/30 border-2 border-green-500 rounded-xl">
              <div className="font-bold text-white text-center" data-sg-af="true">
                {question.answerText}
              </div>
            </div>
          )}
        </div>

        {/* Bottom half - Team cards (teams that had positive scores at start) */}
        <div className="h-1/2 p-6 overflow-auto">
          <div className="grid grid-cols-3 gap-4">
            {teamScores.filter((team: TeamScore) => visibleTeamIds.includes(team.teamId)).map((team: TeamScore) => {
              const answer = superGameAnswers.find(a => a.teamId === team.teamId);
              const bet = superGameBets.find(b => b.teamId === team.teamId)?.bet || 0;
              const isSelected = selectedSuperAnswerTeam === team.teamId;
              const isRevealed = answer?.revealed;

              return (
                <div
                  key={team.teamId}
                  onClick={() => answer && onTeamSelect(team.teamId)}
                  className={`rounded-xl p-4 border-2 cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-yellow-500/20 border-yellow-500 shadow-[0_0_30px_rgba(234,179,8,0.5)]'
                      : isRevealed
                        ? 'bg-blue-500/20 border-blue-500'
                        : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'
                  }`}
                >
                  {/* Team name and score */}
                  <div className="flex justify-between items-center mb-3">
                    <div className="text-lg font-bold text-white">{team.teamName}</div>
                    <div className="text-xl font-bold text-white">
                      {team.score}
                    </div>
                  </div>

                  {/* Bet */}
                  <div className="text-sm text-gray-400 mb-3">Bet: {bet}</div>

                  {/* Answer section */}
                  {answer ? (
                    <div className="min-h-[80px]">
                      {isRevealed || isSelected ? (
                        <>
                          <div className="text-sm text-gray-400 mb-1">Answer:</div>
                          <div className="text-white font-medium p-2 bg-gray-900/50 rounded">
                            {answer.answer}
                          </div>

                          {/* Controls for selected team */}
                          {isSelected && (
                            <div className="mt-3 flex gap-2">
                              <button
                                onClick={(e: React.MouseEvent) => { e.stopPropagation(); onScoreChange(team.teamId, true); }}
                                className="flex-1 py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded"
                              >
                                + ({bet})
                              </button>
                              <button
                                onClick={(e: React.MouseEvent) => { e.stopPropagation(); onScoreChange(team.teamId, false); }}
                                className="flex-1 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded"
                              >
                                - ({bet})
                              </button>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-gray-500 italic">Click to reveal</div>
                      )}
                    </div>
                  ) : (
                    <div className="text-gray-500 italic">No answer</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
});

SuperGameAnswersModal.displayName = 'SuperGameAnswersModal';

// ============= SHOW WINNER SCREEN =============

interface ShowWinnerScreenProps {
  teamScores: TeamScore[];
  onBroadcastMessage?: (message: PeerMessage) => void;
}

const ShowWinnerScreen = memo(({
  teamScores,
  onBroadcastMessage,
}: ShowWinnerScreenProps) => {
  // Find winner(s) - team with highest score
  const maxScore = Math.max(...teamScores.map(t => t.score));
  const winners = teamScores.filter(t => t.score === maxScore);

  // Broadcast winner to mobile clients
  useEffect(() => {
    if (onBroadcastMessage && winners.length > 0) {
      onBroadcastMessage({
        type: 'SUPER_GAME_SHOW_WINNER',
        winnerTeamName: winners.length === 1
          ? winners[0].teamName
          : 'Tie: ' + winners.map(w => w.teamName).join(' & '),
        finalScores: teamScores.map(t => ({ teamId: t.teamId, teamName: t.teamName, score: t.score })),
      });
    }
  }, [onBroadcastMessage, winners, teamScores]);

  return (
    <div className="fixed top-24 left-0 right-0 bottom-0 z-[60] flex items-center justify-center bg-gradient-to-br from-yellow-600 via-orange-600 to-red-600 animate-in fade-in duration-500">
      <div className="text-center">
        {/* Winner title */}
        <h1 className="text-6xl font-black text-white mb-8 animate-bounce">
          WINNER!
        </h1>

        {/* Winner name(s) */}
        <div className="mb-12">
          {winners.length === 1 ? (
            <div className="text-8xl font-black text-white drop-shadow-2xl">
              {winners[0].teamName}
            </div>
          ) : (
            <div className="text-5xl font-bold text-white">
              {winners.map(w => (
                <div key={w.teamId} className="text-6xl mt-4">{w.teamName}</div>
              ))}
            </div>
          )}
        </div>

        {/* Final scores */}
        <div className="bg-black/30 backdrop-blur-sm rounded-2xl p-8 max-w-2xl">
          <h2 className="text-3xl font-bold text-white mb-6">Final Scores</h2>
          <div className="space-y-4">
            {/* Sort by score descending */}
            {[...teamScores].sort((a, b) => b.score - a.score).map((team, index) => {
              const isWinner = winners.some(w => w.teamId === team.teamId);
              return (
                <div
                  key={team.teamId}
                  className={`flex items-center justify-between p-4 rounded-xl ${
                    isWinner
                      ? 'bg-yellow-500/30 border-2 border-yellow-400'
                      : 'bg-white/10'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    {/* Position */}
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${
                      index === 0 ? 'bg-yellow-500 text-white' :
                      index === 1 ? 'bg-gray-400 text-white' :
                      index === 2 ? 'bg-orange-600 text-white' :
                      'bg-gray-600 text-white'
                    }`}>
                      {index + 1}
                    </div>
                    <div className="text-2xl font-bold text-white">{team.teamName}</div>
                  </div>
                  <div className="text-4xl font-black text-white">{team.score}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Trophy icon for winners */}
        {winners.length === 1 && (
          <div className="mt-8 text-9xl animate-pulse">🏆</div>
        )}
      </div>
    </div>
  );
});

ShowWinnerScreen.displayName = 'ShowWinnerScreen';
