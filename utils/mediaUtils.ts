/**
 * Media Utilities
 * Утилиты для работы с локальными файлами и blob URL
 */

import type { LocalFileInfo } from '../components/host/packeditor/types';
import { base64ToFile, getMimeTypeFromBase64 } from './fileSystemManager';

/**
 * Создает информацию о локальном файле из File объекта
 */
export function createLocalFileInfo(file: File): LocalFileInfo {
  return {
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type,
    lastModified: file.lastModified,
  };
}

/**
 * Создает blob URL и информацию о локальном файле
 * Возвращает объект с blob URL и метаданными файла
 */
export function createBlobWithFileInfo(file: File): {
  blobUrl: string;
  localFileInfo: LocalFileInfo;
} {
  const blobUrl = URL.createObjectURL(file);
  const localFileInfo = createLocalFileInfo(file);

  console.log('📁 Created blob URL with file info:', {
    fileName: file.name,
    blobUrl: blobUrl.slice(0, 50) + '...',
    fileSize: file.size,
    fileType: file.type
  });

  return { blobUrl, localFileInfo };
}

/**
 * Проверяет, является ли URL blob URL
 */
export function isBlobUrl(url: string): boolean {
  return url.startsWith('blob:');
}

/**
 * Восстанавливает blob URL из base64 данных
 */
export function restoreBlobFromBase64(base64: string, fileName: string, mimeType: string): string | null {
  try {
    const file = base64ToFile(base64, fileName, mimeType);
    const blobUrl = URL.createObjectURL(file);
    console.log('✅ Blob URL восстановлен из base64:', fileName);
    return blobUrl;
  } catch (error) {
    console.error('❌ Ошибка восстановления из base64:', error);
    return null;
  }
}

/**
 * Массовое восстановление blob URL для всего пака
 * Восстанавливает blob URL для всех медиа элементов в паке
 */
export async function restorePackBlobUrls(pack: any): Promise<void> {
  console.log('🔄 Начинаем восстановление blob URL для пака:', pack.name);

  let restoredCount = 0;
  let skippedCount = 0;

  // Восстанавливаем обложку пака
  if (pack.cover?.value && isBlobUrl(pack.cover.value)) {
    if (pack.cover.localFile?.base64) {
      const restoredUrl = restoreBlobFromBase64(
        pack.cover.localFile.base64,
        pack.cover.localFile.fileName,
        pack.cover.localFile.fileType
      );
      if (restoredUrl) {
        pack.cover.value = restoredUrl;
        restoredCount++;
      }
    } else {
      skippedCount++;
    }
  }

  // Восстанавливаем обложки раундов
  for (const round of pack.rounds || []) {
    if (round.cover?.value && isBlobUrl(round.cover.value)) {
      if (round.cover.localFile?.base64) {
        const restoredUrl = restoreBlobFromBase64(
          round.cover.localFile.base64,
          round.cover.localFile.fileName,
          round.cover.localFile.fileType
        );
        if (restoredUrl) {
          round.cover.value = restoredUrl;
          restoredCount++;
        }
      } else {
        skippedCount++;
      }
    }

    // Восстанавливаем медиа вопросов
    for (const theme of round.themes || []) {
      for (const question of theme.questions || []) {
        // Вопрос медиа
        if (question.media?.url && isBlobUrl(question.media.url)) {
          if (question.media.localFile?.base64) {
            const restoredUrl = restoreBlobFromBase64(
              question.media.localFile.base64,
              question.media.localFile.fileName,
              question.media.localFile.fileType
            );
            if (restoredUrl) {
              question.media.url = restoredUrl;
              restoredCount++;
            }
          } else {
            skippedCount++;
          }
        }

        // Ответ медиа
        if (question.answerMedia?.url && isBlobUrl(question.answerMedia.url)) {
          if (question.answerMedia.localFile?.base64) {
            const restoredUrl = restoreBlobFromBase64(
              question.answerMedia.localFile.base64,
              question.answerMedia.localFile.fileName,
              question.answerMedia.localFile.fileType
            );
            if (restoredUrl) {
              question.answerMedia.url = restoredUrl;
              restoredCount++;
            }
          } else {
            skippedCount++;
          }
        }
      }
    }
  }

  console.log(`✅ Восстановление blob URL завершено: ${restoredCount} восстановлено, ${skippedCount} пропущено`);
}