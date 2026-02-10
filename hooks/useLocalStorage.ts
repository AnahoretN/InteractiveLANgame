import { useState, useCallback, useEffect } from 'react';

/**
 * Centralized localStorage keys for the app
 */
export const STORAGE_KEYS = {
  // Host keys
  HOST_ID: 'ilan_host_id',
  HOST_NAME: 'ilan_host_name',
  LOGS: 'ilan_logs',
  CLIENTS: 'ilan_clients',
  TEAMS: 'ilan_teams',
  LOCKED_IP: 'ilan_locked_ip',
  QR_URL: 'ilan_qr_url',
  SESSION_SETTINGS: 'ilan_session_settings',

  // Client keys
  USER_NAME: 'ilan_username',
  LAST_HOST: 'ilan_last_host',
  STATE_VERSION: 'ilan_state_version',
  LAST_IP: 'ilan_last_ip',
  TEAM_SELECTED: 'ilan_team_selected',
  CURRENT_TEAM: 'ilan_current_team',
  CURRENT_TEAM_ID: 'ilan_current_team_id',
  CLIENT_ID: 'ilan_client_id',

  // TTL timestamp keys (5 hours = 18000000 ms)
  USER_NAME_TTL: 'ilan_username_ttl',
  TEAM_SELECTED_TTL: 'ilan_team_selected_ttl',
  CURRENT_TEAM_TTL: 'ilan_current_team_ttl',
  CURRENT_TEAM_ID_TTL: 'ilan_current_team_id_ttl',
  CLIENT_ID_TTL: 'ilan_client_id_ttl',
  LAST_HOST_TTL: 'ilan_last_host_ttl',
  LAST_IP_TTL: 'ilan_last_ip_ttl'
} as const;

// TTL duration: 5 hours in milliseconds
export const CLIENT_DATA_TTL = 5 * 60 * 60 * 1000;

/**
 * Safe localStorage operations with error handling
 */
