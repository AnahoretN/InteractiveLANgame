/**
 * useSyncEffects Hook
 * Handles sync effects for teams in HostView
 * Teams are broadcast to all clients as commands list
 */

import { useEffect } from 'react';
import { storage, STORAGE_KEYS } from './useLocalStorage';

interface UseSyncEffectsOptions {
  teams: any[];
  commands: any[];
  p2pHost?: {
    isReady: boolean;
    broadcast: (data: any) => void;
  };
}

export const useSyncEffects = ({
  teams,
  commands,
  p2pHost,
}: UseSyncEffectsOptions) => {

  // Broadcast teams list to all clients when teams change
  // Send as COMMANDS_LIST for compatibility with clients
  useEffect(() => {
    if (p2pHost?.isReady) {
      const commandsSync = {
        category: 'SYNC',
        type: 'COMMANDS_LIST',
        payload: {
          commands: teams.map((t: any) => ({ id: t.id, name: t.name }))
        }
      };
      p2pHost.broadcast(commandsSync);
      console.log('[useSyncEffects] Broadcasted teams as commands list:', teams.length);
    }
  }, [teams, p2pHost?.isReady, p2pHost?.broadcast]);

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
