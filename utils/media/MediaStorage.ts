/**
 * Media Storage
 *
 * IndexedDB-based storage for media files
 * Provides persistent storage for game pack media
 */

const DB_NAME = 'GamePackMedia';
const DB_VERSION = 1;
const STORE_NAME = 'mediaFiles';

export interface MediaFileRecord {
  id: string;
  packId: string;
  file: File;
  fileName: string;
  fileType: string;
  fileSize: number;
  lastModified: number;
  createdAt: number;
}

export interface StorageStats {
  fileCount: number;
  totalSize: number;
  averageSize: number;
  largestFile?: { id: string; name: string; size: number };
  types: Record<string, number>;
}

class MediaStorage {
  private db: IDBDatabase | null = null;

  /**
   * Initialize IndexedDB
   */
  async init(): Promise<IDBDatabase> {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const database = (event.target as IDBOpenDBRequest).result as IDBDatabase;

        if (!database.objectStoreNames.contains(STORE_NAME)) {
          const objectStore = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
          objectStore.createIndex('packId', 'packId', { unique: false });
        }
      };
    });
  }

  /**
   * Save a file to IndexedDB
   */
  async save(packId: string, mediaId: string, file: File): Promise<string> {
    const database = await this.init();

    return new Promise((resolve, reject) => {
      const transaction = database.transaction([STORE_NAME], 'readwrite');
      const objectStore = transaction.objectStore(STORE_NAME);

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

      console.log('💾 Сохранение файла в IndexedDB:', {
        mediaId,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size
      });

      const request = objectStore.put(mediaRecord);

      request.onsuccess = () => {
        console.log('✅ Медиа файл сохранен в IndexedDB:', {
          fileName: file.name,
          fileType: file.type,
          mediaId
        });
        resolve(mediaId);
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get a file from IndexedDB by ID
   */
  async get(mediaId: string): Promise<File | null> {
    try {
      const database = await this.init();

      return new Promise((resolve, reject) => {
        const transaction = database.transaction([STORE_NAME], 'readonly');
        const objectStore = transaction.objectStore(STORE_NAME);
        const request = objectStore.get(mediaId);

        request.onsuccess = () => {
          const record = request.result;
          if (record && record.file) {
            const file = record.file;
            const mimeType = record.fileType || file.type || '';

            const finalFile = (!file.type || file.type !== mimeType)
              ? new File([file], record.fileName || file.name, { type: mimeType })
              : file;

            console.log('✅ Медиа файл получен из IndexedDB:', {
              fileName: record.fileName,
              fileSize: record.fileSize,
              fileType: record.fileType || mimeType
            });
            resolve(finalFile);
          } else {
            resolve(null);
          }
        };

        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('❌ Ошибка получения из IndexedDB:', error);
      return null;
    }
  }

  /**
   * Delete all files for a specific pack
   */
  async deletePack(packId: string): Promise<void> {
    try {
      const database = await this.init();

      return new Promise((resolve, reject) => {
        const transaction = database.transaction([STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(STORE_NAME);
        const index = objectStore.index('packId');
        const request = index.openCursor(IDBKeyRange.only(packId));

        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          } else {
            console.log('🗑️ Все медиа файлы пакета удалены:', packId);
            resolve();
          }
        };

        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('❌ Ошибка удаления медиа файлов:', error);
    }
  }

  /**
   * Delete a specific file by ID
   */
  async delete(mediaId: string): Promise<boolean> {
    const database = await this.init();

    return new Promise((resolve, reject) => {
      const transaction = database.transaction([STORE_NAME], 'readwrite');
      const objectStore = transaction.objectStore(STORE_NAME);
      const request = objectStore.delete(mediaId);

      request.onsuccess = () => resolve(true);
      request.onerror = () => {
        console.error('❌ Ошибка удаления файла:', mediaId, request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get storage statistics for a pack
   */
  async getPackStats(packId: string): Promise<StorageStats> {
    const database = await this.init();

    return new Promise((resolve, reject) => {
      const transaction = database.transaction([STORE_NAME], 'readonly');
      const objectStore = transaction.objectStore(STORE_NAME);
      const index = objectStore.index('packId');

      let fileCount = 0;
      let totalSize = 0;
      let largestFile: { id: string; name: string; size: number } | undefined;
      const types: Record<string, number> = {};

      const request = index.openCursor(IDBKeyRange.only(packId));

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;

        if (cursor) {
          const record = cursor.value;
          fileCount++;
          totalSize += record.fileSize;

          if (!largestFile || record.fileSize > largestFile.size) {
            largestFile = {
              id: record.id,
              name: record.fileName,
              size: record.fileSize
            };
          }

          const fileType = record.fileType || 'unknown';
          types[fileType] = (types[fileType] || 0) + 1;

          cursor.continue();
        } else {
          resolve({
            fileCount,
            totalSize,
            averageSize: fileCount > 0 ? totalSize / fileCount : 0,
            largestFile,
            types
          });
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear all stored data
   */
  async clear(): Promise<void> {
    const database = await this.init();

    return new Promise((resolve, reject) => {
      const transaction = database.transaction([STORE_NAME], 'readwrite');
      const objectStore = transaction.objectStore(STORE_NAME);
      const request = objectStore.clear();

      request.onsuccess = () => {
        console.log('[MediaStorage] 🧹 All data cleared');
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }
}

// Export singleton instance
export const mediaStorage = new MediaStorage();