export const storage = {
  /**
   * Get item from localStorage
   */
  get: <T = string>(key: string, defaultValue?: T): T | null => {
    try {
      const item = localStorage.getItem(key);
      if (item === null) return defaultValue ?? null;
      // Try to parse as JSON, fallback to string
      try {
        return JSON.parse(item) as T;
      } catch {
        return item as T;
      }
    } catch (error) {
      console.warn(`Error reading from localStorage (${key}):`, error);
      return defaultValue ?? null;
    }
  },

  /**
   * Set item in localStorage
   */
  set: <T>(key: string, value: T): boolean => {
    try {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      localStorage.setItem(key, serialized);
      return true;
    } catch (error) {
      console.warn(`Error writing to localStorage (${key}):`, error);
      return false;
    }
  },

  /**
   * Set item with TTL timestamp
   * When the item is set, we also store a timestamp that will be checked later
   */
  setWithTTL: <T>(key: string, ttlKey: string, value: T): boolean => {
    const now = Date.now();
    // Set the value
    try {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      localStorage.setItem(key, serialized);
      // If value was set successfully, also set the TTL timestamp
      localStorage.setItem(ttlKey, JSON.stringify(now));
      return true;
    } catch (error) {
      console.warn(`Error writing to localStorage with TTL (${key}):`, error);
      return false;
    }
  },

  /**
   * Remove item from localStorage
   */
  remove: (key: string): boolean => {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.warn(`Error removing from localStorage (${key}):`, error);
      return false;
    }
  },

  /**
   * Clear all items with a prefix
   */
  clearPrefix: (prefix: string): void => {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(prefix)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
    } catch (error) {
      console.warn(`Error clearing localStorage prefix (${prefix}):`, error);
    }
  },

  /**
   * Clear all app data
   */
  clearAll: (): void => {
    try {
      Object.values(STORAGE_KEYS).forEach(key => {
        localStorage.removeItem(key);
      });
    } catch (error) {
      console.warn('Error clearing localStorage:', error);
    }
  },

  /**
   * Check if a TTL timestamp has expired
   */
  isExpired: (ttlKey: string, ttl: number): boolean => {
    const timestamp = storage.get<number>(ttlKey);
    if (!timestamp) return true; // No timestamp = expired
    return Date.now() - timestamp > ttl;
  },

  /**
   * Clean up expired client data (name, team selections)
   * Call this on app initialization to remove stale data
   */
  cleanupExpiredClientData: (): void => {
    const now = new Date().toISOString();
    let cleaned = false;

    // Check and clean user name - only if TTL exists and is expired
    if (storage.get(STORAGE_KEYS.USER_NAME) && storage.isExpired(STORAGE_KEYS.USER_NAME_TTL, CLIENT_DATA_TTL)) {
      console.log(`[Storage] Cleaning up expired USER_NAME (${now})`);
      storage.remove(STORAGE_KEYS.USER_NAME);
      storage.remove(STORAGE_KEYS.USER_NAME_TTL);
      cleaned = true;
    }

    // Check and clean team selection - only if TTL exists and is expired
    if (storage.get(STORAGE_KEYS.TEAM_SELECTED) && storage.isExpired(STORAGE_KEYS.TEAM_SELECTED_TTL, CLIENT_DATA_TTL)) {
      console.log(`[Storage] Cleaning up expired TEAM_SELECTED (${now})`);
      storage.remove(STORAGE_KEYS.TEAM_SELECTED);
      storage.remove(STORAGE_KEYS.TEAM_SELECTED_TTL);
      cleaned = true;
    }

    // Check and clean current team - only if TTL exists and is expired
    if (storage.get(STORAGE_KEYS.CURRENT_TEAM) && storage.isExpired(STORAGE_KEYS.CURRENT_TEAM_TTL, CLIENT_DATA_TTL)) {
      console.log(`[Storage] Cleaning up expired CURRENT_TEAM (${now})`);
      storage.remove(STORAGE_KEYS.CURRENT_TEAM);
      storage.remove(STORAGE_KEYS.CURRENT_TEAM_TTL);
      cleaned = true;
    }

    // Check and clean current team ID - only if TTL exists and is expired
    if (storage.get(STORAGE_KEYS.CURRENT_TEAM_ID) && storage.isExpired(STORAGE_KEYS.CURRENT_TEAM_ID_TTL, CLIENT_DATA_TTL)) {
      console.log(`[Storage] Cleaning up expired CURRENT_TEAM_ID (${now})`);
      storage.remove(STORAGE_KEYS.CURRENT_TEAM_ID);
      storage.remove(STORAGE_KEYS.CURRENT_TEAM_ID_TTL);
      cleaned = true;
    }

    // Check and clean client ID - only if TTL exists and is expired
    if (storage.get(STORAGE_KEYS.CLIENT_ID) && storage.isExpired(STORAGE_KEYS.CLIENT_ID_TTL, CLIENT_DATA_TTL)) {
      console.log(`[Storage] Cleaning up expired CLIENT_ID (${now})`);
      storage.remove(STORAGE_KEYS.CLIENT_ID);
      storage.remove(STORAGE_KEYS.CLIENT_ID_TTL);
      cleaned = true;
    }

    // Check and clean last host - only if TTL exists and is expired
    if (storage.get(STORAGE_KEYS.LAST_HOST) && storage.isExpired(STORAGE_KEYS.LAST_HOST_TTL, CLIENT_DATA_TTL)) {
      console.log(`[Storage] Cleaning up expired LAST_HOST (${now})`);
      storage.remove(STORAGE_KEYS.LAST_HOST);
      storage.remove(STORAGE_KEYS.LAST_HOST_TTL);
      cleaned = true;
    }

    // Check and clean last IP - only if TTL exists and is expired
    if (storage.get(STORAGE_KEYS.LAST_IP) && storage.isExpired(STORAGE_KEYS.LAST_IP_TTL, CLIENT_DATA_TTL)) {
      console.log(`[Storage] Cleaning up expired LAST_IP (${now})`);
      storage.remove(STORAGE_KEYS.LAST_IP);
      storage.remove(STORAGE_KEYS.LAST_IP_TTL);
      cleaned = true;
    }

    if (cleaned) {
      console.log('[Storage] Expired client data cleaned up successfully');
    }
  }
};

/**
 * React hook for localStorage with state synchronization
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => void, () => void] {
  // Get initial value from localStorage or use initialValue
  const [storedValue, setStoredValue] = useState<T>(() => {
    return storage.get<T>(key, initialValue) ?? initialValue;
  });

  // Update localStorage when state changes
  const setValue = useCallback((value: T | ((prev: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      storage.set(key, valueToStore);
    } catch (error) {
      console.warn(`Error setting localStorage value (${key}):`, error);
    }
  }, [key, storedValue]);

  // Remove value from localStorage and reset to initial
  const removeValue = useCallback(() => {
    setStoredValue(initialValue);
    storage.remove(key);
  }, [key, initialValue]);

  // Listen for changes in other tabs
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === key && e.newValue !== null) {
        try {
          const newValue = JSON.parse(e.newValue) as T;
          setStoredValue(newValue);
        } catch {
          setStoredValue(e.newValue as T);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [key]);

  return [storedValue, setValue, removeValue];
}
