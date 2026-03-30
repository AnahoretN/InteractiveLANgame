/**
 * ZIP Pack Manager
 * Управление пакетами с медиа файлами в ZIP архивах
 */

import JSZip from 'jszip';
import type { GamePack } from '../components/host/packeditor/types';
import { saveAs } from 'file-saver';

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

  console.log('📦 JSON пакет загружен:', pack.name);

  // 2. Загружаем медиа файлы и создаем blob URL
  const mediaFolder = zip.folder('media');
  let mediaFilesCount = 0;

  if (mediaFolder) {
    // Правильно итерируемся по файлам в media папке
    const mediaFiles = [];
    zip.forEach((relativePath, file) => {
      if (relativePath.startsWith('media/') && !file.dir) {
        mediaFiles.push({ relativePath, file });
      }
    });

    console.log(`📁 Найдено ${mediaFiles.length} медиа файлов`);

    for (const { relativePath, file: zipFile } of mediaFiles) {
      try {
        // Получаем blob из архива
        const blob = await zipFile.async('blob');

        // Создаем blob URL
        const blobUrl = URL.createObjectURL(blob);

        console.log('🔗 Создан blob URL из архива:', {
          path: relativePath,
          size: blob.size,
          type: blob.type,
          blobUrl: blobUrl.slice(0, 50) + '...'
        });

        // Заменяем пути в паке на blob URL
        replaceMediaPathWithBlobUrl(pack, relativePath, blobUrl);
        mediaFilesCount++;
      } catch (error) {
        console.error('❌ Ошибка загрузки файла из архива:', relativePath, error);
      }
    }
  }

  console.log(`✅ Пакет загружен: ${mediaFilesCount} медиа файлов восстановлено`);

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