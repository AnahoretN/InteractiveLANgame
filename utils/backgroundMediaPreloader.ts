/**
 * Background Media Preloader
 *
 * Handles progressive background transfer of media files from host to demo screen.
 * Simplified version - only handles direct media transfer (no chunking).
 */

import { createMediaInfo, createMediaTransferMessage, needsMediaTransfer } from './mediaStream';
import { getMediaFile } from './mediaManager';
import type { MediaTransferMessage } from '../types';

export interface MediaItem {
  mediaId: string;
  url: string;
  localFile?: {
    mediaId?: string;
  };
  priority: number; // Lower = higher priority (0 = highest)
  questionId?: string;
  mediaType: 'question' | 'answer' | 'cover' | 'round';
}

export interface TransferProgress {
  mediaId: string;
  total: number;
  transferred: number;
  percentage: number;
  status: 'pending' | 'transferring' | 'completed' | 'error';
  error?: string;
}

export interface PreloaderConfig {
  enabled: boolean;
  maxConcurrentTransfers: number;
  priorityThreshold: number; // Priority level for immediate transfer
  transferDelay: number; // Delay between transfers (ms)
}

const DEFAULT_CONFIG: PreloaderConfig = {
  enabled: true,
  maxConcurrentTransfers: 2,
  priorityThreshold: 5, // Priority level for immediate transfer
  transferDelay: 100 // Delay between transfers
};

class BackgroundMediaPreloader {
  private config: PreloaderConfig;
  private mediaQueue: MediaItem[] = [];
  private activeTransfers = new Set<string>();
  private transferProgress = new Map<string, TransferProgress>();
  private completedTransfers = new Set<string>();
  private isProcessing = false;
  private onBroadcastMessage?: (message: MediaTransferMessage) => void;
  private onProgressUpdate?: (progress: TransferProgress[]) => void;
  private hostId = '';

  constructor(config: Partial<PreloaderConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the preloader with broadcast callback
   */
  initialize(
    onBroadcastMessage: (message: MediaTransferMessage) => void,
    hostId: string,
    onProgressUpdate?: (progress: TransferProgress[]) => void
  ) {
    this.onBroadcastMessage = onBroadcastMessage;
    this.hostId = hostId;
    this.onProgressUpdate = onProgressUpdate;
    console.log('[BackgroundMediaPreloader] Initialized');
  }

  /**
   * Add media items to the preload queue
   */
  addMediaItems(items: MediaItem[]) {
    if (!this.config.enabled) {
      console.log('[BackgroundMediaPreloader] Disabled, skipping media preload');
      return;
    }

    const newItems = items.filter(item =>
      !this.completedTransfers.has(item.mediaId) &&
      !this.mediaQueue.some(q => q.mediaId === item.mediaId)
    );

    if (newItems.length === 0) {
      console.log('[BackgroundMediaPreloader] No new media items to add');
      return;
    }

    this.mediaQueue.push(...newItems);

    // Sort by priority (lower number = higher priority)
    this.mediaQueue.sort((a, b) => a.priority - b.priority);

    console.log(`[BackgroundMediaPreloader] Added ${newItems.length} media items to queue. Total: ${this.mediaQueue.length}`);

    // Initialize progress tracking
    newItems.forEach(item => {
      this.transferProgress.set(item.mediaId, {
        mediaId: item.mediaId,
        total: 0,
        transferred: 0,
        percentage: 0,
        status: 'pending'
      });
    });

    this.notifyProgressUpdate();
    this.processQueue();
  }

  /**
   * Add a single media item with immediate transfer if high priority
   */
  addMediaItem(item: MediaItem, immediate = false) {
    if (!this.config.enabled) return;

    // Check if already processed
    if (this.completedTransfers.has(item.mediaId)) {
      console.log(`[BackgroundMediaPreloader] Media ${item.mediaId} already transferred`);
      return;
    }

    if (immediate || item.priority <= this.config.priorityThreshold) {
      console.log(`[BackgroundMediaPreloader] Immediate transfer requested for ${item.mediaId}`);
      this.transferMedia(item);
    } else {
      this.addMediaItems([item]);
    }
  }

  /**
   * Process the media queue
   */
  private async processQueue() {
    if (this.isProcessing) return;
    if (this.activeTransfers.size >= this.config.maxConcurrentTransfers) {
      console.log('[BackgroundMediaPreloader] Max concurrent transfers reached');
      return;
    }
    if (this.mediaQueue.length === 0) {
      console.log('[BackgroundMediaPreloader] Queue is empty');
      return;
    }

    this.isProcessing = true;

    while (this.mediaQueue.length > 0 &&
           this.activeTransfers.size < this.config.maxConcurrentTransfers) {
      const item = this.mediaQueue.shift();
      if (item && !this.completedTransfers.has(item.mediaId)) {
        this.transferMedia(item);
      }
    }

    this.isProcessing = false;
  }

  /**
   * Transfer a single media item
   */
  private async transferMedia(item: MediaItem) {
    if (!this.onBroadcastMessage) {
      console.error('[BackgroundMediaPreloader] No broadcast callback configured');
      return;
    }

    this.activeTransfers.add(item.mediaId);

    const progress = this.transferProgress.get(item.mediaId);
    if (progress) {
      progress.status = 'transferring';
      this.notifyProgressUpdate();
    }

    console.log(`[BackgroundMediaPreloader] Transferring media: ${item.mediaId}`);

    try {
      // Get file from IndexedDB if it's a local file
      let file: File | null = null;
      if (item.localFile?.mediaId && needsMediaTransfer(item.url)) {
        file = await getMediaFile(item.localFile.mediaId);
      }

      // Create media info and transfer message
      const mediaInfo = await createMediaInfo(item.mediaId, item.url, file || undefined);
      const transferMessage = createMediaTransferMessage(mediaInfo, this.hostId);

      // Direct transfer (no chunking)
      this.onBroadcastMessage(transferMessage);
      this.completeTransfer(item.mediaId);

      console.log(`[BackgroundMediaPreloader] Successfully transferred: ${item.mediaId}`);

    } catch (error) {
      console.error(`[BackgroundMediaPreloader] Error transferring ${item.mediaId}:`, error);

      if (progress) {
        progress.status = 'error';
        progress.error = error instanceof Error ? error.message : 'Unknown error';
        this.notifyProgressUpdate();
      }
    } finally {
      this.activeTransfers.delete(item.mediaId);

      // Process next items after delay
      setTimeout(() => {
        this.processQueue();
      }, this.config.transferDelay);
    }
  }

  /**
   * Mark transfer as completed
   */
  private completeTransfer(mediaId: string) {
    this.completedTransfers.add(mediaId);

    const progress = this.transferProgress.get(mediaId);
    if (progress) {
      progress.status = 'completed';
      progress.percentage = 100;
      this.notifyProgressUpdate();
    }
  }

  /**
   * Notify progress update callback
   */
  private notifyProgressUpdate() {
    if (this.onProgressUpdate) {
      const progressArray = Array.from(this.transferProgress.values());
      this.onProgressUpdate(progressArray);
    }
  }

  /**
   * Get current transfer progress
   */
  getTransferProgress(): TransferProgress[] {
    return Array.from(this.transferProgress.values());
  }

  /**
   * Get progress for specific media item
   */
  getMediaProgress(mediaId: string): TransferProgress | undefined {
    return this.transferProgress.get(mediaId);
  }

  /**
   * Check if media is ready (transferred)
   */
  isMediaReady(mediaId: string): boolean {
    return this.completedTransfers.has(mediaId);
  }

  /**
   * Clear all state (for new game/session)
   */
  clear() {
    this.mediaQueue = [];
    this.activeTransfers.clear();
    this.transferProgress.clear();
    this.completedTransfers.clear();
    this.isProcessing = false;
    console.log('[BackgroundMediaPreloader] Cleared all state');
  }

  /**
   * Pause preloading
   */
  pause() {
    this.config.enabled = false;
    console.log('[BackgroundMediaPreloader] Paused');
  }

  /**
   * Resume preloading
   */
  resume() {
    this.config.enabled = true;
    console.log('[BackgroundMediaPreloader] Resumed');
    this.processQueue();
  }

  /**
   * Extract all media from game pack for preloading
   */
  static extractMediaFromPack(pack: any): MediaItem[] {
    const mediaItems: MediaItem[] = [];
    let priority = 0;

    // Pack cover (highest priority)
    if (pack.cover?.localFile?.mediaId) {
      mediaItems.push({
        mediaId: `pack_cover`,
        url: pack.cover.value,
        localFile: pack.cover.localFile,
        priority: priority++,
        mediaType: 'cover'
      });
    }

    // Rounds and their media
    pack.rounds?.forEach((round: any, roundIndex: number) => {
      // Round cover
      if (round.cover?.localFile?.mediaId) {
        mediaItems.push({
          mediaId: `round_${round.id}_cover`,
          url: round.cover.value,
          localFile: round.cover.localFile,
          priority: priority++,
          mediaType: 'round'
        });
      }

      // Questions and their media
      round.themes?.forEach((theme: any) => {
        theme.questions?.forEach((question: any) => {
          // Question media
          if (question.media?.localFile?.mediaId) {
            mediaItems.push({
              mediaId: `question_${question.id}_media`,
              url: question.media.url,
              localFile: question.media.localFile,
              priority: priority++,
              questionId: question.id,
              mediaType: 'question'
            });
          }

          // Answer media
          if (question.answerMedia?.localFile?.mediaId) {
            mediaItems.push({
              mediaId: `question_${question.id}_answer_media`,
              url: question.answerMedia.url,
              localFile: question.answerMedia.localFile,
              priority: priority++,
              questionId: question.id,
              mediaType: 'answer'
            });
          }
        });
      });
    });

    return mediaItems;
  }
}

// Singleton instance
export const backgroundMediaPreloader = new BackgroundMediaPreloader();

// Export class for testing/custom instances
export { BackgroundMediaPreloader };