import { ConnectionQuality } from '../types';
import { CONNECTION_CONFIG } from '../config';

/**
 * Calculate health score based on RTT and jitter
 */
export function calculateHealthScore(rtt: number, jitter: number): number {
  // RTT: 0ms = 100, 100ms = 80, 300ms = 50, 500ms+ = 0
  const rttScore = Math.max(0, 100 - (rtt / 5));

  // Jitter: 0ms = 100, 20ms = 80, 50ms = 50, 100ms+ = 0
  const jitterScore = Math.max(0, 100 - (jitter * 2));

  return Math.round((rttScore + jitterScore) / 2);
}

/**
 * Update connection quality metrics with new measurement
 */
export function updateQualityMetrics(
  current: ConnectionQuality,
  newRtt: number,
  packetLost: boolean = false
): ConnectionQuality {
  const now = Date.now();

  // Calculate new jitter (variance in RTT)
  const newJitter = current.rtt > 0 ? Math.abs(newRtt - current.rtt) : 0;

  // Smooth jitter using exponential moving average (alpha = 0.3)
  const smoothedJitter = current.jitter === 0
    ? newJitter
    : current.jitter * 0.7 + newJitter * 0.3;

  // Update packet loss percentage
  const totalPings = (current.lastPing > 0) ? (current.packetLoss / 100) + 1 : 1;
  const lostCount = (current.packetLoss / 100) * totalPings;
  const newPacketLoss = packetLost
    ? ((lostCount + 1) / (totalPings + 1)) * 100
    : (lostCount / (totalPings + 1)) * 100;

  return {
    rtt: newRtt,
    packetLoss: Math.round(newPacketLoss * 100) / 100,
    jitter: Math.round(smoothedJitter * 100) / 100,
    lastPing: now,
    healthScore: calculateHealthScore(newRtt, smoothedJitter)
  };
}

/**
 * Get default connection quality
 */
export function getDefaultQuality(): ConnectionQuality {
  return {
    rtt: 0,
    packetLoss: 0,
    jitter: 0,
    lastPing: Date.now(),
    healthScore: 100
  };
}

/**
 * Check if a connection is considered stale
 */
export function isStale(lastSeen: number): boolean {
  return Date.now() - lastSeen > CONNECTION_CONFIG.CLIENT_STALE_THRESHOLD;
}

/**
 * Check if a connection is considered dead
 */
export function isDead(lastSeen: number): boolean {
  return Date.now() - lastSeen > CONNECTION_CONFIG.CLIENT_STALE_THRESHOLD * 2;
}

/**
 * Get connection status color based on health score
 */
export function getHealthColor(score: number): string {
  if (score >= 80) return 'text-green-400';
  if (score >= 50) return 'text-yellow-400';
  return 'text-red-400';
}

/**
 * Get connection status background based on health score
 */
export function getHealthBgColor(score: number): string {
  if (score >= 80) return 'bg-green-500/10 border-green-500/20';
  if (score >= 50) return 'bg-yellow-500/10 border-yellow-500/20';
  return 'bg-red-500/10 border-red-500/20';
}

/**
 * Format latency with color indicator
 */
export function formatLatency(latency: number): { value: string; color: string } {
  if (latency < 50) {
    return { value: `${latency}`, color: 'text-green-400' };
  }
  if (latency < 150) {
    return { value: `${latency}`, color: 'text-yellow-400' };
  }
  return { value: `${latency}`, color: 'text-red-400' };
}
