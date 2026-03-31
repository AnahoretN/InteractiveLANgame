/**
 * useBuzz Hook
 *
 * Custom React hook for managing buzz (player button press) state.
 * Automatically tracks which players have buzzed and cleans up old buzzes after a specified duration.
 *
 * @param {number} [cleanupDelayMs=3000] - Time in milliseconds after which a buzz expires. Default is 3000ms (3 seconds).
 * @returns {UseBuzzResult} Object containing buzz state and management functions.
 *
 * @example
 * ```typescript
 * function GameComponent() {
 *   const { buzzedClients, markBuzzed, hasBuzzed } = useBuzz(5000); // 5 second timeout
 *
 *   const handleBuzz = (playerId: string) => {
 *     markBuzzed(playerId);
 *   };
 *
 *   return (
 *     <div>
 *       {hasBuzzed('player-1') && <div>Player 1 buzzed!</div>}
 *     </div>
 *   );
 * }
 * ```
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { UI_CONFIG } from '../config';

/**
 * @interface UseBuzzResult
 * @property {Map<string, number>} buzzedClients - Map of client IDs to buzz timestamps
 * @property {(clientId: string) => void} markBuzzed - Mark a client as having buzzed
 * @property {(clientId: string) => boolean} hasBuzzed - Check if a client has buzzed recently
 * @property {(clientId: string) => number | undefined} getBuzzTimestamp - Get buzz timestamp for a client
 * @property {(clientId: string) => void} clearBuzz - Clear buzz for a specific client
 * @property {() => void} clearAllBuzzes - Clear all buzzes
 */

export const useBuzz = (cleanupDelayMs: number = UI_CONFIG.BUZZ_DURATION) => {
  const [buzzedClients, setBuzzedClients] = useState<Map<string, number>>(new Map());
  const buzzedClientsRef = useRef<Map<string, number>>(new Map());

  // Keep ref in sync with state
  useEffect(() => {
    buzzedClientsRef.current = buzzedClients;
  }, [buzzedClients]);

  // Mark a client as buzzed
  const markBuzzed = useCallback((clientId: string) => {
    setBuzzedClients(prev => new Map(prev).set(clientId, Date.now()));
  }, []);

  // Check if a client has buzzed recently
  const hasBuzzed = useCallback((clientId: string) => {
    return buzzedClientsRef.current.has(clientId);
  }, []);

  // Get buzz timestamp for a client
  const getBuzzTimestamp = useCallback((clientId: string) => {
    return buzzedClientsRef.current.get(clientId);
  }, []);

  // Clear buzz for a specific client
  const clearBuzz = useCallback((clientId: string) => {
    setBuzzedClients(prev => {
      const updated = new Map(prev);
      updated.delete(clientId);
      return updated;
    });
  }, []);

  // Clear all buzzes
  const clearAllBuzzes = useCallback(() => {
    setBuzzedClients(new Map());
  }, []);

  // Auto-cleanup old buzzes
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now(); // Пересчитываем now при каждом вызове интервала
      setBuzzedClients(prev => {
        const updated = new Map(prev);
        for (const [clientId, timestamp] of prev.entries()) {
          if (now - timestamp > cleanupDelayMs) {
            updated.delete(clientId);
          }
        }
        return updated;
      });
    }, 500); // Check every 500ms

    return () => clearInterval(interval);
  }, [cleanupDelayMs]);

  return {
    buzzedClients,
    markBuzzed,
    hasBuzzed,
    getBuzzTimestamp,
    clearBuzz,
    clearAllBuzzes,
  };
};
