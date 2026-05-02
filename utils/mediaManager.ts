/**
 * Media Manager
 *
 * Backward compatibility layer - re-exports from new modular structure
 * @deprecated Import directly from 'utils/media' instead
 */

import type { LocalFileInfo } from '../components/host/packeditor/types';
import type { GamePack } from '../components/host/packeditor/types';
import { errorHandler, handleMediaError, safeAsync } from './errorHandler';

// Re-export everything from the new media module
export {
  // Storage
  mediaStorage,
  // Cache
  MediaFileCache,
  // Blob URL tracking
  BlobUrlTracker,
  // Bulk operations
  bulkSaveMediaFiles,
  bulkLoadMediaFiles,
  bulkDeleteMediaFiles,
  bulkLoadPackMedia,
  bulkTransferMediaFiles,
  // Prefetch
  prefetchNextQuestionsMedia,
  prefetchMediaFiles,
  bulkPrefetchMediaFiles,
  // Utilities
  generateMediaId,
  setGlobalCache
} from './media';

export type {
  MediaFileRecord,
  StorageStats,
  CacheEntry,
  CacheStats,
  MediaFileCacheOptions,
  BlobUrlTrackerStats,
  BlobUrlTrackerOptions,
  BulkOperationResult,
  PrefetchOptions
} from './media';

// Import specific classes and utilities for backward compatibility
import { MediaFileCache as NewMediaFileCache } from './media';
import { BlobUrlTracker as NewBlobUrlTracker } from './media';
import { mediaStorage as newMediaStorage } from './media';
import { bulkLoadMediaFiles as newBulkLoadMediaFiles } from './media';
import { getGlobalCache } from './media';

// Global cache instance (maintained for backward compatibility)
const mediaFileCache = new NewMediaFileCache();

// Global blob URL tracker (maintained for backward compatibility)
const blobUrlTracker = new NewBlobUrlTracker();

/**
 * Save media file with error handling
 */
export const saveMediaFile = safeAsync(async (
  packId: string,
  mediaId: string,
  file: File
): Promise<string> => {
  return newMediaStorage.save(packId, mediaId, file);
}, 'saveMediaFile');

/**
 * Get media file with caching
 */
export async function getMediaFile(mediaId: string): Promise<File | null> {
  return mediaFileCache.get(mediaId, async (id: string) => {
    return newMediaStorage.get(id);
  });
}

/**
 * Delete all media files for a pack
 */
export async function deletePackMedia(packId: string): Promise<void> {
  return newMediaStorage.deletePack(packId);
}

/**
 * Restore blob URL from storage
 */
export async function restoreBlobFromStorage(mediaId: string): Promise<string | null> {
  try {
    const file = await getMediaFile(mediaId);
    if (!file) {
      console.warn('⚠️ Файл не найден в IndexedDB:', mediaId);
      return null;
    }

    const blobUrl = URL.createObjectURL(file);
    console.log('✅ Blob URL восстановлен из IndexedDB:', file.name);
    return blobUrl;
  } catch (error) {
    console.error('❌ Ошибка восстановления из IndexedDB:', error);
    return null;
  }
}

/**
 * Restore pack blob URLs from storage
 */
export async function restorePackBlobUrlsFromStorage(pack: GamePack): Promise<void> {
  console.log('🔄 Восстановление blob URL из IndexedDB для пака:', pack.name);

  let restoredCount = 0;
  let skippedCount = 0;

  // Restore pack cover
  if (pack.cover?.value && pack.cover.value.startsWith('blob:')) {
    if (pack.cover.localFile?.mediaId) {
      const restoredUrl = await restoreBlobFromStorage(pack.cover.localFile.mediaId);
      if (restoredUrl) {
        pack.cover.value = restoredUrl;
        restoredCount++;
      } else {
        skippedCount++;
      }
    } else {
      skippedCount++;
    }
  }

  // Restore round covers and media
  for (const round of pack.rounds || []) {
    if (round.cover?.value && round.cover.value.startsWith('blob:')) {
      if (round.cover.localFile?.mediaId) {
        const restoredUrl = await restoreBlobFromStorage(round.cover.localFile.mediaId);
        if (restoredUrl) {
          round.cover.value = restoredUrl;
          restoredCount++;
        } else {
          skippedCount++;
        }
      } else {
        skippedCount++;
      }
    }

    for (const theme of round.themes || []) {
      for (const question of theme.questions || []) {
        // Question media
        if (question.media?.url && question.media.url.startsWith('blob:')) {
          if (question.media.localFile?.mediaId) {
            const restoredUrl = await restoreBlobFromStorage(question.media.localFile.mediaId);
            if (restoredUrl) {
              question.media.url = restoredUrl;
              restoredCount++;
            } else {
              skippedCount++;
            }
          } else {
            skippedCount++;
          }
        }

        // Answer media
        if (question.answerMedia?.url && question.answerMedia.url.startsWith('blob:')) {
          if (question.answerMedia.localFile?.mediaId) {
            const restoredUrl = await restoreBlobFromStorage(question.answerMedia.localFile.mediaId);
            if (restoredUrl) {
              question.answerMedia.url = restoredUrl;
              restoredCount++;
            } else {
              skippedCount++;
            }
          } else {
            skippedCount++;
          }
        }
      }
    }
  }

  console.log(`✅ Восстановление завершено: ${restoredCount} восстановлено, ${skippedCount} пропущено`);
}

/**
 * Create blob URL with storage
 */
export async function createBlobUrlWithStorage(
  packId: string,
  file: File
): Promise<{
  blobUrl: string;
  mediaId: string;
  localFileInfo: LocalFileInfo;
}> {
  const mediaId = generateMediaId();
  const blobUrl = URL.createObjectURL(file);

  blobUrlTracker.track(blobUrl);
  await saveMediaFile(packId, mediaId, file);

  const localFileInfo: LocalFileInfo = {
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type,
    lastModified: file.lastModified,
    mediaId: mediaId
  };

  console.log('🔗 Создан blob URL с сохранением в IndexedDB:', {
    fileName: file.name,
    mediaId: mediaId,
    blobUrl: blobUrl.slice(0, 50) + '...'
  });

  return { blobUrl, mediaId, localFileInfo };
}

/**
 * Cache management functions
 */
export function clearMediaFileCache() {
  mediaFileCache.clear();
}

export function getMediaFileCacheStats() {
  return mediaFileCache.getStats();
}

export function removeMediaFileFromCache(mediaId: string) {
  mediaFileCache.delete(mediaId);
}

/**
 * Blob URL tracking functions
 */
export function trackBlobUrl(url: string): void {
  blobUrlTracker.track(url);
}

export function revokeBlobUrl(url: string): void {
  blobUrlTracker.revoke(url);
}

export function revokeAllBlobUrls(): void {
  blobUrlTracker.revokeAll();
}

export function getBlobUrlStats(): { trackedUrls: number; urls: string[] } {
  return blobUrlTracker.getStats();
}

/**
 * Get enhanced cache statistics
 */
export function getEnhancedCacheStats() {
  return mediaFileCache.getStats();
}

// Re-export bulk load with proper type
export { bulkLoadMediaFiles };
