/**
 * Pool Stats Manager
 *
 * Manages statistics for the P2P connection pool
 * Extracted from p2pConnectionPool.ts for better separation of concerns
 */

export interface PoolStats {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  unhealthyConnections: number;
  totalMessagesSent: number;
  totalBytesTransferred: number;
  averageHealthScore: number;
  connectionsByTeam: Record<string, number>;
}

export interface ConnectionMetadata {
  clientName?: string;
  teamId?: string;
  persistentClientId?: string;
}

export class PoolStatsManager {
  private stats = {
    totalMessagesSent: 0,
    totalBytesTransferred: 0,
    totalRetries: 0,
    totalFailures: 0
  };

  /**
   * Record a sent message
   */
  recordMessageSent(bytes: number): void {
    this.stats.totalMessagesSent++;
    this.stats.totalBytesTransferred += bytes;
  }

  /**
   * Record a retry
   */
  recordRetry(): void {
    this.stats.totalRetries++;
  }

  /**
   * Add multiple retries
   */
  addRetries(count: number): void {
    this.stats.totalRetries += count;
  }

  /**
   * Record a failure
   */
  recordFailure(): void {
    this.stats.totalFailures++;
  }

  /**
   * Get total messages sent
   */
  getTotalMessagesSent(): number {
    return this.stats.totalMessagesSent;
  }

  /**
   * Get total bytes transferred
   */
  getTotalBytesTransferred(): number {
    return this.stats.totalBytesTransferred;
  }

  /**
   * Get total retries
   */
  getTotalRetries(): number {
    return this.stats.totalRetries;
  }

  /**
   * Get total failures
   */
  getTotalFailures(): number {
    return this.stats.totalFailures;
  }

  /**
   * Calculate pool statistics
   */
  calculatePoolStats(
    connections: number,
    activeConnections: number,
    idleConnections: number,
    unhealthyConnections: number,
    healthScores: number[],
    connectionMetadata: Map<string, ConnectionMetadata | undefined>
  ): PoolStats {
    const connectionsByTeam: Record<string, number> = {};

    for (const [id, metadata] of connectionMetadata.entries()) {
      const teamId = metadata?.teamId || 'no-team';
      connectionsByTeam[teamId] = (connectionsByTeam[teamId] || 0) + 1;
    }

    const averageHealthScore = healthScores.length > 0
      ? healthScores.reduce((a, b) => a + b, 0) / healthScores.length
      : 0;

    return {
      totalConnections: connections,
      activeConnections,
      idleConnections,
      unhealthyConnections,
      totalMessagesSent: this.stats.totalMessagesSent,
      totalBytesTransferred: this.stats.totalBytesTransferred,
      averageHealthScore,
      connectionsByTeam
    };
  }

  /**
   * Reset all statistics
   */
  reset(): void {
    this.stats = {
      totalMessagesSent: 0,
      totalBytesTransferred: 0,
      totalRetries: 0,
      totalFailures: 0
    };
  }

  /**
   * Get all stats as plain object
   */
  toObject(): {
    totalMessagesSent: number;
    totalBytesTransferred: number;
    totalRetries: number;
    totalFailures: number;
  } {
    return { ...this.stats };
  }
}
