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
      return false;
    }

    // Check if connection already exists
    if (this.connections.has(connectionId)) {
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

    // Set up connection event handlers
    this.setupConnectionHandlers(pooledConnection);

    return true;
  }

  /**
   * Set up event handlers for a connection
   *
   * CRITICAL: deliberately does NOT wrap conn.send for statistics. PeerJS's internal
   * chunking (_sendChunks) calls this.send() for EVERY chunk of a large message, so a
   * wrapper here recurses infinitely for any payload larger than PeerJS's chunk size
   * (~16 KB) — RangeError: Maximum call stack size exceeded — and the message is never
   * delivered (symptom: the demo screen stuck on the themes screen). Per-send statistics
   * are updated in sendTo() instead, which is the pool's single send choke point.
   */
  private setupConnectionHandlers(pooledConn: PooledConnection): void {
    const conn = pooledConn.connection;

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
   * Send message to specific connection
   * Note: WebRTC DataConnection.send is fire-and-forget; a synchronous retry loop
   * cannot help (the connection state won't change within the same tick), so we
   * attempt once and report failure honestly so callers can fall back.
   */
  sendTo(connectionId: string, data: any): boolean {
    const conn = this.connections.get(connectionId);
    if (!conn || !conn.connection.open) {
      return false;
    }

    try {
      conn.connection.send(data);

      // Per-send statistics (see setupConnectionHandlers - the send wrapper was removed
      // because it recursed infinitely with PeerJS chunking)
      const dataSize = this.estimateSize(data);
      conn.lastUsed = Date.now();
      conn.messageCount++;
      conn.bytesTransferred += dataSize;
      this.statsManager.recordMessageSent(dataSize);
      this.healthMonitor.updateHealth(connectionId, 5);

      return true;
    } catch (error) {
      this.log(`Send failed for ${connectionId}`);
      this.healthMonitor.updateHealth(connectionId, -30);
      this.statsManager.recordFailure();
      return false;
    }
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
   * Broadcast with load balancing
   * IMPORTANT: a broadcast must reach EVERY connected client, so this intentionally
   * does not cap or slice the target list (the previous .slice(0, maxConcurrent)
   * silently dropped clients beyond the first 10, and they were not reported as
   * failures so no fallback resend could reach them).
   */
  broadcastLoadBalanced(data: any, options?: {
    skipIds?: string[];
    maxConcurrent?: number;
  }): SendResult {
    return this.broadcast(data, options);
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
   * Estimate size of data in bytes WITHOUT full serialization.
   * JSON.stringify on every send doubled the serialization cost of every message;
   * this walk measures strings/binary directly and recurses shallowly over objects.
   */
  private estimateSize(data: any, depth: number = 3): number {
    if (data == null) return 4;
    const type = typeof data;
    if (type === 'string') return data.length * 2; // UTF-16
    if (type === 'number' || type === 'boolean') return 8;
    if (type === 'object') {
      if (data instanceof ArrayBuffer) return data.byteLength;
      if (ArrayBuffer.isView(data)) return (data as ArrayBufferView).byteLength;
      if (depth <= 0) return 64; // Cap recursion - rough estimate for deep objects
      let size = 0;
      try {
        if (Array.isArray(data)) {
          for (const item of data) size += this.estimateSize(item, depth - 1);
        } else {
          for (const key in data) {
            if (Object.prototype.hasOwnProperty.call(data, key)) {
              size += key.length * 2 + this.estimateSize(data[key], depth - 1);
            }
          }
        }
      } catch {
        return 256; // Default estimate for exotic objects
      }
      return size;
    }
    return 16; // Functions, symbols, etc.
  }

  /**
   * Logging helper
   */
  private log(...args: any[]): void {
    if (this.config.debug) {
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
