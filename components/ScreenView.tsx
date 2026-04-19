import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Users, X, Loader2, Smartphone, Monitor } from 'lucide-react';
import { Team, P2PSMessage, MessageCategory } from '../types';
import { useP2PClient, ClientConnectionState } from '../hooks/useP2PClient';
import { storage, STORAGE_KEYS } from '../hooks/useLocalStorage';
import { restoreBlobFromStorage } from '../utils/mediaManager';
import { processMediaTransfer } from '../utils/mediaStream';
import { DraggableQRCode } from './shared/DraggableQRCode';

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

// ============= FONT SIZE CALCULATION UTILITIES =============

/**
 * Calculate dynamic font size for question text
 * @param text - The question text
 * @param baseSize - Base font size in rem (current size: 4 for mobile, 7 for desktop)
 * @returns Font size in rem (can go down to 25% of base for very long text)
 */
function calculateQuestionFontSize(text: string, baseSize: number): number {
  const minSize = baseSize * 0.25; // Can go down to 25% for very long text
  const maxLength = 400; // At 400+ chars, use minimum size
  const shortThreshold = 30; // Text length considered "short"

  const length = text.length;
  if (length <= shortThreshold) return baseSize;
  if (length >= maxLength) return minSize;

  // Linear interpolation between baseSize and minSize
  const ratio = (length - shortThreshold) / (maxLength - shortThreshold);
  return baseSize - (baseSize - minSize) * ratio;
}

/**
 * Calculate font size for answer options - mobile version
 * @param text - Answer text
 * @returns Font size in rem (max 1.5rem, min 0.75rem)
 */
function calculateAnswerFontSizeMobile(text: string): number {
  const baseSize = 1.5; // 1.5rem max for mobile
  const minSize = 0.75; // 0.75rem min for mobile
  const maxLength = 50; // At 50+ chars, use minimum size
  const shortThreshold = 5; // Text length considered "short"

  const length = text.length;
  if (length <= shortThreshold) return baseSize;
  if (length >= maxLength) return minSize;

  // Linear interpolation
  const ratio = (length - shortThreshold) / (maxLength - shortThreshold);
  return baseSize - (baseSize - minSize) * ratio;
}

/**
 * Calculate font size for answer options - desktop version
 * @param text - Answer text
 * @returns Font size in rem (max 3rem, min 1.5rem)
 */
function calculateAnswerFontSizeDesktop(text: string): number {
  const baseSize = 3; // 3rem max for desktop
  const minSize = 1.5; // 1.5rem min for desktop
  const maxLength = 50; // At 50+ chars, use minimum size
  const shortThreshold = 5; // Text length considered "short"

  const length = text.length;
  if (length <= shortThreshold) return baseSize;
  if (length >= maxLength) return minSize;

  // Linear interpolation
  const ratio = (length - shortThreshold) / (maxLength - shortThreshold);
  return baseSize - (baseSize - minSize) * ratio;
}

