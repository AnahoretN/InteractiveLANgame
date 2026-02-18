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
import { Team } from '../../types';
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
  lateBuzzTeamIds?: Set<string>;  // Teams that buzzed after answering team was set (yellow flash)
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
      console.log('[GamePlay] Broadcasting SUPER_GAME_STATE_SYNC placeBets');
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
        console.log('[GamePlay] Broadcasting SUPER_GAME_STATE_SYNC showQuestion');
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
      console.log('[GamePlay] State sync requested, rebroadcasting current state');
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
      // Reset answering team when answer is shown (after scoring)
      if (onAnsweringTeamChange) {
        onAnsweringTeamChange(null);
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
      // Reset answering team when answer is shown (after scoring)
      if (onAnsweringTeamChange) {
        onAnsweringTeamChange(null);
      }
    }
  }, [activeQuestion, buzzedTeamId, answeringTeamId, onBuzzerStateChange, onAnsweringTeamChange]);

  // Open question
  const openQuestion = useCallback((question: Question, theme: Theme, points: number) => {
    const key = `${theme.id}-${question.id}`;
    // Reset answering team when opening a new question
    if (onAnsweringTeamChange) {
      onAnsweringTeamChange(null);
    }
    // Highlight the question for 1 second, then open modal
    setHighlightedQuestion(key);
    setTimeout(() => {
      setHighlightedQuestion(null);
      setActiveQuestion({ question, theme, points, roundName: currentRound?.name });
      setShowAnswer(false);
      setBuzzerActive(false);
    }, 1000);
  }, [currentRound?.name, onAnsweringTeamChange]);

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
          // answeringTeamId takes priority (set by first buzz during response phase)
          const isAnsweringTeam = answeringTeamId === team.teamId;
          const isBuzzed = buzzedTeamIds?.has(team.teamId) || false;
          const isLateBuzz = lateBuzzTeamIds?.has(team.teamId) || false;
          // Check if team has placed bet in super game
          const hasPlacedBet = currentScreen === 'placeBets' && superGameBets.find(b => b.teamId === team.teamId)?.ready;
          // Check if team has submitted answer in super game (during question phase)
          const hasSubmittedAnswer = currentScreen === 'superQuestion' && superGameAnswers.find(a => a.teamId === team.teamId)?.answer;

          return (
            <div
              key={team.teamId}
              className={`px-6 py-2 rounded-lg border-2 transition-all ${
                hasPlacedBet || hasSubmittedAnswer
                  ? 'bg-green-500/30 border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.5)] scale-105'
                  : isAnsweringTeam
                    ? 'bg-green-500/40 border-green-400 shadow-[0_0_20px_rgba(74,222,128,0.6)] scale-105'
                    : isLateBuzz
                      ? 'bg-yellow-500/30 border-yellow-400 shadow-[0_0_30px_rgba(250,204,21,0.8)] scale-105 animate-double-flash'
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
            // Update superGameAnswers with isCorrect/isWrong flags
            setSuperGameAnswers(prev => prev.map(a => {
              if (a.teamId === teamId) {
                return { ...a, isCorrect: correct, isWrong: !correct };
              }
              return a;
            }));
          }}
          onSpacePressed={() => setCurrentScreen('showWinner')}
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
          scoreChangeType={scoreChangeType}
          readingTimePerLetter={currentRound?.readingTimePerLetter ?? 0.05}
          responseWindow={currentRound?.responseWindow ?? 30}
          handicapEnabled={currentRound?.handicapEnabled ?? false}
          handicapDelay={currentRound?.handicapDelay ?? 1}
          answeringTeamId={answeringTeamId}
          roundName={activeQuestion.roundName}
        />
      )}
      </div>
    </>
  );
});

GamePlay.displayName = 'GamePlay';
