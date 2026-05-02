/**
 * Enhanced Media Streamer Component
 *
 * Manages streaming media files from host to demo screen via P2P.
 * Handles local files, YouTube links, and external URLs with background preloading.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { createMediaInfo, createMediaTransferMessage, needsMediaTransfer } from '../../../utils/mediaStream';
import { backgroundMediaPreloader, type TransferProgress } from '../../../utils/backgroundMediaPreloader';
import type { MediaTransferMessage } from '../../../types';
import { getMediaFile } from '../../../utils/mediaManager';

interface EnhancedMediaStreamerProps {
  activeQuestion: {
    question: {
      id: string;
      media?: {
        type: string;
        url?: string;
        localFile?: {
          mediaId?: string;
        };
      };
      answerMedia?: {
        type: string;
        url?: string;
        localFile?: {
          mediaId?: string;
        };
      };
    };
  } | null;
  gamePack?: any; // Current game pack for background preloading
  onBroadcastMessage?: (message: MediaTransferMessage) => void;
  hostId: string;
  enablePreloading?: boolean;
  onProgressUpdate?: (progress: TransferProgress[]) => void;
}

export const EnhancedMediaStreamer = ({
  activeQuestion,
  gamePack,
  onBroadcastMessage,
  hostId,
  enablePreloading = true,
  onProgressUpdate
}: EnhancedMediaStreamerProps) => {
  const transferredMediaIdsRef = useRef<Set<string>>(new Set());
  const isInitializedRef = useRef(false);
  const [preloadStatus, setPreloadStatus] = useState<'idle' | 'loading' | 'completed' | 'error'>('idle');

  // Initialize background preloader
  useEffect(() => {
    if (!onBroadcastMessage || !hostId || isInitializedRef.current) return;

    backgroundMediaPreloader.initialize(
      onBroadcastMessage,
      hostId,
      (progress) => {
        // Notify parent component of progress updates
        if (onProgressUpdate) {
          onProgressUpdate(progress);
        }
      }
    );

    isInitializedRef.current = true;
    console.log('[EnhancedMediaStreamer] Background preloader initialized');
  }, [onBroadcastMessage, hostId, onProgressUpdate]);

  // Extract and preload media from game pack
  useEffect(() => {
    if (!gamePack || !enablePreloading) return;

    const mediaItems = backgroundMediaPreloader.constructor.extractMediaFromPack(gamePack);

    if (mediaItems.length === 0) {
      console.log('[EnhancedMediaStreamer] No media items to preload');
      setPreloadStatus('completed');
      return;
    }

    console.log(`[EnhancedMediaStreamer] Starting background preload of ${mediaItems.length} media items`);
    setPreloadStatus('loading');

    backgroundMediaPreloader.addMediaItems(mediaItems);

    // Check preload completion periodically
    const checkInterval = setInterval(() => {
      const progress = backgroundMediaPreloader.getTransferProgress();
      const completed = progress.filter(p => p.status === 'completed').length;

      if (completed === mediaItems.length) {
        setPreloadStatus('completed');
        clearInterval(checkInterval);
        console.log('[EnhancedMediaStreamer] All media preloaded successfully');
      }
    }, 1000);

    return () => clearInterval(checkInterval);
  }, [gamePack, enablePreloading]);

  // Handle immediate media transfer for active question
  useEffect(() => {
    const streamActiveMedia = async () => {
      if (!activeQuestion || !onBroadcastMessage) return;

      const question = activeQuestion.question;

      // Check question media
      if (question.media?.url) {
        const mediaId = `question_${question.id}_media`;

        // Check if already preloaded
        if (backgroundMediaPreloader.isMediaReady(mediaId)) {
          console.log('[EnhancedMediaStreamer] Question media already preloaded:', mediaId);
        } else {
          // Transfer immediately with highest priority
          backgroundMediaPreloader.addMediaItem({
            mediaId,
            url: question.media.url,
            localFile: question.media.localFile,
            priority: 0, // Highest priority
            questionId: question.id,
            mediaType: 'question'
          }, true); // immediate = true
        }

        transferredMediaIdsRef.current.add(mediaId);
      }

      // Check answer media
      if (question.answerMedia?.url) {
        const mediaId = `question_${question.id}_answer_media`;

        if (backgroundMediaPreloader.isMediaReady(mediaId)) {
          console.log('[EnhancedMediaStreamer] Answer media already preloaded:', mediaId);
        } else {
          backgroundMediaPreloader.addMediaItem({
            mediaId,
            url: question.answerMedia.url,
            localFile: question.answerMedia.localFile,
            priority: 0,
            questionId: question.id,
            mediaType: 'answer'
          }, true);
        }

        transferredMediaIdsRef.current.add(mediaId);
      }
    };

    streamActiveMedia();
  }, [activeQuestion?.question.id, onBroadcastMessage]);

  // Clean up transferred media IDs when question changes
  useEffect(() => {
    if (!activeQuestion) {
      transferredMediaIdsRef.current.clear();
    }
  }, [activeQuestion]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('[EnhancedMediaStreamer] Cleaning up');
      backgroundMediaPreloader.clear();
    };
  }, []);

  return null; // This component doesn't render anything
};

/**
 * Hook to access background preloader status
 */
export function useMediaPreloader() {
  const [progress, setProgress] = useState<TransferProgress[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'completed' | 'error'>('idle');

  const refreshProgress = useCallback(() => {
    const currentProgress = backgroundMediaPreloader.getTransferProgress();
    setProgress(currentProgress);

    const total = currentProgress.length;
    const completed = currentProgress.filter(p => p.status === 'completed').length;
    const errors = currentProgress.filter(p => p.status === 'error').length;

    if (total === 0) {
      setStatus('idle');
    } else if (errors > 0) {
      setStatus('error');
    } else if (completed === total) {
      setStatus('completed');
    } else {
      setStatus('loading');
    }
  }, []);

  return {
    progress,
    status,
    refreshProgress,
    isMediaReady: backgroundMediaPreloader.isMediaReady.bind(backgroundMediaPreloader),
    getMediaProgress: backgroundMediaPreloader.getMediaProgress.bind(backgroundMediaPreloader)
  };
}