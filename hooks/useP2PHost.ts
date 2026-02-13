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
import { storage, STORAGE_KEYS } from './useLocalStorage';
import { generateUUID, getSignallingServer } from '../utils';

/**
 * P2P Host Hook - manages WebRTC connections for the host
 * Handles multiple client connections with automatic reconnection
 */
export const useP2PHost = (config: P2PConfig & {
  onClientConnected?: (clientId: string, data: { name: string; teamId?: string; persistentClientId?: string }) => void;
  onClientDisconnected?: (clientId: string) => void;
  onBuzzReceived?: (data: { clientId: string; clientName: string; teamId?: string; buzzTime: number }) => void;
}) => {
  const peerRef = useRef<Peer | null>(null);
  const connectionsRef = useRef<Map<string, DataConnection>>(new Map());
  const pendingConnectionsRef = useRef<Map<string, DataConnection>>(new Map());
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Get signalling server URL based on LAN mode
  const getSignallingServerUrl = useCallback(() => {
    const lockedIp = config.isLanMode ? storage.get(STORAGE_KEYS.LOCKED_IP) : undefined;
    return getSignallingServer(config.isLanMode, config.signallingServer, lockedIp);
  }, [config.isLanMode, config.signallingServer]);

  // Initialize PeerJS
  useEffect(() => {
    const signallingServer = getSignallingServerUrl();
    console.log('[P2P Host] Initializing with signalling server:', signallingServer);

    const peer = new Peer(config.hostId, {
      debug: 1, // INFO level
    });

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

    // Store in pending until handshake complete
    pendingConnectionsRef.current.set(clientId, conn);

    // Set up data handler BEFORE connection is open
    conn.on('data', (data) => {
      try {
        const message = data as P2PSMessage;

        // Handle handshake
        if (message.type === 'HANDSHAKE') {
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
      config.onClientDisconnected?.(clientId);
    });

    conn.on('error', (err) => {
      console.error('[P2P Host] Connection error:', clientId, err);
      connectionsRef.current.delete(clientId);
      pendingConnectionsRef.current.delete(clientId);
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
  }, [config]);

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

  // Broadcast message to all connected clients
  const broadcast = useCallback((message: Omit<P2PSMessage, 'id' | 'timestamp' | 'senderId'>) => {
    const fullMessage: P2PSMessage = {
      ...message,
      id: generateUUID(),
      timestamp: Date.now(),
      senderId: config.hostId
    } as P2PSMessage;

    connectionsRef.current.forEach((conn, peerId) => {
      if (conn.open) {
        try {
          conn.send(fullMessage);
        } catch (err) {
          console.error('[P2P Host] Error sending to', peerId, err);
        }
      }
    });

    return fullMessage;
  }, [config.hostId]);

  // Send to specific client
  const sendToClient = useCallback((clientId: string, message: Omit<P2PSMessage, 'id' | 'timestamp' | 'senderId'>) => {
    const conn = connectionsRef.current.get(clientId);
    if (!conn || !conn.open) {
      console.warn('[P2P Host] Client not connected:', clientId);
      return false;
    }

    const fullMessage: P2PSMessage = {
      ...message,
      id: generateUUID(),
      timestamp: Date.now(),
      senderId: config.hostId
    } as P2PSMessage;

    try {
      conn.send(fullMessage);
      return true;
    } catch (err) {
      console.error('[P2P Host] Error sending to', clientId, err);
      return false;
    }
  }, [config.hostId]);

  // Get connection count
  const getConnectionCount = useCallback(() => {
    return connectionsRef.current.size;
  }, []);

  // Get all connected client IDs
  const getConnectedClients = useCallback(() => {
    return Array.from(connectionsRef.current.keys());
  }, []);

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
  }, []);

  return {
    isReady,
    error,
    hostId: config.hostId,
    connectionCount: getConnectionCount(),
    connectedClients: getConnectedClients(),
    broadcast,
    sendToClient,
    disconnectClient,
    disconnectAll,
  };
};
