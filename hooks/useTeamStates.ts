/**
 * useTeamStates Hook
 *
 * Manages team states for wrong answers, active teams, and clashing teams
 * Extracted from GamePlay.tsx to reduce component complexity
 */

import { useState, useRef, useCallback, useEffect } from 'react';

export interface UseTeamStatesOptions {
  onUpdateActiveTeamIds?: (teamIds: Set<string>) => void;
}

export interface UseTeamStatesReturn {
  wrongAnswerTeams: Set<string>;
  activeTeamIds: Set<string>;
  attemptedTeamIds: Set<string>;
  markTeamWrong: (teamId: string) => void;
  removeTeamWrong: (teamId: string) => void;
  clearWrongAnswers: () => void;
  setActiveTeamIds: (teamIds: Set<string>) => void;
  updateActiveTeamIds: (teamIds: Set<string>) => void;
  markTeamAttempted: (teamId: string) => void;
  clearAttemptedTeams: () => void;
  getWrongAnswerCount: () => number;
  hasTeamWrongAnswer: (teamId: string) => boolean;
  hasTeamAttempted: (teamId: string) => boolean;
  resetAllStates: () => void;
}

// Helper function to compare Sets by content
function areSetsEqual(setA: Set<string>, setB: Set<string>): boolean {
  if (setA.size !== setB.size) return false;
  for (const item of setA) {
    if (!setB.has(item)) return false;
  }
  return true;
}

export function useTeamStates({
  onUpdateActiveTeamIds
}: UseTeamStatesOptions = {}): UseTeamStatesReturn {
  const [wrongAnswerTeams, setWrongAnswerTeams] = useState<Set<string>>(new Set());
  const [activeTeamIds, setActiveTeamIdsState] = useState<Set<string>>(new Set());
  const [attemptedTeamIds, setAttemptedTeamIds] = useState<Set<string>>(new Set());

  // Refs to track previous Set values for change detection
  const prevWrongAnswerTeamsRef = useRef<Set<string>>(new Set());
  const prevActiveTeamIdsRef = useRef<Set<string>>(new Set());

  const onUpdateActiveTeamIdsRef = useRef(onUpdateActiveTeamIds);
  onUpdateActiveTeamIdsRef.current = onUpdateActiveTeamIds;

  const markTeamWrong = useCallback((teamId: string) => {
    setWrongAnswerTeams(prev => new Set(prev).add(teamId));
  }, []);

  const removeTeamWrong = useCallback((teamId: string) => {
    setWrongAnswerTeams(prev => {
      const newSet = new Set(prev);
      newSet.delete(teamId);
      return newSet;
    });
  }, []);

  const clearWrongAnswers = useCallback(() => {
    setWrongAnswerTeams(new Set());
  }, []);

  const setActiveTeamIds = useCallback((teamIds: Set<string>) => {
    setActiveTeamIdsState(teamIds);
  }, []);

  const updateActiveTeamIds = useCallback((teamIds: Set<string>) => {
    setActiveTeamIdsState(teamIds);
    if (onUpdateActiveTeamIdsRef.current) {
      onUpdateActiveTeamIdsRef.current(teamIds);
    }
  }, []);

  const markTeamAttempted = useCallback((teamId: string) => {
    setAttemptedTeamIds(prev => new Set(prev).add(teamId));
  }, []);

  const clearAttemptedTeams = useCallback(() => {
    setAttemptedTeamIds(new Set());
  }, []);

  const getWrongAnswerCount = useCallback(() => {
    return wrongAnswerTeams.size;
  }, [wrongAnswerTeams]);

  const hasTeamWrongAnswer = useCallback((teamId: string) => {
    return wrongAnswerTeams.has(teamId);
  }, [wrongAnswerTeams]);

  const hasTeamAttempted = useCallback((teamId: string) => {
    return attemptedTeamIds.has(teamId);
  }, [attemptedTeamIds]);

  const resetAllStates = useCallback(() => {
    setWrongAnswerTeams(new Set());
    setAttemptedTeamIds(new Set());
    setActiveTeamIdsState(new Set());
    if (onUpdateActiveTeamIdsRef.current) {
      onUpdateActiveTeamIdsRef.current(new Set());
    }
  }, []);

  // Track changes and trigger callbacks
  useEffect(() => {
    const wrongChanged = !areSetsEqual(prevWrongAnswerTeamsRef.current, wrongAnswerTeams);
    const activeChanged = !areSetsEqual(prevActiveTeamIdsRef.current, activeTeamIds);

    if (wrongChanged || activeChanged) {
      prevWrongAnswerTeamsRef.current = new Set(wrongAnswerTeams);
      prevActiveTeamIdsRef.current = new Set(activeTeamIds);
    }
  }, [wrongAnswerTeams, activeTeamIds]);

  return {
    wrongAnswerTeams,
    activeTeamIds,
    attemptedTeamIds,
    markTeamWrong,
    removeTeamWrong,
    clearWrongAnswers,
    setActiveTeamIds,
    updateActiveTeamIds,
    markTeamAttempted,
    clearAttemptedTeams,
    getWrongAnswerCount,
    hasTeamWrongAnswer,
    hasTeamAttempted,
    resetAllStates
  };
}
