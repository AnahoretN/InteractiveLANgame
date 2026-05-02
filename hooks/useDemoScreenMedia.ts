/**
 * useDemoScreenMedia Hook
 *
 * Manages media cache and processing for demo screen
 * Handles media transfers from host via P2P
 */

import { useCallback, useRef } from 'react';
import { processMediaTransfer } from '../utils/mediaStream';
import { demoScreenMediaHandler } from '../utils/demoScreenMediaHandler';
import type { P2PSMessage } from '../types';

export interface MediaCacheItem {
  type: 'image' | 'video' | 'audio' | 'youtube';
  url: string | null;
  fileData?: string;
  fileType?: string;
  isYouTube: boolean;
}

export interface ActiveQuestion {
  text: string;
  media?: {
    url?: string;
    type?: 'image' | 'video' | 'audio' | 'youtube';
  };
  answer?: string;
  answerMedia?: {
    url?: string;
    type?: 'image' | 'video' | 'audio' | 'youtube';
  };
  points: number;
  themeName: string;
  roundName?: string;
  questionId?: string;
}

export function useDemoScreenMedia() {
  // Media cache is stored globally on window for cross-component access
  const getMediaCache = useCallback((): Map<string, MediaCacheItem> => {
    if (!window.mediaTransferCache) {
      window.mediaTransferCache = new Map();
    }
    return window.mediaTransferCache;
  }, []);

  /**
   * Process a media transfer message and cache the media
   */
  const processMediaMessage = useCallback((message: P2PSMessage) => {
    const payload = message.payload;

    if (message.type === 'MEDIA_TRANSFER' || message.payload?.type === 'MEDIA_TRANSFER') {
      const mediaPayload = message.payload?.type === 'MEDIA_TRANSFER' ? message.payload : payload;

      console.log('[useDemoScreenMedia] Processing media transfer:', mediaPayload);

      const cache = getMediaCache();

      if (mediaPayload.isYouTube && mediaPayload.url) {
        // YouTube links - store directly
        console.log('[useDemoScreenMedia] Caching YouTube URL:', mediaPayload.url);
        cache.set(mediaPayload.mediaId, {
          type: mediaPayload.mediaType,
          url: mediaPayload.url,
          isYouTube: true
        });
      } else if (mediaPayload.fileData && mediaPayload.fileType) {
        // Local files transferred as base64
        console.log('[useDemoScreenMedia] Caching local file:', mediaPayload.fileName);
        cache.set(mediaPayload.mediaId, {
          type: mediaPayload.mediaType,
          url: null,
          fileData: mediaPayload.fileData,
          fileType: mediaPayload.fileType,
          isYouTube: false
        });
      } else if (mediaPayload.url) {
        // External URLs
        console.log('[useDemoScreenMedia] Caching external URL:', mediaPayload.url);
        cache.set(mediaPayload.mediaId, {
          type: mediaPayload.mediaType,
          url: mediaPayload.url,
          isYouTube: false
        });
      }
    } else if (
      message.type === 'MEDIA_CHUNK_METADATA' ||
      message.type === 'MEDIA_CHUNK' ||
      message.type === 'MEDIA_CHUNK_COMPLETE' ||
      message.type === 'MEDIA_PROGRESS'
    ) {
      // Handle chunked media transfer messages
      demoScreenMediaHandler.handleMediaMessage(message);
    }
  }, [getMediaCache]);

  /**
   * Apply cached media URLs to an active question
   * This ensures media URLs from MEDIA_TRANSFER messages are preserved
   */
  const applyCachedMedia = useCallback((
    question: ActiveQuestion | undefined
  ): ActiveQuestion | undefined => {
    if (!question?.media?.url) return question;

    const cache = getMediaCache();
    const questionMediaId = `question_${question.questionId || question.id || 'current'}_media`;
    const cachedMedia = cache.get(questionMediaId);

    if (cachedMedia) {
      console.log('[useDemoScreenMedia] Applying cached media:', questionMediaId);

      let updatedQuestion = { ...question };

      if (cachedMedia.url) {
        // For YouTube and external URLs, use directly
        updatedQuestion = {
          ...updatedQuestion,
          media: {
            ...updatedQuestion.media,
            url: cachedMedia.url
          }
        };
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
              fileData: cachedMedia.fileData
            }
          });

          if (blobUrl) {
            updatedQuestion = {
              ...updatedQuestion,
              media: {
                ...updatedQuestion.media,
                url: blobUrl
              }
            };
          }
        } catch (error) {
          console.error('[useDemoScreenMedia] Error processing cached media:', error);
        }
      }

      // Also check for answer media
      if (question.answerMedia?.url) {
        const answerMediaId = `question_${question.questionId || question.id || 'current'}_answer_media`;
        const cachedAnswerMedia = cache.get(answerMediaId);

        if (cachedAnswerMedia?.url) {
          updatedQuestion = {
            ...updatedQuestion,
            answerMedia: {
              ...updatedQuestion.answerMedia!,
              url: cachedAnswerMedia.url
            }
          };
        }
      }

      return updatedQuestion;
    }

    return question;
  }, [getMediaCache]);

  /**
   * Clear media cache for a specific question
   */
  const clearQuestionMedia = useCallback((questionId: string) => {
    const cache = getMediaCache();
    const questionMediaId = `question_${questionId}_media`;
    const answerMediaId = `question_${questionId}_answer_media`;

    cache.delete(questionMediaId);
    cache.delete(answerMediaId);

    console.log('[useDemoScreenMedia] Cleared media cache for question:', questionId);
  }, [getMediaCache]);

  /**
   * Get cached media item by ID
   */
  const getCachedMedia = useCallback((mediaId: string): MediaCacheItem | undefined => {
    const cache = getMediaCache();
    return cache.get(mediaId);
  }, [getMediaCache]);

  /**
   * Clear all media cache
   */
  const clearAllMedia = useCallback(() => {
    const cache = getMediaCache();
    cache.clear();
    console.log('[useDemoScreenMedia] Cleared all media cache');
  }, [getMediaCache]);

  return {
    processMediaMessage,
    applyCachedMedia,
    clearQuestionMedia,
    getCachedMedia,
    clearAllMedia
  };
}
