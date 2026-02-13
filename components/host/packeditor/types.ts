/**
 * PackEditor Types
 * Type definitions for pack editor components
 */

import type { Question as GameQuestion, Theme as GameTheme } from '../PackEditor';

export interface GamePack {
  id: string;
  name: string;
  cover?: {
    type: 'url' | 'file';
    value: string;
  };
  gameType?: 'custom' | 'quiz' | 'trivia';
  rounds: Round[];
  createdAt: number;
  updatedAt?: number;
}

export type RoundType = 'normal' | 'super';

export interface Round {
  id: string;
  number?: number; // Round number for display
  name?: string;
  type?: RoundType;
  cover?: {
    type: 'url' | 'file';
    value: string;
  };
  // Timer settings
  readingTimePerLetter?: number; // seconds per letter for reading (0.01 - 0.5)
  responseWindow?: number; // seconds players have to press buzzer
  handicapEnabled?: boolean; // enable timeout for leaders
  handicapDelay?: number; // extra seconds for leaders (0.25 - 5)
  themes: Theme[];
  disabled?: boolean;
}

export interface Theme {
  id: string;
  name: string;
  color?: string; // Hex color for theme display (e.g., "#3b82f6")
  textColor?: string; // Hex color for text on theme/question cards (e.g., "#ffffff")
  questions?: Question[];
  disabled?: boolean;
}

export interface ExtendedRound extends Round {
  selectedSuperThemeId?: string;
}

export interface Question {
  id: string;
  text: string;
  answers?: string[];
  correctAnswer?: number;
  answerText?: string; // Text of the correct answer (for non-multiple choice)
  answerMedia?: { // Media for the answer
    type: 'image' | 'video' | 'audio';
    url?: string;
  };
  media?: {
    type: 'image' | 'video' | 'audio';
    url?: string;
    file?: File;
  };
  points?: number;
  timeLimit?: number; // individual question time limit
}

export interface TimerSettings {
  readingTimePerLetter: number; // seconds per letter for reading (0.01 - 0.5)
  responseWindow: number; // seconds players have to press buzzer
  handicapEnabled: boolean;
  handicapDelay: number; // extra seconds for leaders (0.25 - 5)
}

export const DEFAULT_TIMER_SETTINGS: TimerSettings = {
  readingTimePerLetter: 0.05,
  responseWindow: 30,
  handicapEnabled: false,
  handicapDelay: 1,
};

// Legacy timer settings for game components
export interface LegacyTimerSettings {
  readingTimeEnabled: boolean;
  readingTime: number;
  responseTimeEnabled: boolean;
  responseTime: number;
  thinkingTimeEnabled: boolean;
  thinkingTime: number;
  showReadingTimer: boolean;
  showResponseTimer: boolean;
}

export const DEFAULT_LEGACY_TIMER_SETTINGS: LegacyTimerSettings = {
  readingTimeEnabled: false,
  readingTime: 30,
  responseTimeEnabled: false,
  responseTime: 20,
  thinkingTimeEnabled: false,
  thinkingTime: 3,
  showReadingTimer: true,
  showResponseTimer: true,
};
