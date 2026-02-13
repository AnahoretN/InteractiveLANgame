/**
 * useGamePlayState Hook
 * Manages game state for the main GamePlay component
 * Handles screen transitions, buzzer state, scoring, and super game logic
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { GamePack } from '../components/host/GameSelectorModal';
import type { Round, Theme, Question } from '../components/host/packeditor/types';
import type { Team } from '../types';
import type { GameScreen, SuperGameBet, SuperGameAnswer, BuzzerState } from '../components/host/game';

export interface UseGamePlayStateProps {
  pack: GamePack;
  teams: Team[];
  onBuzzerStateChange: (state: BuzzerState) => void;
  onBuzzTriggered: (teamId: string | null) => void;
  onClearBuzzes?: () => void;
  buzzedTeamId: string | null;
  buzzedTeamIds?: Set<string>;
  answeringTeamId?: string | null;
  onAnsweringTeamChange?: (teamId: string | null) => void;
  onBroadcastMessage?: (message: unknown) => void;
  superGameBets?: SuperGameBet[];
  superGameAnswers?: SuperGameAnswer[];
  onSuperGamePhaseChange?: (phase: 'idle' | 'placeBets' | 'showQuestion' | 'showWinner') => void;
  onSuperGameMaxBetChange?: (maxBet: number) => void;
}

export interface TeamScore {
  teamId: string;
  teamName: string;
  score: number;
}

export function useGamePlayState({
  pack,
  teams,
  onBuzzerStateChange,
  onBuzzTriggered,
  onClearBuzzes,
  buzzedTeamId: externalBuzzedTeamId,
  buzzedTeamIds: externalBuzzedTeamIds,
  answeringTeamId: externalAnsweringTeamId,
  onAnsweringTeamChange,
  onBroadcastMessage,
  superGameBets: externalSuperGameBets,
  superGameAnswers: externalSuperGameAnswers,
  onSuperGamePhaseChange,
  onSuperGameMaxBetChange,
}: UseGamePlayStateProps) {
  // Screen state
  const [currentScreen, setCurrentScreen] = useState<GameScreen>('cover');
  const previousScreenRef = useRef<GameScreen>('cover');
  const [currentRoundIndex, setCurrentRoundIndex] = useState(0);

  // Team scores
  const [teamScores, setTeamScores] = useState<TeamScore[]>(
    teams.map(t => ({ teamId: t.id, teamName: t.name, score: 0 }))
  );

  // Buzzed/answering state
  const [buzzedTeamId, setBuzzedTeamId] = useState<string | null>(externalBuzzedTeamId || null);
  const [buzzedTeamIds, setBuzzedTeamIds] = useState<Set<string>>(externalBuzzedTeamIds || new Set());
  const [answeringTeamId, setAnsweringTeamId] = useState<string | null>(externalAnsweringTeamId || null);

  // Super Game state
  const [selectedSuperThemeId, setSelectedSuperThemeId] = useState<string | null>(null);
  const [disabledSuperThemeIds, setDisabledSuperThemeIds] = useState<Set<string>>(new Set());
  const [superGameBets, setSuperGameBets] = useState<SuperGameBet[]>(externalSuperGameBets || []);
  const [superGameAnswers, setSuperGameAnswers] = useState<SuperGameAnswer[]>(externalSuperGameAnswers || []);
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

  // Sync external bets
  useEffect(() => {
    if (externalSuperGameBets) {
      setSuperGameBets(externalSuperGameBets);
    }
  }, [externalSuperGameBets]);

  // Sync external answers
  useEffect(() => {
    if (externalSuperGameAnswers) {
      setSuperGameAnswers(externalSuperGameAnswers);
    }
  }, [externalSuperGameAnswers]);

  // Sync team scores with teams prop
  useEffect(() => {
    setTeamScores(prev => {
      const existingIds = new Set(prev.map(t => t.teamId));
      const newTeams = teams
        .filter(t => !existingIds.has(t.id))
        .map(t => ({ teamId: t.id, teamName: t.name, score: 0 }));
      const combined = [...prev];
      for (const newTeam of newTeams) {
        combined.push(newTeam);
      }
      for (const team of combined) {
        const teamInfo = teams.find(t => t.id === team.teamId);
        if (teamInfo) {
          team.teamName = teamInfo.name;
        }
      }
      return combined;
    });
  }, [teams]);

  // Broadcast updated maxBet during super game
  useEffect(() => {
    if (currentScreen === 'placeBets') {
      const maxScore = Math.max(...teamScores.map(t => t.score), 0);
      const maxBet = maxScore > 0 ? maxScore : 100;
      onSuperGameMaxBetChange?.(maxBet);
      onBroadcastMessage?.({
        type: 'SUPER_GAME_STATE_SYNC',
        phase: 'placeBets',
        maxBet: maxBet,
      });
    }
  }, [teamScores, currentScreen, onSuperGameMaxBetChange, onBroadcastMessage]);

  // Clear super game state when transitioning away
  useEffect(() => {
    const prevScreen = previousScreenRef.current;
    const superGameScreens: GameScreen[] = ['placeBets', 'superQuestion', 'superAnswers', 'showWinner'];
    const wasInSuperGame = superGameScreens.includes(prevScreen);
    const isInSuperGame = superGameScreens.includes(currentScreen);

    if (wasInSuperGame) {
      const validSuperGameTransitions: Record<string, string[]> = {
        'placeBets': ['superQuestion'],
        'superQuestion': ['superAnswers'],
        'superAnswers': ['showWinner'],
        'showWinner': [],
      };
      const allowedTargets = validSuperGameTransitions[prevScreen] || [];
      const isValidTransition = allowedTargets.includes(currentScreen);

      if (!isInSuperGame || !isValidTransition) {
        if (onBroadcastMessage) {
          onBroadcastMessage({ type: 'SUPER_GAME_CLEAR' });
        }
      }
    }
    previousScreenRef.current = currentScreen;
  }, [currentScreen, onBroadcastMessage]);

  // Handle answer result
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
    onAnsweringTeamChange?.(buzzedTeamId);
    onBuzzerStateChange({
      active: false,
      timerPhase: 'inactive',
      readingTimerRemaining: 0,
      responseTimerRemaining: 0,
      handicapActive: false,
    });
  }, [buzzedTeamId, activeQuestion, onAnsweringTeamChange, onBuzzerStateChange]);

  // Handle space for correct answer
  const handleSpacePressed = useCallback(() => {
    if (!buzzedTeamId) return;
    handleAnswerResult(true);
  }, [buzzedTeamId, handleAnswerResult]);

  // Handle control for wrong answer
  const handleControlPressed = useCallback(() => {
    if (!buzzedTeamId) return;
    handleAnswerResult(false);
  }, [buzzedTeamId, handleAnswerResult]);

  // Transition to next screen after answer
  useEffect(() => {
    if (showAnswer) {
      const timer = setTimeout(() => {
        setShowAnswer(false);
        setAnsweringTeamId(null);
        setBuzzedTeamId(null);
        setActiveQuestion(null);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [showAnswer]);

  // Handle buzz from client
  const handleBuzz = useCallback((teamId: string) => {
    setBuzzedTeamId(teamId);
    setBuzzedTeamIds(prev => new Set([...prev, teamId]));
    setAnsweringTeamId(teamId);
    onBuzzTriggered?.(teamId);
  }, [onBuzzTriggered]);

  // Handle clear buzzes
  const handleClearBuzzes = useCallback(() => {
    setBuzzedTeamId(null);
    setBuzzedTeamIds(new Set());
    setAnsweringTeamId(null);
    onClearBuzzes?.();
  }, [onClearBuzzes]);

  // Screen transitions
  const transitionTo = useCallback((screen: GameScreen) => {
    setCurrentScreen(screen);
  }, []);

  // Back to lobby
  const handleBackToLobby = useCallback(() => {
    // Reset state
    setBuzzedTeamId(null);
    setBuzzedTeamIds(new Set());
    setAnsweringTeamId(null);
    setActiveQuestion(null);
    setCurrentScreen('cover');
  }, []);

  // Get current round
  const getCurrentRound = useCallback((): Round | undefined => {
    return pack.rounds?.[currentRoundIndex];
  }, [pack.rounds, currentRoundIndex]);

  return {
    // Screen state
    currentScreen,
    setCurrentScreen,
    currentRoundIndex,
    setCurrentRoundIndex,
    getCurrentRound,

    // Team state
    teamScores,
    setTeamScores,

    // Buzzer state
    buzzedTeamId,
    setBuzzedTeamId,
    buzzedTeamIds,
    setBuzzedTeamIds,
    answeringTeamId,
    setAnsweringTeamId,

    // Question state
    activeQuestion,
    setActiveQuestion,
    highlightedQuestion,
    setHighlightedQuestion,
    showAnswer,
    setShowAnswer,

    // Super game state
    selectedSuperThemeId,
    setSelectedSuperThemeId,
    disabledSuperThemeIds,
    setDisabledSuperThemeIds,
    superGameBets,
    setSuperGameBets,
    superGameAnswers,
    setSuperGameAnswers,
    selectedSuperAnswerTeam,
    setSelectedSuperAnswerTeam,

    // Actions
    handleAnswerResult,
    handleSpacePressed,
    handleControlPressed,
    handleBuzz,
    handleClearBuzzes,
    transitionTo,
    handleBackToLobby,
  };
}
