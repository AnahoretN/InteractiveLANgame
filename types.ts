// Team interface
export interface Team {
  id: string;
  name: string;
  createdAt: number;
  lastUsedAt: number;  // Timestamp when last player joined/left
  score?: number;
}

// Team score interface (for game play)
export interface TeamScore {
  teamId: string;
  teamName: string;
  score: number;
}

// Connection Quality Metrics (simplified - no network)
export interface ConnectionQuality {
  rtt: number;           // Round-trip time in ms
  packetLoss: number;    // Percentage of lost packets
  jitter: number;        // Variance in latency
  lastPing: number;      // Timestamp of last successful ping
  healthScore: number;   // 0-100 score based on all metrics
}

// Extended client info with health tracking
export interface ClientHealth {
  id: string;
  name: string;
  joinedAt: number;
  teamId?: string;
  lastSeen: number;         // Last activity timestamp
  connectionQuality: ConnectionQuality;
  status: 'active' | 'stale' | 'disconnected';
}

// Connection status enum
export enum ConnectionStatus {
  DISCONNECTED = 'disconnected',
  INITIALIZING = 'initializing',
  WAITING = 'waiting',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error'
}

// ============================================================
// P2P Message Types for WebRTC/PeerJS Communication
// ============================================================

// Message category - determines delivery priority and handling
export enum MessageCategory {
  STATE = 'state',           // State-changing messages (guaranteed delivery, ordered)
  EVENT = 'event',           // Events like buzz, button press (low latency)
  SYNC = 'sync',             // State synchronization (periodic, can be dropped)
  CONTROL = 'control'        // Connection control (join, leave, ping)
}

// Base message interface
export interface P2PMessage {
  id: string;                // Unique message ID for deduplication
  category: MessageCategory;
  timestamp: number;
  senderId: string;
}

// STATE: Client joins/leaves team
export interface TeamStateMessage extends P2PMessage {
  category: MessageCategory.STATE;
  type: 'JOIN_TEAM' | 'LEAVE_TEAM';
  payload: {
    clientId: string;
    clientName: string;
    teamId?: string;
    teamName?: string;
  };
}

// STATE: Client confirmed by host (removed from TeamStateMessage to avoid conflict)
export interface TeamConfirmedMessage extends P2PMessage {
  category: MessageCategory.STATE;
  type: 'TEAM_CONFIRMED';
  payload: {
    clientId: string;  // The client ID being confirmed
  };
}

// STATE: Score updates
export interface ScoreStateMessage extends P2PMessage {
  category: MessageCategory.STATE;
  type: 'UPDATE_SCORE';
  payload: {
    teamId: string;
    score: number;
    delta: number;
  };
}

// STATE: Buzzer state changes
export interface BuzzerStateMessage extends P2PMessage {
  category: MessageCategory.STATE;
  type: 'BUZZER_STATE';
  payload: {
    active: boolean;
    timerPhase: 'reading' | 'response' | 'complete' | 'inactive';
    readingTimerRemaining: number;
    responseTimerRemaining: number;
    handicapActive: boolean;
    handicapTeamId?: string;
  };
}

// EVENT: Client buzzed
export interface BuzzEventMessage extends P2PMessage {
  category: MessageCategory.EVENT;
  type: 'BUZZ';
  payload: {
    clientId: string;
    clientName: string;
    teamId?: string;
    teamName?: string;
    buzzTime: number;
  };
}

// EVENT: Super game bet placed
export interface SuperGameBetMessage extends P2PMessage {
  category: MessageCategory.EVENT;
  type: 'SUPER_GAME_BET';
  payload: {
    teamId: string;
    teamName: string;
    bet: number;
  };
}

// EVENT: Super game answer submitted
export interface SuperGameAnswerMessage extends P2PMessage {
  category: MessageCategory.EVENT;
  type: 'SUPER_GAME_ANSWER';
  payload: {
    teamId: string;
    answer: string;
  };
}

