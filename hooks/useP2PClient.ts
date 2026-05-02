import React, { useEffect, useRef, useCallback, useState } from 'react';
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
import { generateUUID, getSignallingServer } from '../utils';
import { getGlobalQualityMonitor, QualityReport, AdaptiveRecommendation } from '../utils/connectionQualityMonitor';

// Connection state enum (exported for use in callbacks)
export enum ClientConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error'
}

/**
 * Extended result interface for useP2PClient with quality monitoring
 */
export interface P2PClientResult {
  connectionState: ClientConnectionState;
  connectionQuality: ConnectionQuality;
  isConnected: boolean;
  isConnecting: boolean;
  connect: () => void;
  disconnect: () => void;
  send: (message: Omit<P2PSMessage, 'id' | 'timestamp' | 'senderId'>) => boolean;
  connectionRef: React.MutableRefObject<DataConnection | null>;
  qualityReport: QualityReport | null;
  getQualityReport: () => QualityReport;
  getAdaptiveRecommendations: () => AdaptiveRecommendation[];
}

/**
 * Exponential Backoff with Jitter
 * Prevents thundering herd problem during reconnection attempts
 */
class ExponentialBackoff {
  private maxRetries: number;
  private initialDelay: number;
  private maxDelay: number;
  private currentRetry: number = 0;
  private jitterFactor: number;

  constructor(
    maxRetries: number = 10,
    initialDelay: number = 1000,
    maxDelay: number = 30000,
    jitterFactor: number = 0.1
  ) {
    this.maxRetries = maxRetries;
    this.initialDelay = initialDelay;
    this.maxDelay = maxDelay;
    this.jitterFactor = jitterFactor;
  }

  /**
   * Get the next delay with exponential backoff and jitter
   */
  getNextDelay(): number {
    if (this.currentRetry >= this.maxRetries) {
      return -1; // Signal to stop retrying
    }

    // Calculate exponential backoff: initialDelay * 2^retry
    const exponentialDelay = Math.min(
      this.initialDelay * Math.pow(2, this.currentRetry),
      this.maxDelay
    );

    // Add jitter: random value between -jitterFactor and +jitterFactor
    const jitter = exponentialDelay * this.jitterFactor * (Math.random() * 2 - 1);

    const delay = Math.max(0, exponentialDelay + jitter);
    this.currentRetry++;

    return Math.round(delay);
  }

  /**
   * Reset the retry counter
   */
  reset(): void {
    this.currentRetry = 0;
  }

  /**
   * Get current retry count
   */
  getCurrentRetry(): number {
    return this.currentRetry;
  }

  /**
   * Check if we should continue retrying
   */
  shouldRetry(): boolean {
    return this.currentRetry < this.maxRetries;
  }

  /**
   * Get connection quality based retry adjustment
   */
  adjustForConnectionQuality(quality: ConnectionQuality): void {
    // If connection quality is poor, back off more aggressively
    if (quality.healthScore < 50) {
      this.currentRetry = Math.min(this.currentRetry + 1, this.maxRetries);
    }
    // If connection quality is good, reset to try normal reconnection
    else if (quality.healthScore > 80) {
      this.currentRetry = Math.max(0, this.currentRetry - 1);
    }
  }
}

interface P2PClientConfig {
  clientName: string;
  hostId: string;
  isLanMode?: boolean;
  signallingUrl?: string;
  persistentClientId?: string;  // Stored client ID for reconnection
  currentTeamId?: string;        // Current team ID (if any)
  isModerator?: boolean;         // Special flag for moderator connection
  onMessage?: (message: P2PSMessage) => void;
  onConnectionChange?: (state: ClientConnectionState, quality: ConnectionQuality) => void;
  onError?: (error: Error) => void;
}

/**
 * P2P Client Hook - manages WebRTC connection to host
 * Handles automatic reconnection and connection quality monitoring
 */
