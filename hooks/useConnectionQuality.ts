/**
 * Custom hook for managing connection quality metrics
 * Provides utilities for calculating and displaying connection health
 *
 * Centralized connection quality logic - used by both HostView and MobileView
 */

import { ConnectionQuality } from '../types';
import { QUALITY_THRESHOLDS } from '../config';
import { useMemo } from 'react';

/**
 * Create default connection quality values
 */
export const getDefaultQuality = (): ConnectionQuality => ({
  rtt: 0,
  packetLoss: 0,
  jitter: 0,
  lastPing: Date.now(),
  healthScore: 100,
});

/**
 * Update connection quality metrics with new RTT measurement
 * @param current Previous connection quality state
 * @param newRtt New round-trip time in ms
 * @param packetLost Whether a packet was lost
 * @returns Updated connection quality
 */
export const updateQualityMetrics = (
  current: ConnectionQuality,
  newRtt: number,
  packetLost: boolean
): ConnectionQuality => {
  const now = Date.now();
  const newJitter = current.rtt > 0 ? Math.abs(newRtt - current.rtt) : 0;
  const smoothedJitter = current.jitter === 0 ? newJitter : current.jitter * 0.7 + newJitter * 0.3;

  const totalPings = current.lastPing > 0 ? (current.packetLoss / 100) + 1 : 1;
  const lostCount = (current.packetLoss / 100) * totalPings;
  const newPacketLoss = packetLost
    ? ((lostCount + 1) / (totalPings + 1)) * 100
    : (lostCount / (totalPings + 1)) * 100;

  const healthScore = Math.max(
    0,
    Math.min(100, 100 - newRtt / 5 - smoothedJitter * 2 - newPacketLoss)
  );

  return {
    rtt: newRtt,
    packetLoss: Math.round(newPacketLoss * 100) / 100,
    jitter: Math.round(smoothedJitter * 100) / 100,
    lastPing: now,
    healthScore: Math.round(healthScore),
  };
};

/**
 * Calculate health color class based on health score
 */
export const getHealthColor = (score: number): string => {
  if (score >= QUALITY_THRESHOLDS.EXCELLENT) return 'text-green-400';
  if (score >= QUALITY_THRESHOLDS.GOOD) return 'text-yellow-400';
  return 'text-red-400';
};

/**
 * Calculate health background color class based on health score
 */
export const getHealthBgColor = (score: number): string => {
  if (score >= QUALITY_THRESHOLDS.EXCELLENT) return 'bg-green-500/10 text-green-400 border-green-500/40';
  if (score >= QUALITY_THRESHOLDS.GOOD) return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/40';
  return 'bg-red-500/10 text-red-400 border-red-500/40';
};

/**
 * Calculate RTT color class based on round-trip time
 */
export const getRttColor = (rtt: number): string => {
  if (rtt <= QUALITY_THRESHOLDS.RTT_EXCELLENT) return 'text-green-400';
  if (rtt <= QUALITY_THRESHOLDS.RTT_GOOD) return 'text-yellow-400';
  return 'text-red-400';
};

/**
 * Hook that provides all connection quality utilities
 */
export const useConnectionQuality = () => {
  return {
    getDefaultQuality,
    updateQualityMetrics,
    getHealthColor,
    getHealthBgColor,
    getRttColor,
  };
};

/**
 * Memoized helper for quality display components
 */
export const useQualityDisplay = (quality: ConnectionQuality) => {
  return useMemo(() => ({
    healthColor: getHealthColor(quality.healthScore),
    healthBgColor: getHealthBgColor(quality.healthScore),
    rttColor: getRttColor(quality.rtt),
    isExcellent: quality.healthScore >= QUALITY_THRESHOLDS.EXCELLENT,
    isGood: quality.healthScore >= QUALITY_THRESHOLDS.GOOD,
    isPoor: quality.healthScore < QUALITY_THRESHOLDS.GOOD,
  }), [quality]);
};
