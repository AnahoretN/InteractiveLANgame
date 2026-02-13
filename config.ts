/**
 * Centralized application configuration
 * All magic numbers and constants should be defined here
 */

// UI Configuration
export const UI_CONFIG = {
  BUZZ_DURATION: 3000,           // 3 seconds - how long buzz indicator shows
  CLEANUP_INTERVAL: 60000,       // 1 minute - cleanup interval for old data
  ANIMATION_DURATION: 300,       // Default animation duration in ms
} as const;

// Session Settings Configuration
export const SESSION_CONFIG = {
  SIMULTANEOUS_PRESS_MIN: 0.25,   // Minimum threshold in seconds
  SIMULTANEOUS_PRESS_MAX: 2.0,    // Maximum threshold in seconds
  SIMULTANEOUS_PRESS_DEFAULT: 0.5, // Default threshold in seconds
  WINNER_DELAY_MIN: 0.1,          // Minimum delay in seconds
  WINNER_DELAY_MAX: 3.0,          // Maximum delay in seconds
  WINNER_DELAY_DEFAULT: 1.0,      // Default delay in seconds
  UNDERDOG_BONUS: 0.20,           // +20% bonus for underdog in clash
} as const;
