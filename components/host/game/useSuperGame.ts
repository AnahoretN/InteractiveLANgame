/**
 * useSuperGame Hook
 * Manages super game state (bets, answers, theme selection)
 */

import { useState, useCallback } from 'react';
import type { SuperGameBet, SuperGameAnswer } from './types';

interface UseSuperGameProps {
  teams: Array<{ id: string; name: string; score: number }>;
}

export function useSuperGame({ teams }: UseSuperGameProps) {
  const [bets, setBets] = useState<SuperGameBet[]>([]);
  const [answers, setAnswers] = useState<SuperGameAnswer[]>([]);
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'placeBets' | 'showQuestion' | 'showWinner'>('idle');

  // Place bet
  const placeBet = useCallback((teamId: string, bet: number) => {
    setBets(prev => {
      const existing = prev.find(b => b.teamId === teamId);
      if (existing) {
        return prev.map(b => b.teamId === teamId ? { ...b, bet, ready: true } : b);
      }
      return [...prev, { teamId, bet, ready: true }];
    });
  }, []);

  // Submit answer
  const submitAnswer = useCallback((teamId: string, answer: string) => {
    setAnswers(prev => {
      const existing = prev.find(a => a.teamId === teamId);
      if (existing) {
        return prev.map(a => a.teamId === teamId ? { ...a, answer } : a);
      }
      return [...prev, { teamId, answer, revealed: false }];
    });
  }, []);

  // Reveal answer
  const revealAnswer = useCallback((teamId: string) => {
    setAnswers(prev => prev.map(a => {
      if (a.teamId === teamId) {
        return { ...a, revealed: true };
      }
      return a;
    }));
  }, []);

  // Reset super game
  const resetSuperGame = useCallback(() => {
    setBets([]);
    setAnswers([]);
    setSelectedThemeId(null);
    setPhase('idle');
  }, []);

  // Start place bets phase
  const startPlaceBets = useCallback(() => {
    setBets([]);
    setPhase('placeBets');
  }, []);

  // Start show question phase
  const startShowQuestion = useCallback(() => {
    setPhase('showQuestion');
  }, []);

  // Calculate max bet
  const maxBet = bets.length > 0 ? Math.max(...bets.map(b => b.bet)) : 0;

  // Check if all teams have answered
  const allAnswered = answers.length === teams.length && answers.every(a => a.revealed);

  // Determine winner
  const winner = phase === 'showWinner' ? (() => {
    // Find team with correct answer (simplified - first revealed)
    const correctAnswer = answers.find(a => a.revealed && a.answer.toLowerCase().includes('правильный'));
    return correctAnswer?.teamId || null;
  })() : null;

  return {
    bets,
    setBets,
    answers,
    setAnswers,
    selectedThemeId,
    setSelectedThemeId,
    phase,
    setPhase,
    placeBet,
    submitAnswer,
    revealAnswer,
    resetSuperGame,
    startPlaceBets,
    startShowQuestion,
    maxBet,
    allAnswered,
    winner,
  };
}
