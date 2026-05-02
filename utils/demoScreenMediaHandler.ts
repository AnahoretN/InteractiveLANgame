/**
 * Demo Screen Media Handler
 *
 * Handles receiving and processing media files on the demo screen side.
 * Simplified version - only handles direct MEDIA_TRANSFER (no chunking).
 * Includes IndexedDB persistence for media files.
 */

import { base64ToBlobUrl } from './mediaStream';
import { saveMediaFile } from './mediaManager';
import type { P2PSMessage } from '../types';

export interface MediaDownloadProgress {
  mediaId: string;
  status: 'pending' | 'transferring' | 'completed' | 'error';
  progress: number; // 0-100
  url?: string;
  error?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'youtube';
  isYouTube?: boolean;
}

class DemoScreenMediaHandler {
  private downloadProgress = new Map<string, MediaDownloadProgress>();
  private onProgressUpdate?: (updates: MediaDownloadProgress[]) => void;
  private mediaCache = new Map<string, string>(); // mediaId -> blob URL

  initialize(onProgressUpdate?: (updates: MediaDownloadProgress[]) => void) {
    this.onProgressUpdate = onProgressUpdate;
    console.log('[DemoScreenMediaHandler] Initialized');

    // Initialize global cache if not exists
    if (!window.mediaTransferCache) {
      window.mediaTransferCache = new Map();
    }
  }

  /**
   * Handle incoming media message
   */
  handleMediaMessage(message: P2PSMessage): boolean {
    switch (message.type) {
      case 'MEDIA_TRANSFER':
        this.handleMediaTransfer(message);
        return true;

      default:
        return false;
    }
  }

  /**
   * Handle regular media transfer
   */
  private async handleMediaTransfer(message: any) {
    const { payload } = message;
    console.log('[DemoScreenMediaHandler] Media transfer received:', payload.mediaId);

    const progress: MediaDownloadProgress = {
      mediaId: payload.mediaId,
      status: 'completed',
      progress: 100,
      mediaType: payload.mediaType,
      isYouTube: payload.isYouTube
    };

    if (payload.isYouTube && payload.url) {
      // YouTube links - store directly
      progress.url = payload.url;
      this.mediaCache.set(payload.mediaId, payload.url);

      this.storeInGlobalCache(payload.mediaId, {
        type: payload.mediaType,
        url: payload.url,
        isYouTube: true
      });

    } else if (payload.fileData && payload.fileType) {
      // Local files - convert to blob URL and save to IndexedDB
      try {
        const blobUrl = base64ToBlobUrl(payload.fileData, payload.fileType);
        progress.url = blobUrl;
        this.mediaCache.set(payload.mediaId, blobUrl);

        // Save to IndexedDB for persistence
        try {
          // Convert base64 back to blob for IndexedDB storage
          const byteCharacters = atob(payload.fileData);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: payload.fileType });

          // Create a File object from the blob
          const file = new File([blob], payload.fileName || 'media', { type: payload.fileType });

          // Save to IndexedDB using the mediaId as both packId and mediaId
          await saveMediaFile(payload.mediaId, payload.mediaId, file);
          console.log('[DemoScreenMediaHandler] Media file saved to IndexedDB:', payload.mediaId);
        } catch (idbError) {
          console.warn('[DemoScreenMediaHandler] Could not save to IndexedDB:', idbError);
          // Continue anyway - we have the blob URL in memory
        }

        this.storeInGlobalCache(payload.mediaId, {
          type: payload.mediaType,
          url: null,
          fileData: payload.fileData,
          fileType: payload.fileType,
          isYouTube: false
        });

        console.log('[DemoScreenMediaHandler] Local file processed:', payload.mediaId);
      } catch (error) {
        console.error('[DemoScreenMediaHandler] Error processing local file:', error);
        progress.status = 'error';
        progress.error = error instanceof Error ? error.message : 'Unknown error';
      }

    } else if (payload.url) {
      // External URLs
      progress.url = payload.url;
      this.mediaCache.set(payload.mediaId, payload.url);

      this.storeInGlobalCache(payload.mediaId, {
        type: payload.mediaType,
        url: payload.url,
        isYouTube: false
      });
    }

    this.downloadProgress.set(payload.mediaId, progress);
    this.notifyProgressUpdate();
  }

  /**
   * Store media in global cache for compatibility
   */
  private storeInGlobalCache(mediaId: string, mediaInfo: any) {
    if (!window.mediaTransferCache) {
      window.mediaTransferCache = new Map();
    }
    window.mediaTransferCache.set(mediaId, mediaInfo);
  }

  /**
   * Notify progress update callback
   */
  private notifyProgressUpdate() {
    if (this.onProgressUpdate) {
      const updates = Array.from(this.downloadProgress.values());
      this.onProgressUpdate(updates);
    }
  }

  /**
   * Get all download progress
   */
  getDownloadProgress(): MediaDownloadProgress[] {
    return Array.from(this.downloadProgress.values());
  }

  /**
   * Get progress for specific media
   */
  getMediaProgress(mediaId: string): MediaDownloadProgress | undefined {
    return this.downloadProgress.get(mediaId);
  }

  /**
   * Get cached media URL
   */
  getMediaUrl(mediaId: string): string | undefined {
    return this.mediaCache.get(mediaId);
  }

  /**
   * Check if media is ready (downloaded and cached)
   */
  isMediaReady(mediaId: string): boolean {
    const progress = this.downloadProgress.get(mediaId);
    return progress?.status === 'completed' && this.mediaCache.has(mediaId);
  }

  /**
   * Clear all cache
   */
  clear() {
    this.downloadProgress.clear();
    this.mediaCache.clear();
    console.log('[DemoScreenMediaHandler] Cleared all cache');
  }

  /**
   * Get media readiness statistics
   */
  getMediaStats(): {
    total: number;
    completed: number;
    transferring: number;
    errors: number;
    completionRate: number;
  } {
    const progress = Array.from(this.downloadProgress.values());

    const total = progress.length;
    const completed = progress.filter(p => p.status === 'completed').length;
    const transferring = progress.filter(p => p.status === 'transferring').length;
    const errors = progress.filter(p => p.status === 'error').length;
    const completionRate = total > 0 ? (completed / total) * 100 : 0;

    return {
      total,
      completed,
      downloading,
      errors,
      completionRate
    };
  }
}

// Singleton instance
export const demoScreenMediaHandler = new DemoScreenMediaHandler();

// Export class for testing/custom instances
export { DemoScreenMediaHandler };