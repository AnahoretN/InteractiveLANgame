import { ConnectionQuality } from '../types';

/**
 * Connection Quality Monitor
 * Comprehensive monitoring system for P2P connection quality
 */
export class ConnectionQualityMonitor {
  private qualityHistory: ConnectionQuality[] = [];
  private maxHistorySize: number;
  private alertThresholds: QualityAlertThresholds;
  private currentQuality: ConnectionQuality;
  private lastAlertTime: number = 0;
  private alertCooldown: number = 30000; // 30 seconds between alerts

  constructor(
    maxHistorySize: number = 100,
    alertThresholds?: Partial<QualityAlertThresholds>
  ) {
    this.maxHistorySize = maxHistorySize;
    this.alertThresholds = {
      criticalRTT: alertThresholds?.criticalRTT || 500,
      warningRTT: alertThresholds?.warningRTT || 200,
      criticalJitter: alertThresholds?.criticalJitter || 100,
      warningJitter: alertThresholds?.warningJitter || 50,
      criticalHealthScore: alertThresholds?.criticalHealthScore || 30,
      warningHealthScore: alertThresholds?.warningHealthScore || 60,
      criticalPacketLoss: alertThresholds?.criticalPacketLoss || 10,
      warningPacketLoss: alertThresholds?.warningPacketLoss || 5
    };

    this.currentQuality = {
      rtt: 0,
      packetLoss: 0,
      jitter: 0,
      lastPing: Date.now(),
      healthScore: 100
    };
  }

  /**
   * Update connection quality with new measurement
   */
  updateQuality(newQuality: ConnectionQuality): void {
    this.currentQuality = newQuality;
    this.qualityHistory.push({ ...newQuality });

    // Keep history size under limit
    if (this.qualityHistory.length > this.maxHistorySize) {
      this.qualityHistory.shift();
    }
  }

  /**
   * Get current connection quality
   */
  getCurrentQuality(): ConnectionQuality {
    return this.currentQuality;
  }

  /**
   * Get quality history
   */
  getQualityHistory(): ConnectionQuality[] {
    return [...this.qualityHistory];
  }

  /**
   * Calculate average quality over history
   */
  getAverageQuality(): ConnectionQuality {
    if (this.qualityHistory.length === 0) {
      return this.currentQuality;
    }

    const sum = this.qualityHistory.reduce(
      (acc, quality) => ({
        rtt: acc.rtt + quality.rtt,
        packetLoss: acc.packetLoss + quality.packetLoss,
        jitter: acc.jitter + quality.jitter,
        lastPing: Math.max(acc.lastPing, quality.lastPing),
        healthScore: acc.healthScore + quality.healthScore
      }),
      { rtt: 0, packetLoss: 0, jitter: 0, lastPing: 0, healthScore: 0 }
    );

    const count = this.qualityHistory.length;
    return {
      rtt: Math.round(sum.rtt / count),
      packetLoss: Math.round(sum.packetLoss / count),
      jitter: Math.round(sum.jitter / count),
      lastPing: sum.lastPing,
      healthScore: Math.round(sum.healthScore / count)
    };
  }

  /**
   * Get quality trend (improving, degrading, stable)
   */
  getQualityTrend(): 'improving' | 'degrading' | 'stable' {
    if (this.qualityHistory.length < 5) {
      return 'stable';
    }

    const recent = this.qualityHistory.slice(-5);
    const old = this.qualityHistory.slice(-10, -5);

    if (old.length === 0) {
      return 'stable';
    }

    const recentAvg = this.calculateAverageHealthScore(recent);
    const oldAvg = this.calculateAverageHealthScore(old);

    if (recentAvg > oldAvg + 10) {
      return 'improving';
    } else if (recentAvg < oldAvg - 10) {
      return 'degrading';
    }
    return 'stable';
  }

