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

// Connection Configuration
export const CONNECTION_CONFIG = {
  HEALTH_CHECK_INTERVAL: 10000,  // 10 seconds between health checks
  HEALTH_CHECK_TIMEOUT: 5000,    // 5 seconds to respond to health check
  CLIENT_STALE_THRESHOLD: 15000, // 15 seconds without activity = stale

  // Message queue
  MAX_RETRY_ATTEMPTS: 5,
  RETRY_DELAY_BASE: 1000,        // Base retry delay in ms
  RETRY_DELAY_MAX: 10000,        // Max retry delay in ms

  // Reconnection
  RECONNECT_BASE_DELAY: 1000,
  RECONNECT_MAX_DELAY: 15000,
  MAX_RECONNECT_ATTEMPTS: 10,
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

// Connection Quality Thresholds
export const QUALITY_THRESHOLDS = {
  EXCELLENT: 80,   // 80+ score = green
  GOOD: 50,        // 50-79 score = yellow
  POOR: 0,         // 0-49 score = red

  // RTT thresholds for display (ms)
  RTT_EXCELLENT: 50,
  RTT_GOOD: 150,
} as const;
