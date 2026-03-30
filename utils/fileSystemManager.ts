/**
 * File System Manager
 * Управление локальными файлами с автоматическим восстановлением
 */

import type { LocalFileInfo } from '../components/host/packeditor/types';

// Хранилище для FileSystemHandles
const fileHandlesStore = new Map<string, FileSystemFileHandle>();

/**
 * Сохраняет FileSystemHandle для будущего использования
 */
export function storeFileHandle(key: string, handle: FileSystemFileHandle): void {
  fileHandlesStore.set(key, handle);
  console.log('💾 FileSystemHandle сохранен:', key);
}

/**
 * Получает сохраненный FileSystemHandle
 */
export function getFileHandle(key: string): FileSystemFileHandle | undefined {
  return fileHandlesStore.get(key);
}

/**
 * Очищает все сохраненные handles
 */
export function clearFileHandles(): void {
  fileHandlesStore.clear();
}

/**
 * Создает уникальный ключ для файла
 */
function createFileKey(packId: string, itemType: string, itemId: string): string {
  return `${packId}:${itemType}:${itemId}`;
}

/**
 * Сохраняет файл как base64 строку для хранения в JSON
 */
export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix (e.g., "data:audio/mp3;base64,")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Конвертирует base64 строку обратно в File
 */
export function base64ToFile(base64: string, fileName: string, mimeType: string): File {
  // Add data URL prefix
  const dataUrl = `data:${mimeType};base64,${base64}`;

  // Convert to blob
  const byteString = atob(base64);
  const array = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) {
    array[i] = byteString.charCodeAt(i);
  }
  const blob = new Blob([array], { type: mimeType });

  return new File([blob], fileName, { type: mimeType });
}

/**
 * Получает MIME тип из base64 данных
 */
export function getMimeTypeFromBase64(base64: string): string {
  // Try to detect from data URL prefix if present
  if (base64.startsWith('data:')) {
    const match = base64.match(/data:([^;]+);base64/);
    if (match) return match[1];
  }

  // Default to common types based on file extension hints
  const fileName = arguments[1]; // Second argument might be filename
  if (fileName) {
    if (fileName.endsWith('.mp3') || fileName.endsWith('.mp2')) return 'audio/mpeg';
    if (fileName.endsWith('.wav')) return 'audio/wav';
    if (fileName.endsWith('.ogg')) return 'audio/ogg';
    if (fileName.endsWith('.m4a')) return 'audio/mp4';
    if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) return 'image/jpeg';
    if (fileName.endsWith('.png')) return 'image/png';
    if (fileName.endsWith('.gif')) return 'image/gif';
    if (fileName.endsWith('.webp')) return 'image/webp';
    if (fileName.endsWith('.mp4')) return 'video/mp4';
    if (fileName.endsWith('.webm')) return 'video/webm';
  }

  return 'application/octet-stream';
}

/**
 * Проверяет, поддерживает ли браузер File System Access API
 */
export function supportsFileSystemAccessAPI(): boolean {
  return 'showOpenFilePicker' in window;
}

/**
 * Сохраняет файл с использованием File System Access API
 */
export async function saveFileWithHandle(file: File, key: string): Promise<void> {
  if (!supportsFileSystemAccessAPI()) {
    console.log('⚠️ File System Access API не поддерживается');
    return;
  }

  try {
    // Запрашиваем разрешение на сохранение файла
    const handle = await (window as any).showSaveFilePicker({
      suggestedName: file.name,
      types: [{
        description: 'Media File',
        accept: { [file.type]: [file.name.split('.').pop() || '*'] }
      }]
    });

    // Сохраняем файл
    const writable = await handle.createWritable();
    await writable.write(file);
    await writable.close();

    // Сохраняем handle для будущего использования
    storeFileHandle(key, handle);

    console.log('✅ Файл сохранен через File System Access API:', file.name);
  } catch (error) {
    console.error('❌ Ошибка сохранения файла:', error);
    // Пользователь мог отменить сохранение - это не ошибка
    if ((error as Error).name !== 'AbortError') {
      console.warn('Не удалось сохранить файл через File System Access API');
    }
  }
}

/**
 * Восстанавливает файл из сохраненного handle
 */
export async function restoreFileFromHandle(key: string): Promise<File | null> {
  if (!supportsFileSystemAccessAPI()) {
    return null;
  }

  const handle = getFileHandle(key);
  if (!handle) {
    return null;
  }

  try {
    const file = await handle.getFile();
    console.log('✅ Файл восстановлен из handle:', file.name);
    return file;
  } catch (error) {
    console.error('❌ Ошибка восстановления файла из handle:', error);
    // Handle мог стать недействительным
    fileHandlesStore.delete(key);
    return null;
  }
}

/**
 * Создает blob URL и сохраняет handle если возможно
 */
export async function createBlobUrlWithHandle(
  file: File,
  key: string,
  saveToPack: boolean = false
): Promise<{
  blobUrl: string;
  base64?: string;
  localFileInfo: LocalFileInfo;
}> {
  // Создаем blob URL
  const blobUrl = URL.createObjectURL(file);
  const localFileInfo = createLocalFileInfo(file);

  let base64: string | undefined;

  // Если нужно сохранить в пак, конвертируем в base64
  if (saveToPack) {
    try {
      base64 = await fileToBase64(file);
      console.log('💾 Файл конвертирован в base64 для сохранения в паке:', file.name);
    } catch (error) {
      console.error('❌ Ошибка конвертации в base64:', error);
    }
  }

  // Пробуем сохранить handle для автоматического восстановления
  if (supportsFileSystemAccessAPI()) {
    storeFileHandle(key, file as any); // Type assertion для совместимости
  }

  console.log('🔗 Создан blob URL с handle:', {
    fileName: file.name,
    hasBase64: !!base64,
    hasHandle: supportsFileSystemAccessAPI()
  });

  return { blobUrl, base64, localFileInfo };
}

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
 * Автоматически восстанавливает blob URL для медиа элемента
 */
export async function restoreMediaBlobUrl(
  media: { url?: string; localFile?: LocalFileInfo; base64?: string },
  key: string
): Promise<string | null> {
  if (!media.url) return null;

  // Если URL не blob, возвращаем как есть
  if (!media.url.startsWith('blob:')) {
    return media.url;
  }

  // Если есть base64 данные, восстанавливаем из них
  if (media.base64 && media.localFile) {
    try {
      const mimeType = media.localFile.fileType || getMimeTypeFromBase64(media.base64, media.localFile.fileName);
      const file = base64ToFile(media.base64, media.localFile.fileName, mimeType);
      const newBlobUrl = URL.createObjectURL(file);
      console.log('✅ Blob URL восстановлен из base64:', media.localFile.fileName);
      return newBlobUrl;
    } catch (error) {
      console.error('❌ Ошибка восстановления из base64:', error);
    }
  }

  // Пробуем восстановить из handle
  if (supportsFileSystemAccessAPI()) {
    const file = await restoreFileFromHandle(key);
    if (file) {
      const newBlobUrl = URL.createObjectURL(file);
      console.log('✅ Blob URL восстановлен из handle:', file.name);
      return newBlobUrl;
    }
  }

  console.warn('⚠️ Не удалось восстановить blob URL:', key);
  return null;
}