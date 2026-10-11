/**
 * ZIP Pack Manager
 * Управление пакетами с медиа файлами в ZIP архивах
 */

import JSZip from 'jszip';
import type { GamePack } from '../components/host/packeditor/types';
import { saveAs } from 'file-saver';
import type { LocalFileInfo } from '../components/host/packeditor/types';
import { saveMediaFile, generateMediaId } from './mediaManager';

/**
 * Сохраняет пакет как ZIP архив с медиа файлами
 */
export async function savePackAsZip(pack: GamePack): Promise<void> {

  const zip = new JSZip();

  // 1. Сохраняем JSON данные пака
  const packJson = JSON.stringify(pack, null, 2);
  zip.file('pack.json', packJson);

  // 2. Собираем все blob URL и их пути в архиве
  const blobUrls = new Map<string, { blob: Blob; path: string; originalUrl: string }>();

  // Функция для обработки медиа элемента
  const processMedia = async (mediaUrl: string | undefined, mediaPath: string) => {
    if (!mediaUrl || !mediaUrl.startsWith('blob:')) {
      return;
    }

    // Проверяем, не обрабатывали ли мы уже этот blob
    if (blobUrls.has(mediaUrl)) {
      return;
    }

    try {

      // Получаем blob из URL
      const response = await fetch(mediaUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const blob = await response.blob();


      // Определяем расширение файла
      const extension = getExtensionFromMimeType(blob.type);

      // Создаем уникальное имя файла
      const fileName = `${mediaPath.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.${extension}`;
      const filePath = `media/${fileName}`;

      blobUrls.set(mediaUrl, { blob, path: filePath, originalUrl: mediaUrl });

    } catch (error) {
      console.error(`❌ Ошибка получения blob для ${mediaPath}:`, error);
    }
  };

  // Обходим все медиа элементы в паке
  const processAllMedia = async () => {

    let processedCount = 0;
    let skippedCount = 0;

    if (pack.cover?.value?.startsWith('blob:')) {
      await processMedia(pack.cover.value, 'pack_cover');
      processedCount++;
    } else {
      skippedCount++;
    }

    for (const round of pack.rounds || []) {
      if (round.cover?.value?.startsWith('blob:')) {
        await processMedia(round.cover.value, `round_${round.number}_cover`);
        processedCount++;
      } else {
        skippedCount++;
      }

      for (const theme of round.themes || []) {
        for (const question of theme.questions || []) {
          if (question.media?.url?.startsWith('blob:')) {
            await processMedia(question.media.url, `question_${question.id}`);
            processedCount++;
          } else {
            skippedCount++;
          }

          if (question.answerMedia?.url?.startsWith('blob:')) {
            await processMedia(question.answerMedia.url, `answer_${question.id}`);
            processedCount++;
          } else {
            skippedCount++;
          }
        }
      }
    }

  };

  // Ждем загрузки всех blobs
  await processAllMedia();

  // 3. Добавляем медиа файлы в архив

  for (const [originalUrl, { blob, path }] of blobUrls) {
    zip.file(path, blob);

    // Сохраняем информацию о файле в метаданных
    updateMediaUrlInPack(pack, originalUrl, path);

  }

  // 4. Создаем README с инструкциями
  const readme = `# ${pack.name}

Этот пакет содержит медиа файлы.

## Структура:
- pack.json - данные пакета
- media/ - папка с медиа файлами (${blobUrls.size} файлов)

## Как использовать:
Загрузите этот файл в приложении для автоматической распаковки.

Создан: ${new Date().toISOString()}
`;
  zip.file('README.md', readme);

  // 5. Генерируем ZIP архив
  const zipBlob = await zip.generateAsync({ type: 'blob' });

  // 6. Сохраняем архив
  const fileName = `${pack.name.replace(/[^a-z0-9]/gi, '_')}.zip`;
  saveAs(zipBlob, fileName);

}

/**
 * Загружает пакет из ZIP архива
 */
export async function loadPackFromZip(file: File): Promise<GamePack> {

  const zip = await JSZip.loadAsync(file);

  // 1. Загружаем JSON данные
  const packJsonFile = zip.file('pack.json');
  if (!packJsonFile) {
    throw new Error('pack.json не найден в архиве');
  }

  const packJson = await packJsonFile.async('string');
  const pack: GamePack = JSON.parse(packJson);

  // Генерируем уникальный ID для пака на основе имени файла и времени
  // Это нужно для корректной работы IndexedDB
  if (!pack.id) {
    pack.id = `zip_${file.name}_${Date.now()}`;
  }


  // Логируем все media URL в паке для отладки
  for (const round of pack.rounds || []) {
    for (const theme of round.themes || []) {
      for (const question of theme.questions || []) {
        if (question.media?.url) {
        }
        if (question.answerMedia?.url) {
        }
      }
    }
  }

  // 2. Загружаем медиа файлы и создаем blob URL с сохранением в IndexedDB
  const mediaFolder = zip.folder('media');
  let mediaFilesCount = 0;

  if (mediaFolder) {
    // Правильно итерируемся по файлам в media папке
    const mediaFiles = [];
    zip.forEach((relativePath, zipEntry) => {
      if (relativePath.startsWith('media/') && !zipEntry.dir) {
        mediaFiles.push({ relativePath, file: zipEntry });
      }
    });


    // Создаем маппинг новых blob URL
    const newBlobUrls = new Map<string, { blobUrl: string; mediaId: string; localFileInfo: LocalFileInfo }>();

    for (const { relativePath, file: zipFile } of mediaFiles) {
      try {
        // Получаем blob из архива
        const blob = await zipFile.async('blob');

        // Создаем File объект из blob для IndexedDB
        const fileName = relativePath.split('/').pop() || 'unknown';

        // Определяем MIME тип по расширению файла
        const extension = fileName.split('.').pop()?.toLowerCase();
        let mimeType = blob.type || '';

        // Если MIME тип пустой, пробуем определить по расширению
        if (!mimeType && extension) {
          const mimeTypes: Record<string, string> = {
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'mp4': 'video/mp4',
            'webm': 'video/webm',
            'ogv': 'video/ogg',
            'mp3': 'audio/mpeg',
            'wav': 'audio/wav',
            'ogg': 'audio/ogg',
            'm4a': 'audio/mp4'
          };
          mimeType = mimeTypes[extension] || '';
        }

        const fileObj = new File([blob], fileName, { type: mimeType });

        // Генерируем mediaId и сохраняем в IndexedDB
        const mediaId = generateMediaId();
        await saveMediaFile(pack.id || 'unknown_pack', mediaId, fileObj);

        // Создаем blob URL
        const blobUrl = URL.createObjectURL(blob);

        const localFileInfo: LocalFileInfo = {
          fileName: fileObj.name,
          fileSize: fileObj.size,
          fileType: mimeType,
          lastModified: fileObj.lastModified,
          mediaId: mediaId
        };

        // Сохраняем для последующего обновления
        newBlobUrls.set(relativePath, { blobUrl, mediaId, localFileInfo });


        mediaFilesCount++;
      } catch (error) {
        console.error('❌ Ошибка загрузки файла из архива:', relativePath, error);
      }
    }

    // Теперь обновляем все media URL в паке
    updateAllMediaUrlsInPack(pack, newBlobUrls);
  }


  return pack;
}

/**
 * Обновляет URL медиа в паке на путь к файлу в архиве
 */
function updateMediaUrlInPack(pack: GamePack, blobUrl: string, filePath: string): void {
  const mediaPath = `media://${filePath}`;

  const updateUrl = (currentUrl: string | undefined): string => {
    if (currentUrl === blobUrl) {
      return mediaPath;
    }
    return currentUrl || '';
  };

  // Обновляем обложку пака
  if (pack.cover?.value === blobUrl) {
    pack.cover.value = mediaPath;
  }

  // Обновляем обложки раундов и медиа вопросов
  for (const round of pack.rounds || []) {
    if (round.cover?.value === blobUrl) {
      round.cover.value = mediaPath;
    }

    for (const theme of round.themes || []) {
      for (const question of theme.questions || []) {
        if (question.media?.url === blobUrl) {
          question.media.url = mediaPath;
        }
        if (question.answerMedia?.url === blobUrl) {
          question.answerMedia.url = mediaPath;
        }
      }
    }
  }
}

/**
 * Заменяет пути к медиа файлам на blob URL при загрузке из архива
 */
function replaceMediaPathWithBlobUrl(pack: GamePack, filePath: string, blobUrl: string): void {
  const mediaPath = `media://${filePath}`;

  const replaceUrl = (currentUrl: string | undefined): string => {
    if (currentUrl === mediaPath) {
      return blobUrl;
    }
    return currentUrl || '';
  };

  // Заменяем URL во всех медиа элементах
  if (pack.cover?.value === mediaPath) {
    pack.cover.value = blobUrl;
  }

  for (const round of pack.rounds || []) {
    if (round.cover?.value === mediaPath) {
      round.cover.value = blobUrl;
    }

    for (const theme of round.themes || []) {
      for (const question of theme.questions || []) {
        if (question.media?.url === mediaPath) {
          question.media.url = blobUrl;
        }
        if (question.answerMedia?.url === mediaPath) {
          question.answerMedia.url = blobUrl;
        }
      }
    }
  }
}

/**
 * Обновляет все media URL в паке на новые blob URL из ZIP архива
 * Извлекает question ID и тип медиа из имен файлов
 */
function updateAllMediaUrlsInPack(
  pack: GamePack,
  newBlobUrls: Map<string, { blobUrl: string; mediaId: string; localFileInfo: LocalFileInfo }>
): void {

  let updatedCount = 0;

  // Создаем маппинг для разных типов медиа
  const questionMediaMap = new Map<string, { blobUrl: string; mediaId: string; localFileInfo: LocalFileInfo }>();
  const answerMediaMap = new Map<string, { blobUrl: string; mediaId: string; localFileInfo: LocalFileInfo }>();
  let packCoverData: { blobUrl: string; mediaId: string; localFileInfo: LocalFileInfo } | null = null;
  const roundCoverMap = new Map<number, { blobUrl: string; mediaId: string; localFileInfo: LocalFileInfo }>();

  // Распределяем файлы по типам
  for (const [relativePath, { blobUrl, mediaId, localFileInfo }] of newBlobUrls) {
    const fileName = relativePath.split('/').pop() || '';

    // Проверяем pack cover - формат: pack_cover_XXXXXXXX.bin или просто pack_cover.bin
    const packCoverMatch = fileName.match(/^pack_cover(_\d+)?\.bin$/);
    if (packCoverMatch) {
      packCoverData = { blobUrl, mediaId, localFileInfo };
      continue;
    }

    // Проверяем round cover - формат: round_X_cover_XXXXXXXX.bin или round_X_cover.bin
    const roundCoverMatch = fileName.match(/^round_(\d+)_cover(_\d+)?\.bin$/);
    if (roundCoverMatch) {
      const roundNumber = parseInt(roundCoverMatch[1], 10);
      roundCoverMap.set(roundNumber, { blobUrl, mediaId, localFileInfo });
      continue;
    }

    // Извлекаем тип медиа (question или answer) и question ID из имени файла
    // Формат: question_XXXXXXXX_XXXXXXXX_XXXXXXXX_XXXXXXXX_XXXXXXXX.mp3
    // или: answer_XXXXXXXX_XXXXXXXX_XXXXXXXX_XXXXXXXX_XXXXXXXX.png
    const questionMatch = fileName.match(/question_([a-f0-9_]{36})/);
    const answerMatch = fileName.match(/answer_([a-f0-9_]{36})/);

    if (!questionMatch && !answerMatch) {
      continue;
    }

    // Заменяем подчёркивания на дефисы для получения правильного UUID формата
    const questionId = (questionMatch?.[1] || answerMatch?.[1]!)!.replace(/_/g, '-');
    const mediaType = questionMatch ? 'question' : 'answer';


    // Определяем тип медиа по расширению файла или по MIME типу из localFileInfo
    let extension = fileName.split('.').pop()?.toLowerCase();

    // Если расширение неизвестно, пробуем определить по MIME типу
    if (extension === 'bin' || extension === 'unknown' || !extension) {
      const mimeType = localFileInfo.fileType;
      if (mimeType.startsWith('image/')) extension = 'png';
      else if (mimeType.startsWith('video/')) extension = 'mp4';
      else if (mimeType.startsWith('audio/')) extension = 'mp3';
    }


    // ПРИОРИТЕТ ПРЕФИКСА: если файл начинается с question_, это question media
    // если начинается с answer_, это answer media
    if (mediaType === 'question') {
      questionMediaMap.set(questionId, { blobUrl, mediaId, localFileInfo });
    } else {
      answerMediaMap.set(questionId, { blobUrl, mediaId, localFileInfo });
    }
  }

  // Вспомогательная функция для определения типа медиа из URL
  const detectMediaType = (url: string): 'image' | 'video' | 'audio' | 'youtube' => {
    const extension = url.split('.').pop()?.toLowerCase() || '';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(extension)) return 'image';
    if (['mp4', 'webm', 'ogv'].includes(extension)) return 'video';
    if (['mp3', 'wav', 'ogg', 'm4a'].includes(extension)) return 'audio';
    return 'audio'; // default
  };

  // Вспомогательная функция для замены media:// URL на blob URL
  const replaceMediaUrl = (currentUrl: string | undefined, questionId: string, mediaMap: Map<string, { blobUrl: string; mediaId: string; localFileInfo: LocalFileInfo }>): string | undefined => {
    if (!currentUrl) return undefined;

    // Если это media:// путь, заменяем его на blob URL
    if (currentUrl.startsWith('media://')) {

      if (mediaMap.has(questionId)) {
        const mediaData = mediaMap.get(questionId)!;
        updatedCount++;
        return mediaData.blobUrl;
      } else {
      }
    }

    return currentUrl;
  };

  // Обновляем media в вопросах
  for (const round of pack.rounds || []) {
    for (const theme of round.themes || []) {
      for (const question of theme.questions || []) {
        // Question media
        if (questionMediaMap.has(question.id)) {
          const mediaData = questionMediaMap.get(question.id)!;

          // Создаем объект media если его нет
          if (!question.media) {
            const mediaType = detectMediaType(mediaData.blobUrl);
            question.media = { type: mediaType, url: '' };
          }

          // Заменяем URL если это media:// путь или если blob URL устарел
          const shouldUpdate = !question.media.url ||
                              question.media.url.startsWith('media://') ||
                              (question.media.url.startsWith('blob:') && question.media.url !== mediaData.blobUrl);

          if (shouldUpdate) {

            question.media.url = mediaData.blobUrl;
            question.media.localFile = mediaData.localFileInfo;
            updatedCount++;
          }
        }

        // Answer media
        if (answerMediaMap.has(question.id)) {
          const mediaData = answerMediaMap.get(question.id)!;

          // Создаем объект answerMedia если его нет
          if (!question.answerMedia) {
            const mediaType = detectMediaType(mediaData.blobUrl);
            question.answerMedia = { type: mediaType, url: '' };
          }

          // Заменяем URL если это media:// путь или если blob URL устарел
          const shouldUpdate = !question.answerMedia.url ||
                              question.answerMedia.url.startsWith('media://') ||
                              (question.answerMedia.url.startsWith('blob:') && question.answerMedia.url !== mediaData.blobUrl);

          if (shouldUpdate) {

            question.answerMedia.url = mediaData.blobUrl;
            question.answerMedia.localFile = mediaData.localFileInfo;
            updatedCount++;
          }
        }
      }
    }
  }

  // Обновляем pack cover
  if (packCoverData) {
    const shouldUpdate = !pack.cover?.value ||
                        pack.cover.value.startsWith('media://') ||
                        (pack.cover.value.startsWith('blob:') && pack.cover.value !== packCoverData.blobUrl);

    if (shouldUpdate) {

      if (!pack.cover) {
        pack.cover = { type: 'file', value: '' };
      }
      pack.cover.value = packCoverData.blobUrl;
      pack.cover.localFile = packCoverData.localFileInfo;
      updatedCount++;
    }
  } else {
  }

  // Обновляем round covers
  for (const round of pack.rounds || []) {
    if (roundCoverMap.has(round.number)) {
      const coverData = roundCoverMap.get(round.number)!;

      const shouldUpdate = !round.cover?.value ||
                          round.cover.value.startsWith('media://') ||
                          (round.cover.value.startsWith('blob:') && round.cover.value !== coverData.blobUrl);

      if (shouldUpdate) {

        if (!round.cover) {
          round.cover = { type: 'file', value: '' };
        }
        round.cover.value = coverData.blobUrl;
        round.cover.localFile = coverData.localFileInfo;
        updatedCount++;
      }
    }
  }

}

/**
 * Получает расширение файла из MIME типа
 */
function getExtensionFromMimeType(mimeType: string): string {
  const extensions: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/ogg': 'ogv',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
    'audio/mp4': 'm4a',
    'audio/webm': 'weba'
  };

  return extensions[mimeType] || 'bin';
}

/**
 * Проверяет, является ли файл ZIP архивом
 */
export function isZipFile(file: File): boolean {
  return file.name.endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed';
}