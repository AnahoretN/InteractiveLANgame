/**
 * Custom hook for managing session settings
 * Handles persistence to localStorage and provides update functions
 */

import { useState, useCallback, useEffect } from 'react';
import { SESSION_CONFIG } from '../config';
import { STORAGE_KEYS } from './useLocalStorage';

export interface SessionSettings {
  simultaneousPressEnabled: boolean; // Enable simultaneous press detection
  simultaneousPressThreshold: number; // seconds (0.25 - 2.0)
  collisionEnabled: boolean; // Enable clash handling for simultaneous presses
  collisionAdvantageUnderdog: boolean; // Give lower-scoring players +20% advantage in clashes
  noTeamsMode: boolean; // Disable teams - show individual players instead
}

const DEFAULT_SETTINGS: SessionSettings = {
  simultaneousPressEnabled: true,
  simultaneousPressThreshold: SESSION_CONFIG.SIMULTANEOUS_PRESS_DEFAULT,
  collisionEnabled: true,
  collisionAdvantageUnderdog: false,
  noTeamsMode: false,
};

const loadSettings = (): SessionSettings => {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.SESSION_SETTINGS);
    if (!saved) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(saved);
    return {
      simultaneousPressEnabled: parsed.simultaneousPressEnabled ?? true,
      simultaneousPressThreshold: parsed.simultaneousPressThreshold ?? SESSION_CONFIG.SIMULTANEOUS_PRESS_DEFAULT,
      collisionEnabled: parsed.collisionEnabled ?? true,
      collisionAdvantageUnderdog: parsed.collisionAdvantageUnderdog ?? false,
      noTeamsMode: parsed.noTeamsMode ?? false,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
};

export const useSessionSettings = () => {
  const [settings, setSettings] = useState<SessionSettings>(loadSettings);

  // Save to localStorage whenever settings change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SESSION_SETTINGS, JSON.stringify(settings));
  }, [settings]);

  const updateSettings = useCallback((updates: Partial<SessionSettings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
  }, []);

  return {
    settings,
    updateSettings,
    resetSettings,
  };
};
