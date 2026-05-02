/**
 * Media File Cache
 *
 * LRU (Least Recently Used) cache for media files
 * Reduces IndexedDB queries for frequently accessed files
 */

export interface CacheEntry {
  file: File;
  lastAccess: number;
  accessCount: number;
}

export interface CacheStats {
  count: number;
  currentSize: number;
  maxSize: number;
  usagePercent: string;
  prefetching: number;
  mostAccessed: Array<{ id: string; accessCount: number; size: number }>;
}

export interface MediaFileCacheOptions {
  maxSize?: number;     // Maximum cache size in bytes
  maxCount?: number;    // Maximum number of files
}

export class MediaFileCache {
  private cache = new Map<string, CacheEntry>();
  private readonly maxSize: number;
  private currentSize = 0;
  private readonly maxCount: number;
  private prefetchQueue = new Set<string>();

  constructor(options: MediaFileCacheOptions = {}) {
    this.maxSize = options.maxSize ?? 50 * 1024 * 1024; // 50MB default
    this.maxCount = options.maxCount ?? 100;
  }

  /**
   * Get file from cache or load from storage
   */
  async get(mediaId: string, loadFn: (id: string) => Promise<File | null>): Promise<File | null> {
    const cached = this.cache.get(mediaId);

    if (cached) {
      cached.lastAccess = Date.now();
      cached.accessCount++;
      console.log('[MediaFileCache] ✅ Cache hit:', mediaId, `Accessed ${cached.accessCount} times`);
      return cached.file;
    }

    console.log('[MediaFileCache] ❌ Cache miss:', mediaId);
    const file = await loadFn(mediaId);

    if (file) {
      this.put(mediaId, file);
    }

    return file;
  }

  /**
   * Add file to cache with intelligent LRU eviction
   */
  put(mediaId: string, file: File): void {
    if (file.size > this.maxSize) {
      console.log('[MediaFileCache] ⚠️ File too large for cache:', file.size);
      return;
    }

    while ((this.currentSize + file.size > this.maxSize || this.cache.size >= this.maxCount) && this.cache.size > 0) {
      const [lruId, lru] = [...this.cache.entries()]
        .sort((a, b) => {
          const countDiff = a[1].accessCount - b[1].accessCount;
          if (countDiff !== 0) return countDiff;
          return a[1].lastAccess - b[1].lastAccess;
        })[0];

      this.cache.delete(lruId);
      this.currentSize -= lru.file.size;
      console.log('[MediaFileCache] 🗑️ Evicted from cache:', lruId, `Accessed ${lru.accessCount} times`);
    }

    this.cache.set(mediaId, { file, lastAccess: Date.now(), accessCount: 1 });
    this.currentSize += file.size;
    console.log('[MediaFileCache] 💾 Cached:', mediaId, `Size: ${this.currentSize}/${this.maxSize} (${this.cache.size} files)`);
  }

  /**
   * Clear specific file from cache
   */
  delete(mediaId: string): void {
    const cached = this.cache.get(mediaId);
    if (cached) {
      this.currentSize -= cached.file.size;
      this.cache.delete(mediaId);
      console.log('[MediaFileCache] 🗑️ Removed from cache:', mediaId);
    }
  }

  /**
   * Clear all cached files
   */
  clear(): void {
    this.cache.clear();
    this.currentSize = 0;
    console.log('[MediaFileCache] 🧹 Cache cleared');
  }

  /**
   * Prefetch multiple files into cache
   */
  async prefetch(mediaIds: string[], loadFn: (id: string) => Promise<File | null>): Promise<void> {
    for (const mediaId of mediaIds) {
      if (this.cache.has(mediaId) || this.prefetchQueue.has(mediaId)) {
        continue;
      }

      this.prefetchQueue.add(mediaId);

      loadFn(mediaId).then(file => {
        if (file) {
          this.put(mediaId, file);
          console.log('[MediaFileCache] 🎯 Prefetched:', mediaId);
        }
        this.prefetchQueue.delete(mediaId);
      }).catch(error => {
        console.warn('[MediaFileCache] ⚠️ Prefetch failed:', mediaId, error);
        this.prefetchQueue.delete(mediaId);
      });
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const mostAccessed = [...this.cache.entries()]
      .sort((a, b) => b[1].accessCount - a[1].accessCount)
      .slice(0, 5)
      .map(([id, data]) => ({ id, accessCount: data.accessCount, size: data.file.size }));

    return {
      count: this.cache.size,
      currentSize: this.currentSize,
      maxSize: this.maxSize,
      usagePercent: (this.currentSize / this.maxSize * 100).toFixed(1),
      prefetching: this.prefetchQueue.size,
      mostAccessed
    };
  }

  /**
   * Check if file is in cache
   */
  has(mediaId: string): boolean {
    return this.cache.has(mediaId);
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }
}
