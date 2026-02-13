/**
 * Custom hooks exports
 */

export { useSessionSettings } from './useSessionSettings';
export { useTeams } from './useTeams';
export { useBuzz } from './useBuzz';

// Utility hooks
export { useInterval } from './useInterval';
export { useURLParams, useURLParam, useURLParamsMap } from './useURLParams';
export { useBuzzerTimer } from './useBuzzerTimer';

// P2P Network hooks
export { useP2PHost } from './useP2PHost';
export { useP2PClient, ClientConnectionState } from './useP2PClient';

// Host state management
export { useHostStateManager } from './useHostStateManager';
export { useP2PMessageHandlers } from './useP2PMessageHandlers';

// Sync effects
export { useSyncEffects } from './useSyncEffects';

// Game state hooks
export { useGamePlayState } from './useGamePlayState';
export { useKeyboardNavigation } from './useKeyboardNavigation';

// Simple isStale function for compatibility
export const isStale = (lastSeen: number): boolean => {
  const STALE_THRESHOLD = 15 * 1000; // 15 seconds
  return Date.now() - lastSeen > STALE_THRESHOLD;
};
