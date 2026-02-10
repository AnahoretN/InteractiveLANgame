/**
 * Custom hook for managing buzz (player button press) state
 * Tracks which players have buzzed and auto-cleanup after duration
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { UI_CONFIG } from '../config';

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
      const now = Date.now();
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
