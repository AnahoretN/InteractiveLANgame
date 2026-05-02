/**
 * P2P Connection Pool Manager
 * Manages multiple client connections with pooling, load balancing, and health monitoring
 *
 * Refactored to use modular components:
 * - ConnectionHealthMonitor from utils/p2p
 * - PoolStatsManager from utils/p2p
 */

import { DataConnection } from 'peerjs';
import { ConnectionQuality } from '../types';
import { ConnectionHealthMonitor } from './p2p/ConnectionHealthMonitor';
import { PoolStatsManager, ConnectionMetadata } from './p2p/PoolStatsManager';

export interface PooledConnection {
  id: string;
  connection: DataConnection;
  connectedAt: number;
  lastUsed: number;
  healthScore: number; // 0-100
  messageCount: number;
  bytesTransferred: number;
  quality?: ConnectionQuality;
  metadata?: {
    clientName?: string;
    teamId?: string;
    persistentClientId?: string;
  };
}

export interface PoolConfig {
  maxConnections?: number;           // Maximum concurrent connections
  maxIdleTime?: number;              // Max idle time before connection considered stale (ms)
  healthCheckInterval?: number;      // Interval for health checks (ms)
  maxRetries?: number;               // Max retries for failed sends
  retryDelay?: number;               // Delay between retries (ms)
  enableLoadBalancing?: boolean;     // Distribute messages across connections
  enableHealthMonitoring?: boolean;  // Monitor connection health
  debug?: boolean;                   // Enable debug logging
}

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

export interface SendResult {
  success: boolean;
  sentTo: number;        // Number of clients message was sent to
  failedToSend: string[]; // Client IDs that failed
  retries: number;       // Number of retries performed
}

/**
 * P2P Connection Pool
 * Manages multiple WebRTC connections with intelligent routing
 *
 * Now uses modular components for better separation of concerns:
 * - ConnectionHealthMonitor handles connection health tracking
 * - PoolStatsManager handles statistics collection
 */
export class P2PConnectionPool {
  private connections: Map<string, PooledConnection> = new Map();
  private config: Required<PoolConfig>;
  private healthMonitor: ConnectionHealthMonitor;
  private statsManager: PoolStatsManager;
  private healthCheckTimer?: NodeJS.Timeout;

  constructor(config?: PoolConfig) {
    this.config = {
      maxConnections: config?.maxConnections ?? 50,
      maxIdleTime: config?.maxIdleTime ?? 300000, // 5 minutes
      healthCheckInterval: config?.healthCheckInterval ?? 30000, // 30 seconds
      maxRetries: config?.maxRetries ?? 3,
      retryDelay: config?.retryDelay ?? 1000,
      enableLoadBalancing: config?.enableLoadBalancing ?? true,
      enableHealthMonitoring: config?.enableHealthMonitoring ?? true,
      debug: config?.debug ?? false
    };

    this.healthMonitor = new ConnectionHealthMonitor();
    this.statsManager = new PoolStatsManager();

    // Start health check timer
    if (this.config.enableHealthMonitoring) {
      this.startHealthCheckTimer();
    }
  }

  /**
   * Add a connection to the pool
   */
  add(connection: DataConnection, metadata?: PooledConnection['metadata']): boolean {
    const connectionId = connection.peer;

    // Check if pool is full
    if (this.connections.size >= this.config.maxConnections) {
      console.log('[P2PConnectionPool] Pool is full, cannot add connection:', connectionId);
      return false;
    }

    // Check if connection already exists
    if (this.connections.has(connectionId)) {
      console.log('[P2PConnectionPool] Connection already exists in pool:', connectionId);
      return false;
    }

    const pooledConnection: PooledConnection = {
      id: connectionId,
      connection,
      connectedAt: Date.now(),
      lastUsed: Date.now(),
      healthScore: 50, // Start with neutral health
      messageCount: 0,
      bytesTransferred: 0,
      metadata
    };

    this.connections.set(connectionId, pooledConnection);
    console.log('[P2PConnectionPool] Connection added to pool:', connectionId, 'Total:', this.connections.size);

    // Set up connection event handlers
    this.setupConnectionHandlers(pooledConnection);

    return true;
  }

  /**
   * Set up event handlers for a connection
   */
  private setupConnectionHandlers(pooledConn: PooledConnection): void {
    const conn = pooledConn.connection;

    // Track data sent
    const originalSend = conn.send.bind(conn);
    conn.send = (data: any) => {
      try {
        const result = originalSend(data);

        // Update statistics
        pooledConn.lastUsed = Date.now();
        pooledConn.messageCount++;
        const dataSize = this.estimateSize(data);
        pooledConn.bytesTransferred += dataSize;
        this.statsManager.recordMessageSent(dataSize);

        // Positive health update for successful send
        this.healthMonitor.updateHealth(pooledConn.id, 5);

        return result;
      } catch (error) {
        // Negative health update for failed send
        this.healthMonitor.updateHealth(pooledConn.id, -20);
        this.statsManager.recordFailure();
        throw error;
      }
    };

    // Handle connection close
    conn.on('close', () => {
      this.remove(pooledConn.id);
    });

    // Handle connection error
    conn.on('error', (error) => {
      this.log('Connection error:', pooledConn.id, error);
      this.healthMonitor.updateHealth(pooledConn.id, -30);
    });
  }