// SYNC: Periodic state sync from host to clients
export interface StateSyncMessage extends P2PMessage {
  category: MessageCategory.SYNC;
  type: 'STATE_SYNC';
  payload: {
    buzzerState: {
      active: boolean;
      timerPhase: 'reading' | 'response' | 'complete' | 'inactive';
      readingTimerRemaining: number;
      responseTimerRemaining: number;
      handicapActive: boolean;
      handicapTeamId?: string;
    };
    sessionVersion: string;
    teams: Array<{ id: string; name: string; score?: number }>;
    superGamePhase: 'idle' | 'placeBets' | 'showQuestion' | 'showWinner';
  };
}

// CONTROL: Client handshake
export interface HandshakeMessage extends P2PMessage {
  category: MessageCategory.CONTROL;
  type: 'HANDSHAKE';
  payload: {
    clientId: string;
    clientName: string;
    protocolVersion: string;
    persistentClientId?: string;  // Stored client ID for reconnection
    currentTeamId?: string;         // Current team ID (if any)
  };
}

// CONTROL: Host handshake response
export interface HandshakeResponseMessage extends P2PMessage {
  category: MessageCategory.CONTROL;
  type: 'HANDSHAKE_RESPONSE';
  payload: {
    hostId: string;
    sessionVersion: string;
    teams: Team[];
    currentTime: number;
  };
}

// CONTROL: Ping/Pong for connection quality
export interface PingMessage extends P2PMessage {
  category: MessageCategory.CONTROL;
  type: 'PING';
  payload: {
    timestamp: number;
  };
}

export interface PongMessage extends P2PMessage {
  category: MessageCategory.CONTROL;
  type: 'PONG';
  payload: {
    originalTimestamp: number;
    serverTimestamp: number;
  };
}

// EVENT: Generic broadcast message for arbitrary data
export interface BroadcastMessage extends P2PMessage {
  category: MessageCategory.EVENT;
  type: 'BROADCAST';
  payload: unknown;
}

// EVENT: Team created/updated
export interface TeamUpdateMessage extends P2PMessage {
  category: MessageCategory.EVENT;
  type: 'TEAM_UPDATE';
  payload: {
    teamId: string;
    teamName: string;
  };
}

// SYNC: Full teams list sync
export interface TeamsSyncMessage extends P2PMessage {
  category: MessageCategory.SYNC;
  type: 'TEAMS_SYNC';
  payload: {
    teams: Array<{ id: string; name: string }>;
  };
}

// SYNC: Commands/Rooms list from host
export interface CommandsListMessage extends P2PMessage {
  category: MessageCategory.SYNC;
  type: 'COMMANDS_LIST';
  payload: {
    commands: Array<{ id: string; name: string }>;
  };
}

// SYNC: Request commands list from host
export interface GetCommandsMessage extends P2PMessage {
  category: MessageCategory.SYNC;
  type: 'GET_COMMANDS';
  payload: {};
}

// SYNC: Request full state sync from host
export interface StateSyncRequestMessage extends P2PMessage {
  category: MessageCategory.SYNC;
  type: 'STATE_SYNC_REQUEST';
  payload: {};
}

// Union type for all P2P messages
export type P2PSMessage =
  | TeamStateMessage
  | TeamConfirmedMessage
  | ScoreStateMessage
  | BuzzerStateMessage
  | BuzzEventMessage
  | SuperGameBetMessage
  | SuperGameAnswerMessage
  | StateSyncMessage
  | HandshakeMessage
  | HandshakeResponseMessage
  | PingMessage
  | PongMessage
  | BroadcastMessage
  | TeamUpdateMessage
  | TeamsSyncMessage
  | CommandsListMessage
  | GetCommandsMessage
  | StateSyncRequestMessage;

// Message handler type
export type MessageHandler = (message: P2PSMessage, peerId: string) => void;

// P2P connection configuration
export interface P2PConfig {
  hostId: string;
  isHost: boolean;
  isLanMode: boolean;
  signallingServer?: string;  // URL of signalling server
  onMessage?: MessageHandler;
  onPeerConnected?: (peerId: string) => void;
  onPeerDisconnected?: (peerId: string) => void;
  onError?: (error: Error) => void;
}

// Connection info encoded in QR/link
export interface ConnectionInfo {
  hostId: string;
  hostIp?: string;       // For LAN mode
  signallingUrl?: string; // For Internet mode
  mode: 'lan' | 'internet';
  port?: number;
}

// Protocol version for compatibility checking
export const PROTOCOL_VERSION = '1.0.0';
