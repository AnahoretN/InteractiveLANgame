/**
 * Media Readiness Verification System
 *
 * Enables host to verify media readiness on demo screen before displaying content.
 * Provides bidirectional communication for media status queries and responses.
 */

import type { P2PSMessage } from '../types';

export interface MediaReadinessQuery {
  mediaIds: string[];
  queryId: string;
  timeout?: number; // Timeout for response (ms)
}

export interface MediaReadinessResponse {
  queryId: string;
  readinessStatus: Record<string, boolean>; // mediaId -> isReady
  timestamp: number;
}

export interface MediaReadinessReport {
  mediaId: string;
  isReady: boolean;
  status?: 'pending' | 'downloading' | 'assembling' | 'completed' | 'error';
  progress?: number;
  url?: string;
}

/**
 * Media Readiness Verifier (Host Side)
 */
class MediaReadinessVerifier {
  private pendingQueries = new Map<string, {
    resolve: (response: MediaReadinessResponse) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>();
  private responseTimeout = 5000; // 5 seconds default

  /**
   * Query demo screen for media readiness
   */
  async queryMediaReadiness(
    mediaIds: string[],
    sendQuery: (query: P2PSMessage) => void,
    timeout?: number
  ): Promise<MediaReadinessResponse> {
    const queryId = `query_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const queryTimeout = timeout || this.responseTimeout;

    console.log(`[MediaReadinessVerifier] Querying readiness for ${mediaIds.length} media items`);

    return new Promise((resolve, reject) => {
      // Set up timeout
      const timeoutId = setTimeout(() => {
        this.pendingQueries.delete(queryId);
        reject(new Error(`Media readiness query timeout after ${queryTimeout}ms`));
      }, queryTimeout);

      // Store pending query
      this.pendingQueries.set(queryId, {
        resolve,
        reject,
        timeout: timeoutId
      });

      // Send query message
      sendQuery({
        id: queryId,
        category: 'sync' as const,
        timestamp: Date.now(),
        senderId: 'host',
        type: 'MEDIA_READINESS_QUERY',
        payload: {
          mediaIds,
          queryId,
          timeout: queryTimeout
        }
      });
    });
  }

  /**
   * Handle readiness response from demo screen
   */
  handleReadinessResponse(message: any): boolean {
    if (message.type !== 'MEDIA_READINESS_RESPONSE') {
      return false;
    }

    const { payload } = message;
    const pendingQuery = this.pendingQueries.get(payload.queryId);

    if (!pendingQuery) {
      console.warn(`[MediaReadinessVerifier] Received response for unknown query: ${payload.queryId}`);
      return true;
    }

    // Clear timeout
    clearTimeout(pendingQuery.timeout);

    // Resolve promise
    pendingQuery.resolve(payload);

    // Remove from pending queries
    this.pendingQueries.delete(payload.queryId);

    console.log(`[MediaReadinessVerifier] Received readiness response for query ${payload.queryId}`);

    return true;
  }

  /**
   * Query readiness for a single media item
   */
  async isMediaReady(
    mediaId: string,
    sendQuery: (query: P2PSMessage) => void,
    timeout?: number
  ): Promise<boolean> {
    const response = await this.queryMediaReadiness([mediaId], sendQuery, timeout);
    return response.readinessStatus[mediaId] || false;
  }

  /**
   * Query readiness for multiple media items with individual status
   */
  async getMediaReadinessReport(
    mediaIds: string[],
    sendQuery: (query: P2PSMessage) => void,
    timeout?: number
  ): Promise<MediaReadinessReport[]> {
    const response = await this.queryMediaReadiness(mediaIds, sendQuery, timeout);

    return mediaIds.map(mediaId => ({
      mediaId,
      isReady: response.readinessStatus[mediaId] || false
    }));
  }

  /**
   * Clear all pending queries
   */
  clear() {
    this.pendingQueries.forEach(({ timeout }) => clearTimeout(timeout));
    this.pendingQueries.clear();
  }
}

/**
 * Media Readiness Reporter (Demo Screen Side)
 */
class MediaReadinessReporter {
  private onSendResponse?: (response: P2PSMessage) => void;

  initialize(onSendResponse: (response: P2PSMessage) => void) {
    this.onSendResponse = onSendResponse;
    console.log('[MediaReadinessReporter] Initialized');
  }

  /**
   * Handle readiness query from host
   */
  handleReadinessQuery(message: any, checkReadiness: (mediaId: string) => boolean): boolean {
    if (message.type !== 'MEDIA_READINESS_QUERY') {
      return false;
    }

    const { payload } = message;
    console.log(`[MediaReadinessReporter] Received readiness query for ${payload.mediaIds.length} items`);

    // Check readiness for each media item
    const readinessStatus: Record<string, boolean> = {};
    payload.mediaIds.forEach((mediaId: string) => {
      readinessStatus[mediaId] = checkReadiness(mediaId);
    });

    // Send response
    if (this.onSendResponse) {
      this.onSendResponse({
        id: `response_${payload.queryId}`,
        category: 'sync' as const,
        timestamp: Date.now(),
        senderId: 'screen',
        type: 'MEDIA_READINESS_RESPONSE',
        payload: {
          queryId: payload.queryId,
          readinessStatus,
          timestamp: Date.now()
        }
      });

      console.log(`[MediaReadinessReporter] Sent readiness response for query ${payload.queryId}`);
    }

    return true;
  }

  /**
   * Proactively report media status (unsolicited)
   */
  reportMediaStatus(mediaIds: string[], getStatus: (mediaId: string) => MediaReadinessReport | null) {
    if (!this.onSendResponse) return;

    const reports = mediaIds
      .map(getStatus)
      .filter((report): report is MediaReadinessReport => report !== null);

    if (reports.length === 0) return;

    console.log(`[MediaReadinessReporter] Proactively reporting status for ${reports.length} media items`);

    this.onSendResponse({
      id: `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      category: 'sync' as const,
      timestamp: Date.now(),
      senderId: 'screen',
      type: 'MEDIA_STATUS_REPORT',
      payload: {
        reports,
        timestamp: Date.now()
      }
    } as any);
  }
}

