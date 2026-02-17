/**
 * Game state management hook
 * Manages the complex state for game play including screens, questions, and scoring
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { GamePack } from '../GameSelectorModal';
import type { Round, Theme, Question } from '../PackEditor';
import type { GameScreen, SuperGameBet, SuperGameAnswer, BuzzerState } from './types';

interface UseGameStateProps {
  pack: GamePack;
  buzzedTeamId: string | null;
  buzzedTeamIds?: Set<string>;
  answeringTeamId?: string | null;
  onBuzzerStateChange: (state: BuzzerState) => void;
  onSuperGamePhaseChange?: (phase: 'idle' | 'placeBets' | 'showQuestion' | 'showWinner') => void;
  onSuperGameMaxBetChange?: (maxBet: number) => void;
  superGameBets?: SuperGameBet[];
  superGameAnswers?: SuperGameAnswer[];
}

export function useGameState({
  pack,
  buzzedTeamId,
  buzzedTeamIds,
  answeringTeamId,
  onBuzzerStateChange,
  onSuperGamePhaseChange,
  onSuperGameMaxBetChange,
  superGameBets,
  superGameAnswers
}: UseGameStateProps) {
  // Game screen state
  const [currentScreen, setCurrentScreen] = useState<GameScreen>('cover');
  const previousScreenRef = useRef<GameScreen>('cover');

  // Round and question selection
  const [currentRoundIndex, setCurrentRoundIndex] = useState(0);
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);
  const [selectedSuperThemeId, setSelectedSuperThemeId] = useState<string | null>(null);

  // Super Game state
  const [disabledSuperThemeIds, setDisabledSuperThemeIds] = useState<Set<string>>(new Set());

  // Question modal state
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [teamScores, setTeamScores] = useState<Map<string, number>>(new Map());

  // Refs for timer and cleanup
  const readingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const responseTimerRef = useRef<NodeJS.Timeout | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Get current round
  const currentRound = pack.rounds?.[currentRoundIndex];

  // Reset super game state when entering selectSuperThemes screen
  useEffect(() => {
    if (currentScreen === 'selectSuperThemes') {
      setDisabledSuperThemeIds(new Set());
      setSelectedSuperThemeId(null);
    }
  }, [currentScreen]);

  // Update parent with super game phase
  useEffect(() => {
    if (!onSuperGamePhaseChange || !currentRound) return;

    if (currentScreen === 'selectSuperThemes') {
      onSuperGamePhaseChange('idle');
    } else if (currentScreen === 'placeBets') {
      onSuperGamePhaseChange('placeBets');
      // Calculate and broadcast max bet
      if (superGameBets && superGameBets.length > 0) {
        const maxBet = Math.max(...superGameBets.map(b => b.bet));
        onSuperGameMaxBetChange?.(maxBet);
      }
    } else if (currentScreen === 'superQuestion') {
      onSuperGamePhaseChange('showQuestion');
    } else if (currentScreen === 'superAnswers') {
      onSuperGamePhaseChange('showQuestion');
    } else if (currentScreen === 'showWinner') {
      onSuperGamePhaseChange('showWinner');
    } else {
      onSuperGamePhaseChange('idle');
    }
  }, [currentScreen, currentRound, onSuperGamePhaseChange, superGameBets, onSuperGameMaxBetChange]);

  // Navigation functions
  const goToNextScreen = useCallback((screen?: GameScreen) => {
    const screenOrder: GameScreen[] = ['cover', 'themes', 'round', 'board'];
    const currentIndex = screenOrder.indexOf(currentScreen);

    if (screen) {
      setCurrentScreen(screen);
    } else if (currentIndex < screenOrder.length - 1) {
      setCurrentScreen(screenOrder[currentIndex + 1]);
    }
  }, [currentScreen]);

  const goToPrevScreen = useCallback(() => {
    const screenOrder: GameScreen[] = ['cover', 'themes', 'round', 'board'];
    const currentIndex = screenOrder.indexOf(currentScreen);

    if (currentIndex > 0) {
      setCurrentScreen(screenOrder[currentIndex - 1]);
    }
  }, [currentScreen]);

  const selectQuestion = useCallback((question: Question, themeId: string) => {
    setSelectedQuestion(question);
    setSelectedThemeId(themeId);
    setShowQuestionModal(true);
    setShowAnswer(false);
  }, []);

  const closeQuestionModal = useCallback(() => {
    setShowQuestionModal(false);
    setSelectedQuestion(null);
    setSelectedThemeId(null);
    setShowAnswer(false);

    // Clear any running timers
    if (readingTimerRef.current) {
      clearTimeout(readingTimerRef.current);
      readingTimerRef.current = null;
    }
    if (responseTimerRef.current) {
      clearTimeout(responseTimerRef.current);
      responseTimerRef.current = null;
    }
  }, []);

  const revealAnswer = useCallback(() => {
    setShowAnswer(true);
  }, []);

  // Scoring functions
  const awardPoints = useCallback((teamId: string, points: number) => {
    setTeamScores(prev => {
      const newScores = new Map<string, number>(prev);
      const currentScore = newScores.get(teamId) ?? 0;
      newScores.set(teamId, currentScore + points);
      return newScores;
    });
  }, []);

  const deductPoints = useCallback((teamId: string, points: number) => {
    setTeamScores(prev => {
      const newScores = new Map<string, number>(prev);
      const currentScore = newScores.get(teamId) ?? 0;
      newScores.set(teamId, currentScore - points);
      return newScores;
    });
  }, []);

  // Cleanup function
  useEffect(() => {
    return () => {
      if (readingTimerRef.current) {
        clearTimeout(readingTimerRef.current);
      }
      if (responseTimerRef.current) {
        clearTimeout(responseTimerRef.current);
      }
      if (cleanupRef.current) {
        cleanupRef.current();
      }
    };
  }, []);

  return {
    // Screen state
    currentScreen,
    previousScreen: previousScreenRef.current,
    setCurrentScreen,
    goToNextScreen,
    goToPrevScreen,

    // Round state
    currentRoundIndex,
    setCurrentRoundIndex,
    currentRound,

    // Question state
    selectedQuestion,
    selectedThemeId,
    selectedSuperThemeId,
    setSelectedSuperThemeId,
    disabledSuperThemeIds,
    setDisabledSuperThemeIds,
    showQuestionModal,
    showAnswer,
    selectQuestion,
    closeQuestionModal,
    revealAnswer,

    // Scoring
    teamScores,
    awardPoints,
    deductPoints,
    setTeamScores,

    // Timer refs
    readingTimerRef,
    responseTimerRef,
    cleanupRef,
  };
}
