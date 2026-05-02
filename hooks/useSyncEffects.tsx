/**
 * useSyncEffects Hook
 * Handles storage persistence for teams and commands in HostView
 */

import { useEffect } from 'react';
import { storage, STORAGE_KEYS } from './useLocalStorage';

export interface Team {
  id: string;
  name: string;
  createdAt?: number;
  lastUsedAt?: number;
  score?: number;
}

export interface Command {
  id: string;
  name: string;
}

interface UseSyncEffectsOptions {
  teams: Team[];
  commands: Command[];
  p2pHost?: any;
}

export const useSyncEffects = ({
  teams,
  commands,
  p2pHost,
}: UseSyncEffectsOptions) => {
  // Save teams to storage when changed
  useEffect(() => {
    storage.set(STORAGE_KEYS.TEAMS, JSON.stringify(teams));
  }, [teams]);

  // Save commands to storage when changed (for backward compatibility)
  useEffect(() => {
    storage.set(STORAGE_KEYS.COMMANDS, JSON.stringify(commands));
  }, [commands]);

  return {
    // No return values - this hook is for side effects only
  };
};