  /**
   * Remove a connection from the pool
   */
  remove(connectionId: string): boolean {
    const conn = this.connections.get(connectionId);
    if (!conn) {
      return false;
    }

    this.connections.delete(connectionId);
    this.healthMonitor.remove(connectionId);
    this.log('Connection removed from pool:', connectionId, 'remaining:', this.connections.size);

    return true;
  }

  /**
   * Get a connection by ID
   */
  get(connectionId: string): PooledConnection | undefined {
    return this.connections.get(connectionId);
  }

  /**
   * Check if a connection exists
   */
  has(connectionId: string): boolean {
    return this.connections.has(connectionId);
  }

  /**
   * Get all connection IDs
   */
  getAllConnectionIds(): string[] {
    return Array.from(this.connections.keys());
  }

  /**
   * Get active connections (open and recently used)
   */
  getActiveConnections(): PooledConnection[] {
    const now = Date.now();
    return Array.from(this.connections.values()).filter(
      conn => conn.connection.open && (now - conn.lastUsed) < this.config.maxIdleTime
    );
  }

  /**
   * Get idle connections (open but not recently used)
   */
  getIdleConnections(): PooledConnection[] {
    const now = Date.now();
    return Array.from(this.connections.values()).filter(
      conn => conn.connection.open && (now - conn.lastUsed) >= this.config.maxIdleTime
    );
  }

  /**
   * Get unhealthy connections
   */
  getUnhealthyConnections(): PooledConnection[] {
    return Array.from(this.connections.values()).filter(
      conn => !this.healthMonitor.isHealthy(conn.id)
    );
  }

  /**
   * Send message to specific connection with retry logic
   */
  sendTo(connectionId: string, data: any): boolean {
    const conn = this.connections.get(connectionId);
    if (!conn || !conn.connection.open) {
      console.log('[P2PConnectionPool] sendTo failed for', connectionId, ': conn exists=', !!conn, ', conn.open=', conn?.connection.open || false, ', total connections=', this.connections.size);
      return false;
    }

    let retries = 0;
    while (retries <= this.config.maxRetries) {
      try {
        conn.connection.send(data);
        if (retries > 0) {
          this.statsManager.addRetries(retries);
        }
        return true;
      } catch (error) {
        retries++;
        if (retries <= this.config.maxRetries) {
          this.log(`Send failed for ${connectionId}, retrying (${retries}/${this.config.maxRetries})`);
          // Wait before retry
          this.delay(this.config.retryDelay * retries); // Exponential backoff
        } else {
          this.log(`Send failed for ${connectionId} after ${retries} retries`);
          this.healthMonitor.updateHealth(connectionId, -30);
          return false;
        }
      }
    }

    return false;
  }

  /**
   * Broadcast message to all connections with load balancing
   */
  broadcast(data: any, options?: {
    skipIds?: string[];
    healthyOnly?: boolean;
  }): SendResult {
    const skipIds = new Set(options?.skipIds ?? []);
    const healthyOnly = options?.healthyOnly ?? false;

    const targets = Array.from(this.connections.values()).filter(conn => {
      if (skipIds.has(conn.id)) return false;
      if (!conn.connection.open) return false;
      if (healthyOnly && !this.healthMonitor.isHealthy(conn.id)) return false;
      return true;
    });

    let sentTo = 0;
    const failedToSend: string[] = [];

    for (const conn of targets) {
      if (this.sendTo(conn.id, data)) {
        sentTo++;
      } else {
        failedToSend.push(conn.id);
      }
    }

    return {
      success: sentTo > 0,
      sentTo,
      failedToSend,
      retries: this.statsManager.getTotalRetries()
    };
  }

  /**
   * Broadcast with load balancing - distribute load across connections
   */
  broadcastLoadBalanced(data: any, options?: {
    skipIds?: string[];
    maxConcurrent?: number;
  }): SendResult {
    if (!this.config.enableLoadBalancing) {
      return this.broadcast(data, options);
    }

    const skipIds = new Set(options?.skipIds ?? []);
    const maxConcurrent = options?.maxConcurrent ?? 10;

    // Get healthy connections sorted by health score and last used
    const targets = Array.from(this.connections.values())
      .filter(conn => !skipIds.has(conn.id) && conn.connection.open)
      .sort((a, b) => {
        // Prioritize health, then recent usage
        const healthDiff = this.healthMonitor.getHealthScore(b.id) - this.healthMonitor.getHealthScore(a.id);
        if (Math.abs(healthDiff) > 10) return healthDiff;
        return b.lastUsed - a.lastUsed;
      })
      .slice(0, maxConcurrent);

    let sentTo = 0;
    const failedToSend: string[] = [];

    for (const conn of targets) {
      if (this.sendTo(conn.id, data)) {
        sentTo++;
      } else {
        failedToSend.push(conn.id);
      }
    }

    return {
      success: sentTo > 0,
      sentTo,
      failedToSend,
      retries: this.statsManager.getTotalRetries()
    };
  }