  /**
   * Check for quality alerts
   */
  checkAlerts(): QualityAlert[] {
    const alerts: QualityAlert[] = [];
    const now = Date.now();

    // Check alert cooldown
    if (now - this.lastAlertTime < this.alertCooldown) {
      return alerts;
    }

    const quality = this.currentQuality;

    // Check RTT alerts
    if (quality.rtt > this.alertThresholds.criticalRTT) {
      alerts.push({
        type: 'critical',
        metric: 'rtt',
        value: quality.rtt,
        threshold: this.alertThresholds.criticalRTT,
        message: `Critical RTT: ${quality.rtt}ms (threshold: ${this.alertThresholds.criticalRTT}ms)`
      });
    } else if (quality.rtt > this.alertThresholds.warningRTT) {
      alerts.push({
        type: 'warning',
        metric: 'rtt',
        value: quality.rtt,
        threshold: this.alertThresholds.warningRTT,
        message: `High RTT: ${quality.rtt}ms (threshold: ${this.alertThresholds.warningRTT}ms)`
      });
    }

    // Check jitter alerts
    if (quality.jitter > this.alertThresholds.criticalJitter) {
      alerts.push({
        type: 'critical',
        metric: 'jitter',
        value: quality.jitter,
        threshold: this.alertThresholds.criticalJitter,
        message: `Critical jitter: ${quality.jitter}ms (threshold: ${this.alertThresholds.criticalJitter}ms)`
      });
    } else if (quality.jitter > this.alertThresholds.warningJitter) {
      alerts.push({
        type: 'warning',
        metric: 'jitter',
        value: quality.jitter,
        threshold: this.alertThresholds.warningJitter,
        message: `High jitter: ${quality.jitter}ms (threshold: ${this.alertThresholds.warningJitter}ms)`
      });
    }

    // Check health score alerts
    if (quality.healthScore < this.alertThresholds.criticalHealthScore) {
      alerts.push({
        type: 'critical',
        metric: 'healthScore',
        value: quality.healthScore,
        threshold: this.alertThresholds.criticalHealthScore,
        message: `Critical health score: ${quality.healthScore} (threshold: ${this.alertThresholds.criticalHealthScore})`
      });
    } else if (quality.healthScore < this.alertThresholds.warningHealthScore) {
      alerts.push({
        type: 'warning',
        metric: 'healthScore',
        value: quality.healthScore,
        threshold: this.alertThresholds.warningHealthScore,
        message: `Low health score: ${quality.healthScore} (threshold: ${this.alertThresholds.warningHealthScore})`
      });
    }

    // Check packet loss alerts
    if (quality.packetLoss > this.alertThresholds.criticalPacketLoss) {
      alerts.push({
        type: 'critical',
        metric: 'packetLoss',
        value: quality.packetLoss,
        threshold: this.alertThresholds.criticalPacketLoss,
        message: `Critical packet loss: ${quality.packetLoss}% (threshold: ${this.alertThresholds.criticalPacketLoss}%)`
      });
    } else if (quality.packetLoss > this.alertThresholds.warningPacketLoss) {
      alerts.push({
        type: 'warning',
        metric: 'packetLoss',
        value: quality.packetLoss,
        threshold: this.alertThresholds.warningPacketLoss,
        message: `High packet loss: ${quality.packetLoss}% (threshold: ${this.alertThresholds.warningPacketLoss}%)`
      });
    }

    // Update last alert time if we found any alerts
    if (alerts.length > 0) {
      this.lastAlertTime = now;
    }

    return alerts;
  }

