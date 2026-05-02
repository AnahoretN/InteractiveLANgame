/**
 * Media Module
 *
 * Core media utilities for caching, storage, and blob URL management
 */

// Storage
export { mediaStorage } from './MediaStorage';
export type { MediaStorageOptions } from './MediaStorage';

// Cache
export { MediaFileCache } from './MediaFileCache';
export type { CacheEntry, CacheStats, MediaFileCacheOptions } from './MediaFileCache';

// Blob URL tracking
export { BlobUrlTracker } from './BlobUrlTracker';
export type { BlobUrlTrackerStats, BlobUrlTrackerOptions } from './BlobUrlTracker';

// Bulk operations
export {
  bulkSaveMediaFiles,
  bulkLoadMediaFiles,
  bulkDeleteMediaFiles,
  bulkLoadPackMedia,
  bulkTransferMediaFiles
} from './MediaBulkOperations';
export type { BulkOperationResult } from './MediaBulkOperations';

// Prefetch
export {
  prefetchNextQuestionsMedia,
  prefetchMediaFiles,
  bulkPrefetchMediaFiles
} from './MediaPrefetch';
export type { PrefetchOptions } from './MediaPrefetch';

// Utilities
export { setGlobalCache } from './MediaPrefetch';

// Simple utility to generate media IDs
export function generateMediaId(): string {
  return `media_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Types
export type { MediaFileRecord, StorageStats } from './MediaStorage';
