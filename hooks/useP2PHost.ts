import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { Peer, DataConnection } from 'peerjs';
import {
  P2PConfig,
  P2PSMessage,
  ConnectionQuality,
  PROTOCOL_VERSION,
  HandshakeMessage,
  HandshakeResponseMessage,
  PingMessage,
  PongMessage,
  MessageCategory
} from '../types';
import { storage, STORAGE_KEYS } from './useLocalStorage';
import { generateUUID, getSignallingServer } from '../utils';
import { createOptimizedMessageSender } from '../utils/messageQueue';
import { getGlobalQualityMonitor, QualityReport } from '../utils/connectionQualityMonitor';
import { P2PConnectionPool, PoolStats } from '../utils/p2pConnectionPool';

/**
 * Connection Rate Limiter
 * Prevents connection flood attacks by limiting connection rate
 */
class ConnectionRateLimiter {
  private connections: number[] = [];
  private readonly maxConnections: number;
  private readonly windowMs: number;

  constructor(maxConnections: number = 10, windowMs: number = 10000) {
    this.maxConnections = maxConnections;
    this.windowMs = windowMs;
  }

  /**
   * Check if a new connection is allowed
   */
  canConnect(): boolean {
    const now = Date.now();

    // Remove old connections outside the time window
    this.connections = this.connections.filter(time => now - time < this.windowMs);

    // Check if we're within the limit
    if (this.connections.length < this.maxConnections) {
      this.connections.push(now);
      return true;
    }

    return false;
  }

  /**
   * Get current connection count in the window
   */
  getCurrentCount(): number {
    const now = Date.now();
    this.connections = this.connections.filter(time => now - time < this.windowMs);
    return this.connections.length;
  }

  /**
   * Get time until next connection is allowed (in ms)
   */
  getTimeUntilNextConnection(): number {
    if (this.connections.length === 0) return 0;

    const oldestConnection = this.connections[0];
    const timeUntilWindowEnd = this.windowMs - (Date.now() - oldestConnection);
    return Math.max(0, timeUntilWindowEnd);
  }

  /**
   * Reset the rate limiter
   */
  reset(): void {
    this.connections = [];
  }
}

/**
 * P2P Host Hook - manages WebRTC connections for the host
 * Handles multiple client connections with automatic reconnection
 */

export interface P2PHostResult {
  isReady: boolean;
  error: Error | null;
  hostId: string;
  connectionCount: number;
  connectedClients: string[];
  broadcast: (data: unknown) => void;
  sendToClient: (clientId: string, data: unknown) => boolean;
  sendToTeam: (teamId: string, data: unknown) => { success: boolean; sentTo: number; failed: string[] };
  disconnectClient: (clientId: string) => void;
  disconnectAll: () => void;
  // Quality monitoring methods
  getClientQualityReport: (clientId: string) => QualityReport | null;
  getAllQualityReports: () => Record<string, QualityReport>;
  globalQualityReport: QualityReport | null;
  updateGlobalQualityReport: () => void;
  // Connection pool methods
  getPoolStats: () => PoolStats;
  cleanupIdleConnections: () => { removed: number; kept: number };
  getActiveConnections: () => string[];
  getConnectionsByTeam: (teamId: string) => string[];
  updateConnectionQuality: (clientId: string, quality: ConnectionQuality) => void;
}
export const useP2PHost = (config: P2PConfig & {
  onClientConnected?: (clientId: string, data: { name: string; teamId?: string; persistentClientId?: string }) => void;
  onClientDisconnected?: (clientId: string) => void;
  onBuzzReceived?: (data: { clientId: string; clientName: string; teamId?: string; buzzTime: number }) => void;
  maxConnectionsPerMinute?: number; // Rate limiting configuration
  enableConnectionPool?: boolean; // Enable connection pooling (default: true)
  poolConfig?: {
    maxConnections?: number;
    maxIdleTime?: number;
    healthCheckInterval?: number;
  };
}) => {
  const peerRef = useRef<Peer | null>(null);
  const connectionsRef = useRef<Map<string, DataConnection>>(new Map());
  const pendingConnectionsRef = useRef<Map<string, DataConnection>>(new Map());

  // Connection pool for managing multiple clients efficiently
  const connectionPoolRef = useRef<P2PConnectionPool | null>(null);

  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [connectedClients, setConnectedClients] = useState<string[]>([]);

  // Sequence counter for ordered messaging
  const sequenceCounterRef = useRef(0);

  // Connection rate limiter - prevent connection flood attacks
  const rateLimiterRef = useRef<ConnectionRateLimiter>(
    new ConnectionRateLimiter(config.maxConnectionsPerMinute || 10, 60000)
  );

  // Connection quality monitoring for each client
  const qualityMonitorsRef = useRef<Map<string, ReturnType<typeof getGlobalQualityMonitor>>>(new Map());
  const [globalQualityReport, setGlobalQualityReport] = useState<QualityReport | null>(null);

  // Optimized message sender with batching
  const messageQueueRef = useRef(createOptimizedMessageSender((message, peerId) => {
    const conn = peerId ? connectionsRef.current.get(peerId) : null;
    if (conn && conn.open) {
      try {
        conn.send(message);
      } catch (err) {
        console.error('[P2P Host] Error sending message:', err);
      }
    } else if (!peerId) {
      // Broadcast to all connected clients
      connectionsRef.current.forEach((conn) => {
        if (conn.open) {
          try {
            conn.send(message);
          } catch (err) {
            console.error('[P2P Host] Error broadcasting to client:', err);
          }
        }
      });
    }
  }));

  // Get signalling server URL based on LAN mode
  const getSignallingServerUrl = useCallback(() => {
    const lockedIp = config.isLanMode ? storage.get(STORAGE_KEYS.LOCKED_IP) : undefined;
    return getSignallingServer(config.isLanMode, config.signallingServer, lockedIp);
  }, [config.isLanMode, config.signallingServer]);

  // Initialize connection pool
  useEffect(() => {
    const enablePool = config.enableConnectionPool ?? true;

    console.log('[P2P Host] Connection pool useEffect triggered, enablePool:', enablePool);

    if (enablePool) {
      connectionPoolRef.current = new P2PConnectionPool({
        maxConnections: config.poolConfig?.maxConnections ?? 50,
        maxIdleTime: config.poolConfig?.maxIdleTime ?? 300000, // 5 minutes
        healthCheckInterval: config.poolConfig?.healthCheckInterval ?? 30000, // 30 seconds
        enableLoadBalancing: true,
        enableHealthMonitoring: true,
        debug: false
      });

      console.log('[P2P Host] Connection pool initialized');
    }

    return () => {
      console.log('[P2P Host] Connection pool cleanup - destroying pool');
      connectionPoolRef.current?.destroy();
      connectionPoolRef.current = null;
    };
  }, [config.poolConfig?.maxConnections, config.poolConfig?.maxIdleTime, config.poolConfig?.healthCheckInterval, config.enableConnectionPool]);

  // Initialize PeerJS
  useEffect(() => {
    const signallingServer = getSignallingServerUrl();
    console.log('[P2P Host] Initializing with signalling server:', signallingServer);

    // Parse signalling server URL to extract host and port
    let peerConfig: any = { debug: 1 }; // INFO level

    if (signallingServer && signallingServer.startsWith('ws://')) {
      try {
        const url = new URL(signallingServer);
        peerConfig.host = url.hostname;
        peerConfig.port = parseInt(url.port);
        peerConfig.secure = false; // WebSocket, not WebSocket Secure
        peerConfig.path = '/peerjs'; // Default PeerServer path
        console.log('[P2P Host] Using custom signalling server:', {
          host: peerConfig.host,
          port: peerConfig.port,
          secure: peerConfig.secure,
          path: peerConfig.path
        });
      } catch (e) {
        console.warn('[P2P Host] Failed to parse signalling server URL, using defaults:', signallingServer, e);
      }
    } else if (signallingServer && signallingServer.startsWith('wss://')) {
      try {
        const url = new URL(signallingServer);
        peerConfig.host = url.hostname;
        peerConfig.port = parseInt(url.port) || 443;
        peerConfig.secure = true; // WebSocket Secure
        peerConfig.path = '/peerjs'; // Default PeerServer path
        console.log('[P2P Host] Using secure signalling server:', {
          host: peerConfig.host,
          port: peerConfig.port,
          secure: peerConfig.secure,
          path: peerConfig.path
        });
      } catch (e) {
        console.warn('[P2P Host] Failed to parse signalling server URL, using defaults:', signallingServer, e);
      }
    } else {
      console.log('[P2P Host] Using default public PeerJS server');
    }

    const peer = new Peer(config.hostId, peerConfig);

    peerRef.current = peer;

    peer.on('open', (id) => {
      console.log('[P2P Host] PeerJS opened with ID:', id);
      setIsReady(true);
      setError(null);
    });

    peer.on('connection', (conn) => {
      console.log('[P2P Host] Incoming connection from:', conn.peer);
      handleIncomingConnection(conn);
    });

    peer.on('error', (err) => {
      console.error('[P2P Host] PeerJS error:', err);

      // Provide specific diagnostics for common signalling server issues
      const errType = (err as any).type;
      if (errType === 'network' || (err as any).message?.includes('Failed to fetch')) {
        console.error('[P2P Host] ❌ Network error accessing signalling server.');
        console.error('[P2P Host] 🔧 Possible fixes:');
        console.error('[P2P Host]    1. Check if signalling server is running at:', signallingServer);
        console.error('[P2P Host]    2. Verify the server supports HTTP API (not just WebSocket)');
        console.error('[P2P Host]    3. Check CORS settings on the server');
        console.error('[P2P Host]    4. Try using the default public PeerJS server');
        console.error('[P2P Host] 📖 Note: PeerJS requires both HTTP and WebSocket endpoints');
      } else if (errType === 'server-error') {
        console.error('[P2P Host] ❌ Signalling server error. The server might be misconfigured.');
      } else if (errType === 'ssl-unavailable') {
        console.error('[P2P Host] ❌ SSL not available. Try using ws:// instead of wss://');
      } else if (errType === 'unavailable-id') {
        console.error('[P2P Host] ❌ Host ID already taken. Try a different ID.');
      }

      setError(err as Error);
      config.onError?.(err as Error);
    });

    peer.on('disconnected', () => {
      console.warn('[P2P Host] PeerJS disconnected from signalling server');
      // Auto-reconnect logic
      setTimeout(() => {
        if (peer && !peer.destroyed) {
          peer.reconnect();
        }
      }, 1000);
    });

    return () => {
      // Clean up all connections
      connectionsRef.current.forEach((conn) => conn.close());
      pendingConnectionsRef.current.forEach((conn) => conn.close());

      if (peer && !peer.destroyed) {
        peer.destroy();
      }
      setIsReady(false);
    };
  }, [config.hostId]);

  // Handle incoming connection
  const handleIncomingConnection = useCallback((conn: DataConnection) => {
    const clientId = conn.peer;

    // Check rate limit before accepting connection
    if (!rateLimiterRef.current.canConnect()) {
      console.warn('[P2P Host] ⚠️ Connection rate limit exceeded for:', clientId);
      console.warn('[P2P Host] Current connections:', rateLimiterRef.current.getCurrentCount());
      console.warn('[P2P Host] Time until next connection allowed:', rateLimiterRef.current.getTimeUntilNextConnection(), 'ms');

      // Close the connection immediately
      conn.close();
      return;
    }

    // Store in pending until handshake complete
    pendingConnectionsRef.current.set(clientId, conn);

    // Set up data handler BEFORE connection is open
    conn.on('data', (data) => {
      try {
        const message = data as P2PSMessage;

        // Handle handshake
        if (message.type === 'HANDSHAKE') {
          console.log('🤝 [P2P HOST] Processing HANDSHAKE from:', clientId);
          handleHandshake(conn, message as HandshakeMessage);
        } else if (message.type === 'PING') {
          handlePing(conn, message as PingMessage);
        } else {
          // Forward to app handler
          config.onMessage?.(message, clientId);
        }
      } catch (err) {
        console.error('[P2P Host] Error handling message:', err);
      }
    });

    conn.on('close', () => {
      console.log('[P2P Host] Connection closed:', clientId);
      connectionsRef.current.delete(clientId);
      pendingConnectionsRef.current.delete(clientId);
      // Remove quality monitor for this client
      qualityMonitorsRef.current.delete(clientId);
      // Update connected clients list
      setConnectedClients(Array.from(connectionsRef.current.keys()));
      config.onClientDisconnected?.(clientId);
    });

    conn.on('error', (err) => {
      console.error('[P2P Host] Connection error:', clientId, err);
      connectionsRef.current.delete(clientId);
      pendingConnectionsRef.current.delete(clientId);
      // Remove quality monitor for this client
      qualityMonitorsRef.current.delete(clientId);
      // Update connected clients list
      setConnectedClients(Array.from(connectionsRef.current.keys()));
      config.onClientDisconnected?.(clientId);
    });

    // Send handshake response when ready
    conn.on('open', () => {
      console.log('[P2P Host] Data connection open:', clientId);
      // Send handshake response immediately when connection opens
      const response: HandshakeResponseMessage = {
        id: generateUUID(),
        category: MessageCategory.CONTROL,
        timestamp: Date.now(),
        senderId: config.hostId,
        type: 'HANDSHAKE_RESPONSE',
        payload: {
          hostId: config.hostId,
          sessionVersion: Date.now().toString(),
          teams: [],
          currentTime: Date.now()
        }
      };
      conn.send(response);
    });
  }, [config.hostId, config.onClientConnected, config.onPeerConnected]);

  // Handle client handshake
  const handleHandshake = useCallback((conn: DataConnection, message: HandshakeMessage) => {
    const { clientId, clientName, protocolVersion, persistentClientId, currentTeamId } = message.payload;

    console.log('[P2P Host] Handshake from:', clientName, 'protocol:', protocolVersion, 'persistentId:', persistentClientId, 'teamId:', currentTeamId);

    // Check protocol version
    if (protocolVersion !== PROTOCOL_VERSION) {
      console.warn('[P2P Host] Protocol mismatch:', protocolVersion, 'vs', PROTOCOL_VERSION);
      // Send error and close
      conn.send({
        id: generateUUID(),
        category: MessageCategory.CONTROL,
        timestamp: Date.now(),
        senderId: config.hostId,
        type: 'ERROR',
        payload: { message: 'Protocol version mismatch' }
      });
      conn.close();
      return;
    }

    // Move from pending to active
    const clientIdReal = conn.peer;
    pendingConnectionsRef.current.delete(clientIdReal);
    connectionsRef.current.set(clientIdReal, conn);

    // Add to connection pool if available
    if (connectionPoolRef.current) {
      connectionPoolRef.current.add(conn, {
        clientName,
        teamId: currentTeamId,
        persistentClientId
      });
      console.log('[P2P Host] Added client to connection pool:', clientIdReal);
    }

    // Create quality monitor for this client
    if (!qualityMonitorsRef.current.has(clientIdReal)) {
      const clientMonitor = getGlobalQualityMonitor();
      qualityMonitorsRef.current.set(clientIdReal, clientMonitor);
      console.log('[P2P Host] 🔍 Created quality monitor for client:', clientIdReal);
    }

    // Update connected clients list
    setConnectedClients(Array.from(connectionsRef.current.keys()));

    // Notify app with persistent client ID and team ID for reconnection handling
    config.onClientConnected?.(clientIdReal, {
      name: clientName,
      teamId: currentTeamId,
      persistentClientId: persistentClientId
    });
    config.onPeerConnected?.(clientIdReal);
  }, [config.hostId, config]);

  // Handle ping
  const handlePing = useCallback((conn: DataConnection, message: PingMessage) => {
    const pong: PongMessage = {
      id: generateUUID(),
      category: MessageCategory.CONTROL,
      timestamp: Date.now(),
      senderId: config.hostId,
      type: 'PONG',
      payload: {
        originalTimestamp: message.payload.timestamp,
        serverTimestamp: Date.now()
      }
    };
    conn.send(pong);
  }, [config.hostId]);

  // Broadcast message to all connected clients (optimized with batching and connection pool)
  const broadcast = useCallback((message: Omit<P2PSMessage, 'id' | 'timestamp' | 'senderId'>) => {
    const fullMessage: P2PSMessage = {
      ...message,
      id: generateUUID(),
      timestamp: Date.now(),
      senderId: config.hostId,
      // Add sequence number if not already present (for ordered messaging)
      sequence: message.sequence ?? sequenceCounterRef.current++
    } as P2PSMessage;

    // Log broadcast for STATE_SYNC messages
    if (fullMessage.type === 'STATE_SYNC') {
      console.log('[P2P Host] Broadcasting STATE_SYNC:', {
        messageId: fullMessage.id,
        type: fullMessage.type,
        category: fullMessage.category,
        connectedClients: connectedClients.length,
        hasConnectionPool: !!connectionPoolRef.current,
        payload: {
          isSessionActive: fullMessage.payload.isSessionActive,
          clientsCount: fullMessage.payload.clients?.length || 0,
          teamsCount: fullMessage.payload.teams?.length || 0
        }
      });
    }

    // Use connection pool if available, otherwise fall back to direct broadcast
    if (connectionPoolRef.current) {
      const result = connectionPoolRef.current.broadcastLoadBalanced(fullMessage);
      // If pool broadcast failed for some clients, try direct connections for those
      if (result.failedToSend.length > 0) {
        console.warn('[P2P Host] Pool broadcast failed for some clients, trying direct:', result.failedToSend);
        for (const failedClientId of result.failedToSend) {
          const conn = connectionsRef.current.get(failedClientId);
          if (conn && conn.open) {
            try {
              conn.send(fullMessage);
              console.log('[P2P Host] Direct send succeeded for:', failedClientId);
            } catch (err) {
              console.error('[P2P Host] Direct send also failed for:', failedClientId, err);
            }
          }
        }
      }
      if (fullMessage.type === 'STATE_SYNC') {
        console.log('[P2P Host] Broadcast result:', {
          success: result.success,
          sentTo: result.sentTo,
          failedToSend: result.failedToSend
        });
      }
    } else {
      // Use optimized message queue with batching
      const priority = fullMessage.category === 'event' ? 'high' : 'normal';
      messageQueueRef.current.send(fullMessage, undefined, priority);
      if (fullMessage.type === 'STATE_SYNC') {
        console.log('[P2P Host] Queued STATE_SYNC via message queue');
      }
    }

    return fullMessage;
  }, [config.hostId, connectedClients]);

  // Send to specific client (optimized with batching and connection pool)
  const sendToClient = useCallback((clientId: string, message: Omit<P2PSMessage, 'id' | 'timestamp' | 'senderId'>) => {
    // Try connection pool first if available
    if (connectionPoolRef.current) {
      const poolResult = connectionPoolRef.current.sendTo(clientId, message);
      // If pool send succeeded, return immediately
      if (poolResult) {
        return true;
      }
      // Pool send failed - fall through to direct connection attempt
      console.log('[P2P Host] Pool send failed, trying direct connection for:', clientId);
    }

    // Fall back to direct connection
    const conn = connectionsRef.current.get(clientId);
    if (!conn || !conn.open) {
      console.warn('[P2P Host] Client not connected:', clientId);
      return false;
    }

    const fullMessage: P2PSMessage = {
      ...message,
      id: generateUUID(),
      timestamp: Date.now(),
      senderId: config.hostId,
      // Add sequence number if not already present (for ordered messaging)
      sequence: message.sequence ?? sequenceCounterRef.current++
    } as P2PSMessage;

    // Use optimized message queue with immediate sending for direct messages
    messageQueueRef.current.send(fullMessage, clientId, 'high');

    return true;
  }, [config.hostId]);

  // Send to all clients in a team (connection pool feature)
  const sendToTeam = useCallback((teamId: string, message: Omit<P2PSMessage, 'id' | 'timestamp' | 'senderId'>) => {
    if (!connectionPoolRef.current) {
      console.warn('[P2P Host] Connection pool not available, falling back to broadcast');
      broadcast(message);
      return { success: true, sentTo: connectedClients.length, failed: [] };
    }

    const fullMessage: P2PSMessage = {
      ...message,
      id: generateUUID(),
      timestamp: Date.now(),
      senderId: config.hostId,
      sequence: message.sequence ?? sequenceCounterRef.current++
    } as P2PSMessage;

    return connectionPoolRef.current.sendToTeam(teamId, fullMessage);
  }, [config.hostId, broadcast, connectedClients.length]);

  // Disconnect specific client
  const disconnectClient = useCallback((clientId: string) => {
    const conn = connectionsRef.current.get(clientId);
    if (conn) {
      conn.close();
      connectionsRef.current.delete(clientId);
    }
  }, []);

  // Disconnect all clients
  const disconnectAll = useCallback(() => {
    connectionsRef.current.forEach((conn) => conn.close());
    connectionsRef.current.clear();
    pendingConnectionsRef.current.forEach((conn) => conn.close());
    pendingConnectionsRef.current.clear();
    // Clear all quality monitors
    qualityMonitorsRef.current.clear();
  }, []);

  // Get quality report for specific client
  const getClientQualityReport = useCallback((clientId: string): QualityReport | null => {
    const monitor = qualityMonitorsRef.current.get(clientId);
    return monitor ? monitor.getQualityReport() : null;
  }, []);

  // Get all quality reports
  const getAllQualityReports = useCallback(() => {
    const reports: Record<string, QualityReport> = {};
    qualityMonitorsRef.current.forEach((monitor, clientId) => {
      reports[clientId] = monitor.getQualityReport();
    });
    return reports;
  }, []);

  // Update global quality report
  const updateGlobalQualityReport = useCallback(() => {
    if (qualityMonitorsRef.current.size > 0) {
      // Get the first client's monitor for global overview
      const firstMonitor = qualityMonitorsRef.current.values().next().value;
      if (firstMonitor) {
        const report = firstMonitor.getQualityReport();
        setGlobalQualityReport(report);

        // Log alerts if any
        if (report.alerts.length > 0) {
          console.warn('[P2P Host] ⚠️ Connection Quality Alerts:', report.alerts);
        }
      }
    }
  }, []);

  // Connection pool methods
  const getPoolStats = useCallback((): PoolStats => {
    return connectionPoolRef.current?.getStats() || {
      totalConnections: 0,
      activeConnections: 0,
      idleConnections: 0,
      unhealthyConnections: 0,
      totalMessagesSent: 0,
      totalBytesTransferred: 0,
      averageHealthScore: 0,
      connectionsByTeam: {}
    };
  }, []);

  const cleanupIdleConnections = useCallback(() => {
    return connectionPoolRef.current?.cleanup({ removeIdle: true, removeUnhealthy: false }) || { removed: 0, kept: 0 };
  }, []);

  const getActiveConnections = useCallback((): string[] => {
    return connectionPoolRef.current?.getActiveConnections().map(c => c.id) || connectedClients;
  }, [connectedClients]);

  const getConnectionsByTeam = useCallback((teamId: string): string[] => {
    return connectionPoolRef.current?.getConnectionsByTeam(teamId) || [];
  }, []);

  const updateConnectionQuality = useCallback((clientId: string, quality: ConnectionQuality) => {
    connectionPoolRef.current?.updateConnectionQuality(clientId, quality);
  }, []);

  // Memoize result to prevent infinite re-renders when used in useEffect dependencies
  return useMemo(() => ({
    isReady,
    error,
    hostId: config.hostId,
    connectionCount: connectedClients.length,
    connectedClients,
    broadcast,
    sendToClient,
    sendToTeam,
    disconnectClient,
    disconnectAll,
    // Quality monitoring methods
    getClientQualityReport,
    getAllQualityReports,
    globalQualityReport,
    updateGlobalQualityReport,
    // Connection pool methods
    getPoolStats,
    cleanupIdleConnections,
    getActiveConnections,
    getConnectionsByTeam,
    updateConnectionQuality,
  }), [isReady, error, config.hostId, connectedClients, broadcast, sendToClient, sendToTeam, disconnectClient, disconnectAll, getClientQualityReport, getAllQualityReports, globalQualityReport, updateGlobalQualityReport, getPoolStats, cleanupIdleConnections, getActiveConnections, getConnectionsByTeam, updateConnectionQuality]);
};