  /**
   * Get adaptive behavior recommendations based on quality
   */
  getAdaptiveRecommendations(): AdaptiveRecommendation[] {
    const recommendations: AdaptiveRecommendation[] = [];
    const quality = this.currentQuality;
    const trend = this.getQualityTrend();

    // Connection stability recommendations
    if (quality.healthScore < 50) {
      recommendations.push({
        type: 'connection',
        action: 'reduce_ping_frequency',
        priority: 'high',
        reason: 'Poor connection quality detected'
      });
    }

    // RTT-based recommendations
    if (quality.rtt > 300) {
      recommendations.push({
        type: 'performance',
        action: 'increase_batch_timeout',
        priority: 'high',
        reason: 'High RTT detected, increase batch processing timeout'
      });
    }

    // Jitter-based recommendations
    if (quality.jitter > 50) {
      recommendations.push({
        type: 'messaging',
        action: 'enable_message_deduplication',
        priority: 'medium',
        reason: 'High jitter detected, ensure message deduplication is active'
      });
    }

    // Trend-based recommendations
    if (trend === 'degrading') {
      recommendations.push({
        type: 'monitoring',
        action: 'increase_monitoring_frequency',
        priority: 'medium',
        reason: 'Connection quality degrading'
      });
    }

    return recommendations;
  }

  /**
   * Get comprehensive quality report
   */
  getQualityReport(): QualityReport {
    const avgQuality = this.getAverageQuality();
    const trend = this.getQualityTrend();
    const alerts = this.checkAlerts();
    const recommendations = this.getAdaptiveRecommendations();

    return {
      current: this.currentQuality,
      average: avgQuality,
      trend,
      alerts,
      recommendations,
      historySize: this.qualityHistory.length,
      timestamp: Date.now()
    };
  }

  /**
   * Reset monitor state
   */
  reset(): void {
    this.qualityHistory = [];
    this.lastAlertTime = 0;
    this.currentQuality = {
      rtt: 0,
      packetLoss: 0,
      jitter: 0,
      lastPing: Date.now(),
      healthScore: 100
    };
  }

  /**
   * Set custom alert thresholds
   */
  setAlertThresholds(thresholds: Partial<QualityAlertThresholds>): void {
    this.alertThresholds = { ...this.alertThresholds, ...thresholds };
  }

  /**
   * Set alert cooldown period
   */
  setAlertCooldown(cooldownMs: number): void {
    this.alertCooldown = cooldownMs;
  }

  // Private helper methods

  private calculateAverageHealthScore(qualities: ConnectionQuality[]): number {
    if (qualities.length === 0) return 100;
    const sum = qualities.reduce((acc, q) => acc + q.healthScore, 0);
    return sum / qualities.length;
  }
}

/**
 * Quality alert thresholds configuration
 */
export interface QualityAlertThresholds {
  criticalRTT: number;
  warningRTT: number;
  criticalJitter: number;
  warningJitter: number;
  criticalHealthScore: number;
  warningHealthScore: number;
  criticalPacketLoss: number;
  warningPacketLoss: number;
}

/**
 * Quality alert
 */
export interface QualityAlert {
  type: 'critical' | 'warning';
  metric: 'rtt' | 'jitter' | 'healthScore' | 'packetLoss';
  value: number;
  threshold: number;
  message: string;
}

/**
 * Adaptive recommendation
 */
export interface AdaptiveRecommendation {
  type: 'connection' | 'performance' | 'messaging' | 'monitoring';
  action: string;
  priority: 'high' | 'medium' | 'low';
  reason: string;
}

/**
 * Comprehensive quality report
 */
export interface QualityReport {
  current: ConnectionQuality;
  average: ConnectionQuality;
  trend: 'improving' | 'degrading' | 'stable';
  alerts: QualityAlert[];
  recommendations: AdaptiveRecommendation[];
  historySize: number;
  timestamp: number;
}

/**
 * Create a singleton quality monitor instance
 */
let globalQualityMonitor: ConnectionQualityMonitor | null = null;

export function getGlobalQualityMonitor(): ConnectionQualityMonitor {
  if (!globalQualityMonitor) {
    globalQualityMonitor = new ConnectionQualityMonitor();
  }
  return globalQualityMonitor;
}

export function resetGlobalQualityMonitor(): void {
  if (globalQualityMonitor) {
    globalQualityMonitor.reset();
  }
}