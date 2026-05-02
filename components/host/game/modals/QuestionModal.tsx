/**
 * QuestionModal Component
 * Modal for displaying questions and answers with media support
 * Extended version with timer, buzzer state, and scoring
 */

import React, { useState, useEffect, useRef } from 'react';
import { Music, Play, Pause, Check, X, SkipForward, Lightbulb } from 'lucide-react';
import type { Question, Theme } from '../../PackEditor';
import type { TeamScore } from '../../../../types';
import {
  calculateQuestionFontSize,
  calculateAnswerFontSizeMobile,
  calculateAnswerFontSizeDesktop
} from '../fontUtils';
import { withSmartMemo } from '../../../../utils/memoUtils.tsx';

// TypeScript declarations for YouTube IFrame API
declare global {
  interface Window {
    YT: {
      Player: any;
      PlayerState: {
        UNSTARTED: number;
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
        BUFFERING: number;
        VIDEO_CUED: number;
      };
    };
    onYouTubeIframeAPIReady: () => void;
  }
}

export interface QuestionModalProps {
  question: Question;
  theme: Theme;
  points: number;
  showAnswer: boolean;
  onShowHint?: (show: boolean) => void;  // Callback to notify parent (demo screen)
  buzzedTeamId: string | null;
  teamScores: TeamScore[];
  onClose: () => void;
  onScoreChange: (change: 'wrong' | 'correct') => void;
  onShowAnswer?: () => void;
  onNext?: () => void;  // Show answer and move to next question
  scoreChangeType: 'wrong' | 'correct' | null;
  // Timer settings
  readingTimePerLetter: number;
  responseWindow: number;
  handicapEnabled: boolean;
  handicapDelay: number;
  answeringTeamId?: string | null;  // Team that gets to answer question
  roundName?: string;
  onBuzzerStateChange?: (state: { active: boolean; timerPhase?: 'reading' | 'response' | 'complete' | 'inactive'; readingTimerRemaining: number; responseTimerRemaining: number; handicapActive: boolean; handicapTeamId?: string; isPaused: boolean; readingTimeTotal?: number; responseTimeTotal?: number }) => void;
  onTimerPauseChange?: (isPaused: boolean) => void;  // Notify parent about timer pause state changes
}

export const QuestionModal = withSmartMemo(({
  question,
  theme,
  points,
  showAnswer,
  onShowHint,
  buzzedTeamId,
  teamScores,
  onClose: _onClose,
  onScoreChange,
  onShowAnswer,
  onNext,
  scoreChangeType,
  readingTimePerLetter,
  responseWindow,
  handicapEnabled,
  handicapDelay,
  answeringTeamId,
  roundName,
  onBuzzerStateChange,
  onTimerPauseChange,
}: QuestionModalProps) => {
  const mediaUrl = question.media?.url;
  const mediaType = question.media?.type;

  // Check if question has any media (image, video, audio, or youtube)
  const hasQuestionMedia = question.media && question.media.url && question.media.url.trim() !== '';
  const hasAnswerMedia = question.answerMedia && question.answerMedia.url && question.answerMedia.url.trim() !== '';

  const buzzedTeam = teamScores.find(t => t.teamId === buzzedTeamId);

  // Debug logging - only log when question changes
  useEffect(() => {
    console.log('🎮 Game Question Modal - Question changed:', {
      questionId: question.id,
      questionText: question.text?.slice(0, 50),
      mediaType: mediaType,
      mediaUrl: mediaUrl?.slice(0, 100),
      hasQuestionMedia: hasQuestionMedia,
      hasAnswerMedia: hasAnswerMedia,
      showAnswer: showAnswer,
      fullMediaObject: question.media
    });
  }, [question.id]); // Only log when question ID changes

  // Calculate reading time based on question text length (letters only, excluding spaces and punctuation)
  const questionTextLetters = (question.text || '').replace(/[^a-zA-Zа-яА-ЯёЁ]/g, '').length;
  // For questions with media (audio, video, youtube), use half the reading time
  const hasMedia = mediaType === 'audio' || mediaType === 'video' || mediaType === 'youtube';
  const calculatedReadingTime = readingTimePerLetter > 0
    ? (hasMedia ? questionTextLetters * readingTimePerLetter * 0.5 : questionTextLetters * readingTimePerLetter)
    : 0;

  // Minimum 1 second for reading timer, even if no letters or very short text
  const readingTime = Math.max(calculatedReadingTime, 1.0);

  // Find leading team for handicap
  const leadingTeamScore = teamScores.length > 0 ? Math.max(...teamScores.map(t => t.score)) : 0;

  // Timer states
  const [readingTimerRemaining, setReadingTimerRemaining] = useState(readingTime);
  const [responseTimerRemaining, setResponseTimerRemaining] = useState(0);
  const [handicapTimerRemaining, setHandicapTimerRemaining] = useState(0);
  const [timerPhase, setTimerPhase] = useState<'reading' | 'response' | 'complete'>('reading');

  // Media playback state
  const [isMediaPlaying, setIsMediaPlaying] = useState(false);
  const [isMediaPaused, setIsMediaPaused] = useState(false);
  const [waitingForFirstMediaPlay, setWaitingForFirstMediaPlay] = useState(false);
  const [isManuallyPaused, setIsManuallyPaused] = useState(false);
  const [showHint, setShowHint] = useState(false); // Local state for UI
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const youtubeRef = useRef<HTMLIFrameElement>(null);

  // Refs for current timer values to avoid stale closures in periodic updates
  const timerValuesRef = useRef({
    readingTimerRemaining,
    responseTimerRemaining,
    timerPhase,
    isManuallyPaused,
    readingTime,
    responseWindow
  });

  // Ref to track previous timer phase for detecting changes
  const prevTimerPhaseRef = useRef<typeof timerPhase>(timerPhase);

  // Update refs when values change
  useEffect(() => {
    timerValuesRef.current = {
      readingTimerRemaining,
      responseTimerRemaining,
      timerPhase,
      isManuallyPaused,
      readingTime,
      responseWindow
    };
  }, [readingTimerRemaining, responseTimerRemaining, timerPhase, isManuallyPaused, readingTime, responseWindow]);

  // Reset timers when question changes
  useEffect(() => {
    // Calculate reading time considering media files
    const hasMedia = mediaType === 'audio' || mediaType === 'video' || mediaType === 'youtube';
    const calculatedReadingTime = readingTimePerLetter > 0
      ? (hasMedia ? questionTextLetters * readingTimePerLetter * 0.5 : questionTextLetters * readingTimePerLetter)
      : 0;

    // Minimum 1 second for reading timer
    const newReadingTime = Math.max(calculatedReadingTime, 1.0);

    setReadingTimerRemaining(newReadingTime);
    setResponseTimerRemaining(responseWindow);
    setHandicapTimerRemaining(0);
    setTimerPhase(newReadingTime > 0 ? 'reading' : 'response');

    // If question has media, start with timer paused
    const shouldStartPaused = hasQuestionMedia;
    setWaitingForFirstMediaPlay(false);  // Don't wait for media play anymore
    setIsManuallyPaused(shouldStartPaused);
    setIsMediaPlaying(false);
    setIsMediaPaused(false);
    setShowHint(false);  // Reset local hint state
    // Reset hint state via parent callback
    onShowHint?.(false);

    console.log('🔄 Question reset - starting with pause:', shouldStartPaused);

    // Send initial timer state to demo screen - timer state depends on host
    const initialState = {
      active: true,  // Timer is active when question opens
      timerPhase: newReadingTime > 0 ? 'reading' : 'response',
      readingTimerRemaining: newReadingTime,
      responseTimerRemaining: responseWindow,
      handicapActive: false,
      handicapTeamId: undefined,
      isPaused: shouldStartPaused,  // Paused only if has media
      readingTimeTotal: newReadingTime,
      responseTimeTotal: responseWindow
    };

    console.log('🎬 Sending initial timer state to demo screen:', {
      readingTime: newReadingTime,
      responseTime: responseWindow,
      isPaused: shouldStartPaused,
      timerPhase: newReadingTime > 0 ? 'reading' : 'response',
      active: true,
      fullState: initialState
    });

    onBuzzerStateChange?.(initialState);
  }, [question.id, readingTime, questionTextLetters, readingTimePerLetter, responseWindow, mediaType, hasQuestionMedia, onBuzzerStateChange]);

  // Sync showHint with parent (demo screen)
  useEffect(() => {
    // Notify parent when showHint changes
    onShowHint?.(showHint);
  }, [showHint, onShowHint]);

  // Auto-show answer when correct answer is given
  useEffect(() => {
    if (scoreChangeType === 'correct' && !showAnswer && onShowAnswer) {
      console.log('✅ Correct answer given - auto-showing answer');
      onShowAnswer();
    }
  }, [scoreChangeType, showAnswer]); // Removed onShowAnswer from dependencies to prevent infinite re-renders

  // Single unified timer effect
  useEffect(() => {
    // Stop timer if answer shown
    if (showAnswer) {
      console.log('[QuestionModal] Answer shown - stopping timer and media');
      setTimerPhase('complete');
      setReadingTimerRemaining(0);
      setResponseTimerRemaining(0);
      setHandicapTimerRemaining(0);

      // Stop all media when answer is shown
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      // Pause YouTube if playing
      if (mediaType === 'youtube' && youtubeRef.current && (youtubeRef.current as any)._player) {
        try {
          const player = (youtubeRef.current as any)._player;
          if (player.pauseVideo) {
            player.pauseVideo();
          }
        } catch (e) {
          console.log('Failed to pause YouTube:', e);
        }
      }

      return;
    }

    // Don't run if complete
    if (timerPhase === 'complete') return;

    // Pause timer when manually paused - button is the only authority
    if (isManuallyPaused) {
      return; // Don't run timer when manually paused
    }

    // Reading phase timer
    if (timerPhase === 'reading') {
      const interval = setInterval(() => {
        setReadingTimerRemaining((prev: number) => {
          if (prev <= 0.1) {
            // Reading time done, move to response phase
            setTimerPhase('response');
            return 0;
          }
          return prev - 0.1;
        });
      }, 100);
      return () => clearInterval(interval);
    }

    // Response window timer - only runs if responseWindow > 0
    if (timerPhase === 'response' && responseWindow > 0) {
      const interval = setInterval(() => {
        setResponseTimerRemaining((prev: number) => {
          if (prev <= 0.1) {
            setTimerPhase('complete');
            setHandicapTimerRemaining(0);
            return 0;
          }
          return prev - 0.1;
        });
        // Also decrease handicap timer
        setHandicapTimerRemaining((prev: number) => {
          if (prev <= 0.1) return 0;
          return prev - 0.1;
        });
      }, 100);
      return () => clearInterval(interval);
    }
  }, [timerPhase, readingTime, responseWindow, showAnswer, handicapEnabled, handicapDelay, isManuallyPaused]);

  // NO periodic updates - demo screen handles countdown locally
  // Only send updates on important state changes

  // Immediately send state update when timer phase changes
  useEffect(() => {
    // Update ref with current phase
    prevTimerPhaseRef.current = timerPhase;

    if (showAnswer || timerPhase === 'complete') return;

    console.log('🔄 Timer phase changed:', timerPhase, '- sending immediate update with current values from ref');
    // Use current values from ref to avoid stale closure issues
    onBuzzerStateChange?.({
      active: true,
      timerPhase: timerPhase,
      readingTimerRemaining: Math.max(0, timerValuesRef.current.readingTimerRemaining),
      responseTimerRemaining: Math.max(0, timerValuesRef.current.responseTimerRemaining),
      handicapActive: false,
      handicapTeamId: undefined,
      isPaused: timerValuesRef.current.isManuallyPaused,
      readingTimeTotal: timerValuesRef.current.readingTime,
      responseTimeTotal: timerValuesRef.current.responseWindow
    });
  }, [timerPhase, showAnswer]); // Only depend on phase changes, use ref for current values

  // Calculate progress for timer visualization - each timer fills bar independently
  const timerProgress = (() => {
    if (timerPhase === 'reading') {
      // Reading Timer: from 0 to 100% based on readingTime
      if (readingTime > 0) {
        const elapsed = readingTime - readingTimerRemaining;
        return (elapsed / readingTime) * 100;
      }
      return 0;
    } else if (timerPhase === 'response') {
      // Response Timer: from 0 to 100% based on responseWindow
      if (responseWindow > 0) {
        const elapsed = responseWindow - responseTimerRemaining;
        return (elapsed / responseWindow) * 100;
      }
      return 100;
    }
    return 100;
  })();

  // Timer color based on phase
  const getTimerColor = () => {
    if (timerPhase === 'reading') return 'bg-yellow-500';
    if (timerPhase === 'response') return 'bg-green-500';
    return 'bg-gray-500';
  };

  // Modal positioned below player panel with margins
  const modalMaxHeight = 'calc(100vh - 140px)';
  const modalTop = '100px';

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '-') {
        onScoreChange('wrong');
      } else if (e.key === '=') {
        onScoreChange('correct');
      } else if (e.key === 'Backspace') {
        // Toggle manual timer pause
        e.preventDefault();
        setIsManuallyPaused(prev => {
          const newState = !prev;
          // If manually resuming timer, stop waiting for first media play
          if (!newState) {
            setWaitingForFirstMediaPlay(false);
            console.log('▶️ Timer manually resumed - no longer waiting for media');
          } else {
            console.log('⏸️ Timer manually paused');
          }
          return newState;
        });
      } else if (e.key === 'q' || e.key === 'Q' || e.key === 'й' || e.key === 'Й') {
        // Toggle QR code display (handle both English and Russian layout)
        e.preventDefault();
        // This will be handled by a parent component or global state
        window.dispatchEvent(new CustomEvent('toggle-qr-code'));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onScoreChange]);

  // Auto-play media when question opens
  useEffect(() => {
    if (hasQuestionMedia && !showAnswer) {
      console.log('🎬 Auto-playing media:', { mediaType, mediaUrl: mediaUrl?.slice(0, 50) });

      // Check if URL exists
      if (!mediaUrl || mediaUrl.length < 5) {
        console.log('⚠️ No media URL, skipping autoplay');
        return;
      }

      // Delay autoplay to ensure DOM is ready and media is loaded
      const autoplayDelay = setTimeout(async () => {
        // Auto-play video
        if (mediaType === 'video' && videoRef.current) {
          console.log('🎬 Attempting to auto-play video');
          videoRef.current.play().catch(err => {
            console.log('❌ Video auto-play failed:', err.name);
          });
        }
        // Auto-play audio
        if (mediaType === 'audio' && audioRef.current) {
          console.log('🎵 Attempting to auto-play audio');
          audioRef.current.play().catch(err => {
            console.log('❌ Audio auto-play failed:', err.name);
          });
        }
        // For YouTube, autoplay is handled via URL parameter (no extra action needed)
        if (mediaType === 'youtube') {
          console.log('📺 YouTube video with autoplay enabled via URL');
        }
      }, 500); // 500ms delay to ensure media is ready

      return () => clearTimeout(autoplayDelay);
    }
  }, [question.id, hasQuestionMedia, mediaType, showAnswer, mediaUrl]);

  // Media event handlers for video
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => {
      console.log('🎬 Video started playing');
      setIsMediaPlaying(true);
      setIsMediaPaused(false);
      // Unmute video after it starts playing (autoplay requires muted)
      if (video.muted) {
        video.muted = false;
      }
    };

    const handlePause = () => {
      console.log('⏸️ Video paused');
      setIsMediaPaused(true);
    };

    const handleEnded = () => {
      console.log('✅ Video ended - resuming timer');
      setIsMediaPlaying(false);
      setIsMediaPaused(false);
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
    };
  }, [timerPhase, readingTimerRemaining, responseTimerRemaining]);

  // Media event handlers for audio
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handlePlay = () => {
      console.log('🎵 Audio started playing');
      setIsMediaPlaying(true);
      setIsMediaPaused(false);
    };

    const handlePause = () => {
      console.log('⏸️ Audio paused');
      setIsMediaPaused(true);
    };

    const handleEnded = () => {
      console.log('✅ Audio ended');
      setIsMediaPlaying(false);
      setIsMediaPaused(false);
    };

    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [timerPhase, readingTimerRemaining, responseTimerRemaining]);

  // Reset media state when question changes
  useEffect(() => {
    setIsMediaPlaying(false);
    setIsMediaPaused(false);
  }, [question.id]);

  // YouTube playback tracking using YouTube IFrame Player API
  useEffect(() => {
    if (mediaType !== 'youtube') return;

    // Load YouTube IFrame API if not already loaded
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    }

    // Initialize player when API is ready
    const initializePlayer = () => {
      if (!youtubeRef.current) {
        console.error('❌ YouTube ref not available');
        return;
      }

      // Extract video ID from URL
      const videoId = extractYouTubeId(mediaUrl);
      if (!videoId) {
        console.error('❌ Could not extract YouTube video ID from URL:', mediaUrl);
        return;
      }

      console.log('🎬 Initializing YouTube player for video:', videoId);

      // Create new player
      const player = new window.YT.Player(youtubeRef.current, {
        videoId: videoId,
        playerVars: {
          autoplay: 1,
          controls: 1,
          enablejsapi: 1,
          origin: window.location.origin
        },
        events: {
          onReady: () => {
            console.log('✅ YouTube player ready');
          },
          onError: (event) => {
            console.error('❌ YouTube player error:', event.data);
          },
          onStateChange: (event) => {
            const state = event.data;
            console.log('🎬 YouTube player state changed:', state);

            // YouTube Player API states:
            // -1: unstarted
            // 0: ended
            // 1: playing
            // 2: paused
            // 3: buffering
            // 5: video cued

            if (state === window.YT.PlayerState.PLAYING) {
              setIsMediaPlaying(true);
              setIsMediaPaused(false);
              console.log('▶️ YouTube video started playing');
            } else if (state === window.YT.PlayerState.PAUSED) {
              setIsMediaPlaying(false);
              setIsMediaPaused(true);
              console.log('⏸️ YouTube video paused');
            } else if (state === window.YT.PlayerState.ENDED) {
              setIsMediaPlaying(false);
              setIsMediaPaused(false);
              console.log('🏁 YouTube video ended');
            } else if (state === window.YT.PlayerState.BUFFERING) {
              // Buffering - keep playing state
              console.log('⏳ YouTube video buffering');
            }
          }
        }
      });

      // Store player reference for cleanup
      (youtubeRef.current as any)._player = player;
    };

    // Wait for YouTube API to be ready
    if (window.YT && window.YT.Player) {
      // API already loaded, initialize immediately
      initializePlayer();
    } else {
      // API not loaded yet, wait for it
      console.log('⏳ Waiting for YouTube API to load...');
      window.onYouTubeIframeAPIReady = initializePlayer;
    }

    return () => {
      // Cleanup player
      if (youtubeRef.current && (youtubeRef.current as any)._player) {
        const player = (youtubeRef.current as any)._player;
        if (player.destroy) {
          console.log('🧹 Cleaning up YouTube player');
          player.destroy();
        }
      }
      window.onYouTubeIframeAPIReady = null;
    };
  }, [mediaType, question.id, mediaUrl]);

  // Helper function to extract YouTube video ID from URL
  const extractYouTubeId = (url: string): string | null => {
    if (!url) return null;

    // Match patterns:
    // youtube.com/watch?v=VIDEO_ID
    // youtu.be/VIDEO_ID
    // youtube.com/embed/VIDEO_ID
    // youtube.com/shorts/VIDEO_ID
    // Direct video ID (11 characters)
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([^&\n?#]+)/,
      /^([a-zA-Z0-9_-]{11})$/ // Direct video ID
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    return null;
  };

  // Calculate dynamic font sizes
  // Priority: Answer text > Hint text > Question text
  const currentQuestionText = showAnswer && question.answerText
    ? question.answerText
    : showHint && question.hint?.text
      ? question.hint.text
      : question.text;
  const questionFontSizeMobile = calculateQuestionFontSize(currentQuestionText, 3); // 3rem base for mobile
  const questionFontSizeDesktop = calculateQuestionFontSize(currentQuestionText, 5); // 5rem base for desktop

  // Calculate answer font sizes (independent of question font size)
  // Use hint answers if showing hint, otherwise use question answers
  const currentAnswers = showHint && question.hint?.answers
    ? question.hint.answers
    : question.answers;
  const currentCorrectAnswer = showHint && question.hint?.correctAnswer !== undefined
    ? question.hint.correctAnswer
    : question.correctAnswer;

  const answerFontSizes = currentAnswers?.map((answer) => ({
    mobile: calculateAnswerFontSizeMobile(answer),
    desktop: calculateAnswerFontSizeDesktop(answer)
  })) ?? [];

  return (
    <div className="fixed inset-0 z-[60] flex bg-black/80 backdrop-blur-sm animate-in fade-in duration-200 cursor-default modal-contained" style={{ paddingTop: modalTop, paddingBottom: '20px' }}>
      <style>{`
        @media (min-width: 768px) {
          [data-qm="true"] { font-size: ${questionFontSizeDesktop}rem !important; }
          ${currentAnswers?.map((_, idx) => `[data-am-idx="${idx}"] { font-size: ${answerFontSizes[idx]?.desktop || 3.5}rem !important; }`).join(' ')}
          ${currentAnswers?.map((_, idx) => `[data-am-idx-noimg="${idx}"] { font-size: ${answerFontSizes[idx]?.desktop || 3.5}rem !important; }`).join(' ')}
        }
      `}</style>
      <div
        className="w-[90vw] mx-auto bg-gray-900 border-2 border-blue-500 rounded-2xl shadow-2xl flex flex-col overflow-hidden cursor-default"
        style={{ maxHeight: modalMaxHeight, minHeight: '48vh' }}
      >
        {/* Question Section (2/3) */}
        <div className="flex-1 flex flex-col border-b border-gray-700 min-h-0">
          {/* Header - Round name, Theme name, Points and Timer */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3 flex items-center justify-between card-contained">
            <div className="flex items-center gap-3">
              {roundName && (
                <>
                  <div className="text-lg font-bold text-white">{roundName}</div>
                  <div className="text-white/50">—</div>
                </>
              )}
              <div className="text-lg font-bold text-white">{theme.name}</div>
              {timerPhase !== 'complete' && ((timerPhase === 'reading' && readingTimerRemaining > 0) || (timerPhase === 'response' && responseTimerRemaining > 0)) && (
                <div className="text-xl font-bold text-white flex items-center gap-2">
                  {timerPhase === 'reading' && (
                    <span className="text-yellow-300">{readingTimerRemaining.toFixed(1)}s</span>
                  )}
                  {timerPhase === 'response' && (
                    <span className="text-green-300">{responseTimerRemaining.toFixed(1)}s</span>
                  )}
                </div>
              )}
            </div>
            <div className="text-2xl font-black text-white">{points > 0 ? `+${points}` : points}</div>
          </div>

          {/* Timer bar - always visible but inactive when not timing */}
          <div className="relative">
            {/* Pause indicator - centered on the timer bar */}
            {isManuallyPaused && (
              <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 z-10">
                <div className="w-8 h-8 bg-white/90 rounded-full flex items-center justify-center shadow-lg">
                  <div className="flex gap-1">
                    <div className="w-1 h-3 bg-gray-800 rounded-sm" />
                    <div className="w-1 h-3 bg-gray-800 rounded-sm" />
                  </div>
                </div>
              </div>
            )}
            <div className="bg-gray-700 w-full overflow-hidden contain-layout" style={{ height: '16px' }}>
              {timerPhase !== 'complete' && ((timerPhase === 'reading' && readingTimerRemaining > 0) || (timerPhase === 'response' && responseTimerRemaining > 0)) ? (
                <div
                  className={`h-full transition-all duration-100 ease-linear ${getTimerColor()}`}
                  style={{ width: `${timerProgress}%` }}
                />
              ) : null}
            </div>
          </div>

          {/* Question content */}
          <div className="flex-1 flex items-center justify-center p-6 overflow-hidden contain-layout contain-paint">
            <div className={`w-full h-full flex ${
              (showAnswer ? hasAnswerMedia : (showHint && question.hint?.media ? true : hasQuestionMedia)) ? 'items-center justify-start' : 'items-center justify-center'
            }`}>
              {/* Media container on left - 50% width when media exists */}
              {(showAnswer ? hasAnswerMedia : (showHint && question.hint?.media ? true : hasQuestionMedia)) ? (
                <div className="w-1/2 h-full flex items-center justify-center p-4">
                  {showAnswer && question.answerMedia ? (
                    // Answer media
                    <>
                      {question.answerMedia.type === 'image' && (
                        <img
                          src={question.answerMedia.url}
                          alt="Answer media"
                          className="w-full h-auto object-contain rounded-lg shadow-xl"
                        />
                      )}
                      {question.answerMedia.type === 'video' && (
                        <video
                          src={question.answerMedia.url}
                          controls
                          className="w-full h-auto object-contain rounded-lg shadow-xl"
                        />
                      )}
                      {question.answerMedia.type === 'audio' && (
                        <div className="w-full flex flex-col items-center justify-center gap-3 bg-gray-800 rounded-lg p-4">
                          {/* Album art placeholder for answer media */}
                          <div className="w-20 h-20 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg flex items-center justify-center shadow-lg">
                            <Music className="w-10 h-10 text-white" />
                          </div>
                          <audio src={question.answerMedia.url} controls className="w-full" />
                        </div>
                      )}
                      {question.answerMedia.type === 'youtube' && (
                        <div className="w-full h-full flex items-center justify-center">
                          <iframe
                            src={question.answerMedia.url}
                            className="w-full h-full rounded-lg shadow-xl"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                            title="YouTube video"
                          />
                        </div>
                      )}
                    </>
                  ) : showHint && question.hint?.media ? (
                    // Hint media
                    <>
                      {question.hint.media.type === 'image' && (
                        <img
                          src={question.hint.media.url}
                          alt="Hint media"
                          className="w-full h-auto object-contain rounded-lg shadow-xl"
                        />
                      )}
                      {question.hint.media.type === 'video' && (
                        <video
                          src={question.hint.media.url}
                          controls
                          className="w-full h-auto object-contain rounded-lg shadow-xl"
                        />
                      )}
                      {question.hint.media.type === 'audio' && (
                        <div className="w-full flex flex-col items-center justify-center gap-3 bg-gray-800 rounded-lg p-4">
                          <div className="w-20 h-20 bg-gradient-to-br from-yellow-600 to-orange-600 rounded-lg flex items-center justify-center shadow-lg">
                            <Music className="w-10 h-10 text-white" />
                          </div>
                          <audio src={question.hint.media.url} controls className="w-full" />
                        </div>
                      )}
                      {question.hint.media.type === 'youtube' && (
                        <div className="w-full h-full flex items-center justify-center">
                          <iframe
                            src={question.hint.media.url}
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
                          ref={videoRef}
                          src={mediaUrl}
                          controls
                          autoPlay
                          muted
                          className="w-full h-auto object-contain rounded-lg shadow-xl"
                          onLoadedData={() => {
                            console.log('🎬 Video loaded, ready to play');
                          }}
                          onError={(e) => {
                            console.log('❌ Video failed to load:', (e.target as HTMLVideoElement).error);
                          }}
                        />
                      )}
                      {mediaType === 'audio' && (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-gray-800 rounded-lg p-6">
                          {/* Album art placeholder */}
                          <div className="w-32 h-32 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg flex items-center justify-center shadow-lg">
                            <Music className="w-16 h-16 text-white" />
                          </div>
                          {/* Audio player */}
                          <audio
                            ref={audioRef}
                            src={mediaUrl}
                            controls
                            autoPlay
                            className="w-full"
                            onLoadedData={() => {
                              console.log('🎵 Audio loaded, ready to play');
                            }}
                            onError={(e) => {
                              console.log('❌ Audio failed to load:', (e.target as HTMLAudioElement).error);
                            }}
                          />
                        </div>
                      )}
                      {mediaType === 'youtube' && (
                        <div className="w-full h-full flex items-center justify-center">
                          {/* YouTube Player API will replace this div */}
                          <div
                            ref={youtubeRef}
                            className="w-full h-full rounded-lg shadow-xl"
                          />
                        </div>
                      )}
                      {!mediaType && (
                        <div className="w-full h-full flex items-center justify-center bg-gray-800 rounded-lg p-4">
                          <p className="text-gray-400 text-sm">Media URL: {mediaUrl?.slice(0, 50)}...</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : null}

              {/* Right side: Question text container and answer options container */}
              {/* With image: 50% width each. Without image: 75% width total, centered */}
              {(showAnswer ? hasAnswerMedia : (showHint && question.hint?.media ? true : hasQuestionMedia)) ? (
                <div className="w-1/2 h-full flex flex-col p-4">
                  {/* Question text container */}
                  <div className={`flex flex-col items-center justify-center p-4 ${
                    currentAnswers && currentAnswers.length > 0 ? 'flex-[19]' : 'flex-[39]'
                  }`}>
                    <h2
                      key={`${showAnswer ? 'answer' : showHint ? 'hint' : 'question'}`}
                      className="font-bold text-white leading-[1.1] text-center"
                      style={{ fontSize: `${questionFontSizeMobile}rem` }}
                      data-qm="true"
                    >
                      {currentQuestionText}
                    </h2>
                  </div>

                  {/* Answer options container */}
                  {currentAnswers && currentAnswers.length > 0 && (
                    <div className="flex-[19] flex items-center justify-center p-4 list-item-contained">
                      <div className="w-full h-full flex flex-wrap items-center justify-center gap-4">
                        {currentAnswers.map((answer, idx) => (
                          <div
                            key={idx}
                            style={{
                              width: '45%',
                              height: '45%',
                              fontSize: `${answerFontSizes[idx]?.mobile || 2}rem`
                            }}
                            className={`rounded-lg border-4 flex items-center justify-center text-center font-semibold ${
                              ((showAnswer && idx === question.correctAnswer) || (showHint && idx === question.hint?.correctAnswer))
                                ? 'bg-green-500/30 border-green-500 text-green-300'
                                : 'bg-gray-800/50 border-gray-700 text-gray-400'
                            }`}
                            data-am-idx={idx}
                          >
                            {answer}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Without image: single centered container 75% width */
                <div className="w-3/4 h-full flex flex-col items-center justify-center p-4">
                  {/* Question text container */}
                  <div className={`w-full flex flex-col items-center justify-center p-4 ${
                    currentAnswers && currentAnswers.length > 0 ? 'flex-[19]' : 'flex-[39]'
                  }`}>
                    <h2
                      key={`${showAnswer ? 'answer' : showHint ? 'hint' : 'question'}`}
                      className="font-bold text-white leading-[1.1] text-center"
                      style={{ fontSize: `${questionFontSizeMobile}rem` }}
                      data-qm="true"
                    >
                      {currentQuestionText}
                    </h2>
                  </div>

                  {/* Answer options container */}
                  {currentAnswers && currentAnswers.length > 0 && (
                    <div className="w-full flex-[19] flex items-center justify-center p-4">
                      <div className="w-full h-full flex flex-wrap items-center justify-center gap-4">
                        {currentAnswers.map((answer, idx) => (
                          <div
                            key={idx}
                            style={{
                              width: '45%',
                              height: '45%',
                              fontSize: `${answerFontSizes[idx]?.mobile || 2}rem`
                            }}
                            className={`rounded-lg border-4 flex items-center justify-center text-center font-semibold ${
                              ((showAnswer && idx === question.correctAnswer) || (showHint && idx === question.hint?.correctAnswer))
                                ? 'bg-green-500/30 border-green-500 text-green-300'
                                : 'bg-gray-800/50 border-gray-700 text-gray-400'
                            }`}
                            data-am-idx-noimg={idx}
                          >
                            {answer}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Control Panel */}
        <div className="h-20 bg-gray-800 border-t border-gray-700 flex items-center justify-between px-6">
          {/* Left: Timer pause/play button */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                setIsManuallyPaused(prev => {
                  const newState = !prev;
                  // Notify parent about pause state change
                  if (onTimerPauseChange) {
                    onTimerPauseChange(newState);
                  }
                  // Immediately send buzzer state update to sync with demo screen
                  onBuzzerStateChange?.({
                    active: true, // Always active when question is open (regardless of pause)
                    timerPhase: timerPhase,
                    readingTimerRemaining: Math.max(0, readingTimerRemaining),
                    responseTimerRemaining: Math.max(0, responseTimerRemaining),
                    handicapActive: false,
                    handicapTeamId: undefined,
                    isPaused: newState,
                    readingTimeTotal: readingTime,
                    responseTimeTotal: responseWindow
                  });
                  return newState;
                });
              }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-semibold"
              title={isManuallyPaused ? "Продолжить таймер" : "Пауза таймера"}
            >
              {isManuallyPaused ? (
                <>
                  <Play className="w-5 h-5" />
                  <span>Старт</span>
                </>
              ) : (
                <>
                  <Pause className="w-5 h-5" />
                  <span>Пауза</span>
                </>
              )}
            </button>
          </div>

          {/* Center: Answer display */}
          <div className="flex-1 flex items-center justify-center px-6">
            <div className="text-xl font-bold text-white">
              Ответ: <span className="text-yellow-300">
                {question.answers && question.correctAnswer !== undefined
                  ? question.answers[question.correctAnswer]
                  : question.answerText || question.text}
              </span>
            </div>
          </div>

          {/* Right: Control buttons */}
          <div className="flex items-center gap-3">
            {/* Hint button - only show if question has hint and answer is not shown */}
            {question.hint && !showAnswer && (
              <button
                onClick={() => setShowHint(!showHint)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors font-semibold ${
                  showHint
                    ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                    : 'bg-gray-600 hover:bg-gray-700 text-white'
                }`}
                title={showHint ? "Скрыть подсказку" : "Показать подсказку"}
              >
                <Lightbulb className="w-5 h-5" />
                <span>Подсказка</span>
              </button>
            )}

            {/* Show Answer / Close button */}
            <button
              onClick={() => {
                console.log('[QuestionModal] Show Answer button clicked, current showAnswer:', showAnswer);
                if (showAnswer) {
                  console.log('[QuestionModal] Closing question modal');
                  _onClose();
                } else {
                  console.log('[QuestionModal] Calling onShowAnswer callback');
                  onShowAnswer?.();
                }
              }}
              className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors font-semibold"
              title={showAnswer ? "Закрыть (Escape)" : "Ответ (Space)"}
            >
              {showAnswer ? (
                <>
                  <X className="w-5 h-5" />
                  <span>Закрыть</span>
                </>
              ) : (
                <>
                  <SkipForward className="w-5 h-5" />
                  <span>Ответ</span>
                </>
              )}
            </button>

            {/* Correct answer button (=) */}
            <button
              onClick={() => onScoreChange('correct')}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors font-semibold"
              title="Верно (=)"
            >
              <Check className="w-5 h-5" />
              <span>Верно</span>
            </button>

            {/* Wrong answer button (-) */}
            <button
              onClick={() => onScoreChange('wrong')}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-semibold"
              title="Не верно (-)"
            >
              <X className="w-5 h-5" />
              <span>Не верно</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}, {
  strategy: 'selective',
  compareKeys: ['question.id', 'theme.id', 'showAnswer', 'buzzedTeamId'],
  enablePerfMonitoring: true,
  componentName: 'QuestionModal'
});
