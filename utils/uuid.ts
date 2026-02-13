/**
 * UUID generation utility
 * Provides a consistent UUID generator across the application
 */

/**
 * Generate a UUID v4 string with fallback for browsers without crypto.randomUUID()
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback: Generate a UUID v4 compatible string
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
