import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { ConnectionStatus, ConnectionQuality } from '../types';
import { CONNECTION_CONFIG } from '../config';
import { Wifi, AlertTriangle, User, ArrowRight, Plus, Users, Loader2, RefreshCw, Settings, Trash2, LogOut } from 'lucide-react';
import { Button } from './Button';
import { P2PManager, generatePeerId, getSignallingServerUrl, GameMessage } from '../utils/p2p';
import { useBuzzerDebounce } from '../hooks/useBuzzerDebounce';
import { storage, STORAGE_KEYS } from '../hooks/useLocalStorage';
import { getHealthColor, getHealthBgColor, updateQualityMetrics } from '../hooks/useConnectionQuality';

export const MobileView: React.FC = () => {
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.INITIALIZING);
  const [hostId, setHostId] = useState<string | null>(null);
  const [ipInput, setIpInput] = useState<string>('');
  const [isIpLocked, setIsIpLocked] = useState<boolean>(false);

  // Restore user name and team selection for automatic reconnection after page refresh
  const [userName, setUserName] = useState<string>(() => {
    return storage.get(STORAGE_KEYS.USER_NAME, '') ?? '';
  });
  const [isNameSubmitted, setIsNameSubmitted] = useState<boolean>(() => {
    // Auto-submit if we have a saved name and host
    return !!(storage.get(STORAGE_KEYS.USER_NAME) && storage.get(STORAGE_KEYS.LAST_HOST));
  });
  const [isTeamSelected, setIsTeamSelected] = useState<boolean>(() => {
    // Check if we have a saved team (not just the flag)
    const savedTeam = storage.get(STORAGE_KEYS.CURRENT_TEAM);
    const savedTeamId = storage.get(STORAGE_KEYS.CURRENT_TEAM_ID);
    return !!(savedTeam || savedTeamId);
  });
  const [teams, setTeams] = useState<Array<{ id: string; name: string; createdAt: number; lastUsedAt: number }>>([]);
  const [newTeamName, setNewTeamName] = useState<string>('');
  const [currentTeam, setCurrentTeam] = useState<string | null>(() => {
    return storage.get(STORAGE_KEYS.CURRENT_TEAM);
  });
  const [currentTeamId, setCurrentTeamId] = useState<string | null>(() => {
    return storage.get(STORAGE_KEYS.CURRENT_TEAM_ID);
  });
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  // Buzzer state from host
  const [buzzerState, setBuzzerState] = useState<{
    active: boolean;
    timerPhase: 'reading' | 'response' | 'complete' | 'inactive';
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

  // Connection quality tracking
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>({
    rtt: 0,
    packetLoss: 0,
    jitter: 0,
    lastPing: Date.now(),
    healthScore: 100
  });

  // White flash for early buzz during reading phase
  const [showWhiteFlash, setShowWhiteFlash] = useState(false);

  // Super Game state
  const [superGamePhase, setSuperGamePhase] = useState<'idle' | 'placeBets' | 'showQuestion' | 'showWinner'>('idle');
  const [superGameTheme, setSuperGameTheme] = useState<{ id: string; name: string } | null>(null);
  const [superGameMaxBet, setSuperGameMaxBet] = useState(100);
  const [superGameBet, setSuperGameBet] = useState<number>(0);
  const [superGameQuestion, setSuperGameQuestion] = useState<{ text: string; media?: { type: string; url?: string } } | null>(null);
  const [superGameAnswer, setSuperGameAnswer] = useState<string>('');
  const [superGameWinner, setSuperGameWinner] = useState<{ winnerTeamName: string; finalScores: { teamId: string; teamName: string; score: number }[] } | null>(null);
  const [betPlaced, setBetPlaced] = useState(false);
  // Flag to track if host sent place bets message but user hasn't opened the UI yet
  const [pendingSuperGame, setPendingSuperGame] = useState<{ maxBet: number; theme?: { id: string; name: string } } | null>(null);

  const [retryCount, setRetryCount] = useState(0);
  // Use persistent client ID to recognize returning players
  const [clientId] = useState<string>(() => {
    const saved = storage.get(STORAGE_KEYS.CLIENT_ID);
    if (saved) {
      console.log('[MobileView] Using saved CLIENT_ID:', saved);
      return saved;
    }
    const newId = generatePeerId();
    storage.setWithTTL(STORAGE_KEYS.CLIENT_ID, STORAGE_KEYS.CLIENT_ID_TTL, newId);
    console.log('[MobileView] Generated new CLIENT_ID:', newId);
    return newId;
  });
  const [isIpFromQr, setIsIpFromQr] = useState<boolean>(false);

  // Debounce for buzzer to prevent rapid-fire presses
  const { debouncedCallback: debounceBuzz } = useBuzzerDebounce(300);

  const p2pManagerRef = useRef<P2PManager | null>(null);
  const heartbeatIntervalRef = useRef<number | null>(null);
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingHealthCheckRef = useRef<{ messageId: string; sentAt: number } | null>(null);

  // Calculate health color using utility function
  const healthColor = useMemo(() => getHealthColor(connectionQuality.healthScore), [connectionQuality.healthScore]);
  const healthBgColor = useMemo(() => getHealthBgColor(connectionQuality.healthScore), [connectionQuality.healthScore]);

  // Update connection quality metrics using utility function
  const updateQuality = useCallback((rtt: number, packetLost: boolean = false) => {
    setConnectionQuality(prev => updateQualityMetrics(prev, rtt, packetLost));
  }, []);

  // Send join/reconnect message
  const sendJoinMessage = useCallback((peerId: string, name: string, isReconnect: boolean = false) => {
    if (!p2pManagerRef.current) {
      return false;
    }

    // Get team info from both state and storage (storage has priority for reconnection)
    const teamIdFromState = currentTeamId;
    const teamNameFromState = currentTeam;
    const teamIdFromStorage = storage.get<string>(STORAGE_KEYS.CURRENT_TEAM_ID);
    const teamNameFromStorage = storage.get<string>(STORAGE_KEYS.CURRENT_TEAM);
    const finalTeamId = teamIdFromStorage || teamIdFromState;
    const finalTeamName = teamNameFromStorage || teamNameFromState;

    // If reconnecting and we have team info, send RECONNECT message
    if (isReconnect && (finalTeamId || finalTeamName)) {
      const payload: GameMessage = {
        type: 'RECONNECT',
        userName: name,
        persistentId: clientId,
        teamId: finalTeamId || undefined,
        teamName: finalTeamName || undefined
      };
      console.log('[MobileView] Sending RECONNECT message with team:', finalTeamName, 'id:', finalTeamId);
      return p2pManagerRef.current.sendTo(peerId, payload);
    }

    // Otherwise send normal JOIN message
    const payload: GameMessage = {
      type: 'JOIN',
      sentAt: Date.now(),
      messageId: `join_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      userName: name,
      persistentId: clientId // Send persistent ID to recognize returning players
    };

    return p2pManagerRef.current.sendTo(peerId, payload);
  }, [clientId, currentTeamId, currentTeam]);

  // Request state sync from host
  const requestStateSync = useCallback((peerId: string) => {
    console.log('[MobileView] Requesting state sync from host:', peerId);
    if (p2pManagerRef.current) {
      const sent = p2pManagerRef.current.sendTo(peerId, { type: 'GET_TEAMS' });
      console.log('[MobileView] GET_TEAMS sent:', sent);

      syncTimeoutRef.current = setTimeout(() => {
        console.log('[MobileView] Retrying GET_TEAMS request');
        p2pManagerRef.current?.sendTo(peerId, { type: 'GET_TEAMS' });
      }, 5000);
    }
  }, []);

  // Refresh teams list - use hostId directly for RELAY fallback support
  const refreshTeams = useCallback(() => {
    if (hostId && p2pManagerRef.current) {
      requestStateSync(hostId);
    }
  }, [requestStateSync, hostId]);

  // Reset state (for debugging or starting over)
  const resetState = useCallback(() => {
    storage.clearAll();
    window.location.reload();
  }, []);

  // Reset super game state
  const resetSuperGameState = useCallback(() => {
    setSuperGamePhase('idle');
    setSuperGameTheme(null);
    setSuperGameMaxBet(100);
    setSuperGameBet(0);
    setSuperGameQuestion(null);
    setSuperGameAnswer('');
    setSuperGameWinner(null);
    setBetPlaced(false);
    setPendingSuperGame(null);
  }, []);

  // Handle incoming game data
  const handleGameData = useCallback((data: GameMessage, peerId: string) => {
    console.log('[MobileView] Received game data:', data.type, 'from', peerId, data);
    switch (data.type) {
      case 'TEAM_LIST':
        console.log('[MobileView] Received TEAM_LIST with', data.teams.length, 'teams');
        setTeams(data.teams);

        // Check if our saved team still exists (for reconnection after F5)
        const savedTeamId = storage.get(STORAGE_KEYS.CURRENT_TEAM_ID);
        if (savedTeamId) {
          const teamExists = data.teams.some(t => t.id === savedTeamId);
          if (!teamExists) {
            console.log('[MobileView] Our saved team no longer exists, clearing team selection');
            setCurrentTeam(null);
            setCurrentTeamId(null);
            setIsTeamSelected(false);
            storage.remove(STORAGE_KEYS.CURRENT_TEAM);
            storage.remove(STORAGE_KEYS.CURRENT_TEAM_ID);
            storage.remove(STORAGE_KEYS.TEAM_SELECTED);
            storage.remove(STORAGE_KEYS.CURRENT_TEAM_TTL);
            storage.remove(STORAGE_KEYS.CURRENT_TEAM_ID_TTL);
            storage.remove(STORAGE_KEYS.TEAM_SELECTED_TTL);
          } else {
            console.log('[MobileView] Our saved team still exists, keeping team selection');
          }
        }

        if (syncTimeoutRef.current) {
          clearTimeout(syncTimeoutRef.current);
          syncTimeoutRef.current = null;
        }
        break;

      case 'STATE_SYNC':
        setTeams(data.teams);
        if (syncTimeoutRef.current) {
          clearTimeout(syncTimeoutRef.current);
          syncTimeoutRef.current = null;
        }
        break;

      case 'BUZZER_STATE':
        // Update buzzer state from host
        // Reset super game state when buzzer becomes active (new regular question)
        if (data.active && data.timerPhase === 'reading' && superGamePhase !== 'idle') {
          resetSuperGameState();
        }
        setBuzzerState({
          active: data.active,
          timerPhase: data.timerPhase ?? 'inactive',
          readingTimerRemaining: data.readingTimerRemaining ?? 0,
          responseTimerRemaining: data.responseTimerRemaining ?? 0,
          handicapActive: data.handicapActive ?? false,
          handicapTeamId: data.teamId
        });
        break;

      case 'TEAM_STATE_REQUEST': {
        // Host is asking for our current team state
        // Use currentTeamId from state (or storage as fallback)
        const savedTeamId = storage.get(STORAGE_KEYS.CURRENT_TEAM_ID);
        const savedTeamName = storage.get(STORAGE_KEYS.CURRENT_TEAM);
        if (p2pManagerRef.current) {
          p2pManagerRef.current.sendTo(peerId, {
            type: 'TEAM_STATE_RESPONSE',
            clientId: clientId,
            clientName: userName,
            teamId: currentTeamId || savedTeamId || undefined,
            teamName: currentTeam || savedTeamName || undefined
          });
        }
        break;
      }

      case 'HEALTH_CHECK': {
        // Respond to health check
        if (p2pManagerRef.current) {
          const response: GameMessage = {
            type: 'HEALTH_RESPONSE',
            requestSentAt: data.sentAt,
            receivedAt: Date.now(),
            messageId: data.messageId
          };
          p2pManagerRef.current.sendTo(peerId, response);
        }
        break;
      }

      case 'PING': {
        // Calculate RTT from host ping
        const rtt = Date.now() - data.sentAt;
        updateQuality(rtt, false);

        // Send ACK back
        if (p2pManagerRef.current) {
          p2pManagerRef.current.sendTo(peerId, {
            type: 'ACK',
            messageId: String(data.messageId)
          });
        }
        break;
      }

      case 'KICK_CLIENT':
        // Host kicked us - clear all cache and reset to name entry screen
        console.log('[MobileView] Received KICK_CLIENT from host, clearing cache and resetting');
        resetState();
        break;

      case 'TEAM_DELETED':
        // Host deleted a team - if we were in that team, reset our team selection
        console.log('[MobileView] Received TEAM_DELETED for team:', data.teamId, ', our team:', currentTeamId);
        if (currentTeamId === data.teamId) {
          console.log('[MobileView] We were in the deleted team, resetting team selection');
          setCurrentTeam(null);
          setCurrentTeamId(null);
          setIsTeamSelected(false);
          storage.remove(STORAGE_KEYS.CURRENT_TEAM);
          storage.remove(STORAGE_KEYS.CURRENT_TEAM_ID);
          storage.remove(STORAGE_KEYS.TEAM_SELECTED);
          // Also remove TTL keys
          storage.remove(STORAGE_KEYS.CURRENT_TEAM_TTL);
          storage.remove(STORAGE_KEYS.CURRENT_TEAM_ID_TTL);
          storage.remove(STORAGE_KEYS.TEAM_SELECTED_TTL);
        }
        // Update teams list to remove the deleted team
        setTeams(prev => prev.filter(t => t.id !== data.teamId));
        break;

      case 'CLEAR_CACHE':
        // Host requested cache clear - reset everything
        console.log('[MobileView] Received CLEAR_CACHE from host, resetting all state');
        resetState();
        break;

      case 'SUPER_GAME_PLACE_YOUR_BETS':
        // Host is asking teams to place bets
        console.log('[MobileView] SUPER_GAME_PLACE_YOUR_BETS', data);
        // If user has already selected a team, show the betting UI immediately
        if (isTeamSelected) {
          setSuperGamePhase('placeBets');
          setSuperGameMaxBet(data.maxBet);
          setBetPlaced(false);
          setSuperGameBet(0);
        } else {
          // Store the pending super game info to show when user selects a team
          setPendingSuperGame({ maxBet: data.maxBet });
          console.log('[MobileView] Super game pending - waiting for team selection');
        }
        break;

      case 'SUPER_GAME_BET_ACK':
        // Host acknowledged our bet
        console.log('[MobileView] SUPER_GAME_BET_ACK', data);
        setBetPlaced(true);
        break;

      case 'SUPER_GAME_SHOW_QUESTION':
        // Host is showing the super game question
        console.log('[MobileView] SUPER_GAME_SHOW_QUESTION', data);
        setSuperGamePhase('showQuestion');
        setSuperGameTheme({ id: data.themeId, name: data.themeName });
        setSuperGameQuestion({
          text: data.questionText,
          media: data.questionMedia
        });
        setSuperGameAnswer('');
        break;

      case 'SUPER_GAME_SHOW_WINNER':
        // Host is showing the winner
        console.log('[MobileView] SUPER_GAME_SHOW_WINNER', data);
        setSuperGamePhase('showWinner');
        setSuperGameWinner({
          winnerTeamName: data.winnerTeamName,
          finalScores: data.finalScores
        });
        break;
    }
  }, [updateQuality, resetState, resetSuperGameState, currentTeamId, currentTeam, userName, clientId, superGamePhase]);

  // Initialize state from Storage & URL
  useEffect(() => {
    // Clean up expired client data first (5 hour TTL)
    storage.cleanupExpiredClientData();

    const params = new URLSearchParams(window.location.hash.split('?')[1]);
    const urlHost = params.get('host');
    const urlIp = params.get('ip');

    if (urlHost) {
      setHostId(urlHost);
      storage.setWithTTL(STORAGE_KEYS.LAST_HOST, STORAGE_KEYS.LAST_HOST_TTL, urlHost);
    } else {
      const savedHost = storage.get(STORAGE_KEYS.LAST_HOST);
      if (savedHost) {
        setHostId(savedHost);
      }
      // If no saved host, stay in WAITING status and show IP input screen
    }

    // Load IP from URL (from QR code) or restore from storage for reconnection
    if (urlIp) {
      setIpInput(urlIp);
      setIsIpLocked(true);
      setIsIpFromQr(true);
      storage.setWithTTL(STORAGE_KEYS.LAST_IP, STORAGE_KEYS.LAST_IP_TTL, urlIp);
    } else {
      const savedIp = storage.get(STORAGE_KEYS.LAST_IP);
      if (savedIp && hostId) {
        // Auto-connect with saved IP if we have a saved host too
        setIpInput(savedIp);
        setIsIpLocked(true);
      }
    }
  }, []);

  // Teams are managed by host - no local persistence needed

  // Initialize P2P connection
  useEffect(() => {
    if (!hostId || !userName || !ipInput || !isNameSubmitted) return;

    // Only create new manager if we don't have one or if critical params changed
    // Don't recreate just because of state changes like team selection
    if (p2pManagerRef.current) {
      const currentUrl = getSignallingServerUrl(ipInput);
      // Check if we need to reconnect (URL or host changed)
      // For now, we'll keep existing manager unless explicitly destroyed
      console.log('[MobileView] P2P manager already exists, skipping recreation');
      return;
    }

    const signallingUrl = getSignallingServerUrl(ipInput);

    // Set connecting status before starting connection
    setStatus(ConnectionStatus.CONNECTING);

    const manager = new P2PManager(
      {
        signallingUrl,
        peerId: clientId,
        peerName: userName,
        role: 'client',
        targetPeerId: hostId
      },
      {
        onSignallingConnected: () => {
          console.log('[MobileView] Signalling server connected, sending initial messages via RELAY');
          setStatus(ConnectionStatus.CONNECTED);
          setRetryCount(0);

          // Send JOIN/RECONNECT and GET_TEAMS immediately via signalling server (RELAY fallback)
          // This works even if P2P connection fails
          if (hostId) {
            // Check if we're reconnecting (have saved team info) - read directly from storage
            const savedTeamId = storage.get(STORAGE_KEYS.CURRENT_TEAM_ID);
            const savedTeamName = storage.get(STORAGE_KEYS.CURRENT_TEAM);
            const isReconnecting = !!(savedTeamId || savedTeamName);
            sendJoinMessage(hostId, userName, isReconnecting);
            requestStateSync(hostId);
          }
        },
        onConnected: (peerId) => {
          console.log('[MobileView] P2P DataChannel connected, peerId:', peerId);
          setStatus(ConnectionStatus.CONNECTED);
          setRetryCount(0);
          // P2P connection is now established, but we already sent JOIN/GET_TEAMS via RELAY
        },
        onDisconnected: () => {
          setStatus(ConnectionStatus.RECONNECTING);
        },
        onData: handleGameData,
        onError: (error) => {
          console.error('[MobileView] P2P error:', error);
          setStatus(ConnectionStatus.ERROR);
        }
      }
    );

    p2pManagerRef.current = manager;

    // Connect to signalling server
    manager.connect().catch((e) => {
      console.error('[MobileView] Failed to connect to signalling server:', e);
      setStatus(ConnectionStatus.ERROR);
    });

    return () => {
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
      // Don't destroy manager here - we want to keep it alive
      // Only destroy on explicit reset or unmount
    };
  }, [hostId, userName, ipInput, clientId, isNameSubmitted]);

  // Network status monitoring
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setStatus(ConnectionStatus.DISCONNECTED);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Visibility change handler - use hostId directly for RELAY fallback support
  useEffect(() => {
    if (!hostId || !p2pManagerRef.current) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && p2pManagerRef.current) {
        p2pManagerRef.current.sendTo(hostId, {
          type: 'HEARTBEAT',
          sentAt: Date.now(),
          messageId: `visibility_${Date.now()}`,
          userName: userName
        });
        requestStateSync(hostId);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [hostId, userName, requestStateSync]);

  // Heartbeat to host - use hostId directly for RELAY fallback support
  useEffect(() => {
    if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);

    if (status === ConnectionStatus.CONNECTED && p2pManagerRef.current && hostId) {
      heartbeatIntervalRef.current = window.setInterval(() => {
        p2pManagerRef.current?.sendTo(hostId, {
          type: 'HEARTBEAT',
          sentAt: Date.now(),
          messageId: `hb_${Date.now()}`,
          userName: userName
        });
      }, 4000);
    }

    return () => {
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
    };
  }, [status, userName, hostId]);

  // Periodic quality report to host - use hostId directly for RELAY fallback support
  useEffect(() => {
    if (status !== ConnectionStatus.CONNECTED || !p2pManagerRef.current || !hostId) return;

    const interval = setInterval(() => {
      if (connectionQuality.rtt > 0) {
        p2pManagerRef.current?.sendTo(hostId, {
          type: 'QUALITY_REPORT',
          rtt: connectionQuality.rtt,
          jitter: connectionQuality.jitter
        });
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [status, connectionQuality, hostId]);

  // --- HANDLERS ---
  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userName.trim()) return;
    // Save userName to storage for reconnection after page refresh (with 5 hour TTL)
    storage.setWithTTL(STORAGE_KEYS.USER_NAME, STORAGE_KEYS.USER_NAME_TTL, userName);
    setIsNameSubmitted(true);
  };

  const handleIpLock = () => {
    if (!ipInput.trim()) return;
    storage.setWithTTL(STORAGE_KEYS.LAST_IP, STORAGE_KEYS.LAST_IP_TTL, ipInput);
    setIsIpLocked(true);
  };

  const handleIpUnlock = () => {
    setIsIpLocked(false);
  };

  const handleResetConnection = () => {
    // Use resetState to clear everything and reload
    resetState();
  };

  const handleCreateTeam = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('[CREATE_TEAM] Form submitted, teamName:', newTeamName, 'hostId:', hostId);

    if (!newTeamName.trim() || !p2pManagerRef.current || !hostId) {
      console.log('[CREATE_TEAM] Early return - no team name, no p2p manager, or no hostId');
      return;
    }

    // Use hostId directly instead of getConnectedPeers() - this works via RELAY even when P2P fails
    const teamId = `team_${Date.now()}`;
    console.log('[CREATE_TEAM] Sending CREATE_TEAM message to host:', hostId, { teamId, teamName: newTeamName, userName });
    const sent = p2pManagerRef.current.sendTo(hostId, {
      type: 'CREATE_TEAM',
      teamId,
      teamName: newTeamName,
      userName
    });
    console.log('[CREATE_TEAM] Message sent result:', sent);
    setCurrentTeam(newTeamName);
    setCurrentTeamId(teamId);  // Store the team ID for BUZZ messages
    setIsTeamSelected(true);
    setNewTeamName('');

    // Save team selection to storage for reconnection (with 5 hour TTL)
    storage.setWithTTL(STORAGE_KEYS.CURRENT_TEAM, STORAGE_KEYS.CURRENT_TEAM_TTL, newTeamName);
    storage.setWithTTL(STORAGE_KEYS.CURRENT_TEAM_ID, STORAGE_KEYS.CURRENT_TEAM_ID_TTL, teamId);
    storage.setWithTTL(STORAGE_KEYS.TEAM_SELECTED, STORAGE_KEYS.TEAM_SELECTED_TTL, 'true');

    // If there's a pending super game, open the betting UI
    if (pendingSuperGame) {
      console.log('[CREATE_TEAM] Opening super game UI after team creation');
      setSuperGamePhase('placeBets');
      setSuperGameMaxBet(pendingSuperGame.maxBet);
      setSuperGameTheme(pendingSuperGame.theme || null);
      setBetPlaced(false);
      setSuperGameBet(0);
      setPendingSuperGame(null);
    }
  };

  const handleJoinTeam = (teamId: string, teamName: string) => {
    console.log('[JOIN_TEAM] Joining team:', teamId, teamName, 'hostId:', hostId);

    if (!p2pManagerRef.current || !hostId) {
      console.log('[JOIN_TEAM] Early return - no p2p manager or no hostId');
      return;
    }

    // Use hostId directly instead of getConnectedPeers() - this works via RELAY even when P2P fails
    console.log('[JOIN_TEAM] Sending JOIN_TEAM message to host:', hostId, { teamId, userName });
    const sent = p2pManagerRef.current.sendTo(hostId, {
      type: 'JOIN_TEAM',
      teamId,
      userName
    });
    console.log('[JOIN_TEAM] Message sent result:', sent);
    setCurrentTeam(teamName);
    setCurrentTeamId(teamId);  // Store the team ID for BUZZ messages
    setIsTeamSelected(true);

    // Save team selection to storage for reconnection (with 5 hour TTL)
    storage.setWithTTL(STORAGE_KEYS.CURRENT_TEAM, STORAGE_KEYS.CURRENT_TEAM_TTL, teamName);
    storage.setWithTTL(STORAGE_KEYS.CURRENT_TEAM_ID, STORAGE_KEYS.CURRENT_TEAM_ID_TTL, teamId);
    storage.setWithTTL(STORAGE_KEYS.TEAM_SELECTED, STORAGE_KEYS.TEAM_SELECTED_TTL, 'true');

    // If there's a pending super game, open the betting UI
    if (pendingSuperGame) {
      console.log('[JOIN_TEAM] Opening super game UI after team join');
      setSuperGamePhase('placeBets');
      setSuperGameMaxBet(pendingSuperGame.maxBet);
      setSuperGameTheme(pendingSuperGame.theme || null);
      setBetPlaced(false);
      setSuperGameBet(0);
      setPendingSuperGame(null);
    }
  };

  const handleLeave = () => {
    // Notify host that we're leaving
    if (p2pManagerRef.current && hostId) {
      p2pManagerRef.current.sendTo(hostId, {
        type: 'JOIN',
        sentAt: Date.now(),
        messageId: `leave_${Date.now()}`,
        userName: '__LEAVING__',
        persistentId: clientId
      });
    }

    // Clear team selection from storage
    storage.remove(STORAGE_KEYS.CURRENT_TEAM);
    storage.remove(STORAGE_KEYS.CURRENT_TEAM_ID);
    storage.remove(STORAGE_KEYS.TEAM_SELECTED);

    // Reset state to initial (no storage)
    setIsTeamSelected(false);
    setCurrentTeam(null);
    setUserName('');
    setIsNameSubmitted(false);
  };

  const handleReply = () => {
    // Debounced buzzer - prevents rapid-fire button presses
    debounceBuzz(() => {
      // Use hostId directly instead of getConnectedPeers() - this works via RELAY even when P2P fails
      if (status === ConnectionStatus.CONNECTED && p2pManagerRef.current && hostId) {
        // If there's a pending super game and user hasn't selected a team, show team selection
        if (pendingSuperGame && !isTeamSelected) {
          console.log('[MobileView] Buzz pressed with pending super game - already on team selection screen');
          return;
        }

        // If there's a pending super game and user has a team, open the betting UI
        if (pendingSuperGame && isTeamSelected && superGamePhase === 'idle') {
          console.log('[MobileView] Buzz pressed - opening super game UI');
          setSuperGamePhase('placeBets');
          setSuperGameMaxBet(pendingSuperGame.maxBet);
          setSuperGameTheme(pendingSuperGame.theme || null);
          setBetPlaced(false);
          setSuperGameBet(0);
          setPendingSuperGame(null);
          return;
        }

        // Show white flash if buzzed during reading phase (too early)
        if (buzzerState.timerPhase === 'reading') {
          setShowWhiteFlash(true);
          setTimeout(() => setShowWhiteFlash(false), 300);
        }

        const sentAt = Date.now();

        // Request current super game state from host (if host is in placeBets phase, it will resend the message)
        // But don't request if we've already placed our bet - we just want to buzz normally
        if (superGamePhase === 'placeBets' && !betPlaced) {
          p2pManagerRef.current.sendTo(hostId, {
            type: 'GET_SUPER_GAME_STATE'
          });
        }

        // Send BUZZ message with the team ID (not just team name)
        // This ensures the host can correctly identify which team buzzed
        p2pManagerRef.current.sendTo(hostId, {
          type: 'BUZZ',
          teamId: currentTeamId || currentTeam || '',  // Use teamId if available, fallback to team name
          teamName: currentTeam || '',  // Also send team name as fallback
          clientId: clientId,
          sentAt
        });

        if (window.navigator && window.navigator.vibrate) window.navigator.vibrate(50);
      }
    });
  };

  // Super Game: Place bet
  const handlePlaceBet = (bet: number) => {
    if (!p2pManagerRef.current || !hostId || !currentTeamId) return;
    console.log('[MobileView] Sending SUPER_GAME_BET', { teamId: currentTeamId, bet });
    p2pManagerRef.current.sendTo(hostId, {
      type: 'SUPER_GAME_BET',
      teamId: currentTeamId,
      bet,
      clientId: clientId
    });
    setSuperGameBet(bet);
    setBetPlaced(true);
  };

  // Super Game: Submit answer
  const handleSubmitAnswer = () => {
    if (!p2pManagerRef.current || !hostId || !currentTeamId || !superGameAnswer.trim()) return;
    console.log('[MobileView] Sending SUPER_GAME_TEAM_ANSWER', { teamId: currentTeamId, answer: superGameAnswer });
    p2pManagerRef.current.sendTo(hostId, {
      type: 'SUPER_GAME_TEAM_ANSWER',
      teamId: currentTeamId,
      answer: superGameAnswer,
      clientId: clientId
    });
  };

  // --- RENDER ---

  // SCREEN 1: NAME ENTRY
  if (!isNameSubmitted) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 bg-gray-950">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 bg-blue-600/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <User className="w-8 h-8 text-blue-400" />
            </div>
            <h1 className="text-3xl font-bold text-white">Identify Yourself</h1>
            <p className="text-gray-400">Enter your name to connect to the session.</p>
          </div>

          <form onSubmit={handleNameSubmit} className="space-y-6 bg-gray-900 p-8 rounded-2xl border border-gray-800 shadow-xl">
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium text-gray-300">Your Name</label>
              <input
                id="name"
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value.slice(0, 20))}
                placeholder="e.g. Player 1"
                maxLength={20}
                className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all placeholder:text-gray-600"
                autoFocus
              />
            </div>
            <Button
              type="submit"
              className="w-full justify-center py-3"
              size="lg"
              disabled={!userName.trim()}
            >
              Continue <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
            {connectionQuality.healthScore > 0 && (
              <div className="flex items-center justify-end text-xs text-gray-500 pt-2">
                <div className={`flex items-center space-x-1 ${healthColor}`}>
                  <Wifi className="w-3 h-3" />
                  <span>{connectionQuality.healthScore}%</span>
                </div>
              </div>
            )}
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={handleResetConnection}
                className="text-xs text-red-400 hover:text-red-300 underline"
              >
                Reset Connection
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // SCREEN 2: TEAM SELECTION (with SUPER GAME overlay if active)
  // Show super game UI if in super game phase, even before team is selected
  if (superGamePhase !== 'idle' && !isTeamSelected) {
    // Super game is active but user hasn't selected a team yet
    // Show a prompt to select a team first, but with super game indicator
    return (
      <div className="h-full flex flex-col p-6 bg-gray-950 relative overflow-hidden">
        {/* Super game banner */}
        <div className="fixed top-0 left-0 right-0 bg-gradient-to-r from-yellow-600 to-orange-600 py-2 px-4 z-20">
          <p className="text-center text-white font-bold text-sm animate-pulse">
            ⭐ SUPER GAME - Select your team to place your bet! ⭐
          </p>
        </div>

        {/* Header with connection status and leave button */}
        <div className="absolute top-4 left-4 right-4 flex justify-between items-center z-10">
          <button
            onClick={handleLeave}
            className="p-2 bg-red-600/20 hover:bg-red-600/30 rounded-full border border-red-600/30 text-red-400 transition-colors"
            title="Leave session"
          >
            <LogOut className="w-4 h-4" />
          </button>
          <div className={`flex items-center space-x-2 px-3 py-1 rounded-full border ${healthBgColor}`}>
            <Wifi className={`w-3 h-3 ${healthColor}`} />
            <span className={`text-xs font-bold uppercase ${healthColor}`}>{status === ConnectionStatus.CONNECTED ? 'Connected' : status}</span>
          </div>
        </div>

        <div className="max-w-md mx-auto w-full flex flex-col h-full mt-8">
           <div className="text-center mb-6 mt-4">
              <h2 className="text-2xl font-bold text-white">Choose Your Team</h2>
              <p className="text-yellow-400 text-sm animate-pulse">Super Game is starting! Join a team to participate.</p>
              <p className="text-xs text-gray-500 mt-1">Connected as <span className="text-gray-300">{userName}</span></p>
           </div>

           <div className="flex-1 overflow-y-auto space-y-6 pb-6 no-scrollbar">
              {/* Option A: Create New */}
              <div className="bg-gray-900 border-2 border-yellow-500/50 rounded-xl p-5 shadow-lg shadow-yellow-500/20">
                 <div className="flex items-center gap-2 mb-3 text-yellow-400 font-semibold text-sm uppercase tracking-wide">
                    <Plus className="w-4 h-4" /> Create New
                 </div>
                 <form onSubmit={handleCreateTeam} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Team Name"
                      value={newTeamName}
                      onChange={(e) => setNewTeamName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleCreateTeam(e);
                        }
                      }}
                      className="flex-1 bg-gray-950 border border-yellow-500/50 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-yellow-500 focus:outline-none"
                    />
                    <Button
                      type="submit"
                      size="sm"
                      disabled={!newTeamName.trim()}
                    >OK</Button>
                 </form>
              </div>

              <div className="flex items-center gap-4">
                 <div className="h-px bg-gray-800 flex-1"></div>
                 <span className="text-xs text-gray-600 font-medium uppercase">OR JOIN EXISTING</span>
                 <button
                   onClick={refreshTeams}
                   className="p-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-500 hover:text-blue-400 transition-colors"
                   title="Refresh teams list"
                 >
                   <RefreshCw className="w-3.5 h-3.5" />
                 </button>
                 <div className="h-px bg-gray-800 flex-1"></div>
              </div>

              {/* Option B: Join Existing */}
              <div className="space-y-2">
                 {teams.length === 0 ? (
                    <div className="text-center py-8 text-gray-600 bg-gray-900/50 rounded-xl border border-dashed border-gray-800">
                       <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                       <p className="text-sm">No active teams yet.</p>
                    </div>
                 ) : (
                    teams.map(team => (
                       <button
                         key={team.id}
                         onClick={() => handleJoinTeam(team.id, team.name)}
                         className="w-full bg-gray-900 border-2 border-yellow-500/30 hover:border-yellow-500 hover:bg-gray-800 p-4 rounded-xl flex items-center justify-between transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                       >
                          <div className="flex items-center gap-3">
                             <div className="w-10 h-10 rounded-full bg-yellow-500/20 text-yellow-400 flex items-center justify-center">
                                <Users className="w-5 h-5" />
                             </div>
                             <span className="font-semibold text-gray-200 group-hover:text-white text-left">{team.name}</span>
                          </div>
                          <ArrowRight className="w-5 h-5 text-yellow-500 group-hover:text-yellow-400 transform group-hover:translate-x-1 transition-all" />
                       </button>
                    ))
                 )}
              </div>
           </div>
        </div>
      </div>
    );
  }

  // Regular TEAM SELECTION (no super game)
  if (!isTeamSelected) {
    return (
      <div className="h-full flex flex-col p-6 bg-gray-950 relative overflow-hidden">
        {/* Header with connection status and leave button */}
        <div className="absolute top-4 left-4 right-4 flex justify-between items-center z-10">
          <button
            onClick={handleLeave}
            className="p-2 bg-red-600/20 hover:bg-red-600/30 rounded-full border border-red-600/30 text-red-400 transition-colors"
            title="Leave session"
          >
            <LogOut className="w-4 h-4" />
          </button>
          <div className={`flex items-center space-x-2 px-3 py-1 rounded-full border ${healthBgColor}`}>
            <Wifi className={`w-3 h-3 ${healthColor}`} />
            <span className={`text-xs font-bold uppercase ${healthColor}`}>{status === ConnectionStatus.CONNECTED ? 'Connected' : status}</span>
          </div>
        </div>

        <div className="max-w-md mx-auto w-full flex flex-col h-full">
           <div className="text-center mb-6 mt-4">
              <h2 className="text-2xl font-bold text-white">Choose Your Team</h2>
              <p className="text-gray-400 text-sm">Create a new team or join an existing one.</p>
              <p className="text-xs text-gray-500 mt-1">Connected as <span className="text-gray-300">{userName}</span></p>
              {p2pManagerRef.current && (
                <p className="text-xs text-gray-600 mt-1">
                  Host: {hostId ? 'Connected' : 'Not connected'}
                </p>
              )}
           </div>

           <div className="flex-1 overflow-y-auto space-y-6 pb-6 no-scrollbar">
              {/* Option A: Create New */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 shadow-lg">
                 <div className="flex items-center gap-2 mb-3 text-blue-400 font-semibold text-sm uppercase tracking-wide">
                    <Plus className="w-4 h-4" /> Create New
                 </div>
                 <form onSubmit={handleCreateTeam} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Team Name"
                      value={newTeamName}
                      onChange={(e) => setNewTeamName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleCreateTeam(e);
                        }
                      }}
                      className="flex-1 bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                    <Button
                      type="submit"
                      size="sm"
                      disabled={!newTeamName.trim()}
                    >OK</Button>
                 </form>
              </div>

              <div className="flex items-center gap-4">
                 <div className="h-px bg-gray-800 flex-1"></div>
                 <span className="text-xs text-gray-600 font-medium uppercase">OR JOIN EXISTING</span>
                 <button
                   onClick={refreshTeams}
                   className="p-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-500 hover:text-blue-400 transition-colors"
                   title="Refresh teams list"
                 >
                   <RefreshCw className="w-3.5 h-3.5" />
                 </button>
                 <div className="h-px bg-gray-800 flex-1"></div>
              </div>

              {/* Option B: Join Existing */}
              <div className="space-y-2">
                 {teams.length === 0 ? (
                    <div className="text-center py-8 text-gray-600 bg-gray-900/50 rounded-xl border border-dashed border-gray-800">
                       <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                       <p className="text-sm">No active teams yet.</p>
                    </div>
                 ) : (
                    teams.map(team => (
                       <button
                         key={team.id}
                         onClick={() => handleJoinTeam(team.id, team.name)}
                         className="w-full bg-gray-900 border border-gray-800 hover:border-blue-500 hover:bg-gray-800 p-4 rounded-xl flex items-center justify-between transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                         disabled={false}
                       >
                          <div className="flex items-center gap-3">
                             <div className="w-10 h-10 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                                <Users className="w-5 h-5" />
                             </div>
                             <span className="font-semibold text-gray-200 group-hover:text-white text-left">{team.name}</span>
                          </div>
                          <ArrowRight className="w-5 h-5 text-gray-600 group-hover:text-blue-400 transform group-hover:translate-x-1 transition-all" />
                       </button>
                    ))
                 )}
              </div>

              {/* Reset Connection button */}
              <div className="flex justify-center pt-4">
                <button
                  type="button"
                  onClick={handleResetConnection}
                  className="text-xs text-red-400 hover:text-red-300 underline"
                >
                  Reset Connection
                </button>
              </div>
           </div>
        </div>
      </div>
    );
  }

  // SCREEN 3: WAITING / READY / SUPER GAME
  // Show super game UI if in super game phase
  if (superGamePhase !== 'idle') {
    return (
      <div className="h-screen flex flex-col relative bg-gray-950">
        {/* Header */}
        <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-10 bg-gradient-to-b from-gray-900/80 to-transparent backdrop-blur-sm">
          <div className="flex items-center space-x-2 bg-gray-800/50 rounded-full pl-3 pr-4 py-1 border border-white/10">
            <User className="w-4 h-4 text-blue-400" />
            <div className="flex flex-col text-left leading-none">
               <span className="font-semibold text-gray-200 text-xs">{userName}</span>
               {currentTeam && <span className="text-[10px] text-indigo-400">{currentTeam}</span>}
            </div>
          </div>
          <div className={`flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase border ${healthBgColor}`}>
             <Wifi className={`w-3 h-3 ${healthColor}`} /> <span className={healthColor}>{status === ConnectionStatus.CONNECTED ? 'Connected' : status}</span>
          </div>
        </div>

        {/* SUPER GAME: Place Bets */}
        {superGamePhase === 'placeBets' && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 mt-16">
            <div className="w-full max-w-md">
              <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500 mb-2 text-center">
                SUPER GAME
              </h1>

              {superGameTheme && (
                <div className="bg-gray-900 rounded-xl p-4 mb-6 text-center border border-gray-800">
                  <p className="text-xs text-gray-500 uppercase">Selected Theme</p>
                  <p className="text-lg font-bold text-white">{superGameTheme.name}</p>
                </div>
              )}

              {betPlaced ? (
                <div className="bg-green-900/30 border border-green-700 rounded-xl p-6 text-center">
                  <p className="text-green-400 text-lg font-bold mb-2">Bet Placed!</p>
                  <p className="text-white text-2xl font-bold">{superGameBet}</p>
                  <p className="text-gray-400 text-sm mt-4">Wait for other players...</p>
                </div>
              ) : (
                <div className="bg-gray-900/80 backdrop-blur border border-gray-800 rounded-2xl p-6 shadow-xl">
                  {/* Title with max bet */}
                  <p className="text-center text-white font-semibold mb-6">
                    Place Your Bet! Max bet: <span className="text-yellow-400">{superGameMaxBet}</span>
                  </p>

                  {/* Number input */}
                  <div className="mb-6">
                    <input
                      type="number"
                      min={1}
                      max={superGameMaxBet}
                      value={superGameBet > 0 ? superGameBet : ''}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0;
                        setSuperGameBet(Math.min(Math.max(0, val), superGameMaxBet));
                      }}
                      className="w-full bg-gray-950 border border-gray-700 rounded-xl px-4 py-4 text-white text-2xl font-bold text-center focus:ring-2 focus:ring-yellow-500 focus:outline-none transition-all"
                      placeholder="0"
                    />
                  </div>

                  {/* Slider */}
                  <div className="mb-6">
                    <input
                      type="range"
                      min={1}
                      max={superGameMaxBet}
                      value={superGameBet > 0 ? superGameBet : 1}
                      onChange={(e) => setSuperGameBet(parseInt(e.target.value))}
                      className="w-full h-3 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-yellow-500"
                    />
                  </div>

                  {/* Confirm button */}
                  <Button
                    size="lg"
                    className="w-full"
                    onClick={() => handlePlaceBet(superGameBet)}
                    disabled={superGameBet < 1 || superGameBet > superGameMaxBet}
                  >
                    Confirm
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* SUPER GAME: Show Question */}
        {superGamePhase === 'showQuestion' && (
          <div className="flex-1 flex flex-col p-4 mt-16 overflow-auto">
            <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-t-xl p-4 text-center">
              <p className="text-purple-200 text-xs uppercase">Super Game</p>
              <p className="text-white font-bold">{superGameTheme?.name}</p>
            </div>

            <div className="flex-1 bg-gray-900 p-4 flex items-center justify-center">
              {superGameQuestion?.media?.url && superGameQuestion.media.type === 'image' && (
                <img src={superGameQuestion.media.url} alt="Question" className="w-full max-h-48 object-contain rounded-lg mb-4" />
              )}
              <p className="text-white text-xl text-center font-bold leading-tight">
                {superGameQuestion?.text}
              </p>
            </div>

            <div className="bg-gray-800 p-4 rounded-b-xl">
              <textarea
                value={superGameAnswer}
                onChange={(e) => setSuperGameAnswer(e.target.value)}
                placeholder="Type your answer..."
                className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:ring-2 focus:ring-purple-500 focus:outline-none resize-none"
                rows={3}
              />
              <button
                onClick={handleSubmitAnswer}
                disabled={!superGameAnswer.trim()}
                className="w-full mt-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:from-gray-700 disabled:to-gray-700 text-white font-bold py-3 rounded-xl transition-all active:scale-95 disabled:opacity-50"
              >
                Submit Answer
              </button>
            </div>
          </div>
        )}

        {/* SUPER GAME: Show Winner */}
        {superGamePhase === 'showWinner' && superGameWinner && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 bg-gradient-to-br from-yellow-600 via-orange-600 to-red-600">
            <h1 className="text-4xl font-black text-white mb-4 animate-bounce">WINNER!</h1>
            <p className="text-3xl font-bold text-white mb-8">{superGameWinner.winnerTeamName}</p>

            <div className="bg-black/30 backdrop-blur-sm rounded-2xl p-4 w-full max-w-sm">
              <h2 className="text-xl font-bold text-white mb-4 text-center">Final Scores</h2>
              <div className="space-y-2">
                {superGameWinner.finalScores
                  .sort((a, b) => b.score - a.score)
                  .map((team, index) => (
                    <div
                      key={team.teamId}
                      className={`flex items-center justify-between p-3 rounded-lg ${
                        index === 0 ? 'bg-yellow-500/30 border border-yellow-400' : 'bg-white/10'
                      }`}
                    >
                      <span className="text-white font-medium">{team.teamName}</span>
                      <span className="text-white font-bold text-xl">{team.score}</span>
                    </div>
                  ))}
              </div>
            </div>

            <button
              onClick={() => {
                resetSuperGameState();
              }}
              className="mt-8 bg-white/20 hover:bg-white/30 text-white font-bold py-3 px-8 rounded-xl transition-all"
            >
              Continue
            </button>
          </div>
        )}
      </div>
    );
  }

  // Regular waiting screen with buzz button
  return (
    <div className="h-screen flex flex-col relative bg-gray-950">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-10 bg-gradient-to-b from-gray-900/80 to-transparent backdrop-blur-sm">
        <button
          onClick={handleLeave}
          className="p-2 bg-red-600/20 hover:bg-red-600/30 rounded-full border border-red-600/30 text-red-400 transition-colors"
          title="Leave session"
        >
          <LogOut className="w-4 h-4" />
        </button>

        <div className="flex items-center space-x-2 bg-gray-800/50 rounded-full pl-3 pr-4 py-1 border border-white/10">
          <User className="w-4 h-4 text-blue-400" />
          <div className="flex flex-col text-left leading-none">
             <span className="font-semibold text-gray-200 text-xs">{userName}</span>
             {currentTeam && <span className="text-[10px] text-indigo-400">{currentTeam}</span>}
          </div>
        </div>

        <div className={`flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase border ${healthBgColor}`}>
             <Wifi className={`w-3 h-3 ${healthColor}`} /> <span className={healthColor}>{status === ConnectionStatus.CONNECTED ? 'Connected' : status}</span>
        </div>
      </div>

      {status === ConnectionStatus.CONNECTED ? (
        <>
          {/* Buzz button - always active now, never blocked */}
          <button
            onClick={handleReply}
            className="group absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[40vh] aspect-square max-h-[40vh] max-w-[40vh] rounded-full flex flex-col items-center justify-center transition-all duration-200 active:scale-95 focus:outline-none touch-manipulation z-0"
          >
            <div className="absolute inset-0 rounded-full shadow-[0_0_60px_-15px_rgba(37,99,235,0.5)] transition-all duration-500 bg-gradient-to-br from-blue-600 to-indigo-700 group-hover:shadow-[0_0_80px_-10px_rgba(37,99,235,0.7)]"></div>
            <div className="absolute inset-4 rounded-full border-t border-white/20 bg-gradient-to-br from-blue-500 to-indigo-600"></div>
            <div className="relative flex flex-col items-center pointer-events-none">
              <span className="text-5xl font-black text-white tracking-widest uppercase drop-shadow-md">Buzz!</span>
            </div>
            <div className="absolute inset-0 rounded-full border-4 border-white/10 scale-105 animate-pulse"></div>
          </button>

          {/* White flash overlay for early buzz during reading phase */}
          {showWhiteFlash && (
            <div className="fixed inset-0 bg-white/40 z-50 animate-pulse pointer-events-none"></div>
          )}

          {/* Connection quality indicator - positioned at bottom */}
          {connectionQuality.rtt > 0 && (
            <div className={`absolute bottom-24 left-1/2 transform -translate-x-1/2 flex items-center space-x-2 px-4 py-2 rounded-full border ${healthBgColor} z-10`}>
              <Wifi className={`w-4 h-4 ${healthColor}`} />
              <span className={`text-sm font-medium ${healthColor}`}>{connectionQuality.rtt}ms</span>
              <span className="text-gray-500">|</span>
              <span className={`text-sm font-medium ${healthColor}`}>{connectionQuality.healthScore}%</span>
            </div>
          )}

          <p className="absolute bottom-20 left-1/2 transform -translate-x-1/2 text-gray-500 text-sm animate-pulse z-10">Waiting for host...</p>
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center">
            <div className="relative">
              <Loader2 className="w-16 h-16 text-blue-500 animate-spin" />
              {retryCount > 0 && (
                <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 bg-gray-800 text-xs px-2 py-1 rounded-full text-gray-400">
                  Attempt {retryCount + 1}
                </div>
              )}
            </div>
            <p className="text-xl font-medium text-gray-400">
              {status === ConnectionStatus.RECONNECTING ? 'Reconnecting...' : 'Connection lost'}
            </p>
            <div className="flex gap-3">
              {retryCount > 2 && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setRetryCount(0);
                    if (p2pManagerRef.current) {
                      p2pManagerRef.current.connect().catch(() => {});
                    }
                  }}
                >
                  <RefreshCw className="w-4 h-4 mr-2" /> Force Reconnect
                </Button>
              )}
              <button
                onClick={resetState}
                className="px-4 py-2 text-sm text-gray-600 hover:text-red-400 transition-colors flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" /> Reset
              </button>
            </div>
          </div>
        )}

      <div className="absolute bottom-0 left-0 right-0 p-6 text-center text-gray-600 text-xs flex justify-end items-center">
         {connectionQuality.rtt > 0 && (
           <span className={healthColor}>{connectionQuality.healthScore}% health</span>
         )}
      </div>
    </div>
  );
};
