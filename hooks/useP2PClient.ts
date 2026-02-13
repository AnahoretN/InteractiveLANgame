import { useEffect, useRef, useCallback, useState } from 'react';
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

// Connection state enum (exported for use in callbacks)
export enum ClientConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error'
}

interface P2PClientConfig {
  clientName: string;
  hostId: string;
  isLanMode?: boolean;
  signallingUrl?: string;
  persistentClientId?: string;  // Stored client ID for reconnection
  currentTeamId?: string;        // Current team ID (if any)
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

  // Ping tracking
  const pingTimesRef = useRef<number[]>([]);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

    // Update state if quality changed significantly
    const oldQuality = connectionQuality;
    if (Math.abs(newQuality.healthScore - oldQuality.healthScore) > 5 ||
        Math.abs(newQuality.rtt - oldQuality.rtt) > 10) {
      setConnectionQuality(newQuality);
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

  // Start ping interval
  const startPingInterval = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
    }

    pingIntervalRef.current = setInterval(() => {
      sendPing();
    }, 5000); // Ping every 5 seconds
  }, [sendPing]);

  // Stop ping interval
  const stopPingInterval = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
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

    setConnectionState(ClientConnectionState.CONNECTING);
    const signallingServer = getSignallingServerUrl();

    console.log('[P2P Client] Connecting to host:', configRefs.current.hostId, 'via signalling:', signallingServer);

    // Create peer for this client
    const peer = new Peer({
      debug: 1,
    });

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
            currentTeamId: configRefs.current.currentTeamId
          }
        };

        conn.send(handshake);
      });

      conn.on('data', (data) => {
        try {
          const message = data as P2PSMessage;

          // Handle handshake response
          if (message.type === 'HANDSHAKE_RESPONSE') {
            console.log('[P2P Client] Handshake confirmed, setting state to CONNECTED');
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
            // Notify with current state to show connection is still working
            if (quality) {
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

    peer.on('error', (err) => {
      console.error('[P2P Client] Peer error:', err);
      setConnectionState(ClientConnectionState.ERROR);
      configRefs.current.onError?.(err as Error);
    });

    peer.on('disconnected', () => {
      console.warn('[P2P Client] Peer disconnected from signalling server');
      // Try to reconnect
      setTimeout(() => {
        if (peer && !peer.destroyed) {
          peer.reconnect();
        }
      }, 1000);
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
    if (!conn || !conn.open || !peerRef.current) {
      console.warn('[P2P Client] Not connected, cannot send message');
      return false;
    }

    const fullMessage: P2PSMessage = {
      ...message,
      id: generateUUID(),
      timestamp: Date.now(),
      senderId: peerRef.current?.id || ''
    } as P2PSMessage;

    try {
      conn.send(fullMessage);
      return true;
    } catch (err) {
      console.error('[P2P Client] Error sending message:', err);
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

  // Log connection state for debugging
  console.log('[P2P Client] State check - connectionState:', connectionState, 'isConnected:', isConnected, 'conn.open:', connectionRef.current?.open);

  return {
    connectionState,
    connectionQuality,
    isConnected,
    isConnecting,
    connect,
    disconnect,
    send,
    connectionRef, // Export connection ref for debugging
  };
};
