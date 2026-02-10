/**
 * Network Connection Module
 *
 * WebSocket-based communication with RELAY fallback.
 * P2P WebRTC functionality removed for stability and simplicity.
 */

import { PeerMessage } from '../types';

export type SignallingMessage =
  | { type: 'WELCOME'; serverTime: number }
  | { type: 'REGISTERED'; peerId: string; serverTime: number }
  | { type: 'HOST_INFO'; hostId: string; hostName: string; serverTime: number }
  | { type: 'HOST_LIST'; hosts: Array<{ id: string; name: string; clientCount: number; createdAt: number }>; serverTime: number }
  | { type: 'HOST_DISCONNECTED'; hostId: string; serverTime: number }
  | { type: 'CLIENT_DISCONNECTED'; clientId: string; serverTime: number }
  | { type: 'CLIENT_ANNOUNCE'; clientId: string; clientName: string; serverTime: number }
  | { type: 'HEARTBEAT_ACK'; serverTime: number }
  | { type: 'RELAY'; from: string; to: string; payload: GameMessage; serverTime: number }
  | { type: 'ERROR'; code: string; message: string; serverTime: number };

// Re-export PeerMessage as GameMessage for backwards compatibility
export type GameMessage = PeerMessage;

export interface P2PConfig {
  signallingUrl: string;
  peerId: string;
  peerName: string;
  role: 'host' | 'client';
  targetPeerId?: string;
}

export interface P2PEvents {
  onSignallingConnected?: () => void;
  onConnected?: (peerId: string) => void;
  onDisconnected: (peerId: string) => void;
  onData: (data: PeerMessage, peerId: string) => void;
  onClientConnected?: (clientId: string, clientName: string) => void;
  onClientDisconnected?: (clientId: string) => void;
  onError?: (error: Error) => void;
}

/**
 * Network Connection Manager
 * Manages WebSocket connection to signalling server with RELAY message routing
 */
export class P2PManager {
  private config: P2PConfig;
  private events: P2PEvents;
  private ws: WebSocket | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private isDestroyed = false;

  constructor(config: P2PConfig, events: P2PEvents) {
    this.config = config;
    this.events = events;
  }

  /**
   * Connect to the signalling server
   */
  async connect(): Promise<void> {
    if (this.isDestroyed) return;

    return new Promise((resolve, reject) => {
      try {
        // Clean up any existing websocket first
        if (this.ws) {
          this.ws.close();
          this.ws = null;
        }

        this.ws = new WebSocket(this.config.signallingUrl);

        this.ws.onopen = () => {
          console.log(`[Network] Connected to signalling server as ${this.config.role}`);

          // Register with signalling server
          this.sendSignallingMessage({
            type: this.config.role === 'host' ? 'REGISTER_HOST' : 'REGISTER_CLIENT',
            peerId: this.config.peerId,
            peerName: this.config.peerName,
            targetHostId: this.config.targetPeerId
          });

          // Start heartbeat
          this.startHeartbeat();

          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message: SignallingMessage = JSON.parse(event.data);
            this.handleSignallingMessage(message);
          } catch (e) {
            console.error('[Network] Failed to parse signalling message:', e);
          }
        };

        this.ws.onclose = () => {
          if (!this.isDestroyed) {
            console.log('[Network] Disconnected from signalling server, reconnecting in 2s...');
            this.scheduleReconnect();
          }
        };

        this.ws.onerror = (error) => {
          console.error('[Network] WebSocket error:', error);
          this.events.onError?.(new Error('WebSocket connection error'));
        };
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Handle incoming messages from the signalling server
   */
  private handleSignallingMessage(message: SignallingMessage): void {
    switch (message.type) {
      case 'WELCOME':
        console.log('[Network] Server welcome received');
        break;

      case 'REGISTERED':
        console.log(`[Network] Registered as ${message.peerId}`);
        this.events.onSignallingConnected?.();
        break;

      case 'HOST_INFO':
        console.log(`[Network] Connected to host: ${message.hostName}`);
        break;

      case 'CLIENT_ANNOUNCE':
        console.log(`[Network] Client connected: ${message.clientName}`);
        this.events.onClientConnected?.(message.clientId, message.clientName);
        break;

      case 'CLIENT_DISCONNECTED':
        console.log(`[Network] Client disconnected: ${message.clientId}`);
        this.events.onDisconnected?.(message.clientId);
        break;

      case 'HOST_DISCONNECTED':
        console.log(`[Network] Host disconnected: ${message.hostId}`);
        this.events.onDisconnected?.(message.hostId);
        break;

      case 'ERROR':
        console.error(`[Network] Server error: ${message.code} - ${message.message}`);
        this.events.onError?.(new Error(message.message));
        break;

      case 'HEARTBEAT_ACK':
        // Silent acknowledgment
        break;

      case 'RELAY':
        // Received relayed message from signalling server
        this.events.onData(message.payload, message.from);
        break;

      case 'HOST_LIST':
        // Host list received, no action needed for RELAY mode
        break;
    }
  }

  /**
   * Send data to a specific peer via RELAY
   */
  sendTo(peerId: string, data: GameMessage): boolean {
    return this.sendSignallingMessage({
      type: 'RELAY',
      from: this.config.peerId,
      to: peerId,
      payload: data
    });
  }

  /**
   * Send message through signalling server
   */
  private sendSignallingMessage(message: any): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      const msgStr = JSON.stringify(message);
      // Only log important messages, not HEARTBEAT or RELAY
      if (message.type !== 'HEARTBEAT' && message.type !== 'RELAY') {
        console.log(`[Network] Sending:`, message.type);
      }
      this.ws.send(msgStr);
      return true;
    } catch (e) {
      console.error('[Network] Failed to send message:', e);
      return false;
    }
  }

  /**
   * Start heartbeat to signalling server
   */
  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.sendSignallingMessage({
          type: 'HEARTBEAT',
          from: this.config.peerId
        });
      }
    }, 10000); // Every 10 seconds
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectTimeout = setTimeout(() => {
      if (!this.isDestroyed) {
        console.log('[Network] Attempting to reconnect...');
        this.connect().catch((e) => {
          console.error('[Network] Reconnection failed:', e);
        });
      }
    }, 2000);
  }

  /**
   * Check if connected to signalling server
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Destroy all connections
   */
  destroy(): void {
    this.isDestroyed = true;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

/**
 * Generate a random peer ID
 */
export function generatePeerId(): string {
  return `net_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Get the signalling server URL
 */
export function getSignallingServerUrl(ip: string, port = 9000): string {
  return `ws://${ip}:${port}`;
}
