/**
 * Custom hooks exports
 */

export { useSessionSettings } from './useSessionSettings';
export { useBuzz } from './useBuzz';

// Utility hooks
export { useInterval } from './useInterval';
export { useURLParams, useURLParam, useURLParamsMap } from './useURLParams';

// P2P Network hooks
export { useP2PHost } from './useP2PHost';
export { useP2PClient, ClientConnectionState } from './useP2PClient';

// Host state management
export { useHostStateManager } from './useHostStateManager';

// Sync effects
export { useSyncEffects } from './useSyncEffects';

// Team status manager (single source of truth for team card states)
export { useTeamStatusManager, useTeamContextMenu } from './useTeamStatusManager';
export type {
  TeamStatus,
  TeamState,
  TeamGameState,
  TeamStatusManagerConfig,
  UseTeamStatusManagerReturn,
  UseTeamContextMenuReturn,
} from './useTeamStatusManager';

// Simple isStale function for compatibility
export const isStale = (lastSeen: number): boolean => {
  const STALE_THRESHOLD = 15 * 1000; // 15 seconds
  return Date.now() - lastSeen > STALE_THRESHOLD;
};
