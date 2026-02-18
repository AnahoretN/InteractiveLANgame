import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from './Button';
import { Smartphone, ArrowRight, Settings, Users, Activity, Copy, RefreshCw, Plus, Check } from 'lucide-react';
import { Team, P2PSMessage, BuzzEventMessage, MessageCategory, BroadcastMessage, TeamsSyncMessage, CommandsListMessage, GetCommandsMessage } from '../types';
import { useSessionSettings } from '../hooks/useSessionSettings';
import { useP2PHost } from '../hooks/useP2PHost';
import { SettingsModal, GameSession, GameSelectorModal, type GamePack, type GameType } from './host';
import type { Round, Theme, RoundType } from './host/PackEditor';
import { TeamListItem, SimpleClientItem, NoTeamSection, ConnectedClient } from './host/ListItems';
import { TeamList, CommandsSection, HostSetupPanel } from './host';
import { storage, STORAGE_KEYS, generateHostUniqueId } from '../hooks/useLocalStorage';
import { useSyncEffects } from '../hooks/useSyncEffects';
import { generateUUID, getHealthBgColor } from '../utils';

// Helper function to get raw string from localStorage without JSON parsing
function getRawStorageValue(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export const HostView: React.FC = () => {
  const [hostId, setHostId] = useState<string>(() => {
    const saved = storage.get(STORAGE_KEYS.HOST_ID);
    return saved || 'host_' + Math.random().toString(36).substring(2, 10);
  });

  // Session ID (5 random chars) - displayed in lobby
  const [sessionId, setSessionId] = useState<string>(() => {
    const saved = storage.get<string>(STORAGE_KEYS.HOST_UNIQUE_ID);
    if (saved) {
      return saved.substring(0, 5);
    }
    const newId = generateHostUniqueId().substring(0, 5);
    storage.set(STORAGE_KEYS.HOST_UNIQUE_ID, newId);
    return newId;
  });

  // Host unique ID (12 chars) - used for client data binding
  const [hostUniqueId, setHostUniqueId] = useState<string>(() => {
    const saved = storage.get<string>(STORAGE_KEYS.HOST_UNIQUE_ID);
    return saved || generateHostUniqueId();
  });

  const [isSessionActive, setIsSessionActive] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [isLanMode, setIsLanMode] = useState<boolean>(true);
  const [ipInput, setIpInput] = useState<string>(() => {
    return storage.get(STORAGE_KEYS.LOCKED_IP) || '';
  });
  const [isIpLocked, setIsIpLocked] = useState<boolean>(() => {
    const storedIp = storage.get(STORAGE_KEYS.LOCKED_IP);
    // If IP is stored, consider it locked
    return storedIp !== null && storedIp !== '';
  });
  const [finalQrUrl, setFinalQrUrl] = useState<string>(() => {
    const saved = storage.get(STORAGE_KEYS.QR_URL) ?? '';
    // Validate saved URL - check for common corruptions like duplicated port
    if (saved && (saved.includes(':3000:3000') || saved.includes('%3A3000%3A3000'))) {
      console.warn('[HostView] Invalid URL in storage, clearing it');
      storage.remove(STORAGE_KEYS.QR_URL);
      return '';
    }
    return saved;
  });

  // State
  const [clients, setClients] = useState<Map<string, ConnectedClient>>(new Map());
  // Queue for pending TEAM_CONFIRMED messages (clientId -> teamId)
  const [pendingConfirmations, setPendingConfirmations] = useState<Map<string, string>>(new Map());
  // Queue for pending GET_COMMANDS requests (clientId requesting commands)
  const [pendingCommandsRequest, setPendingCommandsRequest] = useState<string | null>(null);

  // Wrapper to update clients - MUTATES the existing Map in-place instead of creating new one
  // This prevents loss of client data when setClients is called multiple times
  const updateClients = useCallback((updater: (prev: Map<string, ConnectedClient>) => Map<string, ConnectedClient>) => {
    setClients(prev => {
      // Apply updates to prev and return it (same reference)
      const updated = updater(prev);
      return updated;
    });
  }, []);

  const [teams, setTeams] = useState<Team[]>(() => {
    const saved = storage.get<string>(STORAGE_KEYS.TEAMS);
    if (!saved) return [];
    try {
      const parsed = JSON.parse(saved);
      // Migrate old teams without lastUsedAt
      return parsed.map((t: Team) => ({ ...t, lastUsedAt: t.lastUsedAt || t.createdAt }));
    } catch { return []; }
  });

  // Commands/Rooms state - synchronized with teams for quick join feature
  const [commands, setCommands] = useState<Array<{ id: string; name: string }>>(() => {
    // First try to load from teams storage (preferred source)
    const savedTeams = storage.get<string>(STORAGE_KEYS.TEAMS);
    if (savedTeams && typeof savedTeams === 'string' && savedTeams.trim() !== '' && savedTeams !== 'null' && savedTeams !== 'undefined') {
      try {
        const parsed = JSON.parse(savedTeams);
        if (Array.isArray(parsed)) {
          return parsed.map((t: Team) => ({ id: t.id, name: t.name }));
        }
      } catch (e) {
        console.error('[HostView] Failed to parse teams from storage:', e);
      }
    }
    // Fallback to old commands storage for backward compatibility
    const saved = getRawStorageValue(STORAGE_KEYS.COMMANDS);
    if (!saved || typeof saved !== 'string' || saved.trim() === '' || saved === 'null' || saved === 'undefined') return [];
    try {
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error('[HostView] Failed to parse commands from storage:', e);
      // Clear corrupted data
      storage.remove(STORAGE_KEYS.COMMANDS);
      return [];
    }
  });

  // Team/Command editing state
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editingTeamName, setEditingTeamName] = useState<string>('');

  // Create team input state
  const [showCreateTeamInput, setShowCreateTeamInput] = useState<boolean>(false);
  const [newTeamName, setNewTeamName] = useState<string>('');

  // Track which clients have buzzed (clientId -> timestamp when they buzzed)
  const [buzzedClients, setBuzzedClients] = useState<Map<string, number>>(new Map());

  // Track which clients are currently buzzing (for lobby list visual flash effect)
  const [buzzingClientIds, setBuzingClientIds] = useState<Set<string>>(new Set());

  // Link copy animation state
  const [linkCopied, setLinkCopied] = useState<boolean>(false);

  // Track which teams have buzzed (for visual flash effect) - only tracks recent buzzes
  const [buzzedTeamIds, setBuzzedTeamIds] = useState<Set<string>>(new Set());

  // Track late buzzes (teams that pressed after answering team was already determined)
  const [lateBuzzTeamIds, setLateBuzzTeamIds] = useState<Set<string>>(new Set());

  // Track buzzer state from GamePlay for GameSession
  const [buzzerState, setBuzzerState] = useState<{
    active: boolean;
    timerPhase?: 'reading' | 'response' | 'complete' | 'inactive';
    readingTimerRemaining: number;
    responseTimerRemaining: number;
    handicapActive: boolean;
    handicapTeamId?: string;
  }>({
    active: false,
    timerPhase: 'inactive',
    readingTimerRemaining: 0,
    responseTimerRemaining: 0,
    handicapActive: false
  });

  // Track the current answering team (the team that gets to answer the question)
  const [answeringTeamId, setAnsweringTeamId] = useState<string | null>(null);

  // Session version - changes when starting a new session, helps clients detect stale state
  // Load from storage or generate new one
  const [sessionVersion, setSessionVersion] = useState<string>(() => {
    const saved = storage.get(STORAGE_KEYS.SESSION_VERSION);
    return saved || `v_${Date.now()}`;
  });

  // Super Game state - track bets and answers from mobile clients
  const [superGameBets, setSuperGameBets] = useState<Array<{ teamId: string; bet: number; ready: boolean }>>([]);
  const [superGameAnswers, setSuperGameAnswers] = useState<Array<{ teamId: string; answer: string; revealed: boolean; submitted: boolean }>>([]);
  // Track super game phase for responding to GET_SUPER_GAME_STATE requests
  const [superGamePhase, setSuperGamePhase] = useState<'idle' | 'placeBets' | 'showQuestion' | 'showWinner'>('idle');
  const [superGameMaxBet, setSuperGameMaxBet] = useState<number>(100);
  // Trigger for state sync request (increments to trigger sync)
  const [stateSyncTrigger, setStateSyncTrigger] = useState<number>(0);

  // Session settings using custom hook
  const { settings: sessionSettings, updateSettings: updateSessionSettings } = useSessionSettings();
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);

  // Game selection
  const [selectedGame, setSelectedGame] = useState<GameType>('custom');
  const [selectedPacks, setSelectedPacks] = useState<GamePack[]>([]);
  const [selectedPackIds, setSelectedPackIds] = useState<string[]>([]);
  const [showGameSelector, setShowGameSelector] = useState<boolean>(false);

  // Handle save from game selector modal
  const handleSaveGameSelection = useCallback((gameType: GameType, packIds: string[], packs: GamePack[]) => {
    setSelectedGame(gameType);
    setSelectedPackIds(packIds);
    setSelectedPacks(packs);
  }, []);

  // Define removeClient early (needed by P2P callbacks)
  const removeClient = useCallback((clientId: string) => {
    setClients((prev: Map<string, ConnectedClient>) => {
      prev.delete(clientId);
      return prev;
    });
  }, []);

  // ============================================================
  // P2P Network Connection (WebRTC via PeerJS)
  // ============================================================

  // Get signalling server URL based on LAN mode
  const getSignallingServer = useCallback(() => {
    if (isLanMode && isIpLocked && ipInput && ipInput.trim() !== '') {
      return `ws://${ipInput}:9000`;
    }
    return undefined; // Use default public server
  }, [isLanMode, isIpLocked, ipInput]);

  // Initialize P2P host connection
  const p2pHost = useP2PHost({
    hostId: hostId,
    isHost: true,
    isLanMode: isLanMode,
    signallingServer: getSignallingServer(),
    onMessage: useCallback((message: P2PSMessage, peerId: string) => {
      console.log('[HostView] Received message from', peerId, message.type);

      // Handle incoming messages from clients
      switch (message.type) {
        case 'BUZZ': {
          const buzzMsg = message as BuzzEventMessage;
          const teamId = buzzMsg.payload.teamId;
          const buzzTime = buzzMsg.payload.buzzTime;

          // Use ref to get current buzzer state (not stale closure value)
          const currentBuzzerState = buzzerStateRef.current;
          console.log('[HostView] Buzz received from', buzzMsg.payload.clientName, 'clientId:', buzzMsg.payload.clientId, 'teamId:', teamId, 'buzzerState.active:', currentBuzzerState.active, 'timerPhase:', currentBuzzerState.timerPhase);

          // Only process buzzes during response phase when buzzer is active
          const isResponsePhase = currentBuzzerState.timerPhase === 'response' && currentBuzzerState.active;

          // Use clientId from payload instead of peerId to match the client's actual ID
          setBuzzedClients((prev: Map<string, number>) => new Map(prev).set(buzzMsg.payload.clientId, buzzTime));

          if (isResponsePhase && teamId) {
            // Check if we already have an answering team (using ref for current value)
            const currentAnsweringTeamId = answeringTeamIdRef.current;
            if (!currentAnsweringTeamId) {
              // First buzz during response phase - this team gets to answer!
              console.log('[HostView] First buzz! Setting answering team:', teamId);
              setAnsweringTeamId(teamId);
              setBuzzedTeamIds(prev => new Set(prev).add(teamId));
              // Clear after 500ms
              setTimeout(() => {
                setBuzzedTeamIds(prev => {
                  const newSet = new Set(prev);
                  newSet.delete(teamId);
                  return newSet;
                });
              }, 500);
            } else {
              // Late buzz - another team already won this round
              console.log('[HostView] Late buzz from:', teamId, '(answering team already set:', currentAnsweringTeamId, ')');
              setLateBuzzTeamIds(prev => new Set(prev).add(teamId));
              // Clear after 500ms
              setTimeout(() => {
                setLateBuzzTeamIds(prev => {
                  const newSet = new Set(prev);
                  newSet.delete(teamId);
                  return newSet;
                });
              }, 500);
            }
          } else {
            // Buzz during reading phase or when buzzer inactive - just visual flash
            console.log('[HostView] Buzz during non-response phase, just visual flash');
            if (teamId) {
              setBuzzedTeamIds(prev => new Set(prev).add(teamId));
              setTimeout(() => {
                setBuzzedTeamIds(prev => {
                  const newSet = new Set(prev);
                  newSet.delete(teamId);
                  return newSet;
                });
              }, 500);
            }
          }

          // Add peerId to buzzingClientIds for lobby list visual flash effect (clears after 500ms)
          setBuzingClientIds(prev => new Set(prev).add(peerId));
          setTimeout(() => {
            setBuzingClientIds(prev => {
              const newSet = new Set(prev);
              newSet.delete(peerId);
              return newSet;
            });
          }, 500);
          break;
        }
        case 'JOIN_TEAM': {
          // Client joined a team - add client to lobby if not already present
          const { clientName, teamId } = message.payload;
          console.log('[HostView] JOIN_TEAM received from', peerId, 'name:', clientName, 'team:', teamId);
          updateClients((prev: Map<string, ConnectedClient>) => {
            const existingClient = prev.get(peerId);
            if (existingClient) {
              // Client exists, just update team
              existingClient.teamId = teamId;
              existingClient.name = clientName;
            } else {
              // New client - add to lobby
              const newClient: ConnectedClient = {
                id: peerId,
                peerId: peerId,
                name: clientName,
                joinedAt: Date.now(),
                lastSeen: Date.now(),
                teamId: teamId,
                connectionQuality: {
                  rtt: 0,
                  packetLoss: 0,
                  jitter: 0,
                  lastPing: Date.now(),
                  healthScore: 100
                }
              };
              prev.set(peerId, newClient);
            }
            return prev;
          });
          // Queue confirmation to be sent via useEffect (avoid closure issue)
          setPendingConfirmations((prev: Map<string, string>) => new Map(prev).set(peerId, teamId || ''));
          console.log('[HostView] Queued TEAM_CONFIRMED for', peerId);
          break;
        }
        case 'TEAM_UPDATE': {
          // New team created by client
          const { teamId, teamName } = message.payload;
          // Check if team already exists
          const existingTeam = teams.find(t => t.name === teamName);
          if (!existingTeam) {
            // Add new team
            const newTeam: Team = {
              id: teamId,
              name: teamName,
              createdAt: Date.now(),
              lastUsedAt: Date.now()
            };
            setTeams(prev => [...prev, newTeam]);
            // Broadcasting is handled by useEffect below
          }
          break;
        }
        case 'CREATE_TEAM': {
          // Client creates a new team and joins it
          const { clientId, clientName, teamName } = message.payload;
          console.log('[HostView] CREATE_TEAM received from', peerId, 'clientName:', clientName, 'teamName:', teamName);

          // Generate a unique team ID
          const newTeamId = 'team_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);

          // Check if team already exists
          const existingTeam = teams.find(t => t.name === teamName);
          if (!existingTeam) {
            // Add new team
            const newTeam: Team = {
              id: newTeamId,
              name: teamName,
              createdAt: Date.now(),
              lastUsedAt: Date.now()
            };
            setTeams(prev => [...prev, newTeam]);
            console.log('[HostView] Created new team:', newTeam.name, 'id:', newTeamId);
          } else {
            console.log('[HostView] Team already exists:', existingTeam.name);
          }

          // Add client to lobby with the new team
          updateClients((prev: Map<string, ConnectedClient>) => {
            const existingClient = prev.get(peerId);
            if (existingClient) {
              // Client exists, update team
              existingClient.teamId = newTeamId;
              existingClient.name = clientName;
            } else {
              // New client - add to lobby
              const newClient: ConnectedClient = {
                id: clientId,
                peerId: peerId,
                name: clientName,
                joinedAt: Date.now(),
                lastSeen: Date.now(),
                teamId: newTeamId,
                connectionQuality: {
                  rtt: 0,
                  packetLoss: 0,
                  jitter: 0,
                  lastPing: Date.now(),
                  healthScore: 100
                }
              };
              prev.set(peerId, newClient);
            }
            return prev;
          });

          // Queue confirmation to be sent
          setPendingConfirmations((prev: Map<string, string>) => new Map(prev).set(peerId, newTeamId));
          console.log('[HostView] Queued TEAM_CONFIRMED for CREATE_TEAM', peerId, 'teamId:', newTeamId);
          break;
        }
        case 'GET_COMMANDS': {
          // Client requested commands list - trigger send via state
          console.log('[HostView] GET_COMMANDS received from', peerId);
          setPendingCommandsRequest(peerId);
          break;
        }
        case 'SUPER_GAME_BET': {
          // Client placed a bet in super game
          const existingIndex = superGameBets.findIndex((b: { teamId: string }) => b.teamId === message.payload.teamId);
          if (existingIndex >= 0) {
            setSuperGameBets((prev: Array<{ teamId: string; bet: number; ready: boolean }>) => prev.map((b: { teamId: string; bet: number; ready: boolean }, i: number) =>
              i === existingIndex ? { ...b, bet: message.payload.bet, ready: true } : b
            ));
          } else {
            setSuperGameBets((prev: Array<{ teamId: string; bet: number; ready: boolean }>) => [...prev, { teamId: message.payload.teamId, bet: message.payload.bet, ready: true }]);
          }
          break;
        }
        case 'SUPER_GAME_ANSWER': {
          // Client submitted an answer in super game
          console.log('[HostView] Received SUPER_GAME_ANSWER from', peerId, 'teamId:', message.payload.teamId, 'answer:', message.payload.answer);
          const existingIndex = superGameAnswers.findIndex((a: { teamId: string }) => a.teamId === message.payload.teamId);
          if (existingIndex >= 0) {
            setSuperGameAnswers((prev: Array<{ teamId: string; answer: string; revealed: boolean; submitted: boolean }>) => prev.map((a: { teamId: string; answer: string; revealed: boolean; submitted: boolean }, i: number) =>
              i === existingIndex ? { ...a, answer: message.payload.answer, submitted: true } : a
            ));
          } else {
            setSuperGameAnswers((prev: Array<{ teamId: string; answer: string; revealed: boolean; submitted: boolean }>) => [...prev, {
              teamId: message.payload.teamId,
              answer: message.payload.answer,
              revealed: false,
              submitted: true
            }]);
          }
          break;
        }
        case 'STATE_SYNC_REQUEST': {
          // Client requested full state sync - trigger GamePlay to broadcast current state
          console.log('[HostView] STATE_SYNC_REQUEST received from', peerId, '- triggering state sync');
          // Increment trigger to cause GamePlay to rebroadcast current state
          setStateSyncTrigger(prev => prev + 1);
          break;
        }
        default:
                          console.log('[HostView] Unhandled message type:', message.type);
                      }
                  }, [updateClients, superGameBets, superGameAnswers]),
    onClientConnected: useCallback((clientId: string, data: { name: string; teamId?: string; persistentClientId?: string }) => {
      console.log('[HostView] Client connected via handshake:', clientId, 'name:', data.name, 'persistentId:', data.persistentClientId, 'teamId:', data.teamId);

      // Note: Sending commands to new client is handled by useEffect below
      // to avoid circular dependency with p2pHost initialization

      // Check if this is a returning client (same persistent ID)
      if (data.persistentClientId && data.teamId) {
        // Look for existing client with this persistent ID
        let oldPeerId: string | null = null;
        let existingClient: ConnectedClient | null = null;

        for (const [peerId, client] of clients.entries()) {
          if (client.id === data.persistentClientId) {
            oldPeerId = peerId;
            existingClient = client;
            break;
          }
        }

        if (existingClient && oldPeerId) {
          console.log('[HostView] Returning client detected:', existingClient.name, 'old peerId:', oldPeerId, 'new peerId:', clientId);

          // Update existing client's peer ID and last seen
          updateClients((prev: Map<string, ConnectedClient>) => {
            const client = prev.get(oldPeerId!);
            if (client) {
              // Remove from old peer ID
              prev.delete(oldPeerId!);
              // Add with new peer ID
              client.peerId = clientId;
              client.lastSeen = Date.now();
              client.name = data.name; // Update name in case it changed
              prev.set(clientId, client);
            }
            return prev;
          });

          // Queue TEAM_CONFIRMED for returning client (will be sent by useEffect)
          setPendingConfirmations((prev: Map<string, string>) => new Map(prev).set(clientId, data.teamId!));
          return;
        }
      }

      // New client - will be added when JOIN_TEAM is received
      console.log('[HostView] New client, waiting for JOIN_TEAM message');
    }, [clients, updateClients, setPendingConfirmations]),
                onClientDisconnected: useCallback((clientId: string) => {
      console.log('[HostView] Client disconnected:', clientId);
      removeClient(clientId);
    }, [removeClient]),
                onError: useCallback((error: Error) => {
      console.error('[HostView] P2P error:', error);
    }, []),
              });

  // Keep commands array in sync with teams array
  // This ensures that commands created by guests are also available for GET_COMMANDS requests
  useEffect(() => {
    const teamCommands = teams.map(t => ({ id: t.id, name: t.name }));
    // Only update if different to avoid unnecessary updates
    const currentIds = commands.map(c => c.id).sort().join(',');
    const newIds = teamCommands.map(c => c.id).sort().join(',');
    if (currentIds !== newIds) {
      setCommands(teamCommands);
      console.log('[HostView] Synced commands with teams:', teamCommands.length);
    }
  }, [teams]);

  // Use sync effects for teams and commands (broadcasting and storage)
  useSyncEffects({
    teams,
    commands,
    p2pHost,
  });

  // Broadcast buzzer state to all clients
  useEffect(() => {
    if (p2pHost.isReady) {
                  p2pHost.broadcast({
        category: 'state' as MessageCategory,
        type: 'BUZZER_STATE',
                    payload: buzzerState
      });
    }
          }, [buzzerState, p2pHost.isReady, p2pHost.broadcast]);

  // Send pending TEAM_CONFIRMED messages when p2pHost is ready
  useEffect(() => {
    if (p2pHost.isReady && pendingConfirmations.size > 0) {
      console.log('[HostView] Sending pending confirmations:', pendingConfirmations.size);
      pendingConfirmations.forEach((_teamId: string, clientId: string) => {
        const conn = p2pHost.connectedClients.find(id => id === clientId);
        console.log('[HostView] Sending TEAM_CONFIRMED to', clientId, 'connection open:', !!conn, 'payload:', { clientId });
        p2pHost.sendToClient(clientId, {
          category: MessageCategory.STATE,
          type: 'TEAM_CONFIRMED',
          payload: {
            clientId: clientId
          }
        });
        console.log('[HostView] Sent TEAM_CONFIRMED to', clientId);
      });
      // Clear the queue after sending
      setPendingConfirmations(new Map());
    }
  }, [p2pHost.isReady, pendingConfirmations, p2pHost.sendToClient]);

  // Handle pending GET_COMMANDS requests
  useEffect(() => {
    if (p2pHost.isReady && pendingCommandsRequest && commands.length > 0) {
      const commandsSync: Omit<CommandsListMessage, 'id' | 'timestamp' | 'senderId'> = {
        category: MessageCategory.SYNC,
        type: 'COMMANDS_LIST',
        payload: {
          commands: commands
        }
      };
      p2pHost.sendToClient(pendingCommandsRequest, commandsSync);
      console.log('[HostView] Sent commands list to client:', pendingCommandsRequest, commandsSync);
      // Clear the request after sending
      setPendingCommandsRequest(null);
    } else if (p2pHost.isReady && pendingCommandsRequest && commands.length === 0) {
      // Send empty commands list
      const commandsSync: Omit<CommandsListMessage, 'id' | 'timestamp' | 'senderId'> = {
        category: MessageCategory.SYNC,
        type: 'COMMANDS_LIST',
        payload: {
          commands: []
        }
      };
      p2pHost.sendToClient(pendingCommandsRequest, commandsSync);
      console.log('[HostView] Sent empty commands list to client:', pendingCommandsRequest);
      setPendingCommandsRequest(null);
    }
  }, [p2pHost.isReady, pendingCommandsRequest, commands, p2pHost.sendToClient]);

  // Create command - adds to teams, commands are synced automatically
  const handleCreateCommand = useCallback((name: string) => {
    const teamId = 'team_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    const newTeam: Team = {
      id: teamId,
      name,
      createdAt: Date.now(),
      lastUsedAt: Date.now()
    };

    // Add to teams array (commands will be synced automatically via useEffect)
    setTeams(prev => [...prev, newTeam]);

    console.log('[HostView] Created team:', newTeam.name, 'id:', teamId);
  }, []);

  // Update command name (rename) - updates teams, commands are synced automatically
  const handleRenameCommand = useCallback((commandId: string, newName: string) => {
    setTeams(prev => prev.map(t => t.id === commandId ? { ...t, name: newName } : t));
    console.log('[HostView] Renamed team/command:', commandId, 'to', newName);
  }, []);

  // Delete command - removes from teams, commands are synced automatically
  const handleDeleteCommand = useCallback((commandId: string) => {
    // Remove teamId from clients
    setClients(clientsPrev => {
      const updated = new Map(clientsPrev);
      updated.forEach((client) => {
        if (client.teamId === commandId) {
          client.teamId = undefined;
        }
      });
      return updated;
    });
    // Remove from teams array (commands will be synced automatically via useEffect)
    setTeams(prev => prev.filter(t => t.id !== commandId));
    console.log('[HostView] Deleted team/command:', commandId);
  }, []);

  // Note: Teams and commands storage/broadcast effects are now handled by useSyncEffects hook

  // Send commands to newly connected clients (when they connect via handshake)
  // This is tracked by watching for clients that are in the handshake phase
  useEffect(() => {
    // This effect handles sending commands to clients that have connected
    // It runs when p2pHost becomes ready and when commands change
    if (p2pHost.isReady && commands.length > 0) {
      // Check connected clients from p2pHost and send commands if needed
      p2pHost.connectedClients.forEach((clientId: string) => {
        const client = clients.get(clientId);
        // Send commands to clients that don't have a team yet (just connected via handshake)
        if (client && !client.teamId) {
          const commandsSync: Omit<CommandsListMessage, 'id' | 'timestamp' | 'senderId'> = {
            category: MessageCategory.SYNC,
            type: 'COMMANDS_LIST',
            payload: {
              commands: commands
            }
          };
          p2pHost.sendToClient(clientId, commandsSync);
          console.log('[HostView] Sent commands list to newly connected client:', clientId);
        }
      });
    }
  }, [commands, p2pHost.isReady, p2pHost.sendToClient, clients]);

  // Log initial commands load
  useEffect(() => {
    console.log('[HostView] Initial commands loaded from storage:', commands);
  }, []);

  // Update invitation URL when settings change
  useEffect(() => {
    if (!isIpLocked && !isLanMode) {
      // Internet mode - use public signalling server
      // Format: http://localhost:3000#/mobile?host=HOST_ID&session=SESSION_ID
      // NO signalling parameter - client will use default public server
      const inviteUrl = `${window.location.origin}#/mobile?host=${encodeURIComponent(hostId)}&session=${encodeURIComponent(sessionId)}`;
      setFinalQrUrl(inviteUrl);
      storage.set(STORAGE_KEYS.QR_URL, inviteUrl);
    } else if (isIpLocked && isLanMode && ipInput) {
      // LAN mode - update URL when session ID changes
      const inviteUrl = `http://${ipInput}:3000#/mobile?host=${encodeURIComponent(hostId)}&signalling=${encodeURIComponent(ipInput)}&session=${encodeURIComponent(sessionId)}`;
      setFinalQrUrl(inviteUrl);
      storage.set(STORAGE_KEYS.QR_URL, inviteUrl);
    }
  }, [hostId, isLanMode, isIpLocked, sessionId, ipInput]);

  // Clear old signalling parameter from storage when switching to Internet mode
  useEffect(() => {
    if (!isLanMode) {
      // Switching to Internet mode - clear signalling param from URL
      const currentUrl = window.location.href;
      // Remove signalling parameter if present
      const urlWithoutSignalling = currentUrl.replace(/[?&]signalling=[^&]*/g, '');
      if (urlWithoutSignalling !== currentUrl) {
        window.location.href = urlWithoutSignalling;
      }
    }
  }, [isLanMode]);

  // Handle clear cache - clears host cache and reloads page
  const handleClearCache = useCallback(() => {
    // Clear all storage for host
    storage.clearAll();

    // Reload page to start fresh
    window.location.reload();
  }, []);

  // Helper to merge selected packs into a single session pack
  const mergedSessionPack = useMemo((): GamePack | undefined => {
    const selectedPacksList = selectedPacks.filter(p => selectedPackIds.includes(p.id));
    if (selectedPacksList.length === 0) return undefined;

    // Helper to count rounds
    const getRoundCount = (pack: GamePack): number => {
      return pack.rounds?.length || 0;
    };

    // Find max round count across all packs
    const maxRounds = Math.max(...selectedPacksList.map(p => getRoundCount(p)), 0);

    // Merge packs into a single session pack
    const mergedRounds: Round[] = [];

    for (let roundNum = 1; roundNum <= maxRounds; roundNum++) {
      const mergedThemes: Theme[] = [];

      // Collect round settings from the first pack that has this round
      let roundSettings: {
        name?: string;
        type?: RoundType;
        cover?: { type: 'url' | 'file'; value: string };
        readingTimePerLetter?: number;
        responseWindow?: number;
        handicapEnabled?: boolean;
        handicapDelay?: number;
      } = {};

      selectedPacksList.forEach(pack => {
        const round = pack.rounds?.[roundNum - 1];
        if (round) {
          // Copy round settings from first pack that has them
          if (Object.keys(roundSettings).length === 0) {
            roundSettings = {
              name: round.name,
              type: round.type,
              cover: round.cover,
              readingTimePerLetter: round.readingTimePerLetter,
              responseWindow: round.responseWindow,
              handicapEnabled: round.handicapEnabled,
              handicapDelay: round.handicapDelay,
            };
          }

          if (round.themes) {
            round.themes.forEach((theme: Theme) => {
              // Create unique theme ID per pack to avoid conflicts
              const uniqueThemeId = `${pack.id}-${theme.id}`;
              mergedThemes.push({
                ...theme,
                id: uniqueThemeId,
              });
            });
          }
        }
      });

      if (mergedThemes.length > 0) {
        mergedRounds.push({
          id: generateUUID(),
          number: roundNum,
          name: roundSettings.name || `Round ${roundNum}`,
          type: roundSettings.type,
          cover: roundSettings.cover,
          readingTimePerLetter: roundSettings.readingTimePerLetter,
          responseWindow: roundSettings.responseWindow,
          handicapEnabled: roundSettings.handicapEnabled,
          handicapDelay: roundSettings.handicapDelay,
          themes: mergedThemes,
        });
      }
    }

    // Create merged pack for session
    const sessionPack: GamePack = {
      id: generateUUID(),
      name: selectedPacksList.length === 1
        ? selectedPacksList[0].name
        : `Session (${selectedPacksList.map(p => p.name).join(', ')})`,
      gameType: selectedGame,
      rounds: mergedRounds,
      createdAt: Date.now(),
      // Use cover from first selected pack if available
      ...('cover' in selectedPacksList[0] && selectedPacksList[0].cover ? { cover: selectedPacksList[0].cover } : {}),
    };

    return sessionPack;
  }, [selectedPacks, selectedPackIds, selectedGame]);

  // Drag and drop state
  const [draggedClientId, setDraggedClientId] = useState<string | null>(null);

  // Keep refs in sync with state
  const teamsRef = useRef<Team[]>([]);
  const buzzerStateRef = useRef(buzzerState);
  const answeringTeamIdRef = useRef<string | null>(answeringTeamId);

  // Keep all refs in sync with state - combined for better performance
  useEffect(() => {
    teamsRef.current = teams;
    buzzerStateRef.current = buzzerState;
    answeringTeamIdRef.current = answeringTeamId;
  }, [teams, buzzerState, answeringTeamId]);

  // Clean up buzzed clients after 3 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const BUZZ_DURATION = 3000; // 3 seconds
      setBuzzedClients(prev => {
        const updated = new Map(prev);
        for (const [clientId, timestamp] of prev.entries()) {
          if (now - timestamp > BUZZ_DURATION) {
            updated.delete(clientId);
          }
        }
        return updated;
      });
    }, 500); // Check every 500ms

    return () => clearInterval(interval);
  }, []);

  // Save host ID
  useEffect(() => {
    storage.set(STORAGE_KEYS.HOST_ID, hostId);
  }, [hostId]);

  // Network status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Triple ESC to exit session
  useEffect(() => {
    if (!isSessionActive) return;

    let escPressCount = 0;
    let escTimeout: NodeJS.Timeout | null = null;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        escPressCount++;

        // Clear previous timeout
        if (escTimeout) {
          clearTimeout(escTimeout);
        }

        // If pressed 3 times, exit session
        if (escPressCount >= 3) {
          setIsSessionActive(false);
          escPressCount = 0;
          escTimeout = null;
          return;
        }

        // Reset count if no third press within 1 second
        escTimeout = setTimeout(() => {
          escPressCount = 0;
          escTimeout = null;
        }, 1000);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (escTimeout) {
        clearTimeout(escTimeout);
      }
    };
  }, [isSessionActive]);

  // Calculate stats
  const clientStats = useMemo(() => {
    const clientsArray = Array.from(clients.values()) as ConnectedClient[];
    const active = clientsArray.length;
    const avgQuality = 100; // Default quality when no network
    return { active, total: clientsArray.length, avgQuality: Math.round(avgQuality) };
  }, [clients]);

  // Helper function to broadcast buzzer state (kept for interface compatibility)
  const handleBuzzerStateChange = useCallback((state: { active: boolean; timerPhase?: 'reading' | 'response' | 'complete' | 'inactive'; readingTimerRemaining: number; responseTimerRemaining: number; handicapActive: boolean; handicapTeamId?: string }) => {
    // Store buzzer state locally for GameSession
    setBuzzerState({
      active: state.active,
      timerPhase: state.timerPhase,
      readingTimerRemaining: state.readingTimerRemaining,
      responseTimerRemaining: state.responseTimerRemaining,
      handicapActive: state.handicapActive,
      handicapTeamId: state.handicapTeamId
    });
  }, []);

  // Helper function to broadcast arbitrary message (kept for interface compatibility)
  const broadcastMessage = useCallback((message: unknown) => {
    // Broadcast via P2P to all connected clients
    if (p2pHost.isReady) {
      console.log('[HostView] Broadcasting message:', message);
      // Convert to P2P message format
      const broadcastMsg: Omit<BroadcastMessage, 'id' | 'timestamp' | 'senderId'> = {
        category: MessageCategory.EVENT,
        type: 'BROADCAST',
        payload: message
      };
      p2pHost.broadcast(broadcastMsg);
    }
  }, [p2pHost.isReady, p2pHost.broadcast]);


  // Reset super game state when session starts/ends
  useEffect(() => {
    if (!isSessionActive) {
      setSuperGameBets([]);
      setSuperGameAnswers([]);
    }
  }, [isSessionActive]);

  // Delete a team
  const deleteTeam = useCallback((teamId: string) => {
    setTeams(prev => {
      const updated = prev.filter(t => t.id !== teamId);
      // Remove team from all clients
      setClients(clientsPrev => {
        clientsPrev.forEach((client, clientId) => {
          if (client.teamId === teamId) {
            client.teamId = undefined;
          }
        });
        return clientsPrev;
      });
      return updated;
    });
  }, []);

  // Rename a team
  const renameTeam = useCallback((teamId: string, newName: string) => {
    setTeams(prev => {
      const updated = prev.map(t => t.id === teamId ? { ...t, name: newName } : t);
      return updated;
    });
  }, []);

  const getClientTeamName = useCallback((clientId: string) => {
    const client = clients.get(clientId);
    if (!client?.teamId) return undefined;
    return teams.find(t => t.id === client.teamId)?.name;
  }, [clients, teams]);

  // Move client to team (drag and drop)
  const moveClientToTeam = useCallback((clientId: string, targetTeamId: string | undefined) => {
    setClients(prev => {
      const client = prev.get(clientId);
      if (client) {
        client.teamId = targetTeamId;
      }
      return prev;
    });
  }, []);

  // Drag handlers
  const handleDragStart = useCallback((clientId: string) => {
    setDraggedClientId(clientId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); // Allow drop
  }, []);

  const handleDropOnTeam = useCallback((targetTeamId: string | undefined) => {
    if (draggedClientId) {
      moveClientToTeam(draggedClientId, targetTeamId);
      setDraggedClientId(null);
    }
  }, [draggedClientId, moveClientToTeam]);

  const handleDragEnd = useCallback(() => {
    setDraggedClientId(null);
  }, []);

  // Connection status enum
  enum ConnectionStatus {
    DISCONNECTED = 'disconnected',
    INITIALIZING = 'initializing',
    WAITING = 'waiting',
    CONNECTING = 'connecting',
    CONNECTED = 'connected',
    RECONNECTING = 'reconnecting',
    ERROR = 'error'
  }

  // Current connection status (always CONNECTED since no network)
  const status = ConnectionStatus.CONNECTED;

  // --- LOBBY VIEW ---
  if (!isSessionActive) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col p-6 items-center justify-center">
        <div className="w-full max-w-6xl grid lg:grid-cols-2 gap-8 md:gap-12 animate-in fade-in duration-500 cursor-default">
          {/* LEFT COLUMN: Setup & QR */}
          <div className="flex flex-col space-y-4">
            {/* First row: IP input + LAN button + OK button */}
            <div className="bg-gray-900 border border-gray-800 p-4 rounded-lg shadow-lg cursor-default">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={ipInput}
                  onChange={(e) => setIpInput(e.target.value)}
                  placeholder="192.168.1.x"
                  disabled={!isLanMode || isIpLocked}
                  className="flex-1 bg-gray-950 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all placeholder:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <button
                  onClick={() => setIsLanMode(!isLanMode)}
                  className={`h-11 px-4 rounded-lg border text-sm font-medium transition-colors ${
                    isLanMode
                      ? 'bg-blue-600 hover:bg-blue-700 text-white border-blue-500'
                      : 'bg-gray-800 hover:bg-gray-700 text-gray-400 border-gray-700'
                  }`}
                >
                  LAN
                </button>
                <button
                  onClick={() => {
                    if (isIpLocked) {
                      // Unlock the IP
                      setIsIpLocked(false);
                      storage.remove(STORAGE_KEYS.LOCKED_IP);
                    } else if (ipInput.trim()) {
                      // Lock the IP
                      setIpInput(ipInput.trim());
                      setIsIpLocked(true);
                      storage.set(STORAGE_KEYS.LOCKED_IP, ipInput.trim());

                      // Generate invitation URL with connection parameters
                      // Format: http://IP:3000#/mobile?host=HOST_ID&signalling=IP&session=SESSION_ID
                      const inviteUrl = `http://${ipInput.trim()}:3000#/mobile?host=${encodeURIComponent(hostId)}&signalling=${encodeURIComponent(ipInput.trim())}&session=${encodeURIComponent(sessionId)}`;
                      setFinalQrUrl(inviteUrl);
                      storage.set(STORAGE_KEYS.QR_URL, inviteUrl);
                    }
                  }}
                  disabled={(!isIpLocked && !ipInput.trim()) || !isLanMode}
                  className={`h-11 px-4 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    isIpLocked
                      ? 'bg-gray-600 hover:bg-gray-700 text-white'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  {isIpLocked ? 'OK' : 'OK'}
                </button>
              </div>
            </div>

            {/* Session ID */}
            <div className="bg-gray-900 border border-gray-800 p-4 rounded-lg shadow-lg cursor-default">
              <div className="flex items-center gap-3">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Session ID</label>
                <input
                  key={sessionId}
                  type="text"
                  value={sessionId}
                  className="flex-1 bg-gray-950 border border-gray-700 rounded-lg px-4 py-2 text-white text-sm text-center font-mono text-xl tracking-widest"
                  readOnly
                />
                <button
                  onClick={() => {
                    // Generate random letters (can be uppercase or lowercase)
                    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
                    let newSessionId = '';
                    for (let i = 0; i < 5; i++) {
                      newSessionId += chars.charAt(Math.floor(Math.random() * chars.length));
                    }
                    setSessionId(newSessionId);
                    // Update host unique ID and storage
                    const newHostUniqueId = generateHostUniqueId();
                    storage.set(STORAGE_KEYS.HOST_UNIQUE_ID, newHostUniqueId);
                    setHostUniqueId(newHostUniqueId);
                    // Update QR URL with new session ID
                    if (isIpLocked && isLanMode && ipInput) {
                      const inviteUrl = `http://${ipInput}:3000#/mobile?host=${encodeURIComponent(hostId)}&signalling=${encodeURIComponent(ipInput)}&session=${encodeURIComponent(newSessionId)}`;
                      setFinalQrUrl(inviteUrl);
                      storage.set(STORAGE_KEYS.QR_URL, inviteUrl);
                    } else if (!isLanMode) {
                      const inviteUrl = `${window.location.origin}#/mobile?host=${encodeURIComponent(hostId)}&session=${encodeURIComponent(newSessionId)}`;
                      setFinalQrUrl(inviteUrl);
                      storage.set(STORAGE_KEYS.QR_URL, inviteUrl);
                    }
                  }}
                  className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors flex items-center gap-1.5 text-sm font-medium"
                  title="Regenerate Session ID"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* QR Code */}
            <div className="relative aspect-square w-full bg-gray-900 border border-gray-800 rounded-lg shadow-2xl overflow-hidden flex flex-col items-center justify-center p-8 group cursor-default">
              <div className="absolute inset-0 bg-blue-600/5 blur-[80px] rounded-full pointer-events-none group-hover:bg-blue-600/10 transition-colors duration-500"></div>
              <div
                key={finalQrUrl}
                className="relative z-10 bg-white p-4 rounded-lg shadow-xl"
              >
                {!isIpLocked ? (
                  <div className="w-[350px] h-[350px] bg-gray-100 rounded-lg flex flex-col items-center justify-center text-center p-6 space-y-3">
                    <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center">
                      <Settings className="w-8 h-8 text-gray-400" />
                    </div>
                    <p className="text-gray-600 font-medium">Enter IP address</p>
                    <p className="text-gray-400 text-sm">Then confirm to generate QR code</p>
                  </div>
                ) : (
                  <>
                    <QRCodeSVG value={finalQrUrl} size={350} level="H" includeMargin={true} />
                  </>
                )}
              </div>
              <div className="mt-6 text-center z-10 flex items-center gap-2">
                <button
                  onClick={() => {
                    if (finalQrUrl) {
                      navigator.clipboard.writeText(finalQrUrl);
                      setLinkCopied(true);
                      setTimeout(() => setLinkCopied(false), 2000);
                    }
                  }}
                  disabled={!finalQrUrl}
                  className={`relative flex items-center justify-center px-4 py-3 rounded-lg transition-all duration-200 pl-10 ${
                    linkCopied
                      ? 'bg-white text-blue-600'
                      : 'bg-blue-600 hover:bg-blue-700 text-white active:scale-95'
                  }`}
                  style={{ minWidth: '210px' }}
                >
                  <Copy className="absolute left-3 w-5 h-5" />
                  <span className="font-medium">{linkCopied ? 'Link copied!' : 'Copy invitation link'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: List */}
          <div className="flex flex-col h-full space-y-4">
             <div className="flex-1 bg-gray-900/80 backdrop-blur-sm border border-gray-800 rounded-lg p-6 flex flex-col min-h-[400px] shadow-xl cursor-default">
                <div className="flex justify-between items-center mb-3 border-b border-gray-800 pb-2">
                   <h2 className="text-lg font-bold text-white flex items-center gap-2">
                     <Users className="w-4 h-4 text-blue-400" /> Lobby
                   </h2>
                   <div className="flex items-center gap-2">
                     <div className="bg-gray-800 px-3 py-1 rounded-full text-xs font-mono text-blue-400 border border-blue-500/20">
                       {clients.size} Ready
                     </div>
                     {clients.size > 0 && (
                       <div className={`px-3 py-1 rounded-full text-xs font-mono border ${getHealthBgColor(clientStats.avgQuality)}`}>
                         <Activity className="w-3 h-3 inline mr-1" /> {clientStats.avgQuality}%
                       </div>
                     )}
                   </div>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 pr-2 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
                   {sessionSettings.noTeamsMode ? (
                     // No Teams Mode - show all players individually
                     Array.from(clients.values()).map((client: ConnectedClient) => (
                       <SimpleClientItem
                         key={client.id}
                         client={client}
                         isStale={() => false}
                         hasBuzzed={buzzedClients.has(client.id)}
                         isBuzzing={buzzingClientIds.has(client.peerId)}
                         onRemove={removeClient}
                         getHealthBgColor={getHealthBgColor}
                       />
                     ))
                   ) : (
                     <>
                       {/* Show all teams (even empty ones) - memoized */}
                       {teams.map(team => {
                         const teamClients = Array.from(clients.values()).filter((c: ConnectedClient) => c.teamId === team.id);

                         return (
                           <TeamListItem
                             key={team.id}
                             team={team}
                             teamClients={teamClients}
                             isEditing={editingTeamId === team.id}
                             editingTeamName={editingTeamName}
                             isDraggingOver={draggedClientId !== null}
                             onDragOver={handleDragOver}
                             onDrop={() => handleDropOnTeam(team.id)}
                             onEditStart={() => {
                               setEditingTeamId(team.id);
                               setEditingTeamName(team.name);
                             }}
                             onRename={renameTeam}
                             onDelete={() => {
                               if (confirm(`Delete team "${team.name}"?`)) {
                                 deleteTeam(team.id);
                               }
                             }}
                             onEditingNameChange={(name) => setEditingTeamName(name)}
                             onEditingIdSet={(id) => setEditingTeamId(id)}
                             buzzedClients={buzzedClients}
                             buzzingClientIds={buzzingClientIds}
                             isStale={() => false}
                             draggedClientId={draggedClientId}
                             onDragStart={handleDragStart}
                             onDragEnd={handleDragEnd}
                             onRemoveClient={removeClient}
                           />
                         );
                       })}

                       {/* Players without team - memoized */}
                       <NoTeamSection
                         noTeamClients={Array.from(clients.values()).filter((c: ConnectedClient) => !c.teamId)}
                         isDraggingOver={draggedClientId !== null}
                         onDragOver={handleDragOver}
                         onDrop={() => handleDropOnTeam(undefined)}
                         buzzedClients={buzzedClients}
                         isStale={() => false}
                         draggedClientId={draggedClientId}
                         onDragStart={handleDragStart}
                         onDragEnd={handleDragEnd}
                         onRemoveClient={removeClient}
                         getHealthBgColor={getHealthBgColor}
                       />

                       {/* Create Team button - always visible */}
                       <div className="bg-gray-900/50 backdrop-blur-sm rounded-lg p-4">
                           {!showCreateTeamInput ? (
                             <button
                               onClick={() => setShowCreateTeamInput(true)}
                               className="w-full p-2 border-2 border-dashed border-gray-700 rounded-lg text-gray-500 text-sm hover:bg-gray-800/50 hover:text-gray-300 transition-colors flex items-center justify-center gap-2"
                             >
                               <Plus className="w-4 h-4 text-gray-400" />
                               <span>Create Team</span>
                             </button>
                           ) : (
                             <div className="flex items-center gap-2 p-2 bg-gray-800/50 rounded-lg border-2 border-blue-500/30">
                               <Plus className="w-4 h-4 text-blue-400" />
                               <input
                                 type="text"
                                 value={newTeamName}
                                 onChange={(e) => setNewTeamName(e.target.value)}
                                 onKeyDown={(e) => {
                                   if (e.key === 'Enter') {
                                     if (newTeamName.trim()) {
                                       handleCreateCommand(newTeamName.trim());
                                       setNewTeamName('');
                                       setShowCreateTeamInput(false);
                                     }
                                   } else if (e.key === 'Escape') {
                                     setShowCreateTeamInput(false);
                                     setNewTeamName('');
                                   }
                                 }}
                                 placeholder="Team name..."
                                 className="flex-1 bg-transparent text-white text-sm font-medium focus:outline-none"
                                 autoFocus
                               />
                               {newTeamName.trim() && (
                                 <button
                                   onClick={() => {
                                     handleCreateCommand(newTeamName.trim());
                                     setNewTeamName('');
                                     setShowCreateTeamInput(false);
                                   }}
                                   className="p-1.5 hover:bg-gray-700 rounded text-green-400"
                                   title="Create team"
                                 >
                                   <Check className="w-4 h-4" />
                                 </button>
                               )}
                               <button
                                 onClick={() => {
                                   setShowCreateTeamInput(false);
                                   setNewTeamName('');
                                 }}
                                 className="p-1.5 hover:bg-gray-700 rounded text-gray-400"
                                 title="Cancel"
                               >
                                 ✕
                               </button>
                             </div>
                           )}
                         </div>
                     </>
                   )}
              </div>
             </div>

             {/* Selected game info */}
             <div className="bg-gray-900/50 border border-gray-800 rounded-lg px-4 py-3 flex items-center justify-between">
               <div className="flex items-center gap-3">
                 <div className="w-10 h-10 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center">
                   <span className="text-lg font-bold">{selectedGame === 'custom' ? 'СИ' : selectedGame === 'quiz' ? 'К' : 'В'}</span>
                 </div>
                 <div>
                   <div className="text-sm font-medium text-white">
                     {selectedGame === 'custom' ? 'Своя игра' : selectedGame === 'quiz' ? 'Квиз' : 'Викторина'}
                   </div>
                   {selectedPacks.length > 0 ? (
                     <div className="text-xs text-gray-500">{selectedPacks.length} pack{selectedPacks.length > 1 ? 's' : ''} selected</div>
                   ) : (
                     <div className="text-xs text-gray-600">No pack selected</div>
                   )}
                 </div>
               </div>
             </div>

             <div className="flex gap-3">
               <Button size="xl" variant="secondary" className="px-6" onClick={() => setShowSettingsModal(true)} title="Session Settings">
                  <Settings className="w-6 h-6" />
               </Button>
               <Button size="xl" variant="secondary" className="px-6" onClick={() => setShowGameSelector(true)} disabled={!isOnline || !isIpLocked}>
                  Select Game
               </Button>
               <Button size="xl" className="flex-1 shadow-blue-900/20" onClick={() => {
                 // Generate new session version to help clients detect this is a fresh session
                 const newVersion = `v_${Date.now()}`;
                 setSessionVersion(newVersion);
                 storage.set(STORAGE_KEYS.SESSION_VERSION, newVersion);
                 setIsSessionActive(true);
               }} disabled={!isOnline || !isIpLocked}>
                  Start Session <ArrowRight className="ml-3 w-6 h-6" />
               </Button>
             </div>
          </div>
        </div>

        {/* Settings Modal */}
        <SettingsModal
          isOpen={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
          settings={sessionSettings}
          onSave={updateSessionSettings}
          onClearCache={handleClearCache}
        />

        {/* Game Selector Modal */}
        <GameSelectorModal
          isOpen={showGameSelector}
          onClose={() => setShowGameSelector(false)}
          onSave={handleSaveGameSelection}
          initialGameType={selectedGame}
          initialSelectedPackIds={selectedPackIds}
          initialPacks={selectedPacks}
        />
      </div>
    );
  }

  // --- GAME SESSION ---
  return (
    <GameSession
      teams={teams}
      clients={clients}
      buzzedClients={buzzedClients}
      buzzedTeamIds={buzzedTeamIds}
      lateBuzzTeamIds={lateBuzzTeamIds}
      status={status}
      isOnline={isOnline}
      onBackToLobby={() => setIsSessionActive(false)}
      onClearBuzz={() => setBuzzedClients(new Map())}
      onBuzzerStateChange={handleBuzzerStateChange}
      buzzerState={buzzerState}
      gameType={selectedGame}
      mergedPack={mergedSessionPack}
      noTeamsMode={sessionSettings.noTeamsMode}
      sessionSettings={sessionSettings}
      answeringTeamId={answeringTeamId}
      onAnsweringTeamChange={setAnsweringTeamId}
      onBroadcastMessage={broadcastMessage}
      superGameBets={superGameBets}
      superGameAnswers={superGameAnswers}
      onSuperGamePhaseChange={setSuperGamePhase}
      onSuperGameMaxBetChange={setSuperGameMaxBet}
      onRequestStateSync={() => setStateSyncTrigger(prev => prev + 1)}
      stateSyncTrigger={stateSyncTrigger}
    />
  );
};