export const ScreenView: React.FC = () => {
  // Session ID from URL
  const sessionId = useMemo(() => {
    const params = new URLSearchParams(window.location.hash.split('?')[1]);
    return params.get('session') || null;
  }, []);

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
  const [gameState, setGameState] = useState<any>(null);

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
    };
    showAnswer?: boolean;
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
    // Add team states for player panel colors
    teamStates?: {
      wrongAnswerTeams?: string[];
      activeTeamIds?: string[];
      clashingTeamIds?: string[];
    };
    showQRCode?: boolean; // QR code visibility state
    hostId?: string; // Host ID for QR code generation
    qrCodePosition?: { x: number; y: number }; // QR code position from host
    highlightedQuestion?: string | null; // Currently highlighted question (for visual feedback)
    themesScrollPosition?: number; // Scroll position for themes list
  }>({});

  // Timer display refs for direct DOM manipulation (no re-renders)
  const timerTextRef = useRef<HTMLSpanElement>(null);
  const timerBarRef = useRef<HTMLDivElement>(null);

  // Ref for buzzerState to avoid recreating intervals
  const buzzerStateRef = useRef(detailedGameState.buzzerState);

  // Update buzzerStateRef when detailedGameState changes
  useEffect(() => {
    buzzerStateRef.current = detailedGameState.buzzerState;
  }, [detailedGameState.buzzerState]);

  // Connection quality
  const [connectionQuality, setConnectionQuality] = useState({
    rtt: 0,
    packetLoss: 0,
    jitter: 0,
    lastPing: Date.now(),
    healthScore: 100
  });

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
      console.log('[ScreenView] Message received:', message.type, 'from host');
      switch (message.type) {
        case 'STATE_SYNC':
          console.log('[ScreenView] State sync received:', message.payload);
          // Merge with existing state to preserve all fields
          setGameState(prevState => {
            const payload = message.payload;
            const updatedState = {
              ...prevState,
              ...payload,
              // Ensure clients array is properly set, but don't overwrite with empty array
              clients: (payload.clients && payload.clients.length > 0) ? payload.clients : (prevState?.clients || []),
              // Ensure teams array is properly set, but don't overwrite with empty array
              teams: (payload.teams && payload.teams.length > 0) ? payload.teams : (prevState?.teams || []),
              // NEVER overwrite buzzerState from STATE_SYNC - only BROADCAST messages should update it
              // buzzerState: (payload.buzzerState && payload.buzzerState.timerPhase) ? payload.buzzerState : (prevState?.buzzerState || {}),
              // Update session status
              isSessionActive: payload.isSessionActive !== undefined ? payload.isSessionActive : (prevState?.isSessionActive || false)
            };
            console.log('[ScreenView] Merged state:', updatedState);
            return updatedState;
          });
          break;
        case 'TEAMS_SYNC':
          const syncedTeams = message.payload.teams || [];
          // Only update if we actually received teams (prevent empty array overwriting valid state)
          if (syncedTeams.length > 0) {
            console.log('[ScreenView] Teams synced:', syncedTeams);
            setGameState(prevState => ({
              ...prevState,
              teams: syncedTeams
            }));
          // Also update detailedGameState teamScores
          setDetailedGameState(prevState => ({
            ...prevState,
            teamScores: syncedTeams.map((team: any) => ({
              id: team.id,
              name: team.name,
              score: team.score || 0
            }))
          }));
          } else {
            console.log('[ScreenView] Skipping TEAMS_SYNC with empty teams array');
          }
          break;
        case 'TEAM_UPDATE':
          const { teamId, teamName } = message.payload;
          console.log('[ScreenView] Team update received:', teamId, teamName);
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
          const commands = message.payload.commands || [];
          // Only update if we actually received commands (prevent empty array overwriting valid state)
          if (commands.length > 0) {
            console.log('[ScreenView] Commands list received:', commands);
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
            // Also update detailedGameState teamScores if they don't exist yet
            setDetailedGameState(prevState => {
              const existingTeamIds = new Set(prevState.teamScores?.map(t => t.id) || []);
              const newTeamScores = commands
                .filter((cmd: { id: string; name: string }) => !existingTeamIds.has(cmd.id))
                .map((cmd: { id: string; name: string }) => ({
                  id: cmd.id,
                  name: cmd.name,
                  score: 0
                }));
              return {
                ...prevState,
                teamScores: [...(prevState.teamScores || []), ...newTeamScores]
              };
            });
          } else {
            console.log('[ScreenView] Skipping COMMANDS_LIST with empty commands array');
          }
          break;
        case 'BROADCAST':
          if (message.payload?.type === 'GAME_STATE_UPDATE') {
            console.log('[ScreenView] Game state update received');
            console.log('[ScreenView] Buzzer state in broadcast:', JSON.stringify(message.payload.state?.buzzerState, null, 2));
            handleGameStateUpdate(message.payload.state);
          }
          break;
        case 'BUZZER_STATE':
          console.log('[ScreenView] Buzzer state received:', JSON.stringify(message.payload, null, 2));
          // Handle buzzer state updates (timer state, pause state, etc.)
          setDetailedGameState(prevState => {
            const buzzerState = message.payload;
            return {
              ...prevState,
              buzzerState: {
                ...prevState.buzzerState,
                ...buzzerState,
                // Ensure timer phase is preserved
                timerPhase: buzzerState.timerPhase || prevState.buzzerState?.timerPhase || 'inactive',
                // Update remaining time values
                readingTimerRemaining: buzzerState.readingTimerRemaining ?? prevState.buzzerState?.readingTimerRemaining ?? 0,
                responseTimerRemaining: buzzerState.responseTimerRemaining ?? prevState.buzzerState?.responseTimerRemaining ?? 0,
                // Update total time values - CRITICAL for local countdown
                readingTimeTotal: buzzerState.readingTimeTotal ?? prevState.buzzerState?.readingTimeTotal ?? 5,
                responseTimeTotal: buzzerState.responseTimeTotal ?? prevState.buzzerState?.responseTimeTotal ?? 30,
                // Update pause state - this is critical for timer start/stop
                isPaused: buzzerState.isPaused ?? prevState.buzzerState?.isPaused ?? false,
                // Preserve other important fields
                active: buzzerState.active ?? prevState.buzzerState?.active ?? false,
                handicapActive: buzzerState.handicapActive ?? prevState.buzzerState?.handicapActive ?? false,
                handicapTeamId: buzzerState.handicapTeamId ?? prevState.buzzerState?.handicapTeamId
              }
            };
          });
          break;
        case 'QR_CODE_STATE':
          console.log('[ScreenView] QR code state received:', message.payload);
          setQrCodeState({
            isVisible: message.payload.showQRCode || false,
            position: message.payload.position
          });
          break;
        case 'TIMER_CONTROL':
          console.log('[ScreenView] Timer control received:', message.payload);
          // Handle explicit timer control commands
          const { action, timerPhase, readingTimerRemaining, responseTimerRemaining } = message.payload;

          setDetailedGameState(prevState => {
            const updatedState = { ...prevState };

            if (updatedState.buzzerState) {
              switch (action) {
                case 'pause':
                  updatedState.buzzerState.isPaused = true;
                  break;
                case 'resume':
                  updatedState.buzzerState.isPaused = false;
                  break;
                case 'stop':
                  updatedState.buzzerState.isPaused = false;
                  updatedState.buzzerState.timerPhase = 'inactive';
                  break;
                case 'switch':
                  if (timerPhase) {
                    updatedState.buzzerState.timerPhase = timerPhase;
                  }
                  if (readingTimerRemaining !== undefined) {
                    updatedState.buzzerState.readingTimerRemaining = readingTimerRemaining;
                  }
                  if (responseTimerRemaining !== undefined) {
                    updatedState.buzzerState.responseTimerRemaining = responseTimerRemaining;
                  }
                  updatedState.buzzerState.isPaused = false;
                  break;
                case 'start':
                  if (timerPhase) {
                    updatedState.buzzerState.timerPhase = timerPhase;
                  }
                  if (readingTimerRemaining !== undefined) {
                    updatedState.buzzerState.readingTimerRemaining = readingTimerRemaining;
                  }
                  if (responseTimerRemaining !== undefined) {
                    updatedState.buzzerState.responseTimerRemaining = responseTimerRemaining;
                  }
                  updatedState.buzzerState.isPaused = false;
                  updatedState.buzzerState.active = true;
                  break;
              }
            }

            return updatedState;
          });
          break;
        case 'MEDIA_TRANSFER':
          console.log('[ScreenView] Media transfer received:', message.payload);
          // Process media transfer message - store the media URL for later use
          const { payload } = message;

          if (payload.isYouTube && payload.url) {
            // YouTube links - store directly
            console.log('[ScreenView] YouTube media received:', payload.url);
            // Store in a map for later use when question is displayed
            if (!window.mediaTransferCache) {
              window.mediaTransferCache = new Map();
            }
            window.mediaTransferCache.set(payload.mediaId, {
              type: payload.mediaType,
              url: payload.url,
              isYouTube: true
            });
          } else if (payload.fileData && payload.fileType) {
            // Local files transferred as base64
            console.log('[ScreenView] Local file media received:', payload.fileName);
            if (!window.mediaTransferCache) {
              window.mediaTransferCache = new Map();
            }
            window.mediaTransferCache.set(payload.mediaId, {
              type: payload.mediaType,
              url: null, // Will be processed when needed
              fileData: payload.fileData,
              fileType: payload.fileType,
              isYouTube: false
            });
          } else if (payload.url) {
            // External URLs
            console.log('[ScreenView] External URL media received:', payload.url);
            if (!window.mediaTransferCache) {
              window.mediaTransferCache = new Map();
            }
            window.mediaTransferCache.set(payload.mediaId, {
              type: payload.mediaType,
              url: payload.url,
              isYouTube: false
            });
          }
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
      console.log('[ScreenView] Auto-connecting to host:', urlHostId);
      p2pClient.connect();
    }
  }, [urlHostId, p2pClient]);

  // Track connection changes for reconnection detection
  const previousConnectionStatusRef = useRef<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');

  useEffect(() => {
    if (connectionStatus !== previousConnectionStatusRef.current) {
      console.log('[ScreenView] Connection status changed:', {
        from: previousConnectionStatusRef.current,
        to: connectionStatus
      });

      // When transitioning to connected, request full state sync only on first connection
      // (periodic sync will handle subsequent updates)
      if (connectionStatus === 'connected' && previousConnectionStatusRef.current !== 'connected') {
        console.log('[ScreenView] Connected to host, periodic sync will handle state updates');
      }

      previousConnectionStatusRef.current = connectionStatus;
    }
  }, [connectionStatus, p2pClient.isConnected, p2pClient.send]);

  // Handle game state updates with media restoration
  const handleGameStateUpdate = useCallback(async (state: any) => {
    console.log('[ScreenView] Processing game state update with media restoration');

    // Check for transferred media files for active question
    if (state.activeQuestion?.media?.url && window.mediaTransferCache) {
      const questionMediaId = `question_${state.activeQuestion.questionId || 'current'}_media`;
      const cachedMedia = window.mediaTransferCache.get(questionMediaId);

      if (cachedMedia) {
        console.log('[ScreenView] Using cached media for question:', questionMediaId);

        if (cachedMedia.url) {
          // For YouTube and external URLs, use directly
          state.activeQuestion.media.url = cachedMedia.url;
        } else if (cachedMedia.fileData && cachedMedia.fileType) {
          // For local files, convert base64 to blob URL
          try {
            const blobUrl = processMediaTransfer({
              id: 'cached',
              category: 'state' as const,
              timestamp: Date.now(),
              senderId: 'host',
              type: 'MEDIA_TRANSFER',
              payload: {
                mediaId: questionMediaId,
                mediaType: cachedMedia.type,
                fileName: 'media',
                fileType: cachedMedia.fileType,
                fileSize: 0,
                fileData: cachedMedia.fileData,
                url: cachedMedia.url,
                isYouTube: cachedMedia.isYouTube
              }
            });

            if (blobUrl) {
              state.activeQuestion.media.url = blobUrl;
              console.log('[ScreenView] Media blob URL created from cache:', questionMediaId);
            }
          } catch (error) {
            console.error('[ScreenView] Error creating blob URL from cache:', error);
          }
        }
      }
    }

    // Check for transferred media files for answer media
    if (state.activeQuestion?.answerMedia?.url && window.mediaTransferCache) {
      const answerMediaId = `question_${state.activeQuestion.questionId || 'current'}_answer_media`;
      const cachedMedia = window.mediaTransferCache.get(answerMediaId);

      if (cachedMedia) {
        console.log('[ScreenView] Using cached media for answer:', answerMediaId);

        if (cachedMedia.url) {
          state.activeQuestion.answerMedia.url = cachedMedia.url;
        } else if (cachedMedia.fileData && cachedMedia.fileType) {
          try {
            const blobUrl = processMediaTransfer({
              id: 'cached',
              category: 'state' as const,
              timestamp: Date.now(),
              senderId: 'host',
              type: 'MEDIA_TRANSFER',
              payload: {
                mediaId: answerMediaId,
                mediaType: cachedMedia.type,
                fileName: 'media',
                fileType: cachedMedia.fileType,
                fileSize: 0,
                fileData: cachedMedia.fileData,
                url: cachedMedia.url,
                isYouTube: cachedMedia.isYouTube
              }
            });

            if (blobUrl) {
              state.activeQuestion.answerMedia.url = blobUrl;
              console.log('[ScreenView] Answer media blob URL created from cache:', answerMediaId);
            }
          } catch (error) {
            console.error('[ScreenView] Error creating answer blob URL from cache:', error);
          }
        }
      }
    }

    // Restore media URLs for active question (fallback to IndexedDB)
    if (state.activeQuestion?.media?.localFile?.mediaId) {
      const restoredUrl = await restoreBlobFromStorage(state.activeQuestion.media.localFile.mediaId);
      if (restoredUrl) {
        state.activeQuestion.media.url = restoredUrl;
        console.log('[ScreenView] Question media blob URL restored:', state.activeQuestion.media.localFile.mediaId);
      }
    }

    if (state.activeQuestion?.answerMedia?.localFile?.mediaId) {
      const restoredUrl = await restoreBlobFromStorage(state.activeQuestion.answerMedia.localFile.mediaId);
      if (restoredUrl) {
        state.activeQuestion.answerMedia.url = restoredUrl;
        console.log('[ScreenView] Answer media blob URL restored:', state.activeQuestion.answerMedia.localFile.mediaId);
      }
    }

    // Restore media URLs for pack cover
    if (state.packCover?.localFile?.mediaId) {
      const restoredUrl = await restoreBlobFromStorage(state.packCover.localFile.mediaId);
      if (restoredUrl) {
        // Set both url and value for compatibility
        state.packCover.url = restoredUrl;
        state.packCover.value = restoredUrl;
        console.log('[ScreenView] Pack cover blob URL restored:', state.packCover.localFile.mediaId);
      }
    }

    // Restore media URLs for current round cover
    if (state.currentRound?.cover?.localFile?.mediaId) {
      const restoredUrl = await restoreBlobFromStorage(state.currentRound.cover.localFile.mediaId);
      if (restoredUrl) {
        // Set both url and value for compatibility
        state.currentRound.cover.url = restoredUrl;
        state.currentRound.cover.value = restoredUrl;
        console.log('[ScreenView] Round cover blob URL restored:', state.currentRound.cover.localFile.mediaId);
      }
    }

    setDetailedGameState(prevState => {
      // Preserve important fields if not provided in new state
      const oldScreen = prevState.currentScreen;
      const newScreen = state.currentScreen;
      const oldQuestion = prevState.activeQuestion;
      const newQuestion = state.activeQuestion;

      // Log screen changes for debugging
      if (newScreen && newScreen !== oldScreen) {
        console.log('[ScreenView] ⚠️ Screen changing from', oldScreen, 'to', newScreen);
      } else if (!newScreen) {
        console.log('[ScreenView] ⚠️ No currentScreen in update, keeping:', oldScreen);
      }

      // Check if question actually changed (deep comparison)
      // Important: null newQuestion means question was closed - MUST clear it
      const shouldUpdateQuestion = newQuestion === null || (
        newQuestion && (
          !oldQuestion || // No previous question - must set new one
          (oldQuestion.questionId !== newQuestion.questionId) || // Different question ID
          (oldQuestion.text !== newQuestion.text) ||
          (oldQuestion.points !== newQuestion.points)
        )
      );

      // Use new question if should update, otherwise preserve old
      const finalActiveQuestion = shouldUpdateQuestion ? newQuestion : oldQuestion;

      // Log question changes for debugging (only when actually changed)
      if (shouldUpdateQuestion && newQuestion?.questionId) {
        console.log('[ScreenView] ⚠️ Question updated:', {
          oldId: oldQuestion?.questionId,
          newId: newQuestion.questionId,
          oldText: oldQuestion?.text?.slice(0, 30),
          newText: newQuestion.text?.slice(0, 30)
        });
      } else if (newQuestion === null && oldQuestion) {
        console.log('[ScreenView] ✅ Question CLOSED (was:', oldQuestion.questionId, ')');
      } else if (!newQuestion && oldQuestion) {
        console.log('[ScreenView] ⚠️ Question cleared (was:', oldQuestion.questionId);
      }

      // Always use new buzzerState if provided and valid - BROADCAST from host is authoritative
      let finalBuzzerState = state.buzzerState;

      if (!state.buzzerState || !state.buzzerState.timerPhase) {
        // No new buzzerState - keep old one
        finalBuzzerState = prevState.buzzerState;
        console.log('[ScreenView] 🔧 Keeping old buzzerState (no new state)');
      } else {
        // New state is valid - use it (BROADCAST from host is authoritative)
        console.log('[ScreenView] 🔧 Using new buzzerState', {
          isPaused: state.buzzerState.isPaused,
          timerPhase: state.buzzerState.timerPhase,
          time: state.buzzerState.readingTimerRemaining || state.buzzerState.responseTimerRemaining,
          showAnswer: state.showAnswer,
          activeQuestion: !!state.activeQuestion
        });
      }

      const updatedState = {
        ...state,
        // Preserve currentScreen if not provided (prevent screen jumping)
        currentScreen: state.currentScreen || prevState.currentScreen || 'cover',
        // Preserve teamScores if not provided
        teamScores: state.teamScores || prevState.teamScores || [],
        // Use final activeQuestion (either new or preserved old)
        activeQuestion: finalActiveQuestion,
        // Use calculated final buzzerState
        buzzerState: finalBuzzerState,
        // Include showAnswer from state (important for answer display)
        showAnswer: state.showAnswer ?? prevState.showAnswer ?? false,
        // Preserve teamStates if not provided (critical for player panel colors)
        // ALWAYS create new object to trigger re-render, even if data hasn't changed
        teamStates: state.teamStates ? {
          wrongAnswerTeams: state.teamStates.wrongAnswerTeams ? [...state.teamStates.wrongAnswerTeams] : [],
          activeTeamIds: state.teamStates.activeTeamIds ? [...state.teamStates.activeTeamIds] : [],
          clashingTeamIds: state.teamStates.clashingTeamIds ? [...state.teamStates.clashingTeamIds] : []
        } : (prevState.teamStates || {
          wrongAnswerTeams: [],
          activeTeamIds: [],
          clashingTeamIds: []
        })
      };
      return updatedState;
    });

    // Force re-render by logging current screen
    console.log('[ScreenView] Updated detailedGameState:', {
      currentScreen: state.currentScreen,
      showAnswer: state.showAnswer ?? detailedGameState.showAnswer ?? false,
      activeQuestion: !!state.activeQuestion,
      questionText: state.activeQuestion?.text?.slice(0, 30)
    });
    console.log('[ScreenView] Team scores preserved:', detailedGameState.teamScores);
    console.log('[ScreenView] Team states updated:', {
      wrongAnswerTeams: state.teamStates?.wrongAnswerTeams,
      activeTeamIds: state.teamStates?.activeTeamIds,
      clashingTeamIds: state.teamStates?.clashingTeamIds
    });

    // Enhanced logging for team card states
    if (state.teamStates) {
      console.log('[ScreenView] 🎨 Team Card States Summary:');
      console.log(`  ❌ Wrong Answer Teams: ${state.teamStates.wrongAnswerTeams?.join(', ') || 'none'}`);
      console.log(`  ✅ Active Teams: ${state.teamStates.activeTeamIds?.join(', ') || 'none'}`);
      console.log(`  ⚔️ Clashing Teams: ${state.teamStates.clashingTeamIds?.join(', ') || 'none'}`);
      console.log(`  🎯 Answering Team: ${state.answeringTeamId || 'none'}`);
    }

    // Sync local timer state with host buzzer state
    if (state.buzzerState) {
      const buzzerInfo = {
        timerPhase: state.buzzerState.timerPhase,
        readingTimerRemaining: state.buzzerState.readingTimerRemaining,
        responseTimerRemaining: state.buzzerState.responseTimerRemaining,
        isPaused: state.buzzerState.isPaused,
        active: state.buzzerState.active,
        handicapActive: state.buzzerState.handicapActive
      };

      console.log('[ScreenView] Syncing timer state:', buzzerInfo);
      console.log('[ScreenView] Full buzzerState:', JSON.stringify(state.buzzerState, null, 2));

      // Immediately update timer display on state change
      if (timerTextRef.current) {
        const { timerPhase, readingTimerRemaining, responseTimerRemaining, timerTextColor, isPaused } = state.buzzerState;
        if (timerPhase === 'reading') {
          const pauseText = isPaused ? ' <span class="text-red-400 text-sm font-bold">[PAUSED]</span>' : '';
          timerTextRef.current.innerHTML = `${readingTimerRemaining.toFixed(1)}сек${pauseText}`;
          timerTextRef.current.className = `text-xl font-bold ${timerTextColor || 'text-yellow-300'}`;
        } else if (timerPhase === 'response') {
          const pauseText = isPaused ? ' <span class="text-red-400 text-sm font-bold">[PAUSED]</span>' : '';
          timerTextRef.current.innerHTML = `${responseTimerRemaining.toFixed(1)}сек${pauseText}`;
          timerTextRef.current.className = `text-xl font-bold ${timerTextColor || 'text-green-300'}`;
        } else {
          timerTextRef.current.textContent = '';
        }
      }

      if (timerBarRef.current) {
        const { timerPhase, readingTimerRemaining, responseTimerRemaining, readingTimeTotal, responseTimeTotal, timerBarColor } = state.buzzerState;
        let progress = 0;

        if (timerPhase === 'reading') {
          const totalTime = readingTimeTotal ?? 5;
          const elapsed = totalTime - readingTimerRemaining;
          progress = Math.min(100, Math.max(0, (elapsed / totalTime) * 100));
        } else if (timerPhase === 'response') {
          const totalTime = responseTimeTotal ?? 30;
          const elapsed = totalTime - responseTimerRemaining;
          progress = Math.min(100, Math.max(0, (elapsed / totalTime) * 100));
        }

        timerBarRef.current.style.width = `${progress}%`;
        timerBarRef.current.className = `h-full transition-all duration-100 ease-linear ${timerBarColor || 'bg-gray-500'}`;
      }
    }
  }, []);

  // Sync themes scroll position with host
  useEffect(() => {
    if (detailedGameState.currentScreen === 'themes' && themesScrollRef.current && detailedGameState.themesScrollPosition !== undefined) {
      themesScrollRef.current.scrollTop = detailedGameState.themesScrollPosition;
    }
  }, [detailedGameState.themesScrollPosition, detailedGameState.currentScreen]);

  // Local timer countdown - demo screen runs timer independently after receiving initial state from host
  useEffect(() => {
    let localTimerRemaining = {
      reading: 0,
      response: 0
    };
    let lastUpdateTime = Date.now();
    let isRunning = false;

    const interval = setInterval(() => {
      const buzzerState = buzzerStateRef.current;
      if (!buzzerState) return;

      const actualTimerPhase = buzzerState.timerPhase || 'inactive';
      const isPaused = buzzerState.isPaused || false;

      // Sync local timer when receiving new state from host
      const timeSinceLastUpdate = (Date.now() - lastUpdateTime) / 1000;

      // Check if we should run the timer
      const shouldRun = !isPaused && (actualTimerPhase === 'reading' || actualTimerPhase === 'response');

      if (shouldRun && !isRunning) {
        // Timer just started - initialize from host values
        localTimerRemaining.reading = buzzerState.readingTimerRemaining || 0;
        localTimerRemaining.response = buzzerState.responseTimerRemaining || 0;
        isRunning = true;
        lastUpdateTime = Date.now();

        console.log('[ScreenView] Local timer started:', {
          timerPhase: actualTimerPhase,
          readingRemaining: localTimerRemaining.reading,
          responseRemaining: localTimerRemaining.response,
          readingTimeTotal: buzzerState.readingTimeTotal,
          responseTimeTotal: buzzerState.responseTimeTotal
        });
      } else if (!shouldRun && isRunning) {
        // Timer stopped/paused - sync with host values
        localTimerRemaining.reading = buzzerState.readingTimerRemaining || 0;
        localTimerRemaining.response = buzzerState.responseTimerRemaining || 0;
        isRunning = false;
        lastUpdateTime = Date.now();
      } else if (shouldRun && isRunning) {
        // Timer is running - count down locally
        if (actualTimerPhase === 'reading') {
          localTimerRemaining.reading = Math.max(0, localTimerRemaining.reading - timeSinceLastUpdate);
        } else if (actualTimerPhase === 'response') {
          localTimerRemaining.response = Math.max(0, localTimerRemaining.response - timeSinceLastUpdate);
        }
        lastUpdateTime = Date.now();
      } else {
        // Not running - keep synced with host
        localTimerRemaining.reading = buzzerState.readingTimerRemaining || 0;
        localTimerRemaining.response = buzzerState.responseTimerRemaining || 0;
        lastUpdateTime = Date.now();
      }

      // Update display with local countdown values
      if (timerTextRef.current) {
        const displayTime = actualTimerPhase === 'reading'
          ? localTimerRemaining.reading
          : localTimerRemaining.response;

        if (actualTimerPhase === 'reading' && displayTime !== undefined) {
          const timerTextColor = buzzerState.timerTextColor || 'text-yellow-300';
          const pauseText = isPaused ? ' <span class="text-red-400 text-sm font-bold">[PAUSED]</span>' : '';
          timerTextRef.current.innerHTML = `${displayTime.toFixed(1)}сек${pauseText}`;
          timerTextRef.current.className = `text-xl font-bold ${timerTextColor}`;
        } else if (actualTimerPhase === 'response' && displayTime !== undefined) {
          const timerTextColor = buzzerState.timerTextColor || 'text-green-300';
          const pauseText = isPaused ? ' <span class="text-red-400 text-sm font-bold">[PAUSED]</span>' : '';
          timerTextRef.current.innerHTML = `${displayTime.toFixed(1)}сек${pauseText}`;
          timerTextRef.current.className = `text-xl font-bold ${timerTextColor}`;
        } else {
          timerTextRef.current.textContent = '';
        }
      }

      // Update timer bar with local countdown values
      if (timerBarRef.current) {
        let progress = 0;
        const timerBarColor = buzzerState.timerBarColor || 'bg-gray-500';

        if (actualTimerPhase === 'reading') {
          const totalTime = buzzerState.readingTimeTotal ?? 5;
          const currentTime = localTimerRemaining.reading;
          const elapsed = totalTime - currentTime;
          progress = Math.min(100, Math.max(0, (elapsed / totalTime) * 100));
        } else if (actualTimerPhase === 'response') {
          const totalTime = buzzerState.responseTimeTotal ?? 30;
          const currentTime = localTimerRemaining.response;
          const elapsed = totalTime - currentTime;
          progress = Math.min(100, Math.max(0, (elapsed / totalTime) * 100));
        }

        timerBarRef.current.style.width = `${progress}%`;
        timerBarRef.current.className = `h-full transition-all duration-100 ease-linear ${timerBarColor}`;
      }
    }, 50); // Update every 50ms for smooth countdown

    return () => clearInterval(interval);
  }, []); // Empty deps - create interval once

  // Request state sync periodically (but NOT commands - those are event-driven)
  useEffect(() => {
    if (connectionStatus !== 'connected' || !p2pClient.isConnected) return;

    console.log('[ScreenView] Setting up periodic STATE sync (every 5s)...');

    const requestStateSync = () => {
      const stateRequest = {
        category: 'sync' as MessageCategory,
        type: 'STATE_SYNC_REQUEST',
        payload: {}
      };
      p2pClient.send(stateRequest);
    };

    // Request immediately on connection
    requestStateSync();

    // Then request every 5 seconds only for STATE, not commands
    const syncInterval = setInterval(() => {
      requestStateSync();
    }, 5000);

    return () => {
      clearInterval(syncInterval);
      console.log('[ScreenView] Cleaning up periodic STATE sync');
    };
  }, [connectionStatus, p2pClient.isConnected, p2pClient.send]);

  // Request commands immediately when session becomes active (ONE TIME)
  useEffect(() => {
    if (connectionStatus === 'connected' && p2pClient.isConnected && gameState?.isSessionActive) {
      console.log('[ScreenView] Session became active, requesting commands ONE TIME...');
      const commandsRequest = {
        category: 'sync' as MessageCategory,
        type: 'GET_COMMANDS',
        payload: {}
      };
      p2pClient.send(commandsRequest);
    }
  }, [gameState?.isSessionActive, connectionStatus, p2pClient.isConnected, p2pClient.send]);


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
                    />
                  ) : detailedGameState.packCover?.url ? (
                    <img
                      src={detailedGameState.packCover.url}
                      alt={detailedGameState.packName || 'Game'}
                      className="h-full w-auto object-cover rounded-2xl shadow-2xl cursor-default"
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
                    className="rounded-xl p-6 shadow-lg flex flex-col items-center relative cursor-default"
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
                            className="flex-1 rounded-xl p-3 flex items-center justify-center shadow-lg cursor-default"
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
                                    rounded-xl shadow-md flex items-center justify-center
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
                      className={`rounded-xl p-6 shadow-lg flex flex-col items-center relative transition-all ${
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
                          className="max-w-full max-h-[60vh] mx-auto rounded"
                        />
                      )}
                      {detailedGameState.activeQuestion.media.type === 'video' && (
                        <video
                          src={detailedGameState.activeQuestion.media.url}
                          controls
                          className="max-w-full max-h-[60vh] mx-auto rounded"
                        />
                      )}
                      {detailedGameState.activeQuestion.media.type === 'audio' && (
                        <audio
                          src={detailedGameState.activeQuestion.media.url}
                          controls
                          className="w-full"
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
                <div className="w-[60vw] h-[38vh] p-6 overflow-auto bg-gray-900 rounded-xl">
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
                              className={`relative rounded-xl border-[3px] flex flex-col ${cardStyle}`}
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
                    className={`relative p-3 rounded-xl border-[3px] flex flex-col items-center justify-center ${
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
          <div className="w-full max-w-[1600px] mx-auto" key={`screen-${detailedGameState.currentScreen || 'cover'}-question-${detailedGameState.activeQuestion ? 'active' : 'inactive'}`}>
            {/* Check if host is in lobby mode or game session */}
            {/* Key prop above forces React to re-render when currentScreen OR activeQuestion changes */}
            {!gameState.isSessionActive && (!detailedGameState.currentScreen || detailedGameState.currentScreen === 'lobby') ? (
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
                          <div className="bg-gray-800 px-4 py-2 rounded text-white font-mono text-xl">
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
                          {/* Show all teams with clients */}
                          {gameState.teams && gameState.teams.length > 0 && gameState.teams.map((team: Team) => {
                            const clientsArray = Array.isArray(gameState.clients) ? gameState.clients : Object.values(gameState.clients);
                            const teamClients = gameState.clients ? clientsArray.filter((c: any) => c.teamId === team.id) : [];

                            return (
                              <div key={team.id} className="bg-gray-800/50 rounded-lg p-5 border border-gray-700">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-white font-medium text-xl">{team.name}</span>
                                  <span className="bg-blue-500/20 text-blue-400 px-3 py-1 rounded-full text-sm font-medium">
                                    {teamClients.length} {teamClients.length === 1 ? 'player' : 'players'}
                                  </span>
                                </div>
                                {teamClients.length > 0 && (
                                  <div className="space-y-1">
                                    {teamClients.map((client: any) => (
                                      <div key={client.id} className="flex items-center gap-2 text-sm text-gray-300">
                                        <div className="w-2 h-2 rounded-full bg-green-400"></div>
                                        <span>{client.name}</span>
                                      </div>
                                    ))}
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
                          JSON.stringify({
                            wrong: detailedGameState.teamStates?.wrongAnswerTeams?.sort(),
                            active: detailedGameState.teamStates?.activeTeamIds?.sort(),
                            clashing: detailedGameState.teamStates?.clashingTeamIds?.sort(),
                            answering: detailedGameState.answeringTeamId
                          })
                        }`}
                        className="fixed top-0 left-0 right-0 z-[100] h-auto px-1 bg-gray-900/50 flex items-center justify-center gap-1 py-1">
                        {detailedGameState.teamScores.map((team: { id: string; name: string; score: number }) => {
                          const isAnswering = detailedGameState.answeringTeamId === team.id;
                          const isHandicapTeam = detailedGameState.buzzerState?.handicapTeamId === team.id;
                          const hasWrongAnswer = detailedGameState.teamStates?.wrongAnswerTeams?.includes(team.id);
                          const isActive = detailedGameState.teamStates?.activeTeamIds?.includes(team.id);
                          const isClashing = detailedGameState.teamStates?.clashingTeamIds?.includes(team.id);
                          const hasPlacedBet = detailedGameState.currentScreen === 'placeBets' && detailedGameState.superGameBets?.find(b => b.teamId === team.id)?.ready;
                          const hasSubmittedAnswer = detailedGameState.currentScreen === 'superQuestion' && detailedGameState.superGameAnswers?.find(a => a.teamId === team.id)?.answer;

                          // Determine card state for logging and debugging
                          let cardState = 'default';
                          if (hasWrongAnswer) cardState = 'wrong-answer (gray)';
                          else if (hasPlacedBet || hasSubmittedAnswer) cardState = 'bet-placed (green)';
                          else if (isAnswering) cardState = 'answering (green)';
                          else if (isClashing) cardState = 'clashing (blue)';
                          else if (isActive) cardState = 'active (yellow)';

                          // Store previous state in a ref to detect changes
                          const prevStateKey = `team-state-${team.id}`;
                          const previousState = (window as any)[prevStateKey];
                          const stateChanged = previousState !== cardState;

                          // Update stored state
                          (window as any)[prevStateKey] = cardState;

                          // Log when state changes
                          if (stateChanged) {
                            console.log(`[ScreenView] 🎨 Team "${team.name}" card state changed: "${previousState}" → "${cardState}"`);
                            console.log(`  Details:`, {
                              teamId: team.id,
                              isAnswering,
                              hasWrongAnswer,
                              isActive,
                              isClashing,
                              hasPlacedBet,
                              hasSubmittedAnswer
                            });
                          }

                          return (
                            <div
                              key={`${team.id}-${cardState}`} // Include state in key to force re-render
                              className={`px-6 py-2 rounded-lg border-2 transition-all relative ${
                                hasWrongAnswer
                                  ? 'bg-gray-100/40 border-gray-300 shadow-[0_0_10px_rgba(255,255,255,0.3)]'
                                  : hasPlacedBet || hasSubmittedAnswer
                                    ? 'bg-green-500/30 border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.5)] scale-105'
                                    : isAnswering
                                      ? 'bg-green-500/40 border-green-400 shadow-[0_0_20px_rgba(74,222,128,0.6)] scale-105'
                                      : isClashing
                                        ? 'bg-blue-500/40 border-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.8)] scale-105'
                                        : isActive
                                          ? 'bg-yellow-500/30 border-yellow-400 shadow-[0_0_20px_rgba(234,179,8,0.6)]'
                                          : 'bg-gray-100/40 border-gray-300 shadow-[0_0_10px_rgba(255,255,255,0.3)]'
                              }`}
                            >
                              <div className="text-center">
                                <div className="text-2xl font-bold text-white">{team.name}</div>
                                <div className="h-px bg-gray-600 my-1"></div>
                                <div className={`text-2xl font-bold ${
                                  hasWrongAnswer ? 'text-red-400' : team.score >= 0 ? 'text-white' : 'text-red-400'
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
                      const currentQuestionText = detailedGameState.showAnswer && detailedGameState.activeQuestion.answer
                        ? detailedGameState.activeQuestion.answer
                        : detailedGameState.activeQuestion.text || '';
                      const questionFontSizeMobile = calculateQuestionFontSize(currentQuestionText, 3); // 3rem base for mobile
                      const questionFontSizeDesktop = calculateQuestionFontSize(currentQuestionText, 5); // 5rem base for desktop

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
                              <div className="bg-gray-700 w-full overflow-hidden" style={{ height: '16px' }}>
                                <div
                                  ref={timerBarRef}
                                  className="h-full transition-all duration-100 ease-linear bg-gray-500"
                                  style={{ width: '0%' }}
                                />
                              </div>

                              {/* Question content */}
                              <div className="flex-1 flex items-center justify-center p-6 overflow-hidden">
                                <div className={`w-full h-full flex ${
                                  (detailedGameState.showAnswer ? hasAnswerMedia : hasQuestionMedia) ? 'items-center justify-start' : 'items-center justify-center'
                                }`}>
                                  {/* Media container on left - 50% width when media exists */}
                                  {(detailedGameState.showAnswer ? hasAnswerMedia : hasQuestionMedia) ? (
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
                                              <audio src={detailedGameState.activeQuestion.answerMedia.url} controls className="w-full" />
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
                                  {(detailedGameState.showAnswer ? hasAnswerMedia : hasQuestionMedia) ? (
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
