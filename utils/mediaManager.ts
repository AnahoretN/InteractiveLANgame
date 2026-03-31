/**
 * Media Manager
 * Умное управление медиа файлами без хранения в JSON
 */

import type { LocalFileInfo } from '../components/host/packeditor/types';
import type { GamePack } from '../components/host/packeditor/types';

// IndexedDB база данных для хранения медиа файлов
const DB_NAME = 'GamePackMedia';
const DB_VERSION = 1;
const STORE_NAME = 'mediaFiles';

let db: IDBDatabase | null = null;

/**
 * Инициализация IndexedDB
 */
async function initDB(): Promise<IDBDatabase> {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result as IDBDatabase;

      // Создаем object store для медиа файлов
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const objectStore = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        objectStore.createIndex('packId', 'packId', { unique: false });
      }
    };
  });
}

/**
 * Сохраняет файл в IndexedDB
 */
export async function saveMediaFile(
  packId: string,
  mediaId: string,
  file: File
): Promise<string> {
  try {
    const database = await initDB();

    return new Promise((resolve, reject) => {
      const transaction = database.transaction([STORE_NAME], 'readwrite');
      const objectStore = transaction.objectStore(STORE_NAME);

      const mediaRecord = {
        id: mediaId,
        packId: packId,
        file: file,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        lastModified: file.lastModified,
        createdAt: Date.now()
      };

      const request = objectStore.put(mediaRecord);

      request.onsuccess = () => {
        console.log('💾 Медиа файл сохранен в IndexedDB:', file.name);
        resolve(mediaId);
      };

      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('❌ Ошибка сохранения в IndexedDB:', error);
    throw error;
  }
}

/**
 * Получает файл из IndexedDB
 */
export async function getMediaFile(mediaId: string): Promise<File | null> {
  try {
    const database = await initDB();

    return new Promise((resolve, reject) => {
      const transaction = database.transaction([STORE_NAME], 'readonly');
      const objectStore = transaction.objectStore(STORE_NAME);
      const request = objectStore.get(mediaId);

      request.onsuccess = () => {
        const record = request.result;
        if (record && record.file) {
          console.log('✅ Медиа файл получен из IndexedDB:', record.fileName);
          resolve(record.file);
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
 * Удаляет все медиа файлы для пакета
 */
export async function deletePackMedia(packId: string): Promise<void> {
  try {
    const database = await initDB();

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
 * Генерирует уникальный ID для медиа файла
 */
export function generateMediaId(): string {
  return `media_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Создает blob URL с сохранением в IndexedDB
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

  // Сохраняем файл в IndexedDB
  await saveMediaFile(packId, mediaId, file);

  const localFileInfo: LocalFileInfo = {
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type,
    lastModified: file.lastModified,
    mediaId: mediaId // ID для получения из IndexedDB
  };

  console.log('🔗 Создан blob URL с сохранением в IndexedDB:', {
    fileName: file.name,
    mediaId: mediaId,
    blobUrl: blobUrl.slice(0, 50) + '...'
  });

  return { blobUrl, mediaId, localFileInfo };
}

/**
 * Восстанавливает blob URL из IndexedDB
 */
export async function restoreBlobFromStorage(
  mediaId: string
): Promise<string | null> {
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
 * Массовое восстановление blob URL для всего пака из IndexedDB
 */
export async function restorePackBlobUrlsFromStorage(pack: GamePack): Promise<void> {
  console.log('🔄 Восстановление blob URL из IndexedDB для пака:', pack.name);

  let restoredCount = 0;
  let skippedCount = 0;

  // Восстанавливаем обложку пака
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

  // Восстанавливаем обложки раундов
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

    // Восстанавливаем медиа вопросов
    for (const theme of round.themes || []) {
      for (const question of theme.questions || []) {
        // Вопрос медиа
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

        // Ответ медиа
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