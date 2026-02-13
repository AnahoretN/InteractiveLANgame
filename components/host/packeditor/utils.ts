/**
 * PackEditor Utilities
 * Helper functions for pack editor
 */

import { generateUUID } from '../../../utils';

/**
 * Convert file to base64 string
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Get file extension from MIME type
 */
export function getExtensionFromMime(mime: string): string {
  const mimeToExt: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'audio/mp3': '.mp3',
    'audio/wav': '.wav',
    'audio/ogg': '.ogg',
  };
  return mimeToExt[mime] || '.jpg';
}

/**
 * Generate unique ID
 */
export function generateId(): string {
  return generateUUID();
}

/**
 * Create empty round structure
 */
export function createEmptyRound(roundNumber: number, type: 'normal' | 'super' = 'normal') {
  return {
    id: `round-${generateId()}`,
    name: type === 'super' ? 'Супер-игра' : `Раунд ${roundNumber}`,
    type,
    themes: [],
  };
}

/**
 * Create empty theme structure
 */
export function createEmptyTheme() {
  return {
    id: `theme-${generateId()}`,
    name: 'Новая тема',
    questions: [],
  };
}

/**
 * Create empty question structure
 */
export function createEmptyQuestion(points: number) {
  return {
    id: `question-${generateId()}`,
    text: 'Новый вопрос',
    answers: ['', '', '', '', ''],
    correctAnswer: 0,
    points,
  };
}
