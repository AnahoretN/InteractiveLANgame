// Existing Team interface
export interface Team {
  id: string;
  name: string;
  createdAt: number;
  lastUsedAt: number;  // Timestamp when last player joined/left
}

// Connection Quality Metrics
export interface ConnectionQuality {
  rtt: number;           // Round-trip time in ms
  packetLoss: number;    // Percentage of lost packets
  jitter: number;        // Variance in latency
  lastPing: number;      // Timestamp of last successful ping
  healthScore: number;   // 0-100 score based on all metrics
}

// Queued message for delivery guarantee
export interface QueuedMessage {
  id: string;
  payload: PeerMessage;
  attempts: number;
  maxAttempts: number;
  timestamp: number;
  priority: 'low' | 'normal' | 'high';
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

// Discriminated Union for better type safety across different message types
export type PeerMessage =
  | { type: 'JOIN'; sentAt: number; messageId: string; userName: string; persistentId?: string }
  | { type: 'HEARTBEAT'; sentAt: number; messageId: string; userName: string }
  | { type: 'PING'; sentAt: number; messageId: string; userName: string } // Reply from phone
  | { type: 'GET_TEAMS' } // Client asks for teams
  | { type: 'TEAM_LIST'; teams: Team[] } // Host sends teams
  | { type: 'CREATE_TEAM'; teamId: string; teamName: string; userName: string } // Client creates team
  | { type: 'JOIN_TEAM'; teamId: string; userName: string } // Client joins team
  // NEW: Team state synchronization - host asks clients for their current team
  | { type: 'TEAM_STATE_REQUEST' }
  | { type: 'TEAM_STATE_RESPONSE'; clientId: string; clientName: string; teamId?: string; teamName?: string }
  // NEW: Reconnect - client reconnecting after page refresh/disconnect
  | { type: 'RECONNECT'; userName: string; persistentId: string; teamId?: string; teamName?: string }
  // NEW: Kick/remove client
  | { type: 'KICK_CLIENT'; clientId: string; reason?: string }
  // NEW: Team deleted - host tells clients this team no longer exists
  | { type: 'TEAM_DELETED'; teamId: string }
  // NEW: Health check messages
  | { type: 'HEALTH_CHECK'; sentAt: number; messageId: string }
  | { type: 'HEALTH_RESPONSE'; requestSentAt: number; receivedAt: number; messageId: string }
  // NEW: State synchronization
  | { type: 'REQUEST_STATE_SYNC' }
  | { type: 'STATE_SYNC'; clients: ClientHealth[]; teams: Team[] }
  // NEW: Message acknowledgment
  | { type: 'ACK'; messageId: string }
  // NEW: Connection quality report
  | { type: 'QUALITY_REPORT'; rtt: number; jitter: number }
  // NEW: Buzzer state control
  | { type: 'BUZZER_STATE'; active: boolean; timerPhase?: 'reading' | 'response' | 'complete' | 'inactive'; readingTimerRemaining?: number; responseTimerRemaining?: number; handicapActive?: boolean; teamId?: string }
  | { type: 'BUZZ'; teamId: string; teamName?: string; clientId: string; sentAt: number }
  | { type: 'BUZZ_ACK'; buzzId: string }
  // NEW: Clear cache - host tells clients to clear all their data
  | { type: 'CLEAR_CACHE' }
  // NEW: Super Game messages
  | { type: 'SUPER_GAME_PLACE_YOUR_BETS'; enabledThemes: string[]; maxBet: number } // Show bet input on mobile
  | { type: 'SUPER_GAME_BET'; teamId: string; bet: number; clientId: string }
  | { type: 'SUPER_GAME_BET_ACK'; teamId: string } // Acknowledge bet received
  | { type: 'SUPER_GAME_SHOW_QUESTION'; themeId: string; themeName: string; questionText: string; questionMedia?: { type: 'image' | 'video' | 'audio'; url?: string } }
  | { type: 'SUPER_GAME_TEAM_READY'; teamId: string } // Team submitted answer
  | { type: 'SUPER_GAME_REVEAL_ANSWERS' } // Show team answers to host
  | { type: 'SUPER_GAME_TEAM_ANSWER'; teamId: string; answer: string; clientId: string }
  | { type: 'SUPER_GAME_SHOW_WINNER'; winnerTeamName: string; finalScores: { teamId: string; teamName: string; score: number }[] }
  // NEW: Client requests current super game state (e.g., when pressing buzz)
  | { type: 'GET_SUPER_GAME_STATE' };

export interface TimeLog {
  id: string;
  userName: string;
  teamName?: string; // Added team name to logs
  sentAt: number;
  receivedAt: number;
  latency: number;
}

export enum ConnectionStatus {
  DISCONNECTED = 'disconnected',
  INITIALIZING = 'initializing',
  WAITING = 'waiting',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error'
}
