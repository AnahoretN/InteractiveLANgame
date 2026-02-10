/**
 * Custom hook for managing teams
 * Handles team CRUD operations and persistence
 */

import { useState, useCallback, useEffect } from 'react';
import { Team } from '../types';
import { STORAGE_KEYS } from './useLocalStorage';

export const useTeams = () => {
  const [teams, setTeams] = useState<Team[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.TEAMS);
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      // Migrate old teams without lastUsedAt
      return parsed.map((t: Team) => ({ ...t, lastUsedAt: t.lastUsedAt || t.createdAt }));
    } catch {
      return [];
    }
  });

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.TEAMS, JSON.stringify(teams));
  }, [teams]);

  const createTeam = useCallback((teamId: string, teamName: string) => {
    const newTeam: Team = {
      id: teamId,
      name: teamName,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    };
    setTeams(prev => [...prev, newTeam]);
    return newTeam;
  }, []);

  const deleteTeam = useCallback((teamId: string) => {
    setTeams(prev => prev.filter(t => t.id !== teamId));
  }, []);

  const renameTeam = useCallback((teamId: string, newName: string) => {
    setTeams(prev => prev.map(t => t.id === teamId ? { ...t, name: newName } : t));
  }, []);

  const updateTeamLastUsed = useCallback((teamId: string) => {
    setTeams(prev => prev.map(t => t.id === teamId ? { ...t, lastUsedAt: Date.now() } : t));
  }, []);

  const getTeamById = useCallback((teamId: string) => {
    return teams.find(t => t.id === teamId);
  }, [teams]);

  const getTeamName = useCallback((teamId: string | undefined) => {
    if (!teamId) return undefined;
    return teams.find(t => t.id === teamId)?.name;
  }, [teams]);

  // Auto-cleanup teams not used in a while (called periodically)
  const cleanupOldTeams = useCallback((maxAge: number = 24 * 60 * 60 * 1000) => { // 24 hours default
    const now = Date.now();
    setTeams(prev => prev.filter(t => now - t.lastUsedAt < maxAge));
  }, []);

  return {
    teams,
    setTeams,
    createTeam,
    deleteTeam,
    renameTeam,
    updateTeamLastUsed,
    getTeamById,
    getTeamName,
    cleanupOldTeams,
  };
};
