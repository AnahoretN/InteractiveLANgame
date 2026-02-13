/**
 * Health color utility
 * Provides consistent health score color classes across the application
 */

/**
 * Get CSS text color class based on health score
 * @param score - Health score (0-100)
 * @returns Tailwind CSS class string for text color
 */
export function getHealthColor(score: number): string {
  if (score >= 80) return 'text-green-400';
  if (score >= 50) return 'text-yellow-400';
  return 'text-red-400';
}

/**
 * Get CSS background color class based on health score
 * @param score - Health score (0-100)
 * @returns Tailwind CSS class string for background and border
 */
export function getHealthBgColor(score: number): string {
  if (score >= 80) return 'bg-green-500/20 text-green-400 border-green-500/20';
  if (score >= 50) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/20';
  return 'bg-red-500/20 text-red-400 border-red-500/20';
}
