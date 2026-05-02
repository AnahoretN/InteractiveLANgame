/**
 * Connection Health Monitor
 *
 * Tracks connection quality and determines health status
 * Extracted from p2pConnectionPool.ts for better separation of concerns
 */

export interface HealthStats {
  currentScore: number;
  averageScore: number;
  trend: number;
}

export interface HealthMonitorOptions {
  maxHistoryLength?: number;
  decayRate?: number;
  initialScore?: number;
}

export class ConnectionHealthMonitor {
  private healthScores = new Map<string, { score: number; lastUpdate: number; history: number[] }>();
  private readonly maxHistoryLength: number;
  private readonly decayRate: number;

  constructor(options: HealthMonitorOptions = {}) {
    this.maxHistoryLength = options.maxHistoryLength ?? 10;
    this.decayRate = options.decayRate ?? 0.1;
  }

  /**
   * Update health score for a connection
   */
  updateHealth(connectionId: string, delta: number): number {
    const existing = this.healthScores.get(connectionId);
    const now = Date.now();

    if (existing) {
      const age = (now - existing.lastUpdate) / 1000;
      const decayedScore = existing.score * Math.exp(-this.decayRate * age);

      const newScore = Math.max(0, Math.min(100, decayedScore + delta));
      const history = [...existing.history, newScore].slice(-this.maxHistoryLength);

      this.healthScores.set(connectionId, {
        score: newScore,
        lastUpdate: now,
        history
      });

      return newScore;
    } else {
      const initialScore = Math.max(0, Math.min(100, 50 + delta));
      this.healthScores.set(connectionId, {
        score: initialScore,
        lastUpdate: now,
        history: [initialScore]
      });

      return initialScore;
    }
  }

  /**
   * Get current health score
   */
  getHealthScore(connectionId: string): number {
    const health = this.healthScores.get(connectionId);
    if (!health) return 50;

    const age = (Date.now() - health.lastUpdate) / 1000;
    return Math.max(0, health.score * Math.exp(-this.decayRate * age));
  }

  /**
   * Check if connection is healthy
   */
  isHealthy(connectionId: string, threshold = 30): boolean {
    return this.getHealthScore(connectionId) >= threshold;
  }

  /**
   * Get health statistics for a connection
   */
  getHealthStats(connectionId: string): HealthStats | null {
    const health = this.healthScores.get(connectionId);
    if (!health) return null;

    return {
      currentScore: this.getHealthScore(connectionId),
      averageScore: health.history.reduce((a, b) => a + b, 0) / health.history.length,
      trend: health.history.length >= 2
        ? health.history[health.history.length - 1] - health.history[0]
        : 0
    };
  }

  /**
   * Remove connection from monitoring
   */
  remove(connectionId: string): void {
    this.healthScores.delete(connectionId);
  }

  /**
   * Clear all monitoring data
   */
  clear(): void {
    this.healthScores.clear();
  }

  /**
   * Get all monitored connection IDs
   */
  getConnectionIds(): string[] {
    return Array.from(this.healthScores.keys());
  }

  /**
   * Get number of monitored connections
   */
  size(): number {
    return this.healthScores.size;
  }
}