export const useP2PClient = (config: P2PClientConfig) => {
  const peerRef = useRef<Peer | null>(null);
  const connectionRef = useRef<DataConnection | null>(null);
  const [connectionState, setConnectionState] = useState<ClientConnectionState>(ClientConnectionState.DISCONNECTED);
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>({
    rtt: 0,
    packetLoss: 0,
    jitter: 0,
    lastPing: Date.now(),
    healthScore: 100
  });

  // Connection quality monitoring
  const qualityMonitorRef = useRef(getGlobalQualityMonitor());
  const [qualityReport, setQualityReport] = useState<QualityReport | null>(null);

  // Ping tracking
  const pingTimesRef = useRef<number[]>([]);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Exponential backoff for reconnection
  const backoffRef = useRef<ExponentialBackoff>(new ExponentialBackoff(10, 1000, 30000, 0.1));

  // Track last notified state to avoid unnecessary updates
  const lastNotifiedStateRef = useRef<ClientConnectionState | null>(null);
  const lastNotifiedQualityRef = useRef<ConnectionQuality | null>(null);

  // Store callbacks in refs to avoid re-creating peer on every render
  const configRefs = useRef(config);
  configRefs.current = config;

  // Get signalling server URL
  const getSignallingServerUrl = useCallback(() => {
    const cfg = configRefs.current;
    return getSignallingServer(cfg.isLanMode, cfg.signallingUrl);
  }, []);

  // Calculate connection quality
  const updateConnectionQuality = useCallback(() => {
    const pings = pingTimesRef.current;
    if (pings.length === 0) return;

    const avgRtt = pings.reduce((a, b) => a + b, 0) / pings.length;

    // Calculate jitter (variance)
    const variance = pings.reduce((sum, ping) => sum + Math.pow(ping - avgRtt, 2), 0) / pings.length;
    const jitter = Math.sqrt(variance);

    // Calculate health score (0-100)
    // RTT: <50ms = 100, 50-100ms = 80-100, 100-300ms = 50-80, >300ms = 0-50
    let healthScore = 100;
    if (avgRtt > 300) {
      healthScore = Math.max(0, 50 - (avgRtt - 300) / 10);
    } else if (avgRtt > 100) {
      healthScore = 80 - (avgRtt - 100) / 5;
    } else if (avgRtt > 50) {
      healthScore = 100 - (avgRtt - 50) / 2.5;
    }

    // Reduce score for high jitter
    if (jitter > 50) {
      healthScore -= 20;
    } else if (jitter > 20) {
      healthScore -= 10;
    }

    healthScore = Math.max(0, Math.min(100, healthScore));

    const newQuality: ConnectionQuality = {
      rtt: Math.round(avgRtt),
      packetLoss: 0, // TODO: calculate from lost pings
      jitter: Math.round(jitter),
      lastPing: Date.now(),
      healthScore: Math.round(healthScore)
    };

    // Update quality monitor
    qualityMonitorRef.current.updateQuality(newQuality);

    // Update state if quality changed significantly
    const oldQuality = connectionQuality;
    if (Math.abs(newQuality.healthScore - oldQuality.healthScore) > 5 ||
        Math.abs(newQuality.rtt - oldQuality.rtt) > 10) {
      setConnectionQuality(newQuality);
    }

    // Check for alerts and update quality report
    const alerts = qualityMonitorRef.current.checkAlerts();
    if (alerts.length > 0) {
      console.warn('[P2P Client] ⚠️ Connection Quality Alerts:', alerts);
      alerts.forEach(alert => {
        console.warn(`[P2P Client] ${alert.type.toUpperCase()}: ${alert.message}`);
      });
    }

    // Update quality report periodically
    const report = qualityMonitorRef.current.getQualityReport();
    if (report.alerts.length > 0 || report.recommendations.length > 0) {
      setQualityReport(report);
    }

    return newQuality;
  }, []);

  // Notify connection state change only when actually changed
  const notifyConnectionChange = useCallback((state: ClientConnectionState, quality: ConnectionQuality) => {
    const lastState = lastNotifiedStateRef.current;
    const lastQuality = lastNotifiedQualityRef.current;

    // Check if state changed
    const stateChanged = lastState !== state;
    // Check if quality changed significantly
    const qualityChanged = !lastQuality ||
      Math.abs(quality.healthScore - lastQuality.healthScore) > 5 ||
      Math.abs(quality.rtt - lastQuality.rtt) > 10;

    if (stateChanged || qualityChanged) {
      configRefs.current.onConnectionChange?.(state, quality);
      lastNotifiedStateRef.current = state;
      lastNotifiedQualityRef.current = quality;
    }
  }, []);

  // Send ping
  const sendPing = useCallback(() => {
    const conn = connectionRef.current;
    if (!conn || !conn.open) return;

    const pingMsg: PingMessage = {
      id: generateUUID(),
      category: MessageCategory.CONTROL,
      timestamp: Date.now(),
      senderId: peerRef.current?.id || '',
      type: 'PING',
      payload: { timestamp: Date.now() }
    };

    try {
      conn.send(pingMsg);
    } catch (err) {
      console.error('[P2P Client] Error sending ping:', err);
    }
  }, []);

  // Start ping interval (adaptive based on connection quality)
  const startPingInterval = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
    }

    // Adaptive ping interval based on connection quality
    const getAdaptiveInterval = () => {
      const quality = connectionQuality;
      // Poor connection: more frequent pings (3s)
      if (quality.healthScore < 50) return 3000;
      // Good connection: normal pings (5s)
      if (quality.healthScore < 80) return 5000;
      // Excellent connection: less frequent pings (10s)
      return 10000;
    };

    const scheduleNextPing = () => {
      const interval = getAdaptiveInterval();
      pingIntervalRef.current = setTimeout(() => {
        sendPing();
        scheduleNextPing(); // Reschedule with potentially new interval
      }, interval);
    };

    scheduleNextPing();
  }, [sendPing, connectionQuality]);

  // Stop ping interval
  const stopPingInterval = useCallback(() => {
    if (pingIntervalRef.current) {
      clearTimeout(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
  }, []);

  // Connect to host
  const connect = useCallback(() => {
    if (peerRef.current && !peerRef.current.destroyed) {
      peerRef.current.destroy();
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Reset backoff counter on new connection attempt
    backoffRef.current.reset();
    setConnectionState(ClientConnectionState.CONNECTING);
    const signallingServer = getSignallingServerUrl();

    console.log('[P2P Client] Connecting to host:', configRefs.current.hostId, 'via signalling:', signallingServer);

    // Parse signalling server URL to extract host and port
    let peerConfig: any = { debug: 1 };

    if (signallingServer && signallingServer.startsWith('ws://')) {
      try {
        const url = new URL(signallingServer);
        peerConfig.host = url.hostname;
        peerConfig.port = parseInt(url.port);
        peerConfig.secure = false; // WebSocket, not WebSocket Secure
        peerConfig.path = '/peerjs'; // Default PeerServer path
        console.log('[P2P Client] Using custom signalling server:', {
          host: peerConfig.host,
          port: peerConfig.port,
          secure: peerConfig.secure,
          path: peerConfig.path
        });
      } catch (e) {
        console.warn('[P2P Client] Failed to parse signalling server URL, using defaults:', signallingServer, e);
      }
    } else if (signallingServer && signallingServer.startsWith('wss://')) {
      try {
        const url = new URL(signallingServer);
        peerConfig.host = url.hostname;
        peerConfig.port = parseInt(url.port) || 443;
        peerConfig.secure = true; // WebSocket Secure
        peerConfig.path = '/peerjs'; // Default PeerServer path
        console.log('[P2P Client] Using secure signalling server:', {
          host: peerConfig.host,
          port: peerConfig.port,
          secure: peerConfig.secure,
          path: peerConfig.path
        });
      } catch (e) {
        console.warn('[P2P Client] Failed to parse signalling server URL, using defaults:', signallingServer, e);
      }
    } else {
      console.log('[P2P Client] Using default public PeerJS server');
    }

    // Create peer for this client
    const peer = new Peer(peerConfig);

    peerRef.current = peer;

    peer.on('open', (id) => {
      console.log('[P2P Client] Peer opened with ID:', id);

      // Connect to host
      const conn = peer.connect(configRefs.current.hostId, {
        reliable: true,
      });

      connectionRef.current = conn;

      conn.on('open', () => {
        console.log('[P2P Client] Connection opened to host');

        // Send handshake with persistent client info
        const handshake: HandshakeMessage = {
          id: generateUUID(),
          category: MessageCategory.CONTROL,
          timestamp: Date.now(),
          senderId: id,
          type: 'HANDSHAKE',
          payload: {
            clientId: id,
            clientName: configRefs.current.clientName,
            protocolVersion: PROTOCOL_VERSION,
            persistentClientId: configRefs.current.persistentClientId,
            currentTeamId: configRefs.current.currentTeamId,
            isModerator: configRefs.current.isModerator || false
          }
        };

        conn.send(handshake);
      });

      conn.on('data', (data) => {
        try {
          // Parse JSON if data is string (PeerJS can send both string and object)
          const message = typeof data === 'string' ? JSON.parse(data) : data as P2PSMessage;

          // Handle handshake response
          if (message.type === 'HANDSHAKE_RESPONSE') {
            console.log('[P2P Client] Handshake confirmed, setting state to CONNECTED');

            // Reset backoff on successful connection
            backoffRef.current.reset();

            setConnectionState(ClientConnectionState.CONNECTED);
            startPingInterval();
            // Notify connection state change with current quality
            notifyConnectionChange(ClientConnectionState.CONNECTED, connectionQuality);
            console.log('[P2P Client] State set to CONNECTED, connection.open:', conn.open);
          } else if (message.type === 'PONG') {
            // Handle pong - calculate RTT
            const pong = message as PongMessage;
            const rtt = Date.now() - pong.payload.originalTimestamp;

            pingTimesRef.current.push(rtt);
            if (pingTimesRef.current.length > 10) {
              pingTimesRef.current.shift();
            }
            // Update quality and notify connection is still alive
            const quality = updateConnectionQuality();

            // Adjust backoff strategy based on connection quality
            if (quality) {
              backoffRef.current.adjustForConnectionQuality(quality);
              // Notify with current state to show connection is still working
              notifyConnectionChange(ClientConnectionState.CONNECTED, quality);
            }
          } else {
            // Forward to app
            configRefs.current.onMessage?.(message);
          }
        } catch (err) {
          console.error('[P2P Client] Error handling message:', err);
        }
      });

      conn.on('close', () => {
        console.log('[P2P Client] Connection closed');
        setConnectionState(ClientConnectionState.DISCONNECTED);
        stopPingInterval();
        // Notify connection state change
        notifyConnectionChange(ClientConnectionState.DISCONNECTED, connectionQuality);

        // Don't auto-reconnect - let app handle reconnection
        // This prevents issues with signalling server disconnects
      });

      conn.on('error', (err) => {
        console.error('[P2P Client] Connection error:', err);
        setConnectionState(ClientConnectionState.ERROR);
        configRefs.current.onError?.(err as Error);
        // Notify connection state change
        notifyConnectionChange(ClientConnectionState.ERROR, connectionQuality);
      });
    });

    peer.on('error', async (err) => {
      console.error('[P2P Client] Peer error:', err);

      // Provide specific diagnostics for common signalling server issues
      const errType = (err as any).type;
      if (errType === 'peer-unavailable') {
        console.error('[P2P Client] ❌ Host peer not found. Make sure the host is running and accessible.');
      } else if (errType === 'network' || (err as any).message?.includes('Failed to fetch')) {
        console.error('[P2P Client] ❌ Network error accessing signalling server.');
        console.error('[P2P Client] 🔧 Possible fixes:');
        console.error('[P2P Client]    1. Check if signalling server is running at:', signallingServer);
        console.error('[P2P Client]    2. Verify the server supports HTTP API (not just WebSocket)');
        console.error('[P2P Client]    3. Check CORS settings on the server');
        console.error('[P2P Client]    4. Try using the default public PeerJS server');

        // Run automatic diagnostics
        console.error('[P2P Client] 🔍 Running automatic diagnostics...');
        const { diagnoseSignallingServer } = await import('../utils/signallingServerTest');
        await diagnoseSignallingServer(signallingServer);
      } else if (errType === 'server-error') {
        console.error('[P2P Client] ❌ Signalling server error. The server might be misconfigured.');
      } else if (errType === 'ssl-unavailable') {
        console.error('[P2P Client] ❌ SSL not available. Try using ws:// instead of wss://');
      }

      setConnectionState(ClientConnectionState.ERROR);
      configRefs.current.onError?.(err as Error);
    });

    peer.on('disconnected', () => {
      console.warn('[P2P Client] Peer disconnected from signalling server');

      // Use exponential backoff for reconnection
      if (backoffRef.current.shouldRetry()) {
        const delay = backoffRef.current.getNextDelay();

        if (delay > 0) {
          console.log('[P2P Client] 🔄 Reconnecting in', delay, 'ms (attempt', backoffRef.current.getCurrentRetry(), ')');
          setConnectionState(ClientConnectionState.RECONNECTING);

          setTimeout(() => {
            if (peer && !peer.destroyed) {
              peer.reconnect();
            }
          }, delay);
        } else {
          console.error('[P2P Client] ❌ Max reconnection retries reached');
          setConnectionState(ClientConnectionState.ERROR);
          configRefs.current.onError?.(new Error('Max reconnection retries reached'));
        }
      } else {
        console.error('[P2P Client] ❌ Reconnection abandoned');
        setConnectionState(ClientConnectionState.ERROR);
        configRefs.current.onError?.(new Error('Reconnection abandoned'));
      }
    });
  }, [configRefs.current.hostId, getSignallingServerUrl, startPingInterval, stopPingInterval, updateConnectionQuality]);

  // Disconnect
  const disconnect = useCallback(() => {
    stopPingInterval();

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (connectionRef.current) {
      connectionRef.current.close();
      connectionRef.current = null;
    }

    if (peerRef.current && !peerRef.current.destroyed) {
      peerRef.current.destroy();
      peerRef.current = null;
    }

    setConnectionState(ClientConnectionState.DISCONNECTED);
  }, [stopPingInterval]);

  // Send message to host
  const send = useCallback((message: Omit<P2PSMessage, 'id' | 'timestamp' | 'senderId'>) => {
    const conn = connectionRef.current;
    console.log('📡 [P2P SEND] Attempting to send message:', message.type);
    console.log('📡 [P2P SEND] Connection exists:', !!conn, 'Connection open:', conn?.open, 'Peer exists:', !!peerRef.current);

    if (!conn || !conn.open || !peerRef.current) {
      console.warn('❌ [P2P SEND] Not connected, cannot send message. Connection state:', {
        hasConnection: !!conn,
        connectionOpen: conn?.open,
        hasPeer: !!peerRef.current,
        peerId: peerRef.current?.id
      });
      return false;
    }

    const fullMessage: P2PSMessage = {
      ...message,
      id: generateUUID(),
      timestamp: Date.now(),
      senderId: peerRef.current?.id || ''
    } as P2PSMessage;

    console.log('📤 [P2P SEND] Sending full message:', {
      id: fullMessage.id,
      type: fullMessage.type,
      category: fullMessage.category,
      timestamp: fullMessage.timestamp,
      senderId: fullMessage.senderId,
      payload: fullMessage.payload
    });

    try {
      conn.send(fullMessage);
      console.log('✅ [P2P SEND] Message sent successfully via WebRTC!');
      return true;
    } catch (err) {
      console.error('❌ [P2P SEND] Error sending message:', err);
      return false;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Cleanup directly without calling disconnect to avoid dependency issues
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (connectionRef.current) {
        connectionRef.current.close();
        connectionRef.current = null;
      }
      if (peerRef.current && !peerRef.current.destroyed) {
        peerRef.current.destroy();
        peerRef.current = null;
      }
    };
  }, []);

  // Return connection state and quality for external checking
  const isConnected = connectionState === ClientConnectionState.CONNECTED;
  const isConnecting = connectionState === ClientConnectionState.CONNECTING || connectionState === ClientConnectionState.RECONNECTING;

  // Get comprehensive quality report
  const getQualityReport = useCallback(() => {
    return qualityMonitorRef.current.getQualityReport();
  }, []);

  // Get adaptive recommendations
  const getAdaptiveRecommendations = useCallback(() => {
    return qualityMonitorRef.current.getAdaptiveRecommendations();
  }, []);

  return {
    connectionState,
    connectionQuality,
    isConnected,
    isConnecting,
    connect,
    disconnect,
    send,
    connectionRef, // Export connection ref for debugging
    qualityReport, // Export quality report for UI
    getQualityReport, // Export method to get detailed quality report
    getAdaptiveRecommendations, // Export method to get adaptive recommendations
  };
}