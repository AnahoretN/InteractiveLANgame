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
    localFile?: LocalFileInfo; // Информация о локальном файле для обложки пака
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
    localFile?: LocalFileInfo; // Информация о локальном файле для обложки раунда
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

export interface LocalFileInfo {
  fileName: string;      // Оригинальное имя файла
  fileSize: number;      // Размер файла в байтах
  fileType: string;      // MIME тип файла
  lastModified: number;  // Время последней модификации
  mediaId?: string;      // ID для восстановления из IndexedDB
}

export interface QuestionHint {
  text?: string; // Hint text
  media?: { // Media for the hint
    type: 'image' | 'video' | 'audio' | 'youtube';
    url?: string;
    localFile?: LocalFileInfo;
  };
  answers?: string[]; // Multiple choice answers for hint
  correctAnswer?: number; // Index of correct answer in hint answers
}

export interface Question {
  id: string;
  text: string;
  answers?: string[];
  correctAnswer?: number;
  answerText?: string; // Text of the correct answer (for non-multiple choice)
  answerMedia?: { // Media for the answer
    type: 'image' | 'video' | 'audio' | 'youtube';
    url?: string;
    localFile?: LocalFileInfo; // Информация о локальном файле + base64 данные
  };
  hint?: QuestionHint; // Hint with text, media and optional multiple choice
  media?: {
    type: 'image' | 'video' | 'audio' | 'youtube';
    url?: string;
    file?: File;
    localFile?: LocalFileInfo; // Информация о локальном файле + base64 данные
  };
  points?: number;
  timeLimit?: number; // individual question time limit
}

// Add YouTube type to media types
export type MediaType = 'image' | 'video' | 'audio' | 'youtube';

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