  /**
   * Get connection IDs by team
   */
  getConnectionsByTeam(teamId: string): string[] {
    return Array.from(this.connections.values())
      .filter(conn => conn.metadata?.teamId === teamId)
      .map(conn => conn.id);
  }

  /**
   * Send to all connections in a team
   */
  sendToTeam(teamId: string, data: any): SendResult {
    const teamIds = this.getConnectionsByTeam(teamId);
    let sentTo = 0;
    const failedToSend: string[] = [];

    for (const id of teamIds) {
      if (this.sendTo(id, data)) {
        sentTo++;
      } else {
        failedToSend.push(id);
      }
    }

    return {
      success: sentTo > 0,
      sentTo,
      failedToSend,
      retries: this.statsManager.getTotalRetries()
    };
  }

  /**
   * Clean up idle and unhealthy connections
   */
  cleanup(options?: {
    removeIdle?: boolean;
    removeUnhealthy?: boolean;
  }): { removed: number; kept: number } {
    const removeIdle = options?.removeIdle ?? true;
    const removeUnhealthy = options?.removeUnhealthy ?? true;

    let removed = 0;

    for (const conn of this.connections.values()) {
      // CRITICAL: Never remove connections that are still open
      // Only remove closed/cleaned up connections
      if (conn.connection.open) {
        continue; // Skip active connections
      }

      let shouldRemove = false;

      if (removeIdle) {
        const idle = (Date.now() - conn.lastUsed) > this.config.maxIdleTime;
        if (idle) shouldRemove = true;
      }

      if (removeUnhealthy && !shouldRemove) {
        if (!this.healthMonitor.isHealthy(conn.id)) {
          shouldRemove = true;
        }
      }

      if (shouldRemove) {
        this.remove(conn.id);
        removed++;
      }
    }

    return {
      removed,
      kept: this.connections.size
    };
  }

  /**
   * Get pool statistics
   */
  getStats(): PoolStats {
    const now = Date.now();
    const active = this.getActiveConnections();
    const idle = this.getIdleConnections();
    const unhealthy = this.getUnhealthyConnections();

    // Build metadata map for stats calculation
    const connectionMetadata = new Map<string, ConnectionMetadata | undefined>();
    for (const [id, conn] of this.connections.entries()) {
      connectionMetadata.set(id, conn.metadata);
    }

    // Calculate health scores
    const healthScores = Array.from(this.connections.values()).map(conn =>
      this.healthMonitor.getHealthScore(conn.id)
    );

    return this.statsManager.calculatePoolStats(
      this.connections.size,
      active.length,
      idle.length,
      unhealthy.length,
      healthScores,
      connectionMetadata
    );
  }

  /**
   * Update connection quality metrics
   */
  updateConnectionQuality(connectionId: string, quality: ConnectionQuality): void {
    const conn = this.connections.get(connectionId);
    if (conn) {
      conn.quality = quality;

      // Update health based on quality
      const qualityScore = quality.healthScore;
      this.healthMonitor.updateHealth(connectionId, (qualityScore - 50) / 2);
    }
  }

  /**
   * Start health check timer
   */
  private startHealthCheckTimer(): void {
    this.healthCheckTimer = setInterval(() => {
      const now = Date.now();

      for (const conn of this.connections.values()) {
        if (!conn.connection.open) {
          this.healthMonitor.updateHealth(conn.id, -50);
          continue;
        }

        // Decay health for idle connections
        const idleTime = now - conn.lastUsed;
        if (idleTime > this.config.maxIdleTime / 2) {
          const decay = Math.floor(idleTime / 10000); // Decay 1 point per 10 seconds
          this.healthMonitor.updateHealth(conn.id, -decay);
        }
      }

      // Clean up very unhealthy connections
      this.cleanup({ removeIdle: false, removeUnhealthy: true });
    }, this.config.healthCheckInterval);
  }

  /**
   * Stop health check timer
   */
  private stopHealthCheckTimer(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
  }

  /**
   * Clear all connections
   */
  clear(): void {
    this.stopHealthCheckTimer();

    for (const conn of this.connections.values()) {
      try {
        conn.connection.close();
      } catch (error) {
        // Ignore errors during cleanup
      }
    }

    this.connections.clear();
    this.healthMonitor.clear();
    // Note: statsManager retains cumulative stats - use reset() if needed
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.statsManager.reset();
  }

  /**
   * Estimate size of data in bytes
   */
  private estimateSize(data: any): number {
    try {
      return JSON.stringify(data).length * 2; // Rough estimate (UTF-16)
    } catch {
      return 1024; // Default estimate
    }
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Logging helper
   */
  private log(...args: any[]): void {
    if (this.config.debug) {
      console.log('[P2PConnectionPool]', ...args);
    }
  }

  /**
   * Destroy pool and release resources
   */
  destroy(): void {
    this.clear();
  }
}

export default P2PConnectionPool;
