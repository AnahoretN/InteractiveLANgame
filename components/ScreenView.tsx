import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Users, X, Loader2, Smartphone, Monitor } from 'lucide-react';
import { Team, P2PSMessage, MessageCategory, P2PMessage } from '../types';
import { useP2PClient, ClientConnectionState } from '../hooks/useP2PClient';
import { storage, STORAGE_KEYS } from '../hooks/useLocalStorage';
import { useDemoScreenMedia } from '../hooks/useDemoScreenMedia';
import { MediaSystemDebugger } from '../utils/mediaSystemDebugger';
import { demoScreenMediaHandler } from '../utils/demoScreenMediaHandler';
import { DraggableQRCode } from './shared/DraggableQRCode';
import { TimerDisplay, TimerBar } from './shared/TimerDisplay';
import { calculateQuestionFontSize, calculateAnswerFontSizeMobile, calculateAnswerFontSizeDesktop } from './host/game/fontUtils';
// New team status types - extend to include clash status locally
import { TeamStatus as BaseTeamStatus, TeamState as BaseTeamState } from '../hooks/useTeamStatusManager';

// Extended TeamStatus for demo screen (includes clash)
type ExtendedTeamStatus = 'inactive' | 'active' | 'answering' | 'penalty' | 'clash';

// Extended TeamState for demo screen
interface ExtendedTeamState {
  status: ExtendedTeamStatus;
  previousStatus: ExtendedTeamStatus;
  hasAttempted: boolean;
  statusSince: number;
  clashSubStatus?: 'first_clash' | 'simple_clash';
  hasBeenFirstClash?: boolean;
}

type TeamStatus = ExtendedTeamStatus;
type TeamState = ExtendedTeamState;

// Global declaration for media cache
declare global {
  interface Window {
    mediaTransferCache?: Map<string, {
      type: 'image' | 'video' | 'audio' | 'youtube';
      url: string | null;
      fileData?: string;
      fileType?: string;
      isYouTube: boolean;
    }>;
  }
}

export const ScreenView: React.FC = () => {
  // Session ID from URL
  const sessionId = useMemo(() => {
    const params = new URLSearchParams(window.location.hash.split('?')[1]);
    return params.get('session') || null;
  }, []);

  // Demo screen media hook - handles media cache and processing
  const demoScreenMedia = useDemoScreenMedia();

  // Function to process a single message
  const processMessage = useCallback((message: P2PSMessage) => {
    switch (message.type) {
      case 'STATE_SYNC':
        // Always process STATE_SYNC to update lobby state
        if (message.payload) {
          console.log('[ScreenView] STATE_SYNC received:', {
            isSessionActive: message.payload.isSessionActive,
            hasPayload: !!message.payload
          });
          setGameState(prevState => {
            const payload = message.payload;
            const currentTeams = prevState?.teams || [];
            const payloadTeams = payload.teams || [];
            const currentSessionActive = prevState?.isSessionActive || false;
            const payloadSessionActive = payload.isSessionActive !== undefined ? payload.isSessionActive : currentSessionActive;

            // Update teams if:
            // 1. Session state changed (lobby <-> game), OR
            // 2. Payload has teams AND either:
            //    a. We have no teams yet, OR
            //    b. Payload has MORE teams than current (sync from host after team creation)
            const sessionStateChanged = currentSessionActive !== payloadSessionActive;
            const shouldUpdateTeams = sessionStateChanged || (payloadTeams.length > 0 && payloadTeams.length >= currentTeams.length);

            console.log('[ScreenView] Updating gameState:', {
              currentSessionActive,
              payloadSessionActive,
              sessionStateChanged,
              willUpdateTo: payloadSessionActive
            });

            return {
              ...prevState,
              clients: payload.clients !== undefined ? payload.clients : (prevState?.clients || []),
              teams: shouldUpdateTeams ? payloadTeams : currentTeams,
              isSessionActive: payloadSessionActive
            };
          });
        }
        break;
      case 'TEAMS_SYNC':
        const syncedTeams = message.payload.teams || [];
        if (syncedTeams.length > 0) {
          setGameState(prevState => ({
            ...prevState,
            teams: syncedTeams
          }));
          setDetailedGameState(prevState => ({
            ...prevState,
            teamScores: syncedTeams.map((team: any) => ({
              id: team.id,
              name: team.name,
              score: team.score || 0
            }))
          }));
        }
        break;
      case 'TEAM_UPDATE':
        const { teamId, teamName } = message.payload;
        setGameState(prevState => {
          const existingTeams = prevState?.teams || [];
          const teamExists = existingTeams.some((t: any) => t.id === teamId);
          if (teamExists) {
            // Update existing team
            return {
              ...prevState,
              teams: existingTeams.map((t: any) =>
                t.id === teamId ? { ...t, name: teamName, lastUsedAt: Date.now() } : t
              )
            };
          } else {
            // Add new team
            return {
              ...prevState,
              teams: [...existingTeams, { id: teamId, name: teamName, createdAt: Date.now(), lastUsedAt: Date.now() }]
            };
          }
        });
        // Also update detailedGameState teamScores
        setDetailedGameState(prevState => {
          const existingScores = prevState.teamScores || [];
          const scoreExists = existingScores.some(t => t.id === teamId);
          if (scoreExists) {
            return {
              ...prevState,
              teamScores: existingScores.map(t =>
                t.id === teamId ? { ...t, name: teamName } : t
              )
            };
          } else {
            return {
              ...prevState,
              teamScores: [...existingScores, { id: teamId, name: teamName, score: 0 }]
            };
          }
        });
        break;
      case 'COMMANDS_LIST':
        // Handle commands list from host
        const commands = message.payload.commands || [];
        console.log('[ScreenView] Commands list received:', commands.length, 'teams');
        // Convert commands to teams format for display
        const teamsFromCommands = commands.map((cmd: { id: string; name: string }) => ({
          id: cmd.id,
          name: cmd.name,
          createdAt: Date.now(),
          lastUsedAt: Date.now()
        }));
        setGameState(prevState => ({
          ...prevState,
          teams: teamsFromCommands
        }));
        // Update detailedGameState teamScores - REPLACE with current commands list
        setDetailedGameState(prevState => {
          const updatedTeamScores = commands.map((cmd: { id: string; name: string }) => {
            const existing = prevState.teamScores?.find(t => t.id === cmd.id);
            return {
              id: cmd.id,
              name: cmd.name,
              score: existing?.score ?? 0
            };
          });
          return {
            ...prevState,
            teamScores: updatedTeamScores
          };
        });
        break;
      case 'BROADCAST':
        if (message.payload?.type === 'GAME_STATE_UPDATE') {
          handleGameStateUpdate(message.payload.state, message.payload);
        } else if (message.payload?.type === 'MEDIA_TRANSFER') {
          demoScreenMedia.processMediaMessage(message);
        } else if (message.payload?.type === 'SUPER_GAME_STATE_SYNC') {
          setDetailedGameState(prevState => ({
            ...prevState,
            superGamePhase: message.payload.phase || 'idle'
          }));
        }
        break;
      // TIMER_STATE is ignored - demo screen calculates timer locally
      case 'QR_CODE_STATE':
        setQrCodeState({
          isVisible: message.payload.showQRCode || false,
          position: message.payload.position
        });
        break;
      // TIMER_CONTROL is ignored - demo screen controls timer locally
      case 'MEDIA_TRANSFER':
      case 'MEDIA_CHUNK_METADATA':
      case 'MEDIA_CHUNK':
      case 'MEDIA_CHUNK_COMPLETE':
      case 'MEDIA_PROGRESS':
        // Handle all media messages via demo screen media hook
        demoScreenMedia.processMediaMessage(message);
        break;
      case 'BUZZ_EVENT':
        // Handle buzz event for visual feedback on demo screen
        console.log('[ScreenView] BUZZ_EVENT received:', message.payload);
        const buzzClientId = message.payload.clientId;
        const clientsList = gameState.clients?.map((c: any) => ({ id: c.id, peerId: c.peerId, name: c.name, teamId: c.teamId })) || [];
        console.log('[ScreenView] Current clients in gameState:', clientsList);
        console.log('[ScreenView] Looking for clientId:', buzzClientId, 'in buzzing check');
        // Log each client for debugging
        clientsList.forEach((c: any) => {
          console.log('[ScreenView] Client:', c.name, 'id:', c.id, 'peerId:', c.peerId, 'matches id:', c.id === buzzClientId, 'matches peerId:', c.peerId === buzzClientId);
        });
        // Check both id and peerId for match
        const matchedClient = clientsList.find((c: any) => c.id === buzzClientId || c.peerId === buzzClientId);
        console.log('[ScreenView] Match found:', !!matchedClient, matchedClient ? `client: ${matchedClient.name}` : '');
        // Add to buzzing clients for visual flash effect (use the matched client's id or the buzzClientId)
        const clientIdToAdd = matchedClient?.id || buzzClientId;
        setBuzingClientIds(prev => new Set(prev).add(clientIdToAdd));
        // Remove after 500ms
        setTimeout(() => {
          setBuzingClientIds(prev => {
            const newSet = new Set(prev);
            newSet.delete(clientIdToAdd);
            return newSet;
          });
        }, 500);

        // If team is not active, add to buzzedTeamIds for shrink/lighten effect
        const buzzTeamId = message.payload.teamId;
        const isTeamActive = message.payload.isTeamActive !== false; // Default to true if not specified
        if (!isTeamActive && buzzTeamId) {
          setBuzzedTeamIds(prev => new Set(prev).add(buzzTeamId));
          setTimeout(() => {
            setBuzzedTeamIds(prev => {
              const newSet = new Set(prev);
              newSet.delete(buzzTeamId);
              return newSet;
            });
          }, 500);
        }
        break;
      default:
    }
  }, [demoScreenMedia]); // Demo screen media dependency

  // Host info from URL
  const urlHostId = useMemo(() => {
    const params = new URLSearchParams(window.location.hash.split('?')[1]);
    return params.get('host') || storage.get(STORAGE_KEYS.LAST_HOST) || null;
  }, []);

  // Get signalling server URL
  const signallingUrl = useMemo(() => {
    const params = new URLSearchParams(window.location.hash.split('?')[1]);
    const lanServer = params.get('signalling');
    if (lanServer) {
      return `ws://${lanServer}:9000`;
    }
    return undefined;
  }, []);

  // Screen ID
  const [clientId] = useState<string>(() => {
    const saved = storage.get(STORAGE_KEYS.SCREEN_ID);
    if (saved) return saved;
    const newId = 'screen_' + Math.random().toString(36).substring(2, 10);
    storage.set(STORAGE_KEYS.SCREEN_ID, newId);
    return newId;
  });

  // Connection state
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');

  // Game state from host (synced via P2P)
  const [gameState, setGameState] = useState<any>({
    teams: [],
    clients: [],
    isSessionActive: false
  });

  // Track which clients are currently buzzing (for visual flash effect)
  const [buzzingClientIds, setBuzingClientIds] = useState<Set<string>>(new Set());

  // Track which teams are currently buzzing (for shrink/lighten effect on inactive teams)
  const [buzzedTeamIds, setBuzzedTeamIds] = useState<Set<string>>(new Set());

  // QR Code state from host
  const [qrCodeState, setQrCodeState] = useState<{
    isVisible: boolean;
    position?: { x: number; y: number };
  }>({
    isVisible: false,
    position: undefined
  });

  // Ref for themes scroll container
  const themesScrollRef = useRef<HTMLDivElement>(null);

  // Detailed game state for real-time updates
  const [detailedGameState, setDetailedGameState] = useState<{
    currentScreen?: string;
    currentRoundIndex?: number;
    activeQuestion?: {
      text: string;
      media?: any;
      answer?: string;
      answerMedia?: any;
      points: number;
      themeName: string;
      roundName?: string;
      questionId?: string; // Add question ID for proper comparison
      hint?: {
        text?: string;
        media?: any;
        answers?: string[];
        correctAnswer?: number;
      };
    };
    showAnswer?: boolean;
    showHint?: boolean;
    teamScores?: Array<{ id: string; name: string; score: number }>;
    buzzerState?: {
      active: boolean;
      timerPhase?: 'reading' | 'response' | 'complete' | 'inactive';
      readingTimerRemaining: number;
      responseTimerRemaining: number;
      handicapActive: boolean;
      handicapTeamId?: string;
      readingTimeTotal?: number;
      responseTimeTotal?: number;
      isPaused?: boolean;
      // Color information from host (authoritative)
      timerColor?: 'yellow' | 'green' | 'gray';
      timerBarColor?: string;
      timerTextColor?: string;
    };
    answeringTeamId?: string | null;
    currentRound?: {
      id: string;
      name: string;
      number?: number;
      type?: string;
      cover?: any;
      // Timer settings - demo screen reads these to calculate timer independently
      readingTimePerLetter?: number;
      responseWindow?: number;
      handicapEnabled?: boolean;
      handicapDelay?: number;
    };
    // Add game board data
    allThemes?: Array<{
      id: string;
      name: string;
      color?: string;
      textColor?: string;
      roundNumber: number;
      roundName: string;
      questions?: Array<{
        id: string;
        points: number;
        answered?: boolean;
      }>;
    }>;
    boardData?: {
      themes?: Array<{
        id: string;
        name: string;
        color?: string;
        textColor?: string;
        questions?: Array<{
          id: string;
          points: number;
          answered?: boolean;
        }>;
      }>;
    };
    packCover?: any;
    packName?: string;
    selectedSuperThemeId?: string | null;
    disabledSuperThemeIds?: string[];
    superGameBets?: Array<{ teamId: string; bet: number; ready: boolean }>;
    superGameAnswers?: Array<{ teamId: string; answer: string; revealed: boolean }>;
    selectedSuperAnswerTeam?: string | null;
    // Team states using new status system (TeamStatus enum)
    // Can be in per-team format (Record<string, TeamState>) or grouped format (Record<string, string[]>)
    teamStates?: Record<string, any>;
    showQRCode?: boolean; // QR code visibility state
    hostId?: string; // Host ID for QR code generation
    qrCodePosition?: { x: number; y: number }; // QR code position from host
    highlightedQuestion?: string | null; // Currently highlighted question (for visual feedback)
    themesScrollPosition?: number; // Scroll position for themes list
  }>({
    buzzerState: {
      active: false,
      timerPhase: 'inactive',
      readingTimerRemaining: 0,
      responseTimerRemaining: 0,
      readingTimeTotal: 5,
      responseTimeTotal: 30,
      handicapActive: false,
      isPaused: false,
      timerBarColor: 'bg-gray-500',
      timerTextColor: 'text-gray-300'
    }
  });

  // Timer display refs for direct DOM manipulation (no re-renders)
  const timerTextRef = useRef<HTMLSpanElement>(null);
  const timerBarRef = useRef<HTMLDivElement>(null);
  const timerPauseIndicatorRef = useRef<HTMLDivElement>(null);

  // Local timer state - demo screen runs timer independently, NOT syncing with host
  const localTimerStateRef = useRef({
    phase: 'inactive' as 'reading' | 'response' | 'inactive',
    readingRemaining: 0,
    responseRemaining: 0,
    readingTotal: 0,
    responseTotal: 0,
    isPaused: false,
    hasSwitchedPhase: false, // Track if we've sent TIMER_PHASE_SWITCH for current reading phase
    phaseSwitchedLocally: false, // Track if WE switched phase (waiting for host confirmation)
    currentQuestionId: null as string | null, // Track current question to detect changes
    // Timer settings - will be calculated from question text
    readingTimePerLetter: 0.05, // Default value
    responseWindow: 30 // Default value
  });

  // Ref to track when question opens for timer initialization
  const lastQuestionIdRef = useRef<string | null>(null);

  // Calculate timer settings from question text (same logic as host uses)
  // Timer settings come from currentRound - demo screen reads from pack just like host
  const calculateTimerFromQuestion = useCallback((questionText: string, hasMedia: boolean) => {
    // Get timer settings from currentRound (received from host via broadcast)
    const readingTimePerLetter = detailedGameState.currentRound?.readingTimePerLetter ?? 0.05;
    const responseWindow = detailedGameState.currentRound?.responseWindow ?? 30;

    // Count letters (same logic as host)
    const questionTextLetters = (questionText || '').replace(/[^a-zA-Zа-яА-ЯёЁ]/g, '').length;
    const readingTime = readingTimePerLetter > 0
      ? (hasMedia ? questionTextLetters * readingTimePerLetter * 0.5 : questionTextLetters * readingTimePerLetter)
      : 0;

    // Minimum 1 second for reading timer
    return {
      readingTime: Math.max(readingTime, 1.0),
      responseTime: responseWindow,
      readingTimePerLetter,
      responseWindow
    };
  }, [detailedGameState.currentRound?.readingTimePerLetter, detailedGameState.currentRound?.responseWindow]);

  // Initialize media handler for background downloads
  useEffect(() => {
    demoScreenMediaHandler.initialize((updates) => {
      // Media download progress updates - could trigger UI updates here if needed
    });

    // Run initial health check
    MediaSystemDebugger.healthCheck();

    return () => {
      // Cleanup on unmount
      demoScreenMediaHandler.clear();
    };
  }, []);

  // Connection quality
  const [connectionQuality, setConnectionQuality] = useState({
    rtt: 0,
    packetLoss: 0,
    jitter: 0,
    lastPing: Date.now(),
    healthScore: 100
  });

  // Local countdown state - managed by timer useEffect below

  // Initialize P2P client for screen (connects to host as client)
  const p2pClient = useP2PClient({
    clientName: 'ScreenView',
    hostId: urlHostId || '',
    isLanMode: !!signallingUrl,
    signallingUrl: signallingUrl,
    persistentClientId: clientId,
    currentTeamId: undefined,
    isModerator: false, // Not a moderator, just a display
    onMessage: (message) => {
      // Process message directly with new architecture
      // This handles ALL message types including COMMANDS_LIST, TEAM_UPDATE, STATE_SYNC, etc.
      processMessage(message);

      // Note: TEAM_UPDATE and COMMANDS_LIST are handled in processMessage()
      // to avoid duplicate processing and ensure consistent state updates

      // Handle specific message types that need special handling
      switch (message.type) {
        // TEAM_UPDATE is now handled in processMessage() only
        // COMMANDS_LIST is handled in processMessage() only
        case 'BROADCAST':
          if (message.payload?.type === 'GAME_STATE_UPDATE') {
            handleGameStateUpdate(message.payload.state, message.payload);
          } else if (message.payload?.type === 'MEDIA_TRANSFER') {
            const payload = message.payload;
            if (!window.mediaTransferCache) {
              window.mediaTransferCache = new Map();
            }
            if (payload.isYouTube && payload.url) {
              window.mediaTransferCache.set(payload.mediaId, {
                type: payload.mediaType,
                url: payload.url,
                isYouTube: true
              });
            } else if (payload.fileData && payload.fileType) {
              window.mediaTransferCache.set(payload.mediaId, {
                type: payload.mediaType,
                url: null,
                fileData: payload.fileData,
                fileType: payload.fileType,
                isYouTube: false
              });
            } else if (payload.url) {
              window.mediaTransferCache.set(payload.mediaId, {
                type: payload.mediaType,
                url: payload.url,
                isYouTube: false
              });
            }
          } else if (message.payload?.type === 'SUPER_GAME_STATE_SYNC') {
            setDetailedGameState(prevState => ({
              ...prevState,
              superGamePhase: message.payload.phase || 'idle'
            }));
          }
          break;
        case 'QR_CODE_STATE':
          setQrCodeState({
            isVisible: message.payload.showQRCode || false,
            position: message.payload.position
          });
          break;
        case 'MEDIA_TRANSFER':
        case 'MEDIA_CHUNK_METADATA':
        case 'MEDIA_CHUNK':
        case 'MEDIA_CHUNK_COMPLETE':
        case 'MEDIA_PROGRESS':
          // Handle all media messages via demo screen media hook
          demoScreenMedia.processMediaMessage(message);
          break;
        default:
      }
    },
    onConnectionChange: (state, quality) => {
      setConnectionQuality(quality);
      switch (state) {
        case ClientConnectionState.CONNECTED:
          setConnectionStatus('connected');
          break;
        case ClientConnectionState.CONNECTING:
        case ClientConnectionState.RECONNECTING:
          setConnectionStatus('connecting');
          break;
        case ClientConnectionState.DISCONNECTED:
          setConnectionStatus('disconnected');
          break;
        case ClientConnectionState.ERROR:
          setConnectionStatus('error');
          break;
      }
    },
    onError: (error) => {
      console.error('[ScreenView] P2P error:', error);
      setConnectionStatus('error');
    },
  });

  // Auto-connect when we have host ID
  useEffect(() => {
    if (urlHostId && !p2pClient.isConnected && !p2pClient.isConnecting) {
      console.log('[ScreenView] Connecting to host...');
      p2pClient.connect();
    }
  }, [urlHostId, p2pClient]);

  // Track connection changes for reconnection detection
  const previousConnectionStatusRef = useRef<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');

  useEffect(() => {
    if (connectionStatus !== previousConnectionStatusRef.current) {
      console.log('[ScreenView] Connection:', connectionStatus);

      // When transitioning to connected, request full state sync from host
      if (connectionStatus === 'connected' && previousConnectionStatusRef.current !== 'connected') {
        // Request initial state sync from host
        p2pClient.send({
          id: `sync_${Date.now()}`,
          category: MessageCategory.SYNC,
          timestamp: Date.now(),
          senderId: clientId,
          type: 'STATE_SYNC_REQUEST',
          payload: {}
        });
      }

      previousConnectionStatusRef.current = connectionStatus;
    }
  }, [connectionStatus, p2pClient.isConnected, p2pClient.send, clientId]);

  // Handle game state updates with media restoration
  const handleGameStateUpdate = useCallback(async (state: any, fullPayload?: any) => {
    // Debug: Log incoming fullPayload to see if teamStates and teamScores are present
    console.log('[ScreenView] 📥 handleGameStateUpdate called with:', {
      hasFullPayload: !!fullPayload,
      hasTeamStatesInPayload: !!fullPayload?.teamStates,
      hasTeamScoresInPayload: !!fullPayload?.teamScores,
      teamScoresCount: fullPayload?.teamScores?.length || 0,
      teamScoresValue: fullPayload?.teamScores,
      stateKeys: Object.keys(state || {}),
      payloadKeys: fullPayload ? Object.keys(fullPayload) : []
    });

    // Transform currentQuestion to activeQuestion format for compatibility
    if (state.currentQuestion && !state.activeQuestion) {
      state.activeQuestion = {
        text: state.currentQuestion.text,
        media: state.currentQuestion.media,
        answer: state.currentQuestion.answerText,
        answerMedia: state.currentQuestion.answerMedia,
        points: state.currentQuestion.points,
        themeName: state.currentQuestion.themeName || 'Unknown Theme',
        roundName: state.currentQuestion.roundName,
        questionId: state.currentQuestion.id,
        // Include hint if available
        hint: state.currentQuestion.hint ? {
          text: state.currentQuestion.hint.text,
          media: state.currentQuestion.hint.media,
          answers: state.currentQuestion.hint.answers,
          correctAnswer: state.currentQuestion.hint.correctAnswer
        } : undefined
      };
      console.log('[ScreenView] Transformed activeQuestion:', {
        questionId: state.activeQuestion.questionId,
        text: state.activeQuestion.text?.slice(0, 30),
        hasMedia: !!state.activeQuestion.media,
        hasAnswerMedia: !!state.activeQuestion.answerMedia,
        hasHint: !!state.activeQuestion.hint
      });
    }

    // Debug active question media
    if (state.activeQuestion) {
      MediaSystemDebugger.debugActiveQuestionMedia(state.activeQuestion);
    } else if (state.currentQuestion) {
      console.log('[ScreenView] Using currentQuestion instead of activeQuestion:', {
        id: state.currentQuestion.id,
        text: state.currentQuestion.text?.slice(0, 30),
        hasMedia: !!state.currentQuestion.media,
        hasAnswerMedia: !!state.currentQuestion.answerMedia
      });
    }

    // NOTE: Media cache processing moved to after finalActiveQuestion determination
    // This ensures media URLs from MEDIA_TRANSFER messages are properly applied

    setDetailedGameState(prevState => {
      // Preserve important fields if not provided in new state
      const oldScreen = prevState.currentScreen;
      const newScreen = state.currentScreen;
      const oldQuestion = prevState.activeQuestion;
      const newQuestion = state.activeQuestion;

      // Log screen changes for debugging
      if (newScreen && newScreen !== oldScreen) {
      } else if (!newScreen) {
      }

      // Check if question actually changed (deep comparison)
      // Important: null newQuestion means question was closed - MUST clear it
      const shouldUpdateQuestion = newQuestion === null || (
        newQuestion && (
          !oldQuestion || // No previous question - must set new one
          (oldQuestion.questionId !== newQuestion.questionId) || // Different question ID
          (oldQuestion.text !== newQuestion.text) ||
          (oldQuestion.points !== newQuestion.points) ||
          (oldQuestion.themeName !== newQuestion.themeName)
        )
      );

      // Use new question if should update, otherwise preserve old
      let finalActiveQuestion = shouldUpdateQuestion ? newQuestion : oldQuestion;

      // CRITICAL: Apply cached media URLs AFTER finalActiveQuestion is determined
      // This ensures media URLs from MEDIA_TRANSFER messages are preserved
      finalActiveQuestion = demoScreenMedia.applyCachedMedia(finalActiveQuestion);

      // Log question changes for debugging (only when actually changed)
      if (shouldUpdateQuestion) {
        if (newQuestion?.questionId) {
          console.log('[ScreenView] ⚠️ Question updated:', {
            oldId: oldQuestion?.questionId,
            newId: newQuestion.questionId,
            oldText: oldQuestion?.text?.slice(0, 30),
            newText: newQuestion.text?.slice(0, 30),
            oldTheme: oldQuestion?.themeName,
            newTheme: newQuestion.themeName,
            showAnswer: state.showAnswer
          });

          // Initialize local timer when question opens
          const hasMedia = newQuestion.media?.type === 'audio' ||
                          newQuestion.media?.type === 'video' ||
                          newQuestion.media?.type === 'youtube';

          // Get timer settings from currentRound (same as host uses)
          const readingTimePerLetter = detailedGameState.currentRound?.readingTimePerLetter ?? 0.05;
          const responseWindow = detailedGameState.currentRound?.responseWindow ?? 30;

          const questionTextLetters = (newQuestion.text || '').replace(/[^a-zA-Zа-яА-ЯёЁ]/g, '').length;
          const readingTime = readingTimePerLetter > 0
            ? (hasMedia ? questionTextLetters * readingTimePerLetter * 0.5 : questionTextLetters * readingTimePerLetter)
            : 0;
          const calculatedReadingTime = Math.max(readingTime, 1.0);

          localTimerStateRef.current = {
            phase: calculatedReadingTime > 0 ? 'reading' : 'response',
            readingRemaining: calculatedReadingTime,
            responseRemaining: responseWindow,
            readingTotal: calculatedReadingTime,
            responseTotal: responseWindow,
            isPaused: false, // Timer starts running immediately
            hasSwitchedPhase: false,
            phaseSwitchedLocally: false,
            currentQuestionId: newQuestion.questionId || null,
            readingTimePerLetter,
            responseWindow
          };

          lastQuestionIdRef.current = newQuestion.questionId || null;

          console.log('[ScreenView] 🕐 Local timer initialized:', {
            questionId: newQuestion.questionId,
            readingTime: calculatedReadingTime,
            responseTime: responseWindow,
            phase: calculatedReadingTime > 0 ? 'reading' : 'response',
            hasMedia
          });
        } else if (newQuestion === null && oldQuestion) {
          console.log('[ScreenView] ✅ Question CLOSED (was:', oldQuestion.questionId, ')');
          // Clear media cache when question closes to prevent stale media
          demoScreenMedia.clearQuestionMedia(oldQuestion.questionId || oldQuestion.id || '');

          // Reset local timer when question closes
          localTimerStateRef.current = {
            phase: 'inactive',
            readingRemaining: 0,
            responseRemaining: 0,
            readingTotal: 0,
            responseTotal: 0,
            isPaused: false,
            hasSwitchedPhase: false,
            phaseSwitchedLocally: false,
            currentQuestionId: null,
            readingTimePerLetter: 0.05,
            responseWindow: 30
          };
          lastQuestionIdRef.current = null;
        }
      } else {
        console.log('[ScreenView] ♻️ Question preserved (no change):', {
          currentId: oldQuestion?.questionId,
          showAnswer: state.showAnswer,
          reason: !newQuestion ? 'no new question' :
                  !oldQuestion ? 'no old question' :
                  oldQuestion.questionId === newQuestion.questionId ? 'same question ID' :
                  'other fields unchanged'
        });
      }

      // buzzerState from host is ignored - demo screen uses local timer
      const finalBuzzerState = prevState.buzzerState || {
        active: false,
        timerPhase: 'inactive',
        readingTimerRemaining: 0,
        responseTimerRemaining: 0,
        readingTimeTotal: 5,
        responseTimeTotal: 30,
        handicapActive: false,
        isPaused: false,
        timerBarColor: 'bg-gray-500',
        timerTextColor: 'text-gray-300'
      };

      const updatedState = {
        ...state,
        // Preserve currentScreen if not provided (prevent screen jumping)
        currentScreen: state.currentScreen || prevState.currentScreen || 'cover',
        // CRITICAL: teamScores comes from fullPayload (top level), not from state
        // This ensures score updates sync properly from host to demo screen
        teamScores: fullPayload?.teamScores || state.teamScores || prevState.teamScores || [],
        // Extract packCover and packName from full payload (they are outside state)
        packCover: fullPayload?.packCover !== undefined ? fullPayload.packCover : prevState.packCover,
        packName: fullPayload?.packName !== undefined ? fullPayload.packName : prevState.packName,
        // Extract allThemes and boardData from full payload
        allThemes: fullPayload?.allThemes !== undefined ? fullPayload.allThemes : prevState.allThemes,
        boardData: fullPayload?.boardData !== undefined ? fullPayload.boardData : prevState.boardData,
        // Extract currentRound from full payload
        currentRound: fullPayload?.currentRound !== undefined ? fullPayload.currentRound : prevState.currentRound,
        // Extract super game data from full payload
        selectedSuperThemeId: fullPayload?.selectedSuperThemeId !== undefined ? fullPayload.selectedSuperThemeId : prevState.selectedSuperThemeId,
        disabledSuperThemeIds: fullPayload?.disabledSuperThemeIds !== undefined ? fullPayload.disabledSuperThemeIds : prevState.disabledSuperThemeIds,
        superGameBets: fullPayload?.superGameBets !== undefined ? fullPayload.superGameBets : prevState.superGameBets,
        superGameAnswers: fullPayload?.superGameAnswers !== undefined ? fullPayload.superGameAnswers : prevState.superGameAnswers,
        selectedSuperAnswerTeam: fullPayload?.selectedSuperAnswerTeam !== undefined ? fullPayload.selectedSuperAnswerTeam : prevState.selectedSuperAnswerTeam,
        // Extract highlightedQuestion from full payload
        highlightedQuestion: fullPayload?.highlightedQuestion !== undefined ? fullPayload.highlightedQuestion : prevState.highlightedQuestion,
        // Extract themesScrollPosition from full payload
        themesScrollPosition: fullPayload?.themesScrollPosition !== undefined ? fullPayload.themesScrollPosition : prevState.themesScrollPosition,
        // Use final activeQuestion (either new or preserved old)
        activeQuestion: finalActiveQuestion,
        // Use calculated final buzzerState
        buzzerState: finalBuzzerState,
        // CRITICAL: Always update showAnswer and showHint from host state
        // This ensures instant sync when host shows/hides answer or hint
        showAnswer: state.showAnswer !== undefined ? state.showAnswer : prevState.showAnswer,
        showHint: state.showHint !== undefined ? state.showHint : prevState.showHint,
        // Log showAnswer/showHint changes for debugging
        ...(state.showAnswer !== undefined && state.showAnswer !== prevState.showAnswer && {
          _showAnswerChanged: {
            from: prevState.showAnswer,
            to: state.showAnswer,
            timestamp: Date.now()
          }
        }),
        ...(state.showHint !== undefined && state.showHint !== prevState.showHint && {
          _showHintChanged: {
            from: prevState.showHint,
            to: state.showHint,
            timestamp: Date.now()
          }
        }),

        // Log incoming showAnswer value for debugging
        ...(state.showAnswer !== undefined && {
          _debugShowAnswer: state.showAnswer
        }),
        // Preserve teamStates if not provided (critical for player panel colors)
        // Host sends grouped format (Record<string, string[]>), transform to per-team format
        // NOTE: teamStates is in fullPayload (top level), not in state
        teamStates: (() => {
          // teamStates comes from fullPayload, not from state
          const incomingTeamStates = fullPayload?.teamStates;

          if (!incomingTeamStates) {
            return prevState.teamStates || {};
          }

          // Check if teamStates is in grouped format (from host) or per-team format
          const firstKey = Object.keys(incomingTeamStates)[0];
          if (firstKey && (Array.isArray(incomingTeamStates[firstKey]) || firstKey === 'inactive' || firstKey === 'active' || firstKey === 'answering' || firstKey === 'penalty' || firstKey === 'clash' || firstKey === 'first_clash' || firstKey === 'simple_clash')) {
            // Grouped format from host - transform to per-team format
            const groupedStates = incomingTeamStates as Record<string, string[]>;
            const perTeamStates: Record<string, TeamState> = {};

            // Get all team IDs from teamScores
            const allTeamIds = new Set((state.teamScores || prevState.teamScores || []).map((t: any) => t.id));

            // Process each status group
            Object.entries(groupedStates).forEach(([status, teamIds]) => {
              // Skip sub-status arrays (first_clash, simple_clash) - they'll be processed separately
              if (status === 'first_clash' || status === 'simple_clash') {
                return;
              }

              teamIds.forEach((teamId: string) => {
                const clashSubStatus = (groupedStates.first_clash?.includes(teamId) ? 'first_clash' :
                                       groupedStates.simple_clash?.includes(teamId) ? 'simple_clash' : undefined) as 'first_clash' | 'simple_clash' | undefined;

                perTeamStates[teamId] = {
                  status: status as TeamStatus,
                  previousStatus: 'inactive' as TeamStatus,
                  hasAttempted: status === 'penalty' || status === 'answering',
                  statusSince: Date.now(),
                  ...(clashSubStatus && { clashSubStatus })
                };
              });
            });

            // Ensure all teams have a state (default to INACTIVE)
            allTeamIds.forEach(teamId => {
              if (!perTeamStates[teamId]) {
                perTeamStates[teamId] = {
                  status: 'inactive' as TeamStatus,
                  previousStatus: 'inactive' as TeamStatus,
                  hasAttempted: false,
                  statusSince: Date.now()
                };
              }
            });

            return perTeamStates;
          }

          // Already in per-team format - use as-is
          return incomingTeamStates as Record<string, TeamState>;
        })()
      };

      // Log when showAnswer changes
      if (state.showAnswer !== undefined && state.showAnswer !== prevState.showAnswer) {
        console.log('[ScreenView] 📝 showAnswer changed:', {
          from: prevState.showAnswer,
          to: state.showAnswer,
          questionId: state.activeQuestion?.questionId
        });
      }

      // Log updated state for debugging
      console.log('[ScreenView] Updated detailedGameState:', {
        currentScreen: updatedState.currentScreen,
        showAnswer: updatedState.showAnswer,
        activeQuestion: !!updatedState.activeQuestion,
        questionText: updatedState.activeQuestion?.text?.slice(0, 30),
        hasPackCover: !!updatedState.packCover,
        packCoverValue: updatedState.packCover?.value?.slice(0, 60) || 'none',
        packName: updatedState.packName,
        allThemesCount: updatedState.allThemes?.length || 0,
        hasBoardData: !!updatedState.boardData
      });

      return updatedState;
    });

    console.log('[ScreenView] 📊 Team scores update:', {
      fromPayload: fullPayload?.teamScores?.map(t => ({ id: t.id.slice(0, 12), name: t.name, score: t.score })),
      fromState: state.teamScores?.map(t => ({ id: t.id.slice(0, 12), name: t.name, score: t.score })),
      currentPreserved: detailedGameState.teamScores?.map(t => ({ id: t.id.slice(0, 12), name: t.name, score: t.score }))
    });
    console.log('[ScreenView] Team states updated:', fullPayload?.teamStates);

    // Enhanced logging for team card states
    if (state.teamStates) {
      console.log('[ScreenView] 🎨 Team Card States Summary (new system):');
      Object.entries(state.teamStates).forEach(([teamId, teamState]) => {
        const clashInfo = teamState.clashSubStatus ? ` [clash: ${teamState.clashSubStatus}]` : '';
        console.log(`  Team ${teamId}: ${teamState.status}${clashInfo} (attempted: ${teamState.hasAttempted})`);
      });
      console.log(`  🎯 Answering Team: ${state.answeringTeamId || 'none'}`);
    }
    // Note: buzzerState from host is ignored - demo screen uses local timer
  }, [demoScreenMedia]);

  // Sync themes scroll position with host
  useEffect(() => {
    if (detailedGameState.currentScreen === 'themes' && themesScrollRef.current && detailedGameState.themesScrollPosition !== undefined) {
      themesScrollRef.current.scrollTop = detailedGameState.themesScrollPosition;
    }
  }, [detailedGameState.themesScrollPosition, detailedGameState.currentScreen]);

  // Reset currentScreen when session ends (transition back to lobby)
  useEffect(() => {
    console.log('[ScreenView] gameState.isSessionActive changed:', gameState?.isSessionActive);
    if (!gameState?.isSessionActive && detailedGameState.currentScreen && detailedGameState.currentScreen !== 'lobby') {
      console.log('[ScreenView] Session ended, resetting currentScreen to show lobby');
      setDetailedGameState(prevState => ({
        ...prevState,
        currentScreen: undefined
      }));
    }
  }, [gameState?.isSessionActive]);

  // Local timer countdown - demo screen runs timer independently, NOT syncing with host
  // When reading timer finishes locally, demo screen switches to response phase
  // and sends TIMER_PHASE_SWITCH to host
  useEffect(() => {
    let lastLocalUpdateTime = Date.now();

    const interval = setInterval(() => {
      const now = Date.now();
      const deltaTime = (now - lastLocalUpdateTime) / 1000; // in seconds
      lastLocalUpdateTime = now;

      const localState = localTimerStateRef.current;

      // Update local timer if not paused and in active phase
      if (!localState.isPaused && localState.phase !== 'inactive' && localState.phase !== 'complete') {
        if (localState.phase === 'reading') {
          localState.readingRemaining = Math.max(0, localState.readingRemaining - deltaTime);

          // Check if reading timer finished locally - switch to response phase
          // Only send signal if question is still active on host (not closed, answer not shown)
          const isQuestionStillActive = detailedGameState.activeQuestion?.questionId === localState.currentQuestionId
                                     && !detailedGameState.showAnswer;

          if (localState.readingRemaining <= 0 && !localState.hasSwitchedPhase && isQuestionStillActive) {
            localState.readingRemaining = 0;
            localState.phase = 'response';
            localState.hasSwitchedPhase = true;
            localState.phaseSwitchedLocally = true;

            console.log('[ScreenView] 🟡 Reading timer finished, switching to 🟢 response phase');

            // Send TIMER_PHASE_SWITCH to host
            if (p2pClient.isConnected) {
              p2pClient.send({
                id: `phase_switch_${Date.now()}`,
                category: MessageCategory.EVENT,
                timestamp: Date.now(),
                senderId: clientId,
                type: 'TIMER_PHASE_SWITCH',
                payload: {
                  fromPhase: 'reading',
                  toPhase: 'response'
                }
              });
              console.log('[ScreenView] ➡️ Sent TIMER_PHASE_SWITCH to host');
            }
          } else if (localState.readingRemaining <= 0 && !localState.hasSwitchedPhase && !isQuestionStillActive) {
            // Question closed before timer finished - just switch locally without signaling host
            localState.readingRemaining = 0;
            localState.phase = 'response';
            localState.hasSwitchedPhase = true;
            console.log('[ScreenView] 🟡 Reading timer finished but question not active - skipping host signal');
          }
        } else if (localState.phase === 'response') {
          localState.responseRemaining = Math.max(0, localState.responseRemaining - deltaTime);

          // Check if response timer finished
          if (localState.responseRemaining <= 0) {
            localState.responseRemaining = 0;
            localState.phase = 'complete';
            console.log('[ScreenView] ⏱️ Response timer finished');
          }
        }
      }

      // Update display with local countdown values
      if (timerTextRef.current) {
        let displayTime = 0;
        let displayPhase = localState.phase;

        // Determine which time to display
        if (displayPhase === 'reading') {
          displayTime = localState.readingRemaining;
        } else if (displayPhase === 'response') {
          displayTime = localState.responseRemaining;
        }

        if (displayPhase === 'reading' || displayPhase === 'response') {
          const timerTextColor = displayPhase === 'reading'
            ? 'text-yellow-300'
            : 'text-green-300';
          const pauseText = localState.isPaused
            ? ' <span class="text-red-400 text-sm font-bold">[PAUSED]</span>'
            : '';
          timerTextRef.current.innerHTML = `${displayTime.toFixed(1)}сек${pauseText}`;
          timerTextRef.current.className = `text-xl font-bold ${timerTextColor}`;
        } else {
          timerTextRef.current.textContent = '';
        }
      }

      // Update timer bar with local countdown values
      if (timerBarRef.current) {
        let progress = 0;
        const timerBarColor = localState.phase === 'reading'
          ? 'bg-yellow-500'
          : localState.phase === 'response' ? 'bg-green-500' : 'bg-gray-500';

        if (localState.phase === 'reading') {
          const totalTime = localState.readingTotal;
          const currentTime = localState.readingRemaining;
          const elapsed = totalTime - currentTime;
          progress = Math.min(100, Math.max(0, (elapsed / totalTime) * 100));
        } else if (localState.phase === 'response') {
          const totalTime = localState.responseTotal;
          const currentTime = localState.responseRemaining;
          const elapsed = totalTime - currentTime;
          progress = Math.min(100, Math.max(0, (elapsed / totalTime) * 100));
        }

        timerBarRef.current.style.width = `${progress}%`;
        timerBarRef.current.className = `h-full transition-all duration-100 ease-linear ${timerBarColor}`;
      }

      // Update pause indicator visibility
      if (timerPauseIndicatorRef.current) {
        const shouldShow = localState.isPaused &&
          (localState.phase === 'reading' || localState.phase === 'response');
        timerPauseIndicatorRef.current.classList.toggle('hidden', !shouldShow);
      }
    }, 50); // Update every 50ms for smooth countdown

    return () => clearInterval(interval);
  }, [p2pClient, clientId]);

  // Request state sync periodically (but NOT commands - those are event-driven)
  useEffect(() => {
    if (connectionStatus !== 'connected' || !p2pClient.isConnected) return;

    const requestStateSync = () => {
      const stateRequest = {
        category: 'sync' as MessageCategory,
        type: 'STATE_SYNC_REQUEST',
        payload: {}
      };
      p2pClient.send(stateRequest);
    };

    // Request immediately on connection - ONLY ONCE
    requestStateSync();

    // NO periodic sync - rely on host broadcasts for all updates
    // This prevents stale state from overwriting fresh host updates
  }, [connectionStatus, p2pClient.isConnected, p2pClient.send]);

  // Request commands immediately when connected (ONE TIME) - not just when session active
  // This ensures demo screen gets teams/commands list for lobby display
  useEffect(() => {
    if (connectionStatus === 'connected' && p2pClient.isConnected) {
      const commandsRequest = {
        category: 'sync' as MessageCategory,
        type: 'GET_COMMANDS',
        payload: {}
      };
      p2pClient.send(commandsRequest);
    }
  }, [connectionStatus, p2pClient.isConnected, p2pClient.send]);


  // Calculate stats
  const clientStats = useMemo(() => {
    if (!gameState?.clients) return { active: 0, total: 0, avgQuality: Math.round(connectionQuality.healthScore) };

    // clients can be an array or object depending on how host sends it
    const clientsArray = Array.isArray(gameState.clients) ? gameState.clients : Object.values(gameState.clients);
    const active = clientsArray.length;
    return { active, total: clientsArray.length, avgQuality: Math.round(connectionQuality.healthScore) };
  }, [gameState?.clients, connectionQuality.healthScore]);

  // QR URL for sharing (same as host uses)
  const qrUrl = useMemo(() => {
    if (!urlHostId || !sessionId) return '';

    if (signallingUrl) {
      // LAN mode
      const ipMatch = signallingUrl.match(/ws:\/\/([^:]+):/);
      const ip = ipMatch ? ipMatch[1] : 'localhost';
      return `http://${ip}:3000#/mobile?host=${encodeURIComponent(urlHostId)}&signalling=${encodeURIComponent(ip)}&session=${encodeURIComponent(sessionId)}`;
    } else {
      // Internet mode
      return `${window.location.origin}#/mobile?host=${encodeURIComponent(urlHostId)}&session=${encodeURIComponent(sessionId)}`;
    }
  }, [urlHostId, sessionId, signallingUrl]);

  // Function to render different game screens (optimized with useCallback)
  const renderGameScreen = useCallback(() => {
    const currentScreen = detailedGameState.currentScreen || 'cover';

    // Render based on current screen
    switch (currentScreen) {
      case 'cover':
        console.log('[ScreenView] Rendering cover screen:', {
          hasPackCover: !!detailedGameState.packCover,
          coverType: detailedGameState.packCover?.type,
          coverValue: detailedGameState.packCover?.value?.slice(0, 60) || 'none',
          coverUrl: detailedGameState.packCover?.url?.slice(0, 60) || 'none',
          packName: detailedGameState.packName
        });
        return (
          <div className="fixed inset-0 flex items-center justify-center bg-gray-950 cursor-default">
            <div className="text-center animate-in fade-in zoom-in duration-500 flex flex-col items-center justify-center">
              <div className="flex flex-col items-center gap-[25px] mt-[50px]">
                <div className="h-[70vh] w-[85vw] flex items-center justify-center">
                  {detailedGameState.packCover?.value ? (
                    <img
                      src={detailedGameState.packCover.value}
                      alt={detailedGameState.packName || 'Game'}
                      className="h-full w-auto object-cover rounded-2xl shadow-2xl cursor-default"
                      onError={(e) => {
                        console.error('[ScreenView] Pack cover image error:', {
                          src: detailedGameState.packCover.value,
                          error: e.currentTarget.error
                        });
                      }}
                    />
                  ) : detailedGameState.packCover?.url ? (
                    <img
                      src={detailedGameState.packCover.url}
                      alt={detailedGameState.packName || 'Game'}
                      className="h-full w-auto object-cover rounded-2xl shadow-2xl cursor-default"
                      onError={(e) => {
                        console.error('[ScreenView] Pack cover image error:', {
                          src: detailedGameState.packCover.url,
                          error: e.currentTarget.error
                        });
                      }}
                    />
                  ) : (
                    <div className="aspect-video h-full flex items-center justify-center bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl shadow-2xl cursor-default">
                      <span className="text-8xl font-black text-white/20">?</span>
                    </div>
                  )}
                </div>
                <h1 className="text-7xl font-black text-white uppercase tracking-wider">
                  {detailedGameState.packName || 'Игровая сессия'}
                </h1>
              </div>
            </div>
          </div>
        );

      case 'themes':
        return (
          <div className="fixed inset-0 flex items-center justify-center bg-gray-950 cursor-default">
            <div className="w-full max-w-6xl animate-in fade-in duration-500 flex flex-col items-center h-[85vh]">
              {/* Themes title at top */}
              <h2 className="text-3xl font-bold text-center text-white mb-8 mt-20 uppercase tracking-wide shrink-0">
                Themes
              </h2>

              {/* Themes grid - 2 columns with scroll */}
              <div ref={themesScrollRef} className="grid grid-cols-2 gap-4 w-full px-4 overflow-y-auto flex-1">
                {detailedGameState.allThemes?.map((theme) => (
                  <div
                    key={theme.id}
                    className="rounded-lg p-6 shadow-lg flex flex-col items-center relative cursor-default"
                    style={{
                      backgroundColor: theme.color || '#3b82f6',
                      minHeight: '120px'
                    }}
                  >
                    <div className="text-base font-medium opacity-70 mb-2">Раунд {theme.roundNumber}</div>
                    <h3
                      className="text-2xl font-bold text-center leading-tight absolute"
                      style={{
                        color: theme.textColor || '#ffffff',
                        top: '40%'
                      }}
                    >
                      {theme.name}
                    </h3>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case 'round':
        return (
          <div className="fixed inset-0 flex items-center justify-center bg-gray-950 cursor-default">
            <div className="text-center animate-in fade-in zoom-in duration-500 flex flex-col items-center justify-center">
              <div className="flex flex-col items-center gap-[15px] mt-[50px]">
                <div className="h-[70vh] w-[85vw] flex items-center justify-center">
                  {detailedGameState.currentRound?.cover?.value ? (
                    <img
                      src={detailedGameState.currentRound.cover.value}
                      alt={detailedGameState.currentRound.name}
                      className="h-full w-auto object-cover rounded-2xl shadow-2xl cursor-default"
                    />
                  ) : detailedGameState.currentRound?.cover?.url ? (
                    <img
                      src={detailedGameState.currentRound.cover.url}
                      alt={detailedGameState.currentRound.name}
                      className="h-full w-auto object-cover rounded-2xl shadow-2xl cursor-default"
                    />
                  ) : detailedGameState.currentRound?.number && !detailedGameState.currentRound?.cover && (
                    <div className="w-64 h-64 bg-gradient-to-br from-indigo-600 to-blue-600 rounded-full flex items-center justify-center shadow-2xl cursor-default">
                      <span className="text-6xl font-black text-white">{detailedGameState.currentRound.number}</span>
                    </div>
                  )}
                </div>
                <h2 className="text-7xl font-black text-white uppercase tracking-wider">{detailedGameState.currentRound?.name || 'Раунд'}</h2>
              </div>
            </div>
          </div>
        );

      case 'board':
        // Game board with themes and questions - exact same layout as host
        return (
          <React.Fragment>
            {/* Game board - always shown when currentScreen is 'board', even when question is active */}
            {detailedGameState.boardData && (
              <div className="fixed inset-0 top-24 bottom-0 left-0 right-0 cursor-default">
                <div className="w-full h-full animate-in fade-in duration-500 p-1">
                  {/* Themes column (1/8 width) + Questions grid (7/8 width) */}
                  <div className="flex h-full gap-1">
                    {/* Left column: Themes - 1/8 of screen width */}
                    <div className="w-[12.5%] flex flex-col gap-1">
                      {detailedGameState.boardData.themes?.map((theme) => {
                        const themeColor = theme.color || '#3b82f6';
                        const themeTextColor = theme.textColor || '#ffffff';
                        return (
                          <div
                            key={theme.id}
                            className="flex-1 rounded-lg p-3 flex items-center justify-center shadow-lg cursor-default"
                            style={{ backgroundColor: themeColor }}
                          >
                            <h3 className="font-bold text-center text-2xl leading-tight" style={{ color: themeTextColor }}>
                              {theme.name}
                            </h3>
                          </div>
                        );
                      })}
                    </div>

                    {/* Right area: Questions grid - dynamic rows/cols based on content */}
                    {(() => {
                      const themes = detailedGameState.boardData.themes || [];
                      const maxQuestions = Math.max(...themes.map(t => t.questions?.length || 0), 1);
                      const numThemes = Math.min(themes.length, 10);
                      const numQuestions = maxQuestions;

                      // Helper function to make color brighter and less saturated (for question cards)
                      // 10% brighter, 5% less saturated than theme color
                      const adjustColor = (hex: string): string => {
                        const num = parseInt(hex.replace(/#/g, ''), 16);
                        let R = num >> 16;
                        let G = num >> 8 & 0x00FF;
                        let B = num & 0x0000FF;

                        // Convert to HSL
                        const rNorm = R / 255;
                        const gNorm = G / 255;
                        const bNorm = B / 255;

                        const max = Math.max(rNorm, gNorm, bNorm);
                        const min = Math.min(rNorm, gNorm, bNorm);
                        let h = 0, s = 0, l = (max + min) / 2;

                        if (max !== min) {
                          const d = max - min;
                          s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
                          switch (max) {
                            case rNorm: h = ((gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0)) / 6; break;
                            case gNorm: h = ((bNorm - rNorm) / d + 2) / 6; break;
                            case bNorm: h = ((rNorm - gNorm) / d + 4) / 6; break;
                          }
                        }

                        // Adjust: 10% brighter (increase lightness), 5% less saturated
                        l = Math.min(1, l + 0.10);
                        s = Math.max(0, s * 0.95);

                        // Convert back to RGB
                        let r, g, b;
                        if (s === 0) {
                          r = g = b = l;
                        } else {
                          const hue2rgb = (p: number, q: number, t: number) => {
                            if (t < 0) t += 1;
                            if (t > 1) t -= 1;
                            if (t < 1/6) return p + (q - p) * 6 * t;
                            if (t < 1/2) return q;
                            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                            return p;
                          };
                          const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
                          const p = 2 * l - q;
                          r = hue2rgb(p, q, h + 1/3);
                          g = hue2rgb(p, q, h);
                          b = hue2rgb(p, q, h - 1/3);
                        }

                        return '#' + (
                          Math.round(r * 255) * 0x10000 +
                          Math.round(g * 255) * 0x100 +
                          Math.round(b * 255)
                        ).toString(16).padStart(6, '0');
                      };

                      return (
                        <div
                          className="flex-1"
                          style={{
                            display: 'grid',
                            gridTemplateColumns: `repeat(${numQuestions}, 1fr)`,
                            gridTemplateRows: `repeat(${numThemes}, 1fr)`,
                            gap: '4px',
                          }}
                        >
                          {themes.map(theme => (
                            theme.questions?.map((question, qIndex) => {
                              const questionId = `${theme.id}-${question.id}`;
                              const answered = question.answered || false;
                              const isHighlighted = detailedGameState.highlightedQuestion === questionId;

                              return (
                                <div
                                  key={questionId}
                                  className={`
                                    rounded-lg shadow-md flex items-center justify-center
                                    transition-all duration-200 ease-in-out
                                    ${answered
                                      ? 'cursor-not-allowed opacity-50'
                                      : 'cursor-pointer hover:scale-105 hover:shadow-lg'
                                    }
                                    ${isHighlighted ? 'ring-4 ring-yellow-400 scale-110 shadow-xl' : ''}
                                  `}
                                  style={{
                                    backgroundColor: answered ? '#797d80' : adjustColor(theme.color || '#3b82f6'), // #797d80 = medium gray
                                  }}
                                >
                                  <span className="font-bold text-3xl text-white">
                                    {question.points || (qIndex + 1) * 100}
                                  </span>
                                </div>
                              );
                            })
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}
          </React.Fragment>
        );

      case 'selectSuperThemes':
        const superThemes = detailedGameState.allThemes?.filter(
          t => detailedGameState.currentRound?.number === t.roundNumber
        ) || [];

        return (
          <div className="w-full h-full bg-gray-950 p-6 flex items-center justify-center">
            <div className="w-full max-w-6xl">
              <h2 className="text-5xl font-bold text-center text-white mb-12 uppercase tracking-wide">
                Exclude Themes
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                {superThemes.map((theme) => {
                  const isDisabled = detailedGameState.disabledSuperThemeIds?.includes(theme.id);
                  const isSelected = detailedGameState.selectedSuperThemeId === theme.id;
                  const remainingCount = superThemes.length - (detailedGameState.disabledSuperThemeIds?.length || 0);
                  const isLastRemaining = !isDisabled && remainingCount === 1;

                  return (
                    <div
                      key={theme.id}
                      className={`rounded-lg p-6 shadow-lg flex flex-col items-center relative transition-all ${
                        isDisabled
                          ? 'opacity-30 grayscale'
                          : isLastRemaining
                          ? 'ring-4 ring-green-400 scale-105'
                          : 'hover:scale-105'
                      }`}
                      style={{
                        backgroundColor: theme.color || '#3b82f6',
                      }}
                    >
                      <h3
                        className="text-2xl font-bold text-center leading-tight"
                        style={{
                          color: theme.textColor || '#ffffff',
                        }}
                      >
                        {theme.name}
                      </h3>
                      {isDisabled && (
                        <div className="absolute top-2 right-2 bg-red-500 rounded-full w-8 h-8 flex items-center justify-center shadow-lg">
                          <span className="text-white font-bold">✕</span>
                        </div>
                      )}
                      {isLastRemaining && (
                        <div className="absolute top-2 right-2 bg-green-500 rounded-full w-8 h-8 flex items-center justify-center shadow-lg">
                          <span className="text-white font-bold">✓</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );

      case 'placeBets':
        return (
          <div className="w-full h-full bg-gray-950 p-6 flex items-center justify-center">
            <div className="text-center">
              <h2 className="text-7xl font-bold text-white mb-8 uppercase tracking-wide">
                Place Your Bets
              </h2>
              {detailedGameState.selectedSuperThemeId && detailedGameState.allThemes && (
                <p className="text-4xl text-gray-300 mb-8">
                  Theme: <span className="text-yellow-400 font-bold">
                    {detailedGameState.allThemes.find(t => t.id === detailedGameState.selectedSuperThemeId)?.name}
                  </span>
                </p>
              )}
              <p className="text-2xl text-gray-400">Waiting for teams to place their bets...</p>

              {/* Show team bets */}
              {detailedGameState.superGameBets && detailedGameState.superGameBets.length > 0 && (
                <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
                  {detailedGameState.superGameBets.map((bet) => {
                    const team = detailedGameState.teamScores?.find(t => t.id === bet.teamId);
                    return (
                      <div key={bet.teamId} className={`bg-gray-800/50 rounded-lg p-4 border-2 ${
                        bet.ready ? 'border-green-500 bg-green-900/20' : 'border-gray-700'
                      }`}>
                        <div className="text-white font-medium text-lg mb-2">{team?.name}</div>
                        {bet.ready ? (
                          <div className="text-3xl font-bold text-green-400">{bet.bet}</div>
                        ) : (
                          <div className="text-lg text-gray-500">Thinking...</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );

      case 'superQuestion':
        const superThemeQuestion = detailedGameState.allThemes?.find(
          t => t.id === detailedGameState.selectedSuperThemeId
        );

        return (
          <div className="w-full h-full bg-gray-950 p-6 flex items-center justify-center">
            <div className="text-center max-w-4xl">
              {superThemeQuestion && (
                <p className="text-3xl text-yellow-400 mb-8 font-bold">{superThemeQuestion.name}</p>
              )}
              {detailedGameState.activeQuestion ? (
                <>
                  <div className="bg-gray-800/50 rounded-lg p-8 border border-gray-700 mb-8">
                    <p className="text-white text-4xl leading-relaxed">
                      {detailedGameState.activeQuestion.text || 'Вопрос загружается...'}
                    </p>
                  </div>
                  {detailedGameState.activeQuestion.media && (
                    <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                      {detailedGameState.activeQuestion.media.type === 'image' && (
                        <img
                          src={detailedGameState.activeQuestion.media.url}
                          alt="Вопрос"
                          className="max-w-full max-h-[60vh] mx-auto rounded-lg"
                        />
                      )}
                      {detailedGameState.activeQuestion.media.type === 'video' && (
                        <video
                          src={detailedGameState.activeQuestion.media.url}
                          controls
                          className="max-w-full max-h-[60vh] mx-auto rounded-lg"
                          onError={(e) => {
                            console.error('[ScreenView] Video error:', {
                              url: detailedGameState.activeQuestion.media.url,
                              error: e.currentTarget.error
                            });
                          }}
                          onLoadStart={() => {
                            console.log('[ScreenView] Video loading started:', detailedGameState.activeQuestion.media.url);
                          }}
                          onCanPlay={() => {
                            console.log('[ScreenView] Video can play:', detailedGameState.activeQuestion.media.url);
                          }}
                        />
                      )}
                      {detailedGameState.activeQuestion.media.type === 'audio' && (
                        <audio
                          src={detailedGameState.activeQuestion.media.url}
                          controls
                          className="w-full"
                          onError={(e) => {
                            console.error('[ScreenView] Audio error:', {
                              url: detailedGameState.activeQuestion.media.url,
                              error: e.currentTarget.error
                            });
                          }}
                          onLoadStart={() => {
                            console.log('[ScreenView] Audio loading started:', detailedGameState.activeQuestion.media.url);
                          }}
                          onCanPlay={() => {
                            console.log('[ScreenView] Audio can play:', detailedGameState.activeQuestion.media.url);
                          }}
                        />
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="bg-gray-800/50 rounded-lg p-12 border border-gray-700">
                  <p className="text-white text-2xl">Ожидание вопроса...</p>
                </div>
              )}

              {/* Show team bets while waiting for answers */}
              {detailedGameState.superGameBets && detailedGameState.superGameBets.length > 0 && (
                <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
                  {detailedGameState.superGameBets.map((bet) => {
                    const team = detailedGameState.teamScores?.find(t => t.id === bet.teamId);
                    return (
                      <div key={bet.teamId} className={`bg-gray-800/50 rounded-lg p-4 border-2 ${
                        bet.ready ? 'border-green-500 bg-green-900/20' : 'border-gray-700'
                      }`}>
                        <div className="text-white font-medium text-lg mb-2">{team?.name}</div>
                        {bet.ready ? (
                          <div className="text-3xl font-bold text-green-400">{bet.bet}</div>
                        ) : (
                          <div className="text-lg text-gray-500">Ставка...</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );

      case 'superAnswers':
        return (
          <div className="fixed inset-0 z-[60] flex bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
            style={{ paddingTop: '100px', paddingBottom: '20px' }}
          >
            <div
              className="w-[90vw] mx-auto bg-gray-900 border-2 border-purple-500 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
              style={{ maxHeight: 'calc(100vh - 140px)', minHeight: '40vh' }}
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-3">
                <div className="flex items-center justify-between">
                  <div className="text-xl font-bold text-white">
                    {detailedGameState.allThemes?.find(t => t.id === detailedGameState.selectedSuperThemeId)?.name || 'Super Game'}
                  </div>
                </div>
              </div>

              {/* Two containers: Teams (top) and Correct Answer (bottom) */}
              <div className="flex flex-col h-full items-center justify-center gap-4 p-4">
                {/* Top container - Teams grid */}
                <div className="w-[60vw] h-[38vh] p-6 overflow-auto bg-gray-900 rounded-lg">
                  {/* Calculate grid columns based on number of teams (max 25 teams)
                       - up to 6 teams: 3 cols (2 rows)
                       - 7-12 teams: 4 cols (3 rows)
                       - 13-20 teams: 5 cols (4 rows)
                       - 21-25 teams: 6 cols (4-5 rows)
                  */}
                  {(() => {
                    const teams = detailedGameState.teamScores || [];
                    const gridCols = teams.length <= 6 ? 'grid-cols-3' :
                                    teams.length <= 12 ? 'grid-cols-4' :
                                    teams.length <= 20 ? 'grid-cols-5' : 'grid-cols-6';

                    const fontScale = teams.length <= 6 ? 1.0 :
                                     teams.length <= 12 ? 0.85 :
                                     teams.length <= 20 ? 0.7 : 0.6;

                    return (
                      <div className={`grid gap-3 h-full ${gridCols}`}>
                        {teams.map((team) => {
                          const answer = detailedGameState.superGameAnswers?.find(a => a.teamId === team.id);
                          const bet = detailedGameState.superGameBets?.find(b => b.teamId === team.id);
                          const isCorrect = answer?.isCorrect ?? false;
                          const isWrong = answer?.isWrong ?? false;
                          const hasAnswer = !!answer?.answer;

                          const cardStyle = isCorrect
                            ? 'border-green-500 bg-green-500/20'
                            : isWrong
                              ? 'border-red-500 bg-red-500/20'
                              : hasAnswer
                                ? 'border-blue-500 bg-blue-500/20'
                                : 'border-gray-700 bg-gray-900';

                          return (
                            <div
                              key={team.id}
                              className={`relative rounded-lg border-[3px] flex flex-col ${cardStyle}`}
                              style={{ minHeight: '140px', padding: '8px' }}
                            >
                              {/* Top: Team name */}
                              <div className="text-center" style={{ marginTop: '12px', marginBottom: '8px' }}>
                                <div
                                  className="font-bold text-yellow-400 leading-tight"
                                  style={{ fontSize: `${1.25 * fontScale}rem` }}
                                >
                                  {team.name}
                                </div>
                              </div>

                              {/* Center: Answer - takes remaining space */}
                              <div className="flex-1 flex items-center justify-center text-center px-1">
                                {hasAnswer ? (
                                  <div className="text-white font-medium break-words" style={{ fontSize: `${1.5 * fontScale}rem` }}>
                                    {answer.answer}
                                  </div>
                                ) : null}
                              </div>

                              {/* Bottom: Bet */}
                              <div className="text-center" style={{ marginTop: '8px', marginBottom: '12px' }}>
                                <div
                                  className="text-yellow-400 font-semibold"
                                  style={{ fontSize: `${1.25 * fontScale}rem` }}
                                >
                                  {bet?.bet ?? 0}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>

                {/* Bottom container - Correct Answer card */}
                <div className="w-[45vw] h-[30vh] flex items-center justify-center">
                  <div
                    className={`relative p-3 rounded-lg border-[3px] flex flex-col items-center justify-center ${
                      detailedGameState.superGameAnswers?.some(a => a.revealed)
                        ? 'border-purple-500 bg-purple-500/20'
                        : 'border-gray-700 bg-gray-900'
                    }`}
                    style={{ width: '100%', height: '100%' }}
                  >
                    {detailedGameState.superGameAnswers?.some(a => a.revealed) ? (
                      <div className="text-center">
                        <div className="text-purple-400 font-bold mb-2">CORRECT ANSWER</div>
                        <div className="font-bold text-white leading-[1.2] break-words text-2xl">
                          {/* Correct answer would come from state */}
                          Правильный ответ
                        </div>
                      </div>
                    ) : (
                      <div className="text-gray-400 text-lg">Waiting for reveal...</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 'showWinner':
        return (
          <div className="w-full h-full bg-gray-950 p-6 flex items-center justify-center">
            <div className="text-center">
              <h1 className="text-7xl font-black text-yellow-400 mb-8">🏆 Winner 🏆</h1>
              {detailedGameState.teamScores && detailedGameState.teamScores.length > 0 && (
                <div className="space-y-4">
                  {[...detailedGameState.teamScores]
                    .sort((a, b) => b.score - a.score)
                    .map((team, index) => (
                      <div key={team.id} className={`bg-gray-800/50 rounded-lg p-6 border-2 ${
                        index === 0 ? 'border-yellow-500 bg-yellow-900/20' : 'border-gray-700'
                      }`}>
                        <div className="flex items-center justify-between">
                          <div className="text-left">
                            {index === 0 && <span className="text-4xl">👑</span>}
                            <h3 className="text-3xl font-bold text-white">{team.name}</h3>
                          </div>
                          <div className="text-5xl font-bold text-yellow-400">{team.score}</div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        );

      default:
        return (
          <div className="w-full h-full flex items-center justify-center bg-gray-950">
            <div className="text-center">
              <h2 className="text-4xl font-bold text-white mb-4">Экран: {currentScreen}</h2>
              <p className="text-xl text-gray-400">Содержимое загружается...</p>
            </div>
          </div>
        );
    }
  }, [detailedGameState, themesScrollRef]); // Dependencies for renderGameScreen

  if (connectionStatus === 'connecting') {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-16 h-16 text-blue-500 animate-spin mx-auto mb-4" />
          <p className="text-xl font-medium text-gray-400">Подключение к хосту...</p>
          <p className="text-gray-500 text-sm mt-2">Host ID: {urlHostId || '---'}</p>
        </div>
      </div>
    );
  }

  if (connectionStatus === 'error') {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <X className="w-8 h-8 text-red-400" />
          </div>
          <p className="text-xl font-medium text-red-400">Ошибка подключения</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors"
          >
            Попробовать снова
          </button>
        </div>
      </div>
    );
  }

  // Main interface when connected - centered and maximized
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center">
      {/* MAIN CONTENT - centered and maximized */}
      <div className="w-full h-full p-6 flex items-center justify-center">
        {connectionStatus === 'connected' && gameState ? (
          <div className="w-full max-w-[1600px] mx-auto" key={`screen-${detailedGameState.currentScreen || 'cover'}-question-${detailedGameState.activeQuestion?.questionId || 'none'}-answer-${detailedGameState.showAnswer ? 'showing' : 'hidden'}-hint-${detailedGameState.showHint ? 'showing' : 'hidden'}`}>
            {/* Check if host is in lobby mode or game session */}
            {/* Key prop above forces React to re-render when currentScreen OR activeQuestion changes */}
            {/* Show lobby when session is not active, regardless of currentScreen state */}
            {/* This ensures demo screen transitions to lobby immediately when host exits game */}
            {!gameState.isSessionActive ? (
              // LOBBY MODE - Show exact same lobby as host but without controls
              <div className="grid lg:grid-cols-2 gap-6 md:gap-8 animate-in fade-in duration-500">
                {/* LEFT COLUMN: QR Code */}
                <div className="flex flex-col space-y-3">
                  {/* QR Code */}
                  <div className="relative aspect-square w-full bg-gray-900 border border-gray-800 rounded-lg shadow-2xl overflow-hidden flex flex-col items-center justify-center p-14 group">
                    <div className="absolute inset-0 bg-blue-600/5 blur-[80px] rounded-full pointer-events-none group-hover:bg-blue-600/10 transition-colors duration-500"></div>
                    <div className="relative z-10 bg-white p-6 rounded-lg shadow-xl">
                      <QRCodeSVG value={qrUrl} size={600} level="H" includeMargin={true} />
                        </div>
                      </div>

                      {/* Session Info */}
                      <div className="bg-gray-900 border border-gray-800 p-4 rounded-lg">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Users className="w-5 h-5 text-blue-400" />
                            <span className="text-gray-400 text-sm">Session ID</span>
                          </div>
                          <div className="bg-gray-800 px-4 py-2 rounded-lg text-white font-mono text-xl">
                            {sessionId || '---'}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* RIGHT COLUMN: Client List */}
                    <div className="flex flex-col h-full space-y-3">
                      <div className="flex-1 bg-gray-900/80 backdrop-blur-sm border border-gray-800 rounded-lg p-6 flex flex-col min-h-[450px] shadow-xl">
                        <div className="flex justify-between items-center mb-3 border-b border-gray-800 pb-2">
                          <h2 className="text-3xl font-bold text-white flex items-center gap-2">
                            <Users className="w-7 h-7 text-blue-400" /> Lobby
                          </h2>
                          <div className="flex items-center gap-2">
                            <div className="bg-gray-800 px-6 py-3 rounded-full text-lg font-mono text-blue-400 border border-blue-500/20">
                              {clientStats.active} Ready
                            </div>
                          </div>
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-2 pr-1.5 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
                          {/* Show all teams with clients - same UI as host */}
                          {gameState.teams && gameState.teams.length > 0 && gameState.teams.map((team: Team) => {
                            const clientsArray = Array.isArray(gameState.clients) ? gameState.clients : Object.values(gameState.clients);
                            const teamClients = gameState.clients ? clientsArray.filter((c: any) => c.teamId === team.id) : [];

                            return (
                              <div key={team.id} className="animate-in slide-in-from-bottom-2 duration-300">
                                {/* Team header - same style as host */}
                                <div className="flex items-center gap-2.5 p-2.5 rounded-lg border bg-gray-800/50 border-gray-700/50">
                                  <div className="w-7 h-7 rounded-full bg-violet-500 flex items-center justify-center text-[11px] font-bold text-white">
                                    {typeof team.name === 'string' && team.name.length > 0 ? team.name.charAt(0).toUpperCase() : '?'}
                                  </div>
                                  <span className="font-medium text-gray-200 text-base">{team.name}</span>
                                  <span className={`text-sm ${teamClients.length === 0 ? 'text-gray-600' : 'text-gray-500'}`}>
                                    ({teamClients.length})
                                  </span>
                                </div>

                                {/* Team players */}
                                {teamClients.length > 0 && (
                                  <div className="ml-6 mt-1 space-y-1">
                                    {teamClients.map((client: any) => {
                                      const isBuzzing = buzzingClientIds.has(client.id);
                                      return (
                                        <div key={client.id} className={`flex items-center justify-between p-2.5 rounded-lg ${isBuzzing ? 'outline-2 outline-white/70 outline-offset-2 bg-gray-900/50' : 'bg-gray-900/50'}`}>
                                          <div className="flex items-center gap-2.5">
                                            <div className="w-6 h-6 rounded-full bg-blue-500/80 flex items-center justify-center text-[10px] font-bold text-white">
                                              {typeof client.name === 'string' && client.name.length > 0 ? client.name.charAt(0).toUpperCase() : '?'}
                                            </div>
                                            <span className="text-base text-gray-300">
                                              {typeof client.name === 'string' ? client.name : 'Unnamed'}
                                            </span>
                                            {isBuzzing && (
                                              <div className="ml-1">
                                                <div className="w-3.5 h-3.5 rounded-full bg-white animate-double-flash shadow-[0_0_10px_rgba(255,255,255,0.8)]"></div>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {/* No players message */}
                          {(!gameState.clients || gameState.clients.length === 0) && (
                            <div className="text-center py-8 text-gray-500">
                              <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                              <p>Waiting for players to join...</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                // GAME SESSION MODE - Show game content on full screen
                <>
                  {/* Player Panel - Always visible on top layer */}
                  {detailedGameState.teamScores && detailedGameState.teamScores.length > 0 && (
                      <div
                        key={`player-panel-${
                          JSON.stringify(detailedGameState.teamStates || {})
                        }`}
                        className="fixed top-0 left-0 right-0 z-[100] h-auto px-1 bg-gray-900/50 flex items-center justify-center gap-1 py-1">
                        {detailedGameState.teamScores.map((team: { id: string; name: string; score: number }) => {
                          // Get team status from new system
                          const teamState = detailedGameState.teamStates?.[team.id];
                          const teamStatus = teamState?.status || 'inactive';

                          // Special cases for super game
                          const hasPlacedBet = detailedGameState.currentScreen === 'placeBets' && detailedGameState.superGameBets?.find(b => b.teamId === team.id)?.ready;
                          const hasSubmittedAnswer = detailedGameState.currentScreen === 'superQuestion' && detailedGameState.superGameAnswers?.find(a => a.teamId === team.id)?.answer;

                          // Helper to get CSS classes for team status
                          const getCardClassesForStatus = (status: TeamStatus, clashSubStatus?: 'first_clash' | 'simple_clash'): string => {
                            switch (status) {
                              case 'inactive':
                                return 'bg-gray-100/40 border-gray-300 shadow-[0_0_10px_rgba(255,255,255,0.3)]';
                              case 'active':
                                return 'bg-yellow-500/30 border-yellow-400 shadow-[0_0_20px_rgba(234,179,8,0.6)]';
                              case 'answering':
                                return 'bg-green-500/40 border-green-400 shadow-[0_0_20px_rgba(74,222,128,0.6)] scale-105';
                              case 'penalty':
                                return 'bg-red-500/30 border-red-400 shadow-[0_0_20px_rgba(239,68,68,0.5)]';
                              case 'clash':
                                // Clash cards have special animation - yellow to green transition
                                // Different styling for first_clash vs simple_clash
                                if (clashSubStatus === 'first_clash') {
                                  return 'clash-card bg-yellow-500/40 border-yellow-300 shadow-[0_0_25px_rgba(234,179,8,0.7)]';
                                }
                                return 'clash-card bg-yellow-500/30 border-yellow-400 shadow-[0_0_20px_rgba(234,179,8,0.6)]';
                              default:
                                return 'bg-gray-100/40 border-gray-300 shadow-[0_0_10px_rgba(255,255,255,0.3)]';
                            }
                          };

                          // Determine final card state and classes
                          let cardState: string;
                          let cardClasses: string;

                          // Check if team is currently buzzing (for inactive team shrink/lighten effect)
                          const isTeamBuzzing = buzzedTeamIds.has(team.id);

                          // Get clash sub-status for both bet/non-bet cases
                          const clashSubStatus = teamState?.clashSubStatus as 'first_clash' | 'simple_clash' | undefined;

                          if (hasPlacedBet || hasSubmittedAnswer) {
                            cardState = 'bet-placed (green)';
                            cardClasses = 'bg-green-500/30 border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.5)] scale-105';
                          } else {
                            cardState = teamStatus;
                            cardClasses = getCardClassesForStatus(teamStatus, clashSubStatus);

                            // Apply shrink/lighten effect for inactive team when buzzing
                            if (isTeamBuzzing && teamStatus === 'inactive') {
                              cardClasses = cardClasses.replace('bg-gray-100/40', 'bg-gray-50/60').replace('scale-105', '') + ' scale-90';
                            }
                          }

                          // Store previous state to detect changes
                          const prevStateKey = `team-state-${team.id}`;
                          const previousState = (window as any)[prevStateKey];
                          const stateChanged = previousState !== cardState;

                          // Update stored state
                          (window as any)[prevStateKey] = cardState;

                          // Log when state changes
                          if (stateChanged) {
                            const clashInfo = clashSubStatus ? ` [clash: ${clashSubStatus}]` : '';
                            console.log(`[ScreenView] 🎨 Team "${team.name}" card state changed: "${previousState}" → "${cardState}${clashInfo}"`);
                            console.log(`  Details:`, {
                              teamId: team.id,
                              teamStatus,
                              clashSubStatus,
                              hasPlacedBet,
                              hasSubmittedAnswer
                            });
                          }

                          return (
                            <div
                              key={`${team.id}-${cardState}`}
                              className={`px-6 py-2 rounded-lg border-2 transition-all relative ${cardClasses}`}
                            >
                              <div className="text-center">
                                <div className="text-2xl font-bold text-white">{team.name}</div>
                                <div className="h-px bg-gray-600 my-1"></div>
                                <div className={`text-2xl font-bold ${
                                  teamStatus === 'penalty' ? 'text-red-400' : team.score >= 0 ? 'text-white' : 'text-red-400'
                                }`}>
                                  {team.score}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Main Content */}
                    <div className="h-screen bg-gray-950 text-gray-100 overflow-hidden cursor-default">
                      {renderGameScreen()}
                    </div>

                    {/* Question Modal - Always shown when activeQuestion exists, regardless of currentScreen */}
                    {detailedGameState.activeQuestion && (() => {
                      const hasQuestionMedia = detailedGameState.activeQuestion.media &&
                        detailedGameState.activeQuestion.media.url &&
                        detailedGameState.activeQuestion.media.url.trim() !== '';
                      const hasAnswerMedia = detailedGameState.activeQuestion.answerMedia &&
                        detailedGameState.activeQuestion.answerMedia.url &&
                        detailedGameState.activeQuestion.answerMedia.url.trim() !== '';

                      const mediaUrl = detailedGameState.activeQuestion.media?.url;
                      const mediaType = detailedGameState.activeQuestion.media?.type;

                      // Calculate dynamic font sizes
                      // Priority: Answer > Hint > Question text
                      const currentQuestionText = detailedGameState.showAnswer && detailedGameState.activeQuestion.answer
                        ? detailedGameState.activeQuestion.answer
                        : detailedGameState.showHint && detailedGameState.activeQuestion.hint?.text
                          ? detailedGameState.activeQuestion.hint.text
                          : detailedGameState.activeQuestion.text || '';
                      const questionFontSizeMobile = calculateQuestionFontSize(currentQuestionText, 3); // 3rem base for mobile
                      const questionFontSizeDesktop = calculateQuestionFontSize(currentQuestionText, 5); // 5rem base for desktop

                      // Check if hint has media
                      const hasHintMedia = detailedGameState.activeQuestion.hint?.media &&
                        detailedGameState.activeQuestion.hint.media.url &&
                        detailedGameState.activeQuestion.hint.media.url.trim() !== '';
                      const hintMediaUrl = detailedGameState.activeQuestion.hint?.media?.url;
                      const hintMediaType = detailedGameState.activeQuestion.hint?.media?.type;

                      const modalMaxHeight = 'calc(100vh - 140px)';
                      const modalTop = '100px';

                      return (
                        <div className="fixed inset-0 z-[60] flex bg-black/80 backdrop-blur-sm animate-in fade-in duration-200 cursor-default" style={{ paddingTop: modalTop, paddingBottom: '20px' }}>
                          <style>{`
                            @media (min-width: 768px) {
                              [data-qm-screen="true"] { font-size: ${questionFontSizeDesktop}rem !important; }
                            }
                          `}</style>
                          <div
                            className="w-[90vw] mx-auto bg-gray-900 border-2 border-blue-500 rounded-2xl shadow-2xl flex flex-col overflow-hidden cursor-default"
                            style={{ maxHeight: modalMaxHeight, minHeight: '48vh' }}
                          >
                            {/* Question Section */}
                            <div className="flex-1 flex flex-col border-b border-gray-700 min-h-0">
                              {/* Header - Round name, Theme name, Points and Timer */}
                              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  {detailedGameState.activeQuestion.roundName && (
                                    <>
                                      <div className="text-lg font-bold text-white">{detailedGameState.activeQuestion.roundName}</div>
                                      <div className="text-white/50">—</div>
                                    </>
                                  )}
                                  <div className="text-lg font-bold text-white">{detailedGameState.activeQuestion.themeName}</div>
                                  <div className="text-xl font-bold text-white">
                                    <span ref={timerTextRef}></span>
                                  </div>
                                </div>
                                <div className="text-2xl font-black text-white">
                                  {detailedGameState.activeQuestion.points > 0 ? `+${detailedGameState.activeQuestion.points}` : detailedGameState.activeQuestion.points}
                                </div>
                              </div>

                              {/* Timer bar - same as host */}
                              <div className="relative">
                                {/* Pause indicator - centered on the timer bar */}
                                <div
                                  ref={timerPauseIndicatorRef}
                                  className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 z-10 hidden"
                                >
                                  <div className="w-8 h-8 bg-white/90 rounded-full flex items-center justify-center shadow-lg">
                                    <div className="flex gap-1">
                                      <div className="w-1 h-3 bg-gray-800 rounded-sm" />
                                      <div className="w-1 h-3 bg-gray-800 rounded-sm" />
                                    </div>
                                  </div>
                                </div>
                                <div className="bg-gray-700 w-full overflow-hidden" style={{ height: '16px' }}>
                                  <div
                                    ref={timerBarRef}
                                    className="h-full transition-all duration-100 ease-linear"
                                    style={{ width: '0%' }}
                                  />
                                </div>
                              </div>

                              {/* Question content */}
                              <div className="flex-1 flex items-center justify-center p-6 overflow-hidden">
                                <div className={`w-full h-full flex ${
                                  (detailedGameState.showAnswer ? hasAnswerMedia : detailedGameState.showHint ? hasHintMedia : hasQuestionMedia) ? 'items-center justify-start' : 'items-center justify-center'
                                }`}>
                                  {/* Media container on left - 50% width when media exists */}
                                  {(detailedGameState.showAnswer ? hasAnswerMedia : detailedGameState.showHint ? hasHintMedia : hasQuestionMedia) ? (
                                    <div className="w-1/2 h-full flex items-center justify-center p-4">
                                      {detailedGameState.showAnswer && detailedGameState.activeQuestion.answerMedia ? (
                                        // Answer media
                                        <>
                                          {detailedGameState.activeQuestion.answerMedia.type === 'image' && (
                                            <img
                                              src={detailedGameState.activeQuestion.answerMedia.url}
                                              alt="Answer media"
                                              className="w-full h-auto object-contain rounded-lg shadow-xl"
                                            />
                                          )}
                                          {detailedGameState.activeQuestion.answerMedia.type === 'video' && (
                                            <video
                                              src={detailedGameState.activeQuestion.answerMedia.url}
                                              controls
                                              className="w-full h-auto object-contain rounded-lg shadow-xl"
                                              onError={(e) => {
                                                console.error('[ScreenView] Answer video error:', {
                                                  url: detailedGameState.activeQuestion.answerMedia.url,
                                                  error: e.currentTarget.error
                                                });
                                              }}
                                              onLoadStart={() => {
                                                console.log('[ScreenView] Answer video loading started:', detailedGameState.activeQuestion.answerMedia.url);
                                              }}
                                              onCanPlay={() => {
                                                console.log('[ScreenView] Answer video can play:', detailedGameState.activeQuestion.answerMedia.url);
                                              }}
                                            />
                                          )}
                                          {detailedGameState.activeQuestion.answerMedia.type === 'audio' && (
                                            <div className="w-full flex flex-col items-center justify-center gap-3 bg-gray-800 rounded-lg p-4">
                                              <div className="w-20 h-20 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg flex items-center justify-center shadow-lg">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                                                  <path d="M9 18V5l12-2v13"></path>
                                                  <circle cx="6" cy="18" r="3"></circle>
                                                  <circle cx="18" cy="16" r="3"></circle>
                                                </svg>
                                              </div>
                                              <audio
                                                src={detailedGameState.activeQuestion.answerMedia.url}
                                                controls
                                                className="w-full"
                                                onError={(e) => {
                                                  console.error('[ScreenView] Answer audio error:', {
                                                    url: detailedGameState.activeQuestion.answerMedia.url,
                                                    error: e.currentTarget.error
                                                  });
                                                }}
                                                onLoadStart={() => {
                                                  console.log('[ScreenView] Answer audio loading started:', detailedGameState.activeQuestion.answerMedia.url);
                                                }}
                                                onCanPlay={() => {
                                                  console.log('[ScreenView] Answer audio can play:', detailedGameState.activeQuestion.answerMedia.url);
                                                }}
                                              />
                                            </div>
                                          )}
                                          {detailedGameState.activeQuestion.answerMedia.type === 'youtube' && (
                                            <div className="w-full h-full flex items-center justify-center">
                                              <iframe
                                                src={detailedGameState.activeQuestion.answerMedia.url}
                                                className="w-full h-full rounded-lg shadow-xl"
                                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                                allowFullScreen
                                                title="YouTube video"
                                              />
                                            </div>
                                          )}
                                        </>
                                      ) : detailedGameState.showHint && detailedGameState.activeQuestion.hint?.media ? (
                                        // Hint media
                                        <>
                                          {hintMediaType === 'image' && (
                                            <img
                                              src={hintMediaUrl}
                                              alt="Hint media"
                                              className="w-full h-auto object-contain rounded-lg shadow-xl"
                                            />
                                          )}
                                          {hintMediaType === 'video' && (
                                            <video
                                              src={hintMediaUrl}
                                              controls
                                              className="w-full h-auto object-contain rounded-lg shadow-xl"
                                              onError={(e) => {
                                                console.error('[ScreenView] Hint video error:', {
                                                  url: hintMediaUrl,
                                                  error: e.currentTarget.error
                                                });
                                              }}
                                              onLoadStart={() => {
                                                console.log('[ScreenView] Hint video loading started:', hintMediaUrl);
                                              }}
                                              onCanPlay={() => {
                                                console.log('[ScreenView] Hint video can play:', hintMediaUrl);
                                              }}
                                            />
                                          )}
                                          {hintMediaType === 'audio' && (
                                            <div className="w-full flex flex-col items-center justify-center gap-3 bg-gray-800 rounded-lg p-4">
                                              <div className="w-20 h-20 bg-gradient-to-br from-yellow-600 to-orange-600 rounded-lg flex items-center justify-center shadow-lg">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                                                  <path d="M9 18V5l12-2v13"></path>
                                                  <circle cx="6" cy="18" r="3"></circle>
                                                  <circle cx="18" cy="16" r="3"></circle>
                                                </svg>
                                              </div>
                                              <audio
                                                src={hintMediaUrl}
                                                controls
                                                className="w-full"
                                                onError={(e) => {
                                                  console.error('[ScreenView] Hint audio error:', {
                                                    url: hintMediaUrl,
                                                    error: e.currentTarget.error
                                                  });
                                                }}
                                                onLoadStart={() => {
                                                  console.log('[ScreenView] Hint audio loading started:', hintMediaUrl);
                                                }}
                                                onCanPlay={() => {
                                                  console.log('[ScreenView] Hint audio can play:', hintMediaUrl);
                                                }}
                                              />
                                            </div>
                                          )}
                                          {hintMediaType === 'youtube' && (
                                            <div className="w-full h-full flex items-center justify-center">
                                              <iframe
                                                src={hintMediaUrl}
                                                className="w-full h-full rounded-lg shadow-xl"
                                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                                allowFullScreen
                                                title="YouTube video"
                                              />
                                            </div>
                                          )}
                                        </>
                                      ) : (
                                        // Question media
                                        <>
                                          {mediaType === 'image' && (
                                            <img
                                              src={mediaUrl}
                                              alt="Question media"
                                              className="w-full h-auto object-contain rounded-lg shadow-xl"
                                            />
                                          )}
                                          {mediaType === 'video' && (
                                            <video
                                              src={mediaUrl}
                                              controls
                                              className="w-full h-auto object-contain rounded-lg shadow-xl"
                                            />
                                          )}
                                          {mediaType === 'audio' && (
                                            <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-gray-800 rounded-lg p-6">
                                              <div className="w-32 h-32 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg flex items-center justify-center shadow-lg">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                                                  <path d="M9 18V5l12-2v13"></path>
                                                  <circle cx="6" cy="18" r="3"></circle>
                                                  <circle cx="18" cy="16" r="3"></circle>
                                                </svg>
                                              </div>
                                              <audio
                                                src={mediaUrl}
                                                controls
                                                className="w-full"
                                              />
                                            </div>
                                          )}
                                          {mediaType === 'youtube' && (
                                            <div className="w-full h-full flex items-center justify-center">
                                              <iframe
                                                src={mediaUrl}
                                                className="w-full h-full rounded-lg shadow-xl"
                                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                                allowFullScreen
                                                title="YouTube video"
                                              />
                                            </div>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  ) : null}

                                  {/* Question text container */}
                                  {(detailedGameState.showAnswer ? hasAnswerMedia : detailedGameState.showHint ? hasHintMedia : hasQuestionMedia) ? (
                                    <div className="w-1/2 h-full flex items-center justify-center p-4">
                                      <h2
                                        className="font-bold text-white leading-[1.1] text-center"
                                        style={{ fontSize: `${questionFontSizeMobile}rem` }}
                                        data-qm-screen="true"
                                      >
                                        {currentQuestionText}
                                      </h2>
                                    </div>
                                  ) : (
                                    <div className="w-3/4 h-full flex items-center justify-center p-4">
                                      <h2
                                        className="font-bold text-white leading-[1.1] text-center"
                                        style={{ fontSize: `${questionFontSizeMobile}rem` }}
                                        data-qm-screen="true"
                                      >
                                        {currentQuestionText}
                                      </h2>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </>
                )}
          </div>
        ) : (
            <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center">
              <Loader2 className="w-16 h-16 text-blue-500 animate-spin mx-auto mb-4" />
              <p className="text-xl font-medium text-gray-400">Синхронизация с хостом...</p>
            </div>
          </div>
        )}
      </div>

      {/* Draggable QR Code - synced with host */}
      {detailedGameState.hostId && (
        <DraggableQRCode
          hostId={detailedGameState.hostId}
          isVisible={qrCodeState.isVisible}
          initialPosition={qrCodeState.position}
          draggable={false}
          onClose={() => {
            // Send close event to host via custom event
            window.dispatchEvent(new CustomEvent('toggle-qr-code'));
          }}
        />
      )}
    </div>
  );
};
