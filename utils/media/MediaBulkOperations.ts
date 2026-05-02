/**
 * Media Bulk Operations
 *
 * Optimized bulk operations for multiple media files
 * Uses single transactions for efficiency
 */

import type { MediaFileRecord } from './MediaStorage';
import { mediaStorage } from './MediaStorage';

export interface BulkOperationResult {
  success: boolean;
  succeeded: string[];
  failed: Array<{ id: string; error: string }>;
  totalCount: number;
  duration: number;
}

const DB_NAME = 'GamePackMedia';
const STORE_NAME = 'mediaFiles';

/**
 * Initialize IndexedDB connection
 */
async function initDB(): Promise<IDBDatabase> {
  return (mediaStorage as any).init();
}

/**
 * Bulk save multiple media files in a single transaction
 */
export async function bulkSaveMediaFiles(
  packId: string,
  files: Array<{ mediaId: string; file: File }>
): Promise<BulkOperationResult> {
  const startTime = Date.now();
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(STORE_NAME);

    const succeeded: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const { mediaId, file } of files) {
      try {
        const mediaRecord: MediaFileRecord = {
          id: mediaId,
          packId: packId,
          file: file,
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          lastModified: file.lastModified,
          createdAt: Date.now()
        };

        objectStore.put(mediaRecord);
        succeeded.push(mediaId);
      } catch (error) {
        failed.push({ id: mediaId, error: String(error) });
      }
    }

    transaction.oncomplete = () => {
      const duration = Date.now() - startTime;
      console.log(`✅ Bulk save completed: ${succeeded.length}/${files.length} files in ${duration}ms`);
      resolve({
        success: failed.length === 0,
        succeeded,
        failed,
        totalCount: files.length,
        duration
      });
    };

    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Bulk load multiple media files efficiently
 */
export async function bulkLoadMediaFiles(
  mediaIds: string[]
): Promise<BulkOperationResult & { files: Map<string, File> }> {
  const startTime = Date.now();
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly');
    const objectStore = transaction.objectStore(STORE_NAME);

    const files = new Map<string, File>();
    const succeeded: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    const pendingRequests = mediaIds.map(mediaId => {
      return new Promise<void>((reqResolve) => {
        const request = objectStore.get(mediaId);

        request.onsuccess = () => {
          const record = request.result;
          if (record && record.file) {
            const file = record.file;
            const mimeType = record.fileType || file.type || '';

            const finalFile = (!file.type || file.type !== mimeType)
              ? new File([file], record.fileName || file.name, { type: mimeType })
              : file;

            files.set(mediaId, finalFile);
            succeeded.push(mediaId);
          } else {
            failed.push({ id: mediaId, error: 'Not found' });
          }
          reqResolve();
        };

        request.onerror = () => {
          failed.push({ id: mediaId, error: String(request.error) });
          reqResolve();
        };
      });
    });

    Promise.all(pendingRequests).then(() => {
      const duration = Date.now() - startTime;
      console.log(`✅ Bulk load completed: ${succeeded.length}/${mediaIds.length} files in ${duration}ms`);
      resolve({
        success: failed.length === 0,
        succeeded,
        failed,
        totalCount: mediaIds.length,
        duration,
        files
      });
    }).catch(reject);
  });
}

/**
 * Bulk delete multiple media files in a single transaction
 */
export async function bulkDeleteMediaFiles(
  mediaIds: string[]
): Promise<BulkOperationResult> {
  const startTime = Date.now();
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(STORE_NAME);

    const succeeded: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const mediaId of mediaIds) {
      try {
        objectStore.delete(mediaId);
        succeeded.push(mediaId);
      } catch (error) {
        failed.push({ id: mediaId, error: String(error) });
      }
    }

    transaction.oncomplete = () => {
      const duration = Date.now() - startTime;
      console.log(`✅ Bulk delete completed: ${succeeded.length}/${mediaIds.length} files in ${duration}ms`);
      resolve({
        success: failed.length === 0,
        succeeded,
        failed,
        totalCount: mediaIds.length,
        duration
      });
    };

    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Bulk load all media files for a pack
 */
export async function bulkLoadPackMedia(
  packId: string
): Promise<BulkOperationResult & { files: Map<string, File> }> {
  const startTime = Date.now();
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly');
    const objectStore = transaction.objectStore(STORE_NAME);
    const index = objectStore.index('packId');

    const files = new Map<string, File>();
    const succeeded: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    const request = index.openCursor(IDBKeyRange.only(packId));

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;

      if (cursor) {
        const record = cursor.value;
        if (record && record.file) {
          const file = record.file;
          const mimeType = record.fileType || file.type || '';

          const finalFile = (!file.type || file.type !== mimeType)
            ? new File([file], record.fileName || file.name, { type: mimeType })
            : file;

          files.set(record.id, finalFile);
          succeeded.push(record.id);
        }
        cursor.continue();
      } else {
        const duration = Date.now() - startTime;
        console.log(`✅ Bulk pack load completed: ${succeeded.length} files in ${duration}ms`);
        resolve({
          success: true,
          succeeded,
          failed,
          totalCount: succeeded.length,
          duration,
          files
        });
      }
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Bulk transfer - move files from one pack to another
 */
export async function bulkTransferMediaFiles(
  sourcePackId: string,
  targetPackId: string,
  mediaIds?: string[]
): Promise<BulkOperationResult> {
  const startTime = Date.now();
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(STORE_NAME);
    const sourceIndex = objectStore.index('packId');

    const succeeded: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    let totalCount = 0;
    const idsToTransfer = mediaIds ? new Set(mediaIds) : null;

    const sourceRequest = sourceIndex.openCursor(IDBKeyRange.only(sourcePackId));

    sourceRequest.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;

      if (cursor) {
        const record = cursor.value;

        if (!idsToTransfer || idsToTransfer.has(record.id)) {
          totalCount++;

          try {
            record.packId = targetPackId;
            cursor.update(record);
            succeeded.push(record.id);
          } catch (error) {
            failed.push({ id: record.id, error: String(error) });
          }
        }

        cursor.continue();
      } else {
        const duration = Date.now() - startTime;
        console.log(`✅ Bulk transfer completed: ${succeeded.length}/${totalCount} files in ${duration}ms`);
        resolve({
          success: failed.length === 0,
          succeeded,
          failed,
          totalCount,
          duration
        });
      }
    };

    sourceRequest.onerror = () => reject(sourceRequest.error);
  });
}
