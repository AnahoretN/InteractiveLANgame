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
  console.log('📦 Создание ZIP архива для пака:', pack.name);

  const zip = new JSZip();

  // 1. Сохраняем JSON данные пака
  const packJson = JSON.stringify(pack, null, 2);
  zip.file('pack.json', packJson);
  console.log('📄 pack.json добавлен в архив');

  // 2. Собираем все blob URL и их пути в архиве
  const blobUrls = new Map<string, { blob: Blob; path: string; originalUrl: string }>();

  // Функция для обработки медиа элемента
  const processMedia = async (mediaUrl: string | undefined, mediaPath: string) => {
    if (!mediaUrl || !mediaUrl.startsWith('blob:')) {
      console.log(`⏭️ Пропуск: ${mediaPath} (не blob URL: ${mediaUrl?.slice(0, 30)}...)`);
      return;
    }

    // Проверяем, не обрабатывали ли мы уже этот blob
    if (blobUrls.has(mediaUrl)) {
      console.log(`⏭️ Пропуск: ${mediaPath} (уже обработан)`);
      return;
    }

    try {
      console.log(`🔍 Обработка медиа: ${mediaPath} (${mediaUrl.slice(0, 50)}...)`);

      // Получаем blob из URL
      const response = await fetch(mediaUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const blob = await response.blob();

      console.log(`✅ Blob получен: ${mediaPath}`, {
        size: blob.size,
        type: blob.type
      });

      // Определяем расширение файла
      const extension = getExtensionFromMimeType(blob.type);

      // Создаем уникальное имя файла
      const fileName = `${mediaPath.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.${extension}`;
      const filePath = `media/${fileName}`;

      blobUrls.set(mediaUrl, { blob, path: filePath, originalUrl: mediaUrl });

      console.log(`📁 Файл добавлен в очередь: ${filePath}`);
    } catch (error) {
      console.error(`❌ Ошибка получения blob для ${mediaPath}:`, error);
    }
  };

  // Обходим все медиа элементы в паке
  const processAllMedia = async () => {
    console.log('🔍 Сканирование пакета на наличие медиа файлов...');

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

    console.log(`📊 Статистика сканирования: ${processedCount} blob URL, ${skippedCount} пропущено`);
  };

  // Ждем загрузки всех blobs
  await processAllMedia();

  // 3. Добавляем медиа файлы в архив
  console.log(`📁 Добавление ${blobUrls.size} файлов в архив...`);

  for (const [originalUrl, { blob, path }] of blobUrls) {
    zip.file(path, blob);

    // Сохраняем информацию о файле в метаданных
    updateMediaUrlInPack(pack, originalUrl, path);

    console.log(`✅ Файл добавлен в архив: ${path} (${blob.size} bytes)`);
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
  console.log('🗜️ Генерация ZIP архива...');
  const zipBlob = await zip.generateAsync({ type: 'blob' });

  // 6. Сохраняем архив
  const fileName = `${pack.name.replace(/[^a-z0-9]/gi, '_')}.zip`;
  saveAs(zipBlob, fileName);

  console.log('✅ ZIP архив сохранен:', fileName);
  console.log(`📊 Итоговая статистика: ${blobUrls.size} медиа файлов в архиве`);
}

/**
 * Загружает пакет из ZIP архива
 */
export async function loadPackFromZip(file: File): Promise<GamePack> {
  console.log('📂 Загрузка пакета из ZIP архива:', file.name);

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

  console.log('📦 JSON пакет загружен:', pack.name, 'ID:', pack.id);

  // Логируем все media URL в паке для отладки
  console.log('🔍 Сканирование media URL в загруженном паке:');
  for (const round of pack.rounds || []) {
    for (const theme of round.themes || []) {
      for (const question of theme.questions || []) {
        if (question.media?.url) {
          console.log(`  Question ${question.id}: ${question.media.url?.slice(0, 60)}... (type: ${question.media.type})`);
        }
        if (question.answerMedia?.url) {
          console.log(`  Answer ${question.id}: ${question.answerMedia.url?.slice(0, 60)}... (type: ${question.answerMedia.type})`);
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

    console.log(`📁 Найдено ${mediaFiles.length} медиа файлов`);

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

        console.log('🔗 Создан blob URL из архива с сохранением в IndexedDB:', {
          path: relativePath,
          size: blob.size,
          type: mimeType,
          mediaId: mediaId,
          blobUrl: blobUrl.slice(0, 50) + '...'
        });

        mediaFilesCount++;
      } catch (error) {
        console.error('❌ Ошибка загрузки файла из архива:', relativePath, error);
      }
    }

    // Теперь обновляем все media URL в паке
    updateAllMediaUrlsInPack(pack, newBlobUrls);
  }

  console.log(`✅ Пакет загружен: ${mediaFilesCount} медиа файлов восстановлено и сохранено в IndexedDB`);

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
  console.log('🔄 Обновление media URL в паке...');

  let updatedCount = 0;

  // Создаем маппинг для разных типов медиа
  const questionMediaMap = new Map<string, { blobUrl: string; mediaId: string; localFileInfo: LocalFileInfo }>();
  const answerMediaMap = new Map<string, { blobUrl: string; mediaId: string; localFileInfo: LocalFileInfo }>();

  // Распределяем файлы по типам
  for (const [relativePath, { blobUrl, mediaId, localFileInfo }] of newBlobUrls) {
    const fileName = relativePath.split('/').pop() || '';

    // Извлекаем тип медиа (question или answer) и question ID из имени файла
    // Формат: question_XXXXXXXX_XXXXXXXX_XXXXXXXX_XXXXXXXX_XXXXXXXX.mp3
    // или: answer_XXXXXXXX_XXXXXXXX_XXXXXXXX_XXXXXXXX_XXXXXXXX.png
    const questionMatch = fileName.match(/question_([a-f0-9_]{36})/);
    const answerMatch = fileName.match(/answer_([a-f0-9_]{36})/);

    if (!questionMatch && !answerMatch) {
      console.log(`⚠️ Не удалось извлечь question ID из файла: ${fileName}`);
      continue;
    }

    // Заменяем подчёркивания на дефисы для получения правильного UUID формата
    const questionId = (questionMatch?.[1] || answerMatch?.[1]!)!.replace(/_/g, '-');
    const mediaType = questionMatch ? 'question' : 'answer';

    console.log(`📋 Извлечён ID из файла ${fileName}: ${questionId} (${mediaType})`);

    // Определяем тип медиа по расширению файла или по MIME типу из localFileInfo
    let extension = fileName.split('.').pop()?.toLowerCase();

    // Если расширение неизвестно, пробуем определить по MIME типу
    if (extension === 'bin' || extension === 'unknown' || !extension) {
      const mimeType = localFileInfo.fileType;
      if (mimeType.startsWith('image/')) extension = 'png';
      else if (mimeType.startsWith('video/')) extension = 'mp4';
      else if (mimeType.startsWith('audio/')) extension = 'mp3';
    }

    console.log(`🔍 Файл ${fileName} имеет расширение: ${extension}, MIME: ${localFileInfo.fileType}`);

    // ПРИОРИТЕТ ПРЕФИКСА: если файл начинается с question_, это question media
    // если начинается с answer_, это answer media
    if (mediaType === 'question') {
      questionMediaMap.set(questionId, { blobUrl, mediaId, localFileInfo });
      console.log(`📋 Файл ${fileName} -> question media для вопроса ${questionId}`);
    } else {
      answerMediaMap.set(questionId, { blobUrl, mediaId, localFileInfo });
      console.log(`📋 Файл ${fileName} -> answer media для вопроса ${questionId}`);
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
      console.log(`🔍 Найден media:// путь для вопроса ${questionId}: ${currentUrl}`);

      if (mediaMap.has(questionId)) {
        const mediaData = mediaMap.get(questionId)!;
        console.log(`✅ Замена media:// на blob URL для вопроса ${questionId}`);
        updatedCount++;
        return mediaData.blobUrl;
      } else {
        console.log(`⚠️ Не найден blob URL для вопроса ${questionId}`);
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
            console.log(`🔄 Обновление question media для ${question.id}:`);
            console.log(`   Старый URL: ${question.media.url?.slice(0, 50) || 'пусто'}...`);
            console.log(`   Новый URL: ${mediaData.blobUrl.slice(0, 50)}...`);

            question.media.url = mediaData.blobUrl;
            question.media.localFile = mediaData.localFileInfo;
            updatedCount++;
            console.log(`✅ Обновлено question media для ${question.id}`);
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
            console.log(`🔄 Обновление answer media для ${question.id}:`);
            console.log(`   Старый URL: ${question.answerMedia.url?.slice(0, 50) || 'пусто'}...`);
            console.log(`   Новый URL: ${mediaData.blobUrl.slice(0, 50)}...`);

            question.answerMedia.url = mediaData.blobUrl;
            question.answerMedia.localFile = mediaData.localFileInfo;
            updatedCount++;
            console.log(`✅ Обновлено answer media для ${question.id}`);
          }
        }
      }
    }
  }

  console.log(`✅ Обновление завершено: ${updatedCount} media URL обновлено`);
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