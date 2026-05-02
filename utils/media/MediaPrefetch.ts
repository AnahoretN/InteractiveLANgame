/**
 * Media Prefetch
 *
 * Prefetching utilities for loading media files ahead of time
 * Improves user experience by preloading likely-to-be-accessed media
 */

import { MediaFileCache } from './MediaFileCache';
import { mediaStorage } from './MediaStorage';

export interface PrefetchOptions {
  aheadCount?: number;  // Number of questions to look ahead
}

/**
 * Load a single media file from storage
 */
async function loadMediaFile(mediaId: string): Promise<File | null> {
  return mediaStorage.get(mediaId);
}

/**
 * Prefetch media files for the next questions in a pack
 * Analyzes question order to predict which media will be needed
 */
export async function prefetchNextQuestionsMedia(
  packId: string,
  themes: Array<{ questions?: Array<{ media?: { localFile?: { mediaId: string } }; answerMedia?: { localFile?: { mediaId: string } } }> }>,
  currentQuestionIndex: number,
  aheadCount: number = 3
): Promise<void> {
  try {
    const mediaIdsToPrefetch: string[] = [];

    let questionsChecked = 0;
    for (const theme of themes) {
      if (questionsChecked >= aheadCount) break;

      for (const question of theme.questions || []) {
        if (questionsChecked >= aheadCount) break;

        const questionIndex = theme.questions?.indexOf(question) ?? -1;
        if (questionIndex > currentQuestionIndex) {
          if (question.media?.localFile?.mediaId) {
            mediaIdsToPrefetch.push(question.media.localFile.mediaId);
          }

          if (question.answerMedia?.localFile?.mediaId) {
            mediaIdsToPrefetch.push(question.answerMedia.localFile.mediaId);
          }

          questionsChecked++;
        }
      }
    }

    if (mediaIdsToPrefetch.length > 0) {
      await prefetchMediaFiles(mediaIdsToPrefetch);
      console.log('[MediaPrefetch] ✅ Prefetched media for next questions:', mediaIdsToPrefetch.length);
    }
  } catch (error) {
    console.warn('[MediaPrefetch] ⚠️ Failed to prefetch next questions media:', error);
  }
}

/**
 * Prefetch media files into cache
 */
export async function prefetchMediaFiles(mediaIds: string[]): Promise<void> {
  if (!mediaIds.length) return;

  console.log('[MediaPrefetch] 🎯 Prefetching media files:', mediaIds.length);

  // Get or create global cache instance
  const cache = getGlobalCache();

  await cache.prefetch(mediaIds, loadMediaFile);
}

/**
 * Prefetch multiple files and return result
 */
export async function bulkPrefetchMediaFiles(
  mediaIds: string[]
): Promise<{ success: boolean; succeeded: string[]; failed: Array<{ id: string; error: string }>; totalCount: number; duration: number }> {
  const startTime = Date.now();

  // Use bulk load to get files
  const { bulkLoadMediaFiles } = await import('./MediaBulkOperations');
  const result = await bulkLoadMediaFiles(mediaIds);

  // Add all loaded files to cache
  const cache = getGlobalCache();
  for (const [mediaId, file] of result.files.entries()) {
    cache.put(mediaId, file);
  }

  console.log(`[MediaPrefetch] 🎯 Bulk prefetch completed: ${result.succeeded.length} files cached`);
  return result;
}

/**
 * Get global cache instance
 */
let globalCache: MediaFileCache | null = null;

function getGlobalCache(): MediaFileCache {
  if (!globalCache) {
    globalCache = new MediaFileCache();
  }
  return globalCache;
}

/**
 * Set global cache instance (for testing or custom configuration)
 */
export function setGlobalCache(cache: MediaFileCache): void {
  globalCache = cache;
}
