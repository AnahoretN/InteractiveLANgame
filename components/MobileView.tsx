import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { ConnectionStatus, ConnectionQuality, MessageCategory, P2PSMessage, GetCommandsMessage } from '../types';
import { Users, Loader2, RefreshCw, LogOut, X, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from './Button';
import { useBuzzerDebounce } from '../hooks/useBuzzerDebounce';
import { useP2PClient, ClientConnectionState } from '../hooks/useP2PClient';
import { storage, STORAGE_KEYS } from '../hooks/useLocalStorage';

export const MobileView: React.FC = () => {
  // Setup step - now just name input + team selection on one screen
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.CONNECTING);

  // Host info
  const [hostId] = useState<string | null>(() => {
    return storage.get(STORAGE_KEYS.LAST_HOST) || null;
  });

  // User name
  const [userName, setUserName] = useState<string>(() => {
    return storage.get(STORAGE_KEYS.USER_NAME, '') ?? '';
  });

  // Commands from host (for quick join)
  const [commands, setCommands] = useState<Array<{ id: string; name: string }>>([]);
  const [currentTeam, setCurrentTeam] = useState<string | null>(() => {
    return storage.get(STORAGE_KEYS.CURRENT_TEAM) || null;
  });
  const [currentTeamId, setCurrentTeamId] = useState<string | null>(() => {
    return storage.get(STORAGE_KEYS.CURRENT_TEAM_ID) || null;
  });
  const [currentTeamScore, setCurrentTeamScore] = useState<number | null>(null);

  // Wait for host confirmation after selecting team before showing BUZZ! screen
  const [waitForHostConfirmation, setWaitForHostConfirmation] = useState<boolean>(false);

  // Show command list expanded inline (not as separate screen)
  const [showCommandList, setShowCommandList] = useState<boolean>(false);

  // Track if commands are currently being loaded from host
  const [loadingCommands, setLoadingCommands] = useState<boolean>(false);

  // Track if we have received commands from host at least once
  const [hasReceivedCommands, setHasReceivedCommands] = useState<boolean>(false);

  // Track if currently refreshing the list (for animation on Refresh List button)
  const [isRefreshingList, setIsRefreshingList] = useState<boolean>(false);

  // New team name input
  const [newTeamName, setNewTeamName] = useState<string>('');

  // Save team selection to localStorage for recovery after reconnect
  useEffect(() => {
    if (currentTeam && currentTeamId) {
      storage.set(STORAGE_KEYS.CURRENT_TEAM, currentTeam);
      storage.set(STORAGE_KEYS.CURRENT_TEAM_ID, currentTeamId);
      console.log('[MobileView] Saved team to storage:', currentTeam, currentTeamId);
    } else if (currentTeam === null) {
      storage.remove(STORAGE_KEYS.CURRENT_TEAM);
      storage.remove(STORAGE_KEYS.CURRENT_TEAM_ID);
      console.log('[MobileView] Removed team from storage');
    }
  }, [currentTeam, currentTeamId]);

  // Track session version
  const [hostSessionVersion, setHostSessionVersion] = useState<string | null>(() => {
    return storage.get(STORAGE_KEYS.HOST_SESSION_VERSION);
  });

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

  // Connection quality
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>({
    rtt: 0,
    packetLoss: 0,
    jitter: 0,
    lastPing: Date.now(),
    healthScore: 100
  });


  // Super Game state
  const [superGamePhase, setSuperGamePhase] = useState<'idle' | 'placeBets' | 'showQuestion' | 'showWinner'>('idle');
  const [superGameTheme, setSuperGameTheme] = useState<{ id: string; name: string } | null>(null);
  const [superGameMaxBet, setSuperGameMaxBet] = useState<number>(100);
  const [superGameBet, setSuperGameBet] = useState<number>(0);
  const [superGameQuestion, setSuperGameQuestion] = useState<{ text: string; media?: { type: string; url?: string } } | null>(null);
  const [superGameAnswer, setSuperGameAnswer] = useState<string>('');
  const [superGameWinner, setSuperGameWinner] = useState<{ winnerTeamName: string; finalScores: { teamId: string; teamName: string; score: number }[] } | null>(null);
  const [betPlaced, setBetPlaced] = useState<boolean>(false);
  const [pendingSuperGame, setPendingSuperGame] = useState<{ maxBet: number; theme?: { id: string; name: string } } | null>(null);

  const [retryCount, setRetryCount] = useState(0);
  const [clientId] = useState<string>(() => {
    const saved = storage.get(STORAGE_KEYS.CLIENT_ID);
    if (saved) {
      return saved;
    }
    const newId = 'client_' + Math.random().toString(36).substring(2, 10);
    storage.set(STORAGE_KEYS.CLIENT_ID, newId);
    return newId;
  });

  // Debounce for buzzer
  const { debouncedCallback: debounceBuzz } = useBuzzerDebounce(300);

  // Get host ID from URL params or storage
  const urlHostId = useMemo(() => {
    const params = new URLSearchParams(window.location.hash.split('?')[1]);
    return params.get('host') || storage.get(STORAGE_KEYS.LAST_HOST) || null;
  }, []);

  // Get session ID from URL params
  const sessionId = useMemo(() => {
    const params = new URLSearchParams(window.location.hash.split('?')[1]);
    return params.get('session') || null;
  }, []);

  // Get signalling server URL (from URL params for LAN mode)
  // Only use LAN signalling if explicitly provided (for LAN mode)
  // For Internet mode, always use default public server
  const signallingUrl = useMemo(() => {
    const params = new URLSearchParams(window.location.hash.split('?')[1]);
    const lanServer = params.get('signalling');
    // Only use LAN server if explicitly specified - for Internet mode this will be undefined
    if (lanServer) {
      return `ws://${lanServer}:9000`;
    }
    return undefined; // Use default public server for Internet mode
  }, []);

  // Use refs for values that change but shouldn't trigger p2pClient re-creation
  const waitForConfirmationRef = useRef(waitForHostConfirmation);
  const currentTeamIdRef = useRef(currentTeamId);
  const clientIdRef = useRef(clientId);

  // Keep refs in sync
  useEffect(() => {
    waitForConfirmationRef.current = waitForHostConfirmation;
    currentTeamIdRef.current = currentTeamId;
    clientIdRef.current = clientId;
  }, [waitForHostConfirmation, currentTeamId, clientId]);

  // Initialize P2P client connection
  // Only use LAN mode if signallingUrl is explicitly provided (host sent LAN URL)
  // This allows Internet mode to work correctly without signalling param
  const p2pClient = useP2PClient({
    clientName: userName,
    hostId: urlHostId || hostId || '',
    isLanMode: !!signallingUrl,  // LAN mode only if signalling server is specified
    signallingUrl: signallingUrl,
    persistentClientId: clientId,  // Pass stored client ID for reconnection
    currentTeamId: currentTeamId,   // Pass current team ID for reconnection
    onMessage: (message) => {
      console.log('[MobileView] Received message from host:', message.type, 'category:', message.category);

      switch (message.type) {
        case 'BUZZER_STATE':
          // Update buzzer state from host
          setBuzzerState(message.payload);
          break;
        case 'STATE_SYNC':
          // Full state sync
          setBuzzerState(message.payload.buzzerState);
          setSuperGamePhase(message.payload.superGamePhase);
          break;
        case 'TEAMS_SYNC':
          // Teams list from host (same structure as commands)
          const syncedTeams = message.payload.teams || [];
          const newTeamsCommands = syncedTeams.map((t: { id: string; name: string }) => ({
            id: t.id,
            name: t.name
          }));

          // Update currentTeamId if we have a temp ID (teamName) but now have the real ID from host
          if (currentTeam && currentTeamId) {
            const matchedTeam = newTeamsCommands.find(c => c.name === currentTeam);
            if (matchedTeam && matchedTeam.id !== currentTeamId) {
              console.log('[MobileView] Updating currentTeamId from temp to real ID:', currentTeamId, '->', matchedTeam.id);
              setCurrentTeamId(matchedTeam.id);
              storage.set(STORAGE_KEYS.CURRENT_TEAM_ID, matchedTeam.id);
            }
          }

          // Check if current team still exists
          if (currentTeamId && currentTeam) {
            const currentTeamExists = newTeamsCommands.some(c => c.id === currentTeamId || c.name === currentTeam);
            if (!currentTeamExists) {
              console.log('[MobileView] Current team was deleted (TEAMS_SYNC), clearing selection');
              setCurrentTeam(null);
              setCurrentTeamId(null);
              storage.remove(STORAGE_KEYS.CURRENT_TEAM);
              storage.remove(STORAGE_KEYS.CURRENT_TEAM_ID);
            }
          }

          setCommands(newTeamsCommands);
          storage.set(STORAGE_KEYS.COMMANDS, JSON.stringify(newTeamsCommands));
          setHasReceivedCommands(true);
          console.log('[MobileView] Teams sync received:', syncedTeams);
          break;
        case 'COMMANDS_LIST':
          // Commands list from host
          const syncedCommands = message.payload.commands || [];
          const newCommands = syncedCommands.map(c => ({
            id: c.id,
            name: c.name
          }));

          // Update currentTeamId if we have a temp ID (teamName) but now have the real ID from host
          if (currentTeam && currentTeamId) {
            const matchedTeam = newCommands.find(c => c.name === currentTeam);
            if (matchedTeam && matchedTeam.id !== currentTeamId) {
              console.log('[MobileView] Updating currentTeamId from temp to real ID:', currentTeamId, '->', matchedTeam.id);
              setCurrentTeamId(matchedTeam.id);
              storage.set(STORAGE_KEYS.CURRENT_TEAM_ID, matchedTeam.id);
            }
          }

          // Check if current team still exists in the updated list
          if (currentTeamId && currentTeam) {
            const currentTeamExists = newCommands.some(c => c.id === currentTeamId || c.name === currentTeam);
            if (!currentTeamExists) {
              // Current team was deleted, clear selection
              console.log('[MobileView] Current team was deleted, clearing selection');
              setCurrentTeam(null);
              setCurrentTeamId(null);
              storage.remove(STORAGE_KEYS.CURRENT_TEAM);
              storage.remove(STORAGE_KEYS.CURRENT_TEAM_ID);
            }
          }

          setCommands(newCommands);
          // Save commands to localStorage for persistence
          storage.set(STORAGE_KEYS.COMMANDS, JSON.stringify(newCommands));
          setLoadingCommands(false);
          setIsRefreshingList(false);
          setHasReceivedCommands(true);
          console.log('[MobileView] Commands sync received:', syncedCommands);
          break;
        case 'TEAM_CONFIRMED':
          // Host confirmed client is in lobby
          console.log('[MobileView] TEAM_CONFIRMED received, showing BUZZ! screen');
          console.log('[MobileView] Before setState - waitForHostConfirmation:', waitForHostConfirmation);
          // Directly set to false
          setWaitForHostConfirmation(false);
          console.log('[MobileView] After setState called (state will update on next render)');
          break;
        case 'BROADCAST':
          // Generic broadcast from host
          console.log('[MobileView] Broadcast:', message.payload);
          break;
        default:
          console.log('[MobileView] Unhandled message type:', message.type);
      }
    },
    onConnectionChange: (state, quality) => {
      console.log('[MobileView] onConnectionChange - P2P state:', state, 'ClientConnectionState.CONNECTED:', ClientConnectionState.CONNECTED, 'match:', state === ClientConnectionState.CONNECTED, 'quality:', quality);
      // Update connection quality
      setConnectionQuality(quality);

      // Map P2P state to ConnectionStatus
      switch (state) {
        case ClientConnectionState.CONNECTED:
          console.log('[MobileView] Setting status to CONNECTED');
          setStatus(ConnectionStatus.CONNECTED);
          break;
        case ClientConnectionState.CONNECTING:
        case ClientConnectionState.RECONNECTING:
          console.log('[MobileView] Setting status to CONNECTING');
          setStatus(ConnectionStatus.CONNECTING);
          break;
        case ClientConnectionState.DISCONNECTED:
          console.log('[MobileView] Setting status to DISCONNECTED');
          setStatus(ConnectionStatus.DISCONNECTED);
          break;
        case ClientConnectionState.ERROR:
          console.log('[MobileView] Setting status to ERROR');
          setStatus(ConnectionStatus.ERROR);
          break;
      }
    },
    onError: (error) => {
      console.error('[MobileView] P2P error:', error);
      setStatus(ConnectionStatus.ERROR);
    },
  });

  // Auto-connect when we have host ID
  useEffect(() => {
    if (urlHostId && !p2pClient.isConnected && !p2pClient.isConnecting) {
      console.log('[MobileView] Auto-connecting to host:', urlHostId);
      p2pClient.connect();
    }
  }, [urlHostId, p2pClient.isConnected, p2pClient.isConnecting, p2pClient.connect]);

  // Debug: Track p2pClient connection state changes
  useEffect(() => {
    console.log('[MobileView] p2pClient state changed - isConnected:', p2pClient.isConnected, 'connectionState:', p2pClient.connectionState);
  }, [p2pClient.isConnected, p2pClient.connectionState]);

  // Save name to storage when changed
  useEffect(() => {
    if (userName) {
      storage.set(STORAGE_KEYS.USER_NAME, userName);
    }
  }, [userName]);

  // Save team to storage when selected
  useEffect(() => {
    if (currentTeam) {
      storage.set(STORAGE_KEYS.CURRENT_TEAM, currentTeam);
    }
    if (currentTeamId) {
      storage.set(STORAGE_KEYS.CURRENT_TEAM_ID, currentTeamId);
    }
    if (currentTeam && currentTeamId) {
      storage.set(STORAGE_KEYS.TEAM_SELECTED, 'true');
    }
  }, [currentTeam, currentTeamId]);

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

  // Send buzz via P2P
  const sendBuzz = useCallback(() => {
    console.log('[MobileView] sendBuzz called - p2pClient.isConnected:', p2pClient.isConnected, 'connectionState:', p2pClient.connectionState);

    if (!p2pClient.isConnected) {
      console.warn('[MobileView] Not connected, cannot buzz. State:', p2pClient.connectionState);
      return;
    }

    // Send buzz message to host
    const sent = p2pClient.send({
      category: MessageCategory.EVENT,
      type: 'BUZZ',
      payload: {
        clientId: clientId,
        clientName: userName,
        teamId: currentTeamId,
        teamName: currentTeam,
        buzzTime: Date.now()
      }
    });

    console.log('[MobileView] Buzz message sent:', sent);
  }, [p2pClient.isConnected, p2pClient.connectionState, p2pClient.send, clientId, userName, currentTeamId, currentTeam]);

  // Handle buzz button press
  const handleBuzz = useCallback(() => {
    if (superGamePhase !== 'idle') {
      // In super game, don't buzz
      return;
    }
    debounceBuzz(sendBuzz);
  }, [debounceBuzz, sendBuzz, superGamePhase]);

  // Handle leave
  const handleLeave = useCallback(() => {
    // Send leaving message if connected
    if (p2pClient.isConnected) {
      p2pClient.send({
        category: MessageCategory.STATE,
        type: 'LEAVE_TEAM',
        payload: {
          clientId: clientId,
          clientName: userName,
          teamId: currentTeamId,
          teamName: currentTeam
        }
      });
    }

    // Disconnect P2P
    p2pClient.disconnect();

    // Clear local team state
    setCurrentTeam(null);
    setCurrentTeamId(null);
    storage.remove(STORAGE_KEYS.CURRENT_TEAM);
    storage.remove(STORAGE_KEYS.CURRENT_TEAM_ID);
    storage.remove(STORAGE_KEYS.TEAM_SELECTED);
  }, [p2pClient, clientId, userName, currentTeamId, currentTeam]);

  // Handle force reconnect
  const handleForceReconnect = useCallback(() => {
    console.log('[MobileView] Force reconnect');
    setRetryCount(0);
    if (p2pClient.isConnected) {
      p2pClient.disconnect();
    }
    setTimeout(() => {
      p2pClient.connect();
    }, 500);
  }, [p2pClient]);

  // Reset
  const handleReset = useCallback(() => {
    storage.clearAll();
    window.location.reload();
  }, []);

  // Debug: Track waitForHostConfirmation changes
  useEffect(() => {
    console.log('[MobileView] waitForHostConfirmation changed to:', waitForHostConfirmation);
  }, [waitForHostConfirmation]);

  // Is setup complete (ready to play) - need name, selected team, AND host confirmation
  const isSetupComplete = useMemo(() => {
    const result = userName.trim() !== '' && currentTeam !== null && !waitForHostConfirmation;
    console.log('[MobileView] isSetupComplete:', result, 'userName:', userName, 'currentTeam:', currentTeam, 'waitForHostConfirmation:', waitForHostConfirmation);
    return result;
  }, [userName, currentTeam, waitForHostConfirmation]);

  // Handle refresh commands list
  const handleRefreshCommands = useCallback(() => {
    setLoadingCommands(true);
    if (p2pClient.isConnected) {
      p2pClient.send({
        category: MessageCategory.SYNC,
        type: 'GET_COMMANDS',
        payload: {}
      });
      console.log('[MobileView] Requested commands list from host');
    }
  }, [p2pClient]);

  return (
    <>
      {!isSetupComplete ? (
        <div className="h-full flex flex-col p-6 bg-gray-950">
          <div className="max-w-md mx-auto w-full flex flex-col h-full justify-center">
            <div className="text-center mb-8 mt-4">
              <h1 className="text-3xl font-bold text-white mb-2">
                Welcome!
              </h1>
            </div>

            {/* Single card with name input and team selection */}
            <div className="bg-gray-900/80 backdrop-blur border border-gray-800 rounded-2xl p-6 shadow-xl space-y-5">
              {/* Name input */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Your Name</label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={userName}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUserName(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full bg-gray-950 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all pr-10"
                    maxLength={20}
                    autoFocus
                  />
                  {userName.trim() && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <Check className="w-6 h-6 text-green-500" />
                    </div>
                  )}
                </div>
              </div>

              {/* Team selection section with collapsible list */}
              <div className="space-y-3">
                {/* Header button - shows/hides list OR refreshes data */}
                <button
                  onClick={() => {
                    if (showCommandList && hasReceivedCommands) {
                      // List is already open - refresh data
                      setIsRefreshingList(true);
                      if (p2pClient.isConnected) {
                        p2pClient.send({
                          category: MessageCategory.SYNC,
                          type: 'GET_COMMANDS',
                          payload: {}
                        });
                        console.log('[MobileView] Refreshing commands list from host');
                      }
                    } else {
                      // Open the list and fetch commands if needed
                      setShowCommandList(true);
                      if (!hasReceivedCommands) {
                        setLoadingCommands(true);
                        if (p2pClient.isConnected) {
                          p2pClient.send({
                            category: MessageCategory.SYNC,
                            type: 'GET_COMMANDS',
                            payload: {}
                          });
                          console.log('[MobileView] Requested commands list from host');
                        }
                      }
                    }
                  }}
                  disabled={!p2pClient.isConnected || loadingCommands || isRefreshingList}
                  className="w-full px-4 py-3 text-sm text-blue-400 hover:text-blue-300 border border-blue-500/30 hover:border-blue-500/50 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isRefreshingList ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      Refreshing...
                    </>
                  ) : showCommandList && hasReceivedCommands ? (
                    <>
                      <RefreshCw className="w-5 h-5" />
                      Refresh List
                    </>
                  ) : hasReceivedCommands ? (
                    <>
                      <ChevronDown className="w-5 h-5" />
                      Show Teams
                    </>
                  ) : (
                    <>
                      <Users className="w-5 h-5" />
                      Select Team
                    </>
                  )}
                </button>

                {/* Collapsible commands list */}
                {showCommandList && hasReceivedCommands && (
                  <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
                    {commands.length === 0 ? (
                      <div className="text-center py-6 text-gray-500 border border-gray-700 rounded-xl bg-gray-800/50">
                        <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No teams available</p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {commands.map((command) => (
                          <button
                            key={command.id}
                            onClick={() => {
                              setCurrentTeam(command.name);
                              setCurrentTeamId(command.id);
                              setShowCommandList(false);
                              // Notify host about team selection
                              if (p2pClient.isConnected) {
                                p2pClient.send({
                                  category: MessageCategory.STATE,
                                  type: 'JOIN_TEAM',
                                  payload: {
                                    clientId: clientId,
                                    clientName: userName,
                                    teamId: command.id,
                                    teamName: command.name
                                  }
                                });
                                setWaitForHostConfirmation(true);
                                console.log('[MobileView] Sent JOIN_TEAM message for team:', command.name);
                              }
                            }}
                            className="w-full border rounded-xl px-4 py-3 text-left transition-all flex items-center justify-between bg-gray-800 hover:bg-gray-700 border-gray-700 text-gray-300"
                          >
                            <span className="font-medium truncate">{command.name}</span>
                            <Users className="w-4 h-4 shrink-0 text-blue-400" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Create new team input */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  placeholder="New team name"
                  className="flex-1 bg-gray-950 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all text-sm"
                />
                <button
                  onClick={() => {
                    if (newTeamName.trim() && p2pClient.isConnected) {
                      const teamName = newTeamName.trim();
                      p2pClient.send({
                        category: MessageCategory.STATE,
                        type: 'CREATE_TEAM',
                        payload: {
                          clientId: clientId,
                          clientName: userName,
                          teamName: teamName
                        }
                      });
                      console.log('[MobileView] Sent CREATE_TEAM message:', teamName);
                      setNewTeamName('');
                      // Set current team and wait for host confirmation
                      setCurrentTeam(teamName);
                      setCurrentTeamId(teamName); // Use teamName as temp ID until host confirms
                      setShowCommandList(false);
                      setWaitForHostConfirmation(true);
                    }
                  }}
                  disabled={!newTeamName.trim() || !p2pClient.isConnected}
                  className="p-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-xl transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14"/>
                    <path d="m12 5 7 7-7 7"/>
                  </svg>
                </button>
              </div>
            </div>

            {/* Session ID display */}
            <div className="text-center text-gray-600 text-xs mt-4">
              Session ID: {urlHostId ? sessionId || '---' : '---'}
            </div>
          </div>
        </div>
      ) : (
        /* GAME SCREEN */
        <div className="h-full flex flex-col relative bg-gray-950">
          {/* Header */}
          <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-10 bg-gradient-to-b from-gray-900/80 to-transparent backdrop-blur-sm">
            <button
              onClick={handleLeave}
              className="p-2 bg-red-600/20 hover:bg-red-600/30 rounded-full border border-red-600/30 text-red-400 transition-colors"
              title="Leave session"
            >
              <LogOut className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2 bg-gray-800/50 rounded-full pl-3 pr-4 py-1 border border-white/10">
              <Users className="w-4 h-4 text-blue-400" />
              <div className="flex flex-col text-left leading-none">
                <span className="font-semibold text-gray-200 text-xs">{userName}</span>
                {currentTeam && <span className="text-[10px] text-indigo-400">{currentTeam}</span>}
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 flex items-start justify-center pt-[20vh] p-6 w-full">
            {isSetupComplete ? (
              <div className="flex items-center justify-center w-full animate-in zoom-in duration-300">
                <button
                  onClick={handleBuzz}
                  className={`group relative rounded-full flex items-center justify-center transition-all duration-200 active:scale-95 focus:outline-none touch-manipulation ${
                    status !== ConnectionStatus.CONNECTED ? 'grayscale' : ''
                  }`}
                  style={{ width: 'min(60vw, 60vh)', height: 'min(60vw, 60vh)' }}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-full shadow-[0_0_60px_-15px_rgba(37,99,235,0.5)] group-hover:shadow-[0_0_80px_-10px_rgba(37,99,235,0.7)] transition-all duration-500"></div>
                  <div className="absolute inset-4 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full border-t border-white/20"></div>
                  <div className="relative flex flex-col items-center pointer-events-none">
                    {status !== ConnectionStatus.CONNECTED ? (
                      <span className="text-4xl font-black text-white/70 tracking-wide text-center leading-tight">Connection<br/>lost</span>
                    ) : (
                      <span className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-br from-white to-white/80 tracking-widest uppercase drop-shadow-md">Buzz!</span>
                    )}
                  </div>
                  <div className="absolute inset-0 rounded-full border-4 border-white/10 scale-105 animate-pulse"></div>
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center space-y-6 text-center">
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
                      onClick={handleForceReconnect}
                    >
                      <RefreshCw className="w-4 h-4 mr-2" /> Force Reconnect
                    </Button>
                  )}
                  <button
                    onClick={handleReset}
                    className="px-4 py-2 text-sm text-gray-600 hover:text-red-400 transition-colors flex items-center gap-2"
                  >
                    <X className="w-4 h-4" /> Reset
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-6 text-center text-gray-600 text-xs">
            Session ID: {sessionId || '---'}
          </div>
        </div>
      )}
    </>
  );
};
