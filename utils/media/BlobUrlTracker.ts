/**
 * Blob URL Tracker
 *
 * Prevents memory leaks from unreleased blob URLs
 * Tracks and automatically cleans up blob URLs
 */

export interface BlobUrlTrackerStats {
  trackedUrls: number;
  urls: string[];
}

export interface BlobUrlTrackerOptions {
  maxUrls?: number;  // Maximum URLs to track
}

export class BlobUrlTracker {
  private blobUrls = new Set<string>();
  private readonly maxUrls: number;

  constructor(options: BlobUrlTrackerOptions = {}) {
    this.maxUrls = options.maxUrls ?? 100;
  }

  /**
   * Track a blob URL for later cleanup
   */
  track(url: string): void {
    if (url && url.startsWith('blob:')) {
      this.blobUrls.add(url);

      if (this.blobUrls.size > this.maxUrls) {
        const urlsToRevoke = Array.from(this.blobUrls).slice(0, this.maxUrls / 2);
        urlsToRevoke.forEach(url => this.revoke(url));
      }
    }
  }

  /**
   * Revoke a specific blob URL
   */
  revoke(url: string): void {
    if (this.blobUrls.has(url)) {
      try {
        URL.revokeObjectURL(url);
        this.blobUrls.delete(url);
      } catch (error) {
        console.warn('[BlobUrlTracker] Failed to revoke URL:', url, error);
      }
    }
  }

  /**
   * Revoke all tracked blob URLs
   */
  revokeAll(): void {
    const count = this.blobUrls.size;
    this.blobUrls.forEach(url => {
      try {
        URL.revokeObjectURL(url);
      } catch (error) {
        console.warn('[BlobUrlTracker] Failed to revoke URL:', url, error);
      }
    });
    this.blobUrls.clear();
    console.log(`[BlobUrlTracker] Revoked ${count} blob URLs`);
  }

  /**
   * Get statistics
   */
  getStats(): BlobUrlTrackerStats {
    return {
      trackedUrls: this.blobUrls.size,
      urls: Array.from(this.blobUrls)
    };
  }

  /**
   * Clear tracker without revoking URLs
   */
  clear(): void {
    this.blobUrls.clear();
  }

  /**
   * Check if URL is tracked
   */
  has(url: string): boolean {
    return this.blobUrls.has(url);
  }

  /**
   * Get number of tracked URLs
   */
  size(): number {
    return this.blobUrls.size;
  }
}