/**
 * Media Readiness Monitor (High-level utility)
 */
class MediaReadinessMonitor {
  private mediaCache = new Set<string>();
  private onMediaReadyCallbacks = new Map<string, Set<(mediaId: string) => void>>();

  /**
   * Mark media as ready
   */
  markMediaReady(mediaId: string) {
    this.mediaCache.add(mediaId);

    // Trigger callbacks
    const callbacks = this.onMediaReadyCallbacks.get(mediaId);
    if (callbacks) {
      callbacks.forEach(callback => callback(mediaId));
      this.onMediaReadyCallbacks.delete(mediaId);
    }

    console.log(`[MediaReadinessMonitor] Media ready: ${mediaId}`);
  }

  /**
   * Check if media is ready
   */
  isMediaReady(mediaId: string): boolean {
    return this.mediaCache.has(mediaId);
  }

  /**
   * Wait for media to be ready
   */
  async waitForMediaReady(mediaId: string, timeout?: number): Promise<boolean> {
    if (this.isMediaReady(mediaId)) {
      return true;
    }

    return new Promise((resolve) => {
      const timeoutId = timeout ? setTimeout(() => {
        this.removeCallback(mediaId, callback);
        resolve(false);
      }, timeout) : undefined;

      const callback = (id: string) => {
        if (timeoutId) clearTimeout(timeoutId);
        resolve(id === mediaId);
      };

      this.addCallback(mediaId, callback);
    });
  }

  /**
   * Register callback for media ready event
   */
  private addCallback(mediaId: string, callback: (mediaId: string) => void) {
    if (!this.onMediaReadyCallbacks.has(mediaId)) {
      this.onMediaReadyCallbacks.set(mediaId, new Set());
    }
    this.onMediaReadyCallbacks.get(mediaId)!.add(callback);
  }

  /**
   * Remove callback
   */
  private removeCallback(mediaId: string, callback: (mediaId: string) => void) {
    const callbacks = this.onMediaReadyCallbacks.get(mediaId);
    if (callbacks) {
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        this.onMediaReadyCallbacks.delete(mediaId);
      }
    }
  }

  /**
   * Clear all cached media
   */
  clear() {
    this.mediaCache.clear();
    this.onMediaReadyCallbacks.clear();
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      totalReady: this.mediaCache.size,
      pendingCallbacks: this.onMediaReadyCallbacks.size
    };
  }
}

// Singleton instances
export const mediaReadinessVerifier = new MediaReadinessVerifier();
export const mediaReadinessReporter = new MediaReadinessReporter();
export const mediaReadinessMonitor = new MediaReadinessMonitor();

// Export classes for testing/custom instances
export { MediaReadinessVerifier, MediaReadinessReporter, MediaReadinessMonitor };