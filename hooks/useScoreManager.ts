/**
 * useScoreManager Hook
 *
 * Manages team scores and score changes
 * Extracted from GamePlay.tsx to reduce component complexity
 */

import { useState, useEffect, useCallback } from 'react';
import type { Team } from '../types';

export interface TeamScore {
  teamId: string;
  teamName: string;
  score: number;
}

export interface ScoreChangeOptions {
  points: number;
  targetTeamId: string | null;
  changeType: 'wrong' | 'correct';
  onScoreChangeComplete?: (newScores: TeamScore[]) => void;
}

export interface UseScoreManagerReturn {
  teamScores: TeamScore[];
  scoreChangeType: 'wrong' | 'correct' | null;
  updateTeamScores: (teams: Team[]) => void;
  handleScoreChange: (options: ScoreChangeOptions) => void;
  resetScoreChangeType: () => void;
  addPoints: (teamId: string, points: number) => void;
  deductPoints: (teamId: string, points: number) => void;
  getTeamScore: (teamId: string) => number;
  getMaxScore: () => number;
}

export function useScoreManager(initialTeams: Team[]): UseScoreManagerReturn {
  const [teamScores, setTeamScores] = useState<TeamScore[]>(
    initialTeams.map(t => ({ teamId: t.id, teamName: t.name, score: 0 }))
  );
  const [scoreChangeType, setScoreChangeType] = useState<'wrong' | 'correct' | null>(null);

  // Sync teamScores with teams prop
  const updateTeamScores = useCallback((teams: Team[]) => {
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
  }, []);

  const handleScoreChange = useCallback(({ points, targetTeamId, changeType, onScoreChangeComplete }: ScoreChangeOptions) => {
    if (!targetTeamId) return;

    setTeamScores(prev => {
      const newScores = prev.map(team => {
        if (team.teamId === targetTeamId) {
          const newScore = changeType === 'correct'
            ? team.score + points
            : team.score - points;
          return { ...team, score: newScore };
        }
        return team;
      });

      setScoreChangeType(changeType);
      onScoreChangeComplete?.(newScores);
      return newScores;
    });
  }, []);

  const resetScoreChangeType = useCallback(() => {
    setScoreChangeType(null);
  }, []);

  const addPoints = useCallback((teamId: string, points: number) => {
    setTeamScores(prev => prev.map(team =>
      team.teamId === teamId
        ? { ...team, score: team.score + points }
        : team
    ));
  }, []);

  const deductPoints = useCallback((teamId: string, points: number) => {
    setTeamScores(prev => prev.map(team =>
      team.teamId === teamId
        ? { ...team, score: team.score - points }
        : team
    ));
  }, []);

  const getTeamScore = useCallback((teamId: string): number => {
    return teamScores.find(t => t.teamId === teamId)?.score ?? 0;
  }, [teamScores]);

  const getMaxScore = useCallback((): number => {
    return Math.max(...teamScores.map(t => t.score), 0);
  }, [teamScores]);

  return {
    teamScores,
    scoreChangeType,
    updateTeamScores,
    handleScoreChange,
    resetScoreChangeType,
    addPoints,
    deductPoints,
    getTeamScore,
    getMaxScore
  };
}
