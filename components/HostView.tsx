import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from './Button';
import { Smartphone, ArrowRight, Wifi, RefreshCw, Settings, Users, AlertCircle, Activity } from 'lucide-react';
import { P2PManager, generatePeerId, getSignallingServerUrl } from '../utils/p2p';
import { PeerMessage, ConnectionStatus, TimeLog, Team, ConnectionQuality } from '../types';
import { useSessionSettings } from '../hooks/useSessionSettings';
import { getDefaultQuality, updateQualityMetrics, getHealthBgColor } from '../hooks/useConnectionQuality';
import { SettingsModal, GameSession, GameSelectorModal, type GamePack, type GameType } from './host';
import type { Round, Theme, RoundType } from './host/PackEditor';
import { TeamListItem, SimpleClientItem, NoTeamSection, ConnectedClient } from './host/ListItems';
import { storage, STORAGE_KEYS, generateHostUniqueId } from '../hooks/useLocalStorage';
import { CONNECTION_CONFIG } from '../config';

export const HostView: React.FC = () => {
  const [hostId] = useState<string>(() => {
    const saved = storage.get(STORAGE_KEYS.HOST_ID);
    return saved || generatePeerId();
  });

  // Host unique ID (12 chars) - used for client data binding
  const [hostUniqueId, setHostUniqueId] = useState<string>(() => {
    const saved = storage.get<string>(STORAGE_KEYS.HOST_UNIQUE_ID);
    return saved || generateHostUniqueId();
  });

  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.INITIALIZING);
  const [isSessionActive, setIsSessionActive] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  // IP Configuration state
  const [ipInput, setIpInput] = useState<string>(() => {
    const saved = storage.get(STORAGE_KEYS.LOCKED_IP);
    return saved ?? '';
  });
  const [isIpLocked, setIsIpLocked] = useState<boolean>(() => {
    return storage.get(STORAGE_KEYS.LOCKED_IP) !== null;
  });
  const [finalQrUrl, setFinalQrUrl] = useState<string>(() => {
    return storage.get(STORAGE_KEYS.QR_URL) ?? '';
  });

  // State
  const [logs, setLogs] = useState<TimeLog[]>(() => {
    const saved = storage.get<string>(STORAGE_KEYS.LOGS);
    if (!saved) return [];
    try {
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed.filter((l: TimeLog) => l && typeof l.sentAt === 'number' && typeof l.receivedAt === 'number') : [];
    } catch { return []; }
  });

  const [clients, setClients] = useState<Map<string, ConnectedClient>>(new Map());

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

  // Team editing state
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editingTeamName, setEditingTeamName] = useState<string>('');

  // Track which clients have buzzed (clientId -> timestamp when they buzzed)
  const [buzzedClients, setBuzzedClients] = useState<Map<string, number>>(new Map());

  // Track which teams have buzzed (for visual flash effect) - only tracks recent buzzes
  const [buzzedTeamIds, setBuzzedTeamIds] = useState<Set<string>>(new Set());

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
          id: crypto.randomUUID(),
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
      id: crypto.randomUUID(),
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

  // P2P Manager
  const p2pManagerRef = useRef<P2PManager | null>(null);
  const healthCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clientsRef = useRef<Map<string, ConnectedClient>>(new Map());
  const teamsRef = useRef<Team[]>([]);
  // Map peerId -> persistentId for tracking reconnections
  const peerToPersistentIdRef = useRef<Map<string, string>>(new Map());
  // Track buzzed clients ref for cleanup
  const buzzedClientsRef = useRef<Map<string, number>>(new Map());
  // Track clients that disconnected but might reconnect (persistentId -> disconnect timestamp)
  const disconnectedClientsRef = useRef<Map<string, number>>(new Map());
  // Track previous noTeamsMode to detect when it's disabled
  const prevNoTeamsModeRef = useRef<boolean>(false);
  // Track buzzer state ref for real-time access in message handlers
  const buzzerStateRef = useRef(buzzerState);

  // Keep all refs in sync with state - combined for better performance
  useEffect(() => {
    clientsRef.current = clients;
    teamsRef.current = teams;
    buzzedClientsRef.current = buzzedClients;
    buzzerStateRef.current = buzzerState;
    prevNoTeamsModeRef.current = sessionSettings.noTeamsMode;
  }, [clients, teams, buzzedClients, buzzerState, sessionSettings.noTeamsMode]);

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

  // Persistence
  useEffect(() => {
    storage.set(STORAGE_KEYS.LOGS, logs);
  }, [logs]);

  // Temporarily disabled - may be causing issues
  // useEffect(() => {
  //   const clientsArray = Array.from(clients.values());
  //   console.log('[Host] Saving clients to storage:', clientsArray.length, 'clients:', clientsArray.map(c => ({ id: c.id, name: c.name, teamId: c.teamId })));
  //   console.log('[Host] clients Map size:', clients.size, 'entries:', Array.from(clients.entries()).map(([id, c]) => `${id}=${c.name}`));
  //   storage.set(STORAGE_KEYS.CLIENTS, clientsArray);
  // }, [clients]);

  // Persist teams to storage
  useEffect(() => {
    storage.set(STORAGE_KEYS.TEAMS, teams);
  }, [teams]);

  // Helper function to get current peerId for a persistent client ID
  const getPeerIdForPersistentId = useCallback((persistentId: string): string | undefined => {
    for (const [peerId, pId] of peerToPersistentIdRef.current.entries()) {
      if (pId === persistentId) return peerId;
    }
    return undefined;
  }, []);

  // Helper function to broadcast teams to all connected clients
  // Uses refs to always have access to current state without dependency issues
  // NOTE: sendTo will automatically use RELAY fallback if P2P channel is not available
  const broadcastTeams = useCallback((teamsToBroadcast?: Team[]) => {
    const teamsToSend = teamsToBroadcast ?? teamsRef.current;
    // Use current values from state to avoid closure issues
    const currentSessionVersion = sessionVersion;
    const currentHostUniqueId = hostUniqueId;

    // Don't send teams in no-teams mode
    if (sessionSettings.noTeamsMode) {
      clientsRef.current.forEach((client) => {
        // Don't check isConnected - let sendTo use RELAY fallback if P2P is down
        p2pManagerRef.current?.sendTo(client.peerId, { type: 'TEAM_LIST', teams: [], sessionVersion: currentSessionVersion, hostId: currentHostUniqueId });
      });
      return;
    }
    clientsRef.current.forEach((client) => {
      // Don't check isConnected - let sendTo use RELAY fallback if P2P is down
      p2pManagerRef.current?.sendTo(client.peerId, { type: 'TEAM_LIST', teams: teamsToSend, sessionVersion: currentSessionVersion, hostId: currentHostUniqueId });
    });
  }, [sessionSettings.noTeamsMode, sessionVersion, hostUniqueId]); // Dependencies ensure we use current values

  // Helper function to request team state from all clients
  // Used when returning to lobby or disabling no-teams mode
  const requestTeamStatesFromClients = useCallback(() => {
    clientsRef.current.forEach((client) => {
      // Don't check isConnected - let sendTo use RELAY fallback if P2P is down
      p2pManagerRef.current?.sendTo(client.peerId, { type: 'TEAM_STATE_REQUEST' });
    });
  }, []);

  // Helper function to broadcast timer state to all connected clients
  // Note: Buzz button is never blocked anymore, only timer info is sent
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

    // Broadcast to all connected clients
    // Don't check isConnected - let sendTo use RELAY fallback if P2P is down
    clientsRef.current.forEach((client) => {
      p2pManagerRef.current?.sendTo(client.peerId, {
        type: 'BUZZER_STATE',
        active: false, // Never block the button
        readingTimerRemaining: state.readingTimerRemaining,
        responseTimerRemaining: state.responseTimerRemaining,
        handicapActive: false, // No handicap blocking
        teamId: undefined
      });
    });
  }, []);

  // Helper function to broadcast arbitrary message to all connected clients
  const broadcastMessage = useCallback((message: PeerMessage) => {
    if (message.type === 'SUPER_GAME_PLACE_YOUR_BETS') {
      console.log('[HostView] Broadcasting SUPER_GAME_PLACE_YOUR_BETS to', clientsRef.current.size, 'clients:', message);
    }
    clientsRef.current.forEach((client) => {
      p2pManagerRef.current?.sendTo(client.peerId, message);
    });
  }, []);

  // Helper function to send current super game state to a specific client
  const sendSuperGameStateToClient = useCallback((peerId: string) => {
    console.log('[HostView] Sending super game state to client:', superGamePhase);

    if (superGamePhase === 'placeBets') {
      p2pManagerRef.current?.sendTo(peerId, {
        type: 'SUPER_GAME_STATE_SYNC',
        phase: 'placeBets',
        maxBet: superGameMaxBet
      });
    } else if (superGamePhase === 'showQuestion') {
      p2pManagerRef.current?.sendTo(peerId, {
        type: 'SUPER_GAME_STATE_SYNC',
        phase: 'showQuestion',
        maxBet: superGameMaxBet
      });
    } else if (superGamePhase === 'idle') {
      p2pManagerRef.current?.sendTo(peerId, {
        type: 'SUPER_GAME_STATE_SYNC',
        phase: 'idle'
      });
    }
    // Note: showWinner phase doesn't need resync - game is over
  }, [superGamePhase, superGameMaxBet]);

  // Track previous clients count to detect new connections
  const prevClientsCountRef = useRef(0);

  // Broadcast teams to newly connected clients only (not on every teams change)
  useEffect(() => {
    const currentCount = clients.size;

    if (currentCount > prevClientsCountRef.current) {
      // New client connected - send current teams from ref
      broadcastTeams();
    }

    prevClientsCountRef.current = currentCount;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients.size]); // Only depend on clients.size, broadcastTeams is stable

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

  // Request team states when returning to lobby (session ends)
  useEffect(() => {
    // Only trigger when going from active session to lobby
    if (!isSessionActive && clients.size > 0 && !sessionSettings.noTeamsMode) {
      // Request team states from all clients to sync up
      requestTeamStatesFromClients();
      // After a delay, broadcast the updated teams to ensure consistency
      // Increased delay to give clients more time to respond
      const timeoutId = setTimeout(() => {
        broadcastTeams();
      }, 2000);
      return () => clearTimeout(timeoutId);
    }
  }, [isSessionActive, clients.size, sessionSettings.noTeamsMode, requestTeamStatesFromClients, broadcastTeams]);

  // Request team states when disabling no-teams mode
  useEffect(() => {
    // Update ref for next check
    const wasNoTeamsMode = prevNoTeamsModeRef.current;
    prevNoTeamsModeRef.current = sessionSettings.noTeamsMode;

    // Check if no-teams mode was just disabled (true -> false)
    if (wasNoTeamsMode && !sessionSettings.noTeamsMode && clients.size > 0) {
      // no-teams mode was just disabled - request team states from clients
      requestTeamStatesFromClients();
      // Broadcast teams after receiving responses
      const timeoutId = setTimeout(() => {
        broadcastTeams();
      }, 1000);
      return () => clearTimeout(timeoutId);
    }
  }, [sessionSettings.noTeamsMode, clients.size, requestTeamStatesFromClients, broadcastTeams]);

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
    const active = clientsArray.filter(c => !isStale(c.lastSeen)).length;
    const avgQuality = clientsArray.length > 0
      ? clientsArray.reduce((acc, c) => acc + c.connectionQuality.healthScore, 0) / clientsArray.length
      : 100;
    return { active, total: clientsArray.length, avgQuality: Math.round(avgQuality) };
  }, [clients]);

  // Handle IP lock
  const handleLockIp = useCallback(() => {
    if (!ipInput.trim()) return;
    setIsIpLocked(true);
    storage.set(STORAGE_KEYS.LOCKED_IP, ipInput);

    // Generate QR URL
    const protocol = window.location.protocol;
    const port = window.location.port || '3000';
    const baseUrl = `${protocol}//${ipInput}:${port}/`;
    const qrUrl = `${baseUrl}#/mobile?host=${hostId}&ip=${ipInput}`;
    setFinalQrUrl(qrUrl);
    storage.set(STORAGE_KEYS.QR_URL, qrUrl);
  }, [ipInput, hostId]);

  const handleUnlockIp = useCallback(() => {
    setIsIpLocked(false);
    setFinalQrUrl('');
    storage.remove(STORAGE_KEYS.LOCKED_IP);
    storage.remove(STORAGE_KEYS.QR_URL);
  }, []);

  // Initialize P2P
  useEffect(() => {
    if (!isIpLocked || !ipInput) return;

    const signallingUrl = getSignallingServerUrl(ipInput);

    const manager = new P2PManager({
      signallingUrl,
      peerId: hostId,
      peerName: 'Host',
      role: 'host'
    }, {
      onSignallingConnected: () => {
        console.log('[Host] Registered with signalling server');
        setStatus(ConnectionStatus.CONNECTED);
      },
      onConnected: () => {
        // Peer connected (for future P2P use)
      },
      onDisconnected: (disconnectedPeerId: string) => {
        console.log('[Host] Client disconnected:', disconnectedPeerId);
        // Find the persistentId for this peerId
        const persistentId = peerToPersistentIdRef.current.get(disconnectedPeerId);
        if (persistentId) {
          console.log('[Host] Found persistentId for disconnected peer:', persistentId);
          // Remove the peerId mapping
          peerToPersistentIdRef.current.delete(disconnectedPeerId);

          // Check if this persistentId has any other active peerId connections
          const hasOtherConnection = Array.from(peerToPersistentIdRef.current.values()).includes(persistentId);

          if (!hasOtherConnection) {
            // No other connections for this client - mark as potentially disconnected
            // Will be fully removed after 30 seconds if not reconnected
            console.log('[Host] No other connections for', persistentId, '- marking for cleanup');
            disconnectedClientsRef.current.set(persistentId, Date.now());
          } else {
            console.log('[Host] Client', persistentId, 'has other active connections');
          }
        } else {
          console.log('[Host] No persistentId found for disconnected peer:', disconnectedPeerId);
        }
      },
      onData: (data, peerId) => handleGameData(data, peerId),
      onClientConnected: (clientId, clientName) => {
        // Only map peerId to itself initially - client entry will be created by JOIN message
        // This prevents duplicate entries (one by peerId, one by persistentId)
        peerToPersistentIdRef.current.set(clientId, clientId);
      },
      onError: (error) => {
        console.error('[Host] P2P error:', error);
        setStatus(ConnectionStatus.ERROR);
      }
    });

    p2pManagerRef.current = manager;

    manager.connect().then(() => {
      setStatus(ConnectionStatus.WAITING);
    }).catch((e) => {
      console.error('[Host] Failed to connect:', e);
      setStatus(ConnectionStatus.ERROR);
    });

    return () => {
      manager.destroy();
    };
  }, [isIpLocked, ipInput, hostId]);

  // Kick a client from the session
  const kickClient = useCallback((clientId: string) => {
    const client = clientsRef.current.get(clientId);
    if (!client) {
      return;
    }

    if (p2pManagerRef.current) {
      p2pManagerRef.current.sendTo(client.peerId, {
        type: 'KICK_CLIENT',
        clientId,
        reason: 'Removed by host'
      });
    }
    // Remove from local state
    setClients(prev => {
      // Mutate prev in-place instead of creating new Map
      prev.delete(clientId);
      return prev;  // Return same reference
    });
    // Also remove peer mapping
    peerToPersistentIdRef.current.delete(client.peerId);
  }, []);

  // Handle game data
  const handleGameData = useCallback((data: PeerMessage, peerId: string) => {
    // Update last seen - find client by peerId mapping
    const persistentId = peerToPersistentIdRef.current.get(peerId);
    if (persistentId) {
      setClients(prev => {
        // Mutate prev in-place instead of creating new Map
        const client = prev.get(persistentId);
        if (!client) return prev;
        prev.set(persistentId, {
          ...client,
          lastSeen: Date.now()
        });
        return prev;  // Return same reference
      });
    }

    switch (data.type) {
      case 'JOIN': {
        console.log('[Host] Received JOIN message:', {
          peerId,
          userName: data.userName,
          persistentId: data.persistentId,
          clientState: data.clientState
        });

        // Client is leaving
        if (data.userName === '__LEAVING__') {
          const persistentId = peerToPersistentIdRef.current.get(peerId);
          if (persistentId) {
            const client = clientsRef.current.get(persistentId);

            // Check if this client was the last one in their team
            if (client?.teamId) {
              const teamId = client.teamId;
              const remainingInTeam = Array.from(clientsRef.current.values()).filter(
                (c: ConnectedClient) => c.id !== persistentId && c.teamId === teamId
              );

              // If no other players in this team, delete the team
              if (remainingInTeam.length === 0) {
                setTeams(prev => {
                  const updated = prev.filter(t => t.id !== teamId);
                  // Broadcast updated team list
                  broadcastTeams(updated);
                  return updated;
                });
              } else {
                // Update team's lastUsedAt since a player left
                setTeams(prev => prev.map(t => t.id === teamId ? { ...t, lastUsedAt: Date.now() } : t));
              }
            }

            setClients(prev => {
              // Mutate prev in-place instead of creating new Map
              prev.delete(persistentId);
              return prev;  // Return same reference
            });
            peerToPersistentIdRef.current.delete(peerId);
          }
          break;
        }

        // Use persistentId if provided, otherwise use peerId as fallback
        const persistentId = data.persistentId || peerId;

        setClients(prev => {
          const existing = prev.get(persistentId);
          const oldPeerId = existing?.peerId;

          // Handle client state restoration from JOIN
          let finalTeamId: string | undefined = undefined;
          let teamScoreToRestore: number | undefined = undefined;

          if (data.clientState) {
            // Client is reconnecting with saved state
            // Only restore team if this is an existing client (reconnection), not a new connection
            // New connections should start fresh without team
            if (existing) {
              const cs = data.clientState;

              // Check if the team exists
              if (cs.teamId && teamsRef.current.some((t: Team) => t.id === cs.teamId)) {
                finalTeamId = cs.teamId;
                teamScoreToRestore = cs.teamScore;
              } else if (cs.teamName && cs.teamId) {
                // Team doesn't exist but client has team info - recreate it
                console.log('[Host] Recreating team for reconnecting client:', cs.teamName);
                setTeams(prevTeams => {
                  const newTeam: Team = {
                    id: cs.teamId!,
                    name: cs.teamName!,
                    createdAt: Date.now(),
                    lastUsedAt: Date.now()
                  };
                  // Also update the team score if provided
                  if (cs.teamScore !== undefined) {
                    // We'll update team scores separately via GamePlay
                  }
                  const updated = [...prevTeams, newTeam];
                  broadcastTeams(updated);
                  return updated;
                });
                finalTeamId = cs.teamId;
                teamScoreToRestore = cs.teamScore;
              }
            }
            // If this is a new client (!existing), don't restore team from clientState
            // The client needs to select/create a team fresh
          } else if (existing?.teamId && teamsRef.current.some((t: Team) => t.id === existing.teamId)) {
            // Preserve existing teamId if still valid
            finalTeamId = existing.teamId;
          }

          // If team score needs to be restored, we'll need to communicate with GamePlay
          // For now, just log it - the score restoration will be handled via a callback
          if (teamScoreToRestore !== undefined && finalTeamId) {
            console.log('[Host] Client', data.userName, 'reconnecting with team score:', teamScoreToRestore, 'for team:', finalTeamId);
            // We'll need to add a mechanism to update team scores in GamePlay
          }

          // Use userName from data, or from clientState as fallback, or generate a default name
          // Ensure name is never empty - if all sources are empty, don't create the client yet
          const dataUserName = data.userName?.trim();
          const stateUserName = data.clientState?.userName?.trim();
          const clientName = dataUserName || stateUserName || `Player_${persistentId.slice(0, 4)}`;

          if (!clientName) {
            console.warn('[Host] JOIN: Skipping client creation - userName is empty:', {
              dataUserName: data.userName,
              stateUserName: stateUserName,
              persistentId: persistentId
            });
            return prev;
          }

          console.log('[Host] Creating client with name:', clientName, 'from data.userName:', data.userName, 'persistentId:', persistentId);

          // Create new Map with updated client
          const newMap = new Map(prev);
          newMap.set(persistentId, {
            id: persistentId,
            peerId: peerId,
            name: clientName,
            joinedAt: existing?.joinedAt || Date.now(),
            teamId: finalTeamId,
            lastSeen: Date.now(),
            connectionQuality: existing?.connectionQuality || getDefaultQuality()
          });

          // Log client creation for debugging
          console.log('[Host] Created client:', {
            id: persistentId,
            peerId: peerId,
            name: clientName,
            teamId: finalTeamId
          });
          console.log('[Host] Client added, total clients:', newMap.size, 'all client IDs:', Array.from(newMap.keys()), 'names:', Array.from(newMap.values()).map(c => c.name));
          console.log('[Host] Client details:', JSON.stringify({
            id: persistentId,
            peerId: peerId,
            name: clientName,
            joinedAt: existing?.joinedAt || Date.now(),
            teamId: finalTeamId,
            fromUserName: data.userName,
            fromClientState: data.clientState?.userName,
            persistentId: data.persistentId
          }));

          // Update peer mapping - remove old peerId mapping if this is a reconnection
          if (oldPeerId && oldPeerId !== peerId) {
            console.log('[Host] Removing old peerId mapping:', oldPeerId, '-> new peerId:', peerId);
            peerToPersistentIdRef.current.delete(oldPeerId);
          }
          peerToPersistentIdRef.current.set(peerId, persistentId);

          // Remove from disconnected clients tracking if present
          disconnectedClientsRef.current.delete(persistentId);

          console.log('[Host] About to return newMap with', newMap.size, 'clients, including:', Array.from(newMap.entries()).map(([id, c]) => `${id}=${c.name}`));

          return newMap;
        });
        // TEAM_LIST will be sent by useEffect when clients.size increases
        break;
      }

      case 'RECONNECT': {
        // Client is reconnecting after page refresh/disconnect
        const persistentId = data.persistentId || peerId;

        setClients(prev => {
          // Mutate prev in-place instead of creating new Map
          const existing = prev.get(persistentId);
          const oldPeerId = existing?.peerId;

          // If client has a saved team, only restore it if the team still exists
          let teamId: string | undefined = undefined;
          let teamScoreToRestore: number | undefined = undefined;

          // Check if existing teamId is still valid
          if (existing?.teamId && teamsRef.current.some((t: Team) => t.id === existing.teamId)) {
            teamId = existing.teamId;
          }
          // Or if client is requesting a specific team that exists
          if (data.teamId && teamsRef.current.some((t: Team) => t.id === data.teamId)) {
            teamId = data.teamId;
            // Check if client provided a team score
            if (data.teamScore !== undefined) {
              teamScoreToRestore = data.teamScore;
              console.log('[Host] Client', data.userName, 'reconnecting with team score:', teamScoreToRestore, 'for team:', teamId);
            }
          }
          // If client has a team name but the team doesn't exist, recreate it
          if (data.teamName && data.teamId && !teamsRef.current.some((t: Team) => t.id === data.teamId)) {
            console.log('[Host] Recreating team for reconnecting client:', data.teamName);
            const newTeam: Team = {
              id: data.teamId,
              name: data.teamName,
              createdAt: Date.now(),
              lastUsedAt: Date.now()
            };
            setTeams(prevTeams => {
              const updated = [...prevTeams, newTeam];
              broadcastTeams(updated);
              return updated;
            });
            teamId = data.teamId;
            teamScoreToRestore = data.teamScore;
          }

          // Mutate prev in-place (newMap is actually prev)
          prev.set(persistentId, {
            id: persistentId,
            peerId: peerId,
            name: data.userName,
            joinedAt: existing?.joinedAt || Date.now(),
            teamId: teamId,
            lastSeen: Date.now(),
            connectionQuality: existing?.connectionQuality || getDefaultQuality()
          });

          // Update peer mapping - remove old peerId mapping if this is a reconnection
          if (oldPeerId && oldPeerId !== peerId) {
            peerToPersistentIdRef.current.delete(oldPeerId);
          }
          peerToPersistentIdRef.current.set(peerId, persistentId);

          // Remove from disconnected clients tracking if present
          disconnectedClientsRef.current.delete(persistentId);

          // Return prev (same reference) for mutation
          return prev;
        });

        // Send current state back to client (teams, buzzer state, etc.)
        p2pManagerRef.current?.sendTo(peerId, {
          type: 'TEAM_LIST',
          teams: teamsRef.current,
          sessionVersion,
          hostId: hostUniqueId
        });

        // Send current buzzer state if active
        if (buzzerState.timerPhase !== 'inactive') {
          p2pManagerRef.current?.sendTo(peerId, {
            type: 'BUZZER_STATE',
            active: false,
            readingTimerRemaining: buzzerState.readingTimerRemaining,
            responseTimerRemaining: buzzerState.responseTimerRemaining,
            handicapActive: false,
            teamId: undefined
          });
        }

        // Send super game state if in super game phase
        if (superGamePhase !== 'idle') {
          sendSuperGameStateToClient(peerId);
        }

        break;
      }

      case 'GET_TEAMS':
        p2pManagerRef.current?.sendTo(peerId, { type: 'TEAM_LIST', teams: teamsRef.current, sessionVersion, hostId: hostUniqueId });
        break;

      case 'GET_SUPER_GAME_STATE':
        // Client requesting current super game state (e.g., after reconnection or sleep)
        // Send the appropriate state based on current phase
        sendSuperGameStateToClient(peerId);
        break;

      case 'CREATE_TEAM': {
        const newTeam: Team = {
          id: data.teamId,
          name: data.teamName,
          createdAt: Date.now(),
          lastUsedAt: Date.now()
        };

        setTeams(prev => {
          const updated = [...prev, newTeam];
          // Broadcast immediately with new team list
          broadcastTeams(updated);
          return updated;
        });

        // Update client's team using persistentId
        const persistentId = peerToPersistentIdRef.current.get(peerId) || peerId;
        setClients(prev => {
          const client = prev.get(persistentId);
          if (!client) return prev;
          return new Map(prev).set(persistentId, {
            ...client,
            teamId: newTeam.id,
            name: data.userName
          });
        });
        break;
      }

      case 'JOIN_TEAM':
        // Update team's lastUsedAt when someone joins
        setTeams(prev => {
          return prev.map(t => t.id === data.teamId ? { ...t, lastUsedAt: Date.now() } : t);
        });
        const joinPersistentId = peerToPersistentIdRef.current.get(peerId) || peerId;
        setClients(prev => {
          // Mutate prev in-place instead of creating new Map
          const client = prev.get(joinPersistentId);
          if (!client) return prev;
          prev.set(joinPersistentId, {
            ...client,
            teamId: data.teamId,
            name: data.userName
          });
          return prev;  // Return same reference
        });
        break;

      case 'PING': {
        const receivedAt = Date.now();
        const pingPersistentId = peerToPersistentIdRef.current.get(peerId) || peerId;
        const client = clients.get(pingPersistentId);
        const team = client?.teamId ? teamsRef.current.find(t => t.id === client.teamId) : undefined;

        const newLog: TimeLog = {
          id: `ping_${receivedAt}_${peerId}`,
          userName: data.userName,
          teamName: team?.name,
          sentAt: data.sentAt,
          receivedAt,
          latency: receivedAt - data.sentAt
        };

        // Update quality using persistentId
        updateClientQuality(pingPersistentId, newLog.latency, false);

        // Track buzz - when a client presses the Buzz button, it sends a PING
        setBuzzedClients(prev => new Map(prev).set(pingPersistentId, Date.now()));

        // Add team to buzzed teams for visual flash effect
        if (client?.teamId) {
          setBuzzedTeamIds(prev => new Set([...prev, client.teamId]));
          // Clear the team from buzzed teams after 1 second (flash duration)
          setTimeout(() => {
            setBuzzedTeamIds(prev => {
              const newSet = new Set(prev);
              newSet.delete(client.teamId);
              return newSet;
            });
          }, 1000);
        }

        // Ensure client exists (only for new connections before JOIN)
        // BUT don't create client if userName is empty - wait for JOIN message instead
        setClients(prev => {
          // Mutate prev in-place instead of creating new Map
          const existing = prev.get(pingPersistentId);
          // Also update peerId if it changed (mutate existing client directly)
          if (existing && existing.peerId !== peerId) {
            existing.peerId = peerId;
          }
          // Create new client only if userName is not empty
          if (!prev.has(pingPersistentId) && data.userName && data.userName.trim()) {
            console.log('[Host] PING: Creating new client from PING with name:', data.userName.trim());
            prev.set(pingPersistentId, {
              id: pingPersistentId,
              peerId: peerId,
              name: data.userName.trim(),
              joinedAt: Date.now(),
              lastSeen: Date.now(),
              connectionQuality: getDefaultQuality()
            });
          }
          return prev;  // Return same reference
        });

        setLogs(prev => [newLog, ...prev]);
        break;
      }

      case 'BUZZ': {
        // Handle buzz button press from client
        const receivedAt = Date.now();
        const buzzPersistentId = peerToPersistentIdRef.current.get(peerId) || peerId;
        const client = clients.get(buzzPersistentId);

        // Track buzz - mutate prev in-place
        setBuzzedClients(prev => {
          prev.set(buzzPersistentId, receivedAt);
          return prev;
        });

        // Determine which team ID to use for flash effect
        let teamIdToFlash: string | undefined;

        if (client?.teamId) {
          // Use the client's stored team ID
          teamIdToFlash = client.teamId;
        } else if (data.teamId) {
          // Check if data.teamId is already a valid team ID (starts with 'team_')
          if (data.teamId.startsWith('team_')) {
            const teamById = teamsRef.current.find(t => t.id === data.teamId);
            if (teamById) {
              teamIdToFlash = teamById.id;
              // Update client with the correct team ID - mutate in-place
              setClients(prev => {
                const c = prev.get(buzzPersistentId);
                if (c) {
                  c.teamId = teamById.id;
                }
                return prev;  // Return same reference
              });
            }
          } else {
            // data.teamId is actually a team name, find by name
            const teamByName = teamsRef.current.find(t => t.name === data.teamId);
            if (teamByName) {
              teamIdToFlash = teamByName.id;
              // Update client with the correct team ID - mutate in-place
              setClients(prev => {
                const c = prev.get(buzzPersistentId);
                if (c) {
                  c.teamId = teamByName.id;
                }
                return prev;  // Return same reference
              });
            }
          }
        }

        // Also try teamName if provided
        if (!teamIdToFlash && data.teamName) {
          const teamByName = teamsRef.current.find(t => t.name === data.teamName);
          if (teamByName) {
            teamIdToFlash = teamByName.id;
          }
        }

        // Add team to buzzed teams for visual flash effect
        if (teamIdToFlash) {
          setBuzzedTeamIds(prev => {
            // Mutate prev in-place
            prev.add(teamIdToFlash);
            return prev;  // Return same reference
          });
          // Clear the team from buzzed teams after 600ms (flash duration - 2 quick flashes)
          setTimeout(() => {
            setBuzzedTeamIds(prev => {
              // Mutate prev in-place
              prev.delete(teamIdToFlash);
              return prev;  // Return same reference
            });
          }, 600);

          // Answering team detection: ONLY during response timer phase, NOT during reading timer
          // Use ref to get current buzzer state (not stale state from closure)
          const currentState = buzzerStateRef.current;
          setAnsweringTeamId(prev => {
            // Strict check: ONLY when timerPhase is exactly 'response' AND reading timer is NOT active
            // NEVER set answering team during reading phase
            const isReadingActive = currentState.readingTimerRemaining > 0 || currentState.timerPhase === 'reading';
            const isResponseActive = currentState.timerPhase === 'response' && currentState.responseTimerRemaining > 0;

            if (!prev && isResponseActive && !isReadingActive) {
              return teamIdToFlash;
            }
            return prev;
          });
        }

        // Send acknowledgment back to client
        if (p2pManagerRef.current) {
          p2pManagerRef.current.sendTo(peerId, {
            type: 'BUZZ_ACK',
            buzzId: `buzz_${receivedAt}_${peerId}`
          });
        }
        break;
      }

      case 'HEALTH_RESPONSE': {
        const rtt = data.receivedAt - data.requestSentAt;
        updateClientQuality(peerId, rtt, false);
        break;
      }

      case 'TEAM_STATE_RESPONSE': {
        // Client responded with their team state
        const clientId = data.clientId;
        const clientName = data.clientName;
        const teamId = data.teamId;
        const teamName = data.teamName;

        // Update client's team
        setClients(prev => {
          // Mutate prev in-place
          const client = prev.get(clientId);
          if (!client) {
            // Client might not exist yet - create new by adding to prev
            prev.set(clientId, {
              id: clientId,
              peerId: peerId,
              name: clientName,
              joinedAt: Date.now(),
              teamId,
              lastSeen: Date.now(),
              connectionQuality: getDefaultQuality()
            });
          } else {
            // Update existing client
            client.teamId = teamId;
            client.name = clientName;
          }
          return prev;  // Return same reference
        });

        // If team exists, update its lastUsedAt
        if (teamId) {
          setTeams(prev => {
            const existing = prev.find(t => t.id === teamId);
            if (existing) {
              return prev.map(t => t.id === teamId ? { ...t, lastUsedAt: Date.now() } : t);
            } else if (teamName) {
              // Team doesn't exist but client claims to be in one - recreate it
              const newTeam: Team = {
                id: teamId,
                name: teamName,
                createdAt: Date.now(),
                lastUsedAt: Date.now()
              };
              return [...prev, newTeam];
            }
            return prev;
          });
        }
        break;
      }

      case 'SUPER_GAME_BET': {
        // Client placed a bet
        const { teamId, bet } = data;
        setSuperGameBets(prev => {
          const existing = prev.find(b => b.teamId === teamId);
          if (existing) {
            // Update existing bet
            return prev.map(b => b.teamId === teamId ? { ...b, bet } : b);
          }
          // Add new bet
          return [...prev, { teamId, bet, ready: true }];
        });
        // Send ACK to ALL clients in the same team
        clients.forEach((client) => {
          if (client.teamId === teamId) {
            p2pManagerRef.current?.sendTo(client.peerId, {
              type: 'SUPER_GAME_BET_ACK',
              teamId
            });
          }
        });
        break;
      }

      case 'SUPER_GAME_TEAM_ANSWER': {
        // Client submitted an answer
        const { teamId, answer } = data;
        setSuperGameAnswers(prev => {
          const existing = prev.find(a => a.teamId === teamId);
          if (existing) {
            // Update existing answer and mark as submitted
            return prev.map(a => a.teamId === teamId ? { ...a, answer, submitted: true } : a);
          }
          // Add new answer with submitted flag
          return [...prev, { teamId, answer, revealed: false, submitted: true }];
        });
        // Broadcast to all clients that this team has submitted their answer
        broadcastMessage({
          type: 'SUPER_GAME_ANSWER_SUBMITTED',
          teamId
        });
        break;
      }
    }
  }, [clients, broadcastTeams]);

  // Update client quality
  const updateClientQuality = useCallback((clientId: string, rtt: number, packetLost: boolean) => {
    setClients(prev => {
      // Mutate prev in-place
      const client = prev.get(clientId);
      if (!client) return prev;

      const newQuality = updateQualityMetrics(client.connectionQuality, rtt, packetLost);
      client.connectionQuality = newQuality;
      return prev;  // Return same reference
    });
  }, []);

  // Health checks
  useEffect(() => {
    if (!isSessionActive || clients.size === 0) return;

    healthCheckIntervalRef.current = setInterval(() => {
      const now = Date.now();
      clients.forEach((client) => {
        // Don't check isConnected - let sendTo use RELAY fallback if P2P is down
        p2pManagerRef.current?.sendTo(client.peerId, {
          type: 'HEALTH_CHECK',
          sentAt: now,
          messageId: `health_${client.id}_${now}`
        });
      });
    }, CONNECTION_CONFIG.HEALTH_CHECK_INTERVAL);

    return () => {
      if (healthCheckIntervalRef.current) {
        clearInterval(healthCheckIntervalRef.current);
      }
    };
  }, [isSessionActive, clients]);

  // Clean up clients that disconnected and didn't reconnect after 30 seconds
  useEffect(() => {
    const DISCONNECTED_CLIENT_TIMEOUT = 30 * 1000; // 30 seconds

    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      const toRemove: string[] = [];

      for (const [persistentId, disconnectTimestamp] of disconnectedClientsRef.current.entries()) {
        if (now - disconnectTimestamp > DISCONNECTED_CLIENT_TIMEOUT) {
          toRemove.push(persistentId);
        }
      }

      if (toRemove.length > 0) {
        console.log('[Host] Cleaning up disconnected clients:', toRemove);
        toRemove.forEach(persistentId => {
          disconnectedClientsRef.current.delete(persistentId);
        });

        // Remove from clients map - mutate prev in-place
        setClients(prev => {
          toRemove.forEach(persistentId => {
            prev.delete(persistentId);
          });
          return prev;  // Return same reference
        });
      }
    }, 10000); // Check every 10 seconds

    return () => clearInterval(cleanupInterval);
  }, []);

  // Auto-cleanup empty teams after 5 minutes (300000ms)
  useEffect(() => {
    const EMPTY_TEAM_TIMEOUT = 5 * 60 * 1000; // 5 minutes

    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      const clientTeamIds = new Set(Array.from(clients.values()).map((c: ConnectedClient) => c.teamId).filter(Boolean) as string[]);

      setTeams(prev => {
        const filtered = prev.filter(team => {
          const hasPlayers = clientTeamIds.has(team.id);
          const isRecent = (now - team.lastUsedAt) < EMPTY_TEAM_TIMEOUT;
          return hasPlayers || isRecent;
        });

        if (filtered.length !== prev.length) {
          // Broadcast updated team list immediately
          broadcastTeams(filtered);
        }

        return filtered;
      });
    }, 60000); // Check every minute

    return () => clearInterval(cleanupInterval);
  }, [clients, broadcastTeams]);

  // Reset super game state when session starts/ends
  useEffect(() => {
    if (!isSessionActive) {
      setSuperGameBets([]);
      setSuperGameAnswers([]);
    }
  }, [isSessionActive]);

  // Track previous team assignments to update lastUsedAt when players leave teams
  const prevClientTeamIdsRef = useRef<Map<string, string | undefined>>(new Map());
  useEffect(() => {
    const currentTeamIds = new Map(Array.from(clients.entries()).map(([id, c]) => [id, c.teamId]));
    const prevTeamIds = prevClientTeamIdsRef.current;

    // Find players who left their teams
    for (const [clientId, prevTeamId] of prevTeamIds.entries()) {
      const currentTeamId = currentTeamIds.get(clientId);
      if (prevTeamId && currentTeamId !== prevTeamId) {
        // Player left team or was removed
        setTeams(prev => {
          return prev.map(t => t.id === prevTeamId ? { ...t, lastUsedAt: Date.now() } : t);
        });
      }
    }

    prevClientTeamIdsRef.current = currentTeamIds;
  }, [clients]);

  const removeClient = useCallback((clientId: string) => {
    // Notify client they're being removed
    kickClient(clientId);
  }, [kickClient]);

  // Delete a team
  const deleteTeam = useCallback((teamId: string) => {
    setTeams(prev => {
      const updated = prev.filter(t => t.id !== teamId);
      // Broadcast TEAM_DELETED to all clients first
      clientsRef.current.forEach((client) => {
        p2pManagerRef.current?.sendTo(client.peerId, { type: 'TEAM_DELETED', teamId });
      });
      // Broadcast updated team list
      broadcastTeams(updated);
      // Remove team from all clients - mutate clients in-place
      setClients(clientsPrev => {
        clientsPrev.forEach((client, clientId) => {
          if (client.teamId === teamId) {
            client.teamId = undefined;
          }
        });
        return clientsPrev;  // Return same reference
      });
      return updated;
    });
  }, [broadcastTeams]);

  // Rename a team
  const renameTeam = useCallback((teamId: string, newName: string) => {
    setTeams(prev => {
      const updated = prev.map(t => t.id === teamId ? { ...t, name: newName } : t);
      // Broadcast updated team list immediately
      broadcastTeams(updated);
      return updated;
    });
  }, [broadcastTeams]);

  const getClientTeamName = useCallback((clientId: string) => {
    const client = clients.get(clientId);
    if (!client?.teamId) return undefined;
    return teams.find(t => t.id === client.teamId)?.name;
  }, [clients, teams]);

  // Move client to team (drag and drop)
  const moveClientToTeam = useCallback((clientId: string, targetTeamId: string | undefined) => {
    setClients(prev => {
      // Mutate prev in-place
      const client = prev.get(clientId);
      if (client) {
        client.teamId = targetTeamId;
      }
      return prev;  // Return same reference
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

  // --- LOBBY VIEW ---
  if (!isSessionActive) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col p-6 items-center justify-center">
        <header className="absolute top-6 right-6">
          <div className={`flex items-center space-x-2 px-3 py-1 rounded-full ${isOnline ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
            <Wifi className="w-3 h-3" />
            <span className="text-xs font-semibold uppercase">{isOnline ? 'Online' : 'Offline'}</span>
          </div>
        </header>

        <div className="w-full max-w-6xl grid lg:grid-cols-2 gap-8 md:gap-12 animate-in fade-in duration-500 cursor-default">
          {/* LEFT COLUMN: Setup & QR */}
          <div className="flex flex-col space-y-6">
            {/* IP Input */}
            <div className="bg-gray-900 border border-gray-800 p-4 rounded-lg shadow-lg cursor-default">
               <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-2">Local Network IP</label>
               <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    placeholder="e.g., 192.168.1.5"
                    value={ipInput}
                    onChange={(e) => setIpInput(e.target.value)}
                    disabled={isIpLocked}
                    className={`flex-1 bg-gray-950 border rounded-lg px-4 py-2 text-white text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all placeholder:text-gray-600 ${isIpLocked ? 'border-gray-600 bg-gray-900 text-gray-400 cursor-not-allowed' : 'border-gray-700'}`}
                  />
                  {isIpLocked ? (
                    <button onClick={handleUnlockIp} className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-gray-300 transition-colors" title="Change IP">
                      <Settings className="w-5 h-5" />
                    </button>
                  ) : (
                    <button onClick={handleLockIp} disabled={!ipInput.trim()} className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${ipInput.trim() ? 'bg-green-600 hover:bg-green-500 text-white' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`} title="Enter IP address">
                      OK
                    </button>
                  )}
               </div>
               {isIpLocked && status === ConnectionStatus.WAITING && (
                 <div className="mt-2 flex items-center gap-2 text-xs">
                   <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                   <span className="text-gray-500">Server running • Waiting for connections...</span>
                 </div>
               )}
            </div>

            {/* QR Code */}
            <div className="relative aspect-square w-full bg-gray-900 border border-gray-800 rounded-lg shadow-2xl overflow-hidden flex flex-col items-center justify-center p-8 group cursor-default">
              <div className="absolute inset-0 bg-blue-600/5 blur-[80px] rounded-full pointer-events-none group-hover:bg-blue-600/10 transition-colors duration-500"></div>
              <div
                className="relative z-10 bg-white p-4 rounded-lg shadow-xl transition-transform duration-300 hover:scale-105 cursor-pointer"
                onDoubleClick={() => finalQrUrl && window.open(finalQrUrl, '_blank')}
                title="Double-click to open link"
              >
                {status === ConnectionStatus.ERROR ? (
                  <div className="w-80 h-80 bg-red-50 rounded flex flex-col items-center justify-center text-center p-6 space-y-4">
                    <AlertCircle className="w-10 h-10 text-red-500" />
                    <p className="text-red-900 font-bold">Connection Error</p>
                    <p className="text-red-800 text-xs">Could not connect to signalling server</p>
                    <p className="text-red-700 text-xs mt-2">Make sure the server is running!</p>
                  </div>
                ) : !isIpLocked ? (
                  <div className="w-[350px] h-[350px] bg-gray-100 rounded-lg flex flex-col items-center justify-center text-center p-6 space-y-3">
                    <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center">
                      <Settings className="w-8 h-8 text-gray-400" />
                    </div>
                    <p className="text-gray-600 font-medium">Enter your configuration</p>
                    <p className="text-gray-400 text-sm">Type your name and IP, then click OK</p>
                  </div>
                ) : status === ConnectionStatus.INITIALIZING ? (
                  <div className="w-[350px] h-[350px] bg-gray-100 rounded flex items-center justify-center">
                    <RefreshCw className="w-10 h-10 text-gray-400 animate-spin" />
                  </div>
                ) : (
                  <QRCodeSVG value={finalQrUrl} size={350} level="H" includeMargin={true} />
                )}
              </div>
              <div className="mt-6 text-center z-10">
                 <p className="text-gray-300 font-medium">Scan to Connect</p>
                 <p className="text-gray-500 text-sm mt-1">Ensure devices are on the same Wi-Fi</p>
                 <p className="text-gray-600 text-xs mt-2">Double-click QR to open link</p>
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
                   {clients.size === 0 && teams.length === 0 ? (
                     <div className="h-full flex flex-col items-center justify-center text-gray-600 opacity-60">
                        <Smartphone className="w-12 h-12 mb-2" />
                        <p>No devices connected</p>
                     </div>
                   ) : sessionSettings.noTeamsMode ? (
                     // No Teams Mode - show all players individually
                     Array.from(clients.values()).map((client: ConnectedClient) => (
                       <SimpleClientItem
                         key={client.id}
                         client={client}
                         isStale={isStale}
                         hasBuzzed={buzzedClients.has(client.id)}
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
                             isStale={isStale}
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
                         isStale={isStale}
                         draggedClientId={draggedClientId}
                         onDragStart={handleDragStart}
                         onDragEnd={handleDragEnd}
                         onRemoveClient={removeClient}
                         getHealthBgColor={getHealthBgColor}
                       />
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
               <Button size="xl" variant="secondary" className="px-6" onClick={() => setShowGameSelector(true)} disabled={status === ConnectionStatus.INITIALIZING || status === ConnectionStatus.ERROR || !isOnline || !isIpLocked}>
                  Select Game
               </Button>
               <Button size="xl" className="flex-1 shadow-blue-900/20" onClick={() => {
                 // Generate new session version to help clients detect this is a fresh session
                 const newVersion = `v_${Date.now()}`;
                 setSessionVersion(newVersion);
                 storage.set(STORAGE_KEYS.SESSION_VERSION, newVersion);
                 setIsSessionActive(true);
               }} disabled={status === ConnectionStatus.INITIALIZING || status === ConnectionStatus.ERROR || !isOnline || !isIpLocked}>
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
          onRegenerateHostId={() => {
            const newHostId = generateHostUniqueId();
            setHostUniqueId(newHostId);
            storage.set(STORAGE_KEYS.HOST_UNIQUE_ID, newHostId);
            console.log('[Host] Regenerated hostUniqueId:', newHostId);
          }}
          hostUniqueId={hostUniqueId}
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
    />
  );
};

// Helper functions
function isStale(lastSeen: number): boolean {
  return Date.now() - lastSeen > CONNECTION_CONFIG.CLIENT_STALE_THRESHOLD;
}
