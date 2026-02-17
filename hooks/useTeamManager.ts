/**
 * useTeamManager Hook
 * Unified team management (CRUD operations)
 * Extracted from multiple locations to eliminate duplication
 */

import { useCallback } from 'react';
import type { Team } from '../types';
import type { Dispatch, SetStateAction } from 'react';

interface UseTeamManagerOptions {
  teams: Team[];
  setTeams: Dispatch<SetStateAction<Team[]>>;
  setClients?: Dispatch<SetStateAction<Map<string, any>>>;
}

export const useTeamManager = ({
  teams,
  setTeams,
  setClients
}: UseTeamManagerOptions) => {

  const createTeam = useCallback((name: string) => {
    const newTeam: Team = {
      id: 'team_' + Math.random().toString(36).substring(2, 10),
      name,
      createdAt: Date.now(),
      lastUsedAt: Date.now()
    };
    setTeams(prev => [...prev, newTeam]);
    return newTeam;
  }, [setTeams]);

  const deleteTeam = useCallback((teamId: string) => {
    setTeams(prev => prev.filter(t => t.id !== teamId));

    // Remove team from all clients if setClients is provided
    if (setClients) {
      setClients((clientsPrev: Map<string, any>) => {
        const updated = new Map(clientsPrev);
        updated.forEach((client) => {
          if (client?.teamId === teamId) {
            client.teamId = undefined;
          }
        });
        return updated;
      });
    }
  }, [setTeams, setClients]);

  const renameTeam = useCallback((teamId: string, newName: string) => {
    setTeams(prev => prev.map(t => t.id === teamId ? { ...t, name: newName } : t));
  }, [setTeams]);

  const updateTeamScore = useCallback((teamId: string, score: number) => {
    setTeams(prev => prev.map(t => t.id === teamId ? { ...t, score } : t));
  }, [setTeams]);

  const getTeamById = useCallback((teamId: string): Team | undefined => {
    return teams.find(t => t.id === teamId);
  }, [teams]);

  const getTeamByName = useCallback((name: string): Team | undefined => {
    return teams.find(t => t.name === name);
  }, [teams]);

  return {
    createTeam,
    deleteTeam,
    renameTeam,
    updateTeamScore,
    getTeamById,
    getTeamByName,
  };
};
