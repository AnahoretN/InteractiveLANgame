/**
 * Media Streaming Utilities
 *
 * Utilities for streaming media files from host to demo screen via P2P.
 * Handles local files, YouTube links, and external URLs.
 */

import { convertYouTubeToEmbed } from './mediaUtils';
import type { MediaTransferMessage } from '../types';

export interface MediaInfo {
  mediaId: string;
  mediaType: 'image' | 'video' | 'audio' | 'youtube';
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  url?: string;
  fileData?: string; // Base64 encoded data
  isYouTube: boolean;
  isLocalFile: boolean;
}

/**
 * Check if URL is a YouTube link
 */
export function isYouTubeUrl(url: string): boolean {
  if (!url) return false;
  const patterns = [
    /youtube\.com\/watch\?v=/,
    /youtu\.be\//,
    /youtube\.com\/embed\//
  ];
  return patterns.some(pattern => pattern.test(url));
}

/**
 * Check if URL is a blob URL (local file)
 */
export function isBlobUrl(url: string): boolean {
  return url?.startsWith('blob:') || false;
}

/**
 * Check if URL is an external HTTP(S) URL
 */
export function isExternalUrl(url: string): boolean {
  return url?.startsWith('http://') || url?.startsWith('https://');
}

/**
 * Detect media type from URL or MIME type
 */
export function detectMediaType(url: string, mimeType?: string): 'image' | 'video' | 'audio' | 'youtube' {
  if (isYouTubeUrl(url)) return 'youtube';

  // First check MIME type (most reliable)
  if (mimeType) {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
  }

  // For blob URLs without MIME type, check the original filename if stored
  if (url && isBlobUrl(url)) {
    // Blob URLs don't have extensions, so we can't determine type from URL
    // Return 'image' as default, but this should be handled by proper MIME type
    console.warn('[detectMediaType] Blob URL without MIME type, using default:', url.slice(0, 50));
    return 'image';
  }

  // For external URLs, check extension
  if (url) {
    const extension = url.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(extension || '')) return 'image';
    if (['mp4', 'webm', 'ogg', 'mov'].includes(extension || '')) return 'video';
    if (['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(extension || '')) return 'audio';
  }

  console.warn('[detectMediaType] Unable to detect media type, using default image:', { url, mimeType });
  return 'image'; // Default fallback
}

/**
 * Progress callback for file operations
 */
export interface FileProgress {
  loaded: number;
  total: number;
  percent: number;
}

/**
 * Options for file to base64 conversion
 */
export interface FileToBase64Options {
  chunkSize?: number; // Chunk size for large files (default: 2MB)
  onProgress?: (progress: FileProgress) => void;
  signal?: AbortSignal; // For cancellation
  useWebWorker?: boolean; // Use Web Worker for processing (default: auto-detect)
}

/**
 * Convert File to base64 string with chunked reading for large files
 * Prevents freezing on large files and provides progress updates
 */
export async function fileToBase64(
  file: File,
  options?: FileToBase64Options
): Promise<string> {
  const { chunkSize = 2 * 1024 * 1024, onProgress, signal, useWebWorker } = options || {};

  // For small files (< 5MB), use simple method
  if (file.size < 5 * 1024 * 1024) {
    return simpleFileToBase64(file, signal);
  }

  // For large files, use chunked reading
  return chunkedFileToBase64(file, chunkSize, onProgress, signal);
}

/**
 * Simple file to base64 conversion for small files
 */
function simpleFileToBase64(file: File, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Operation aborted'));
      return;
    }

    const reader = new FileReader();
    const abortHandler = () => {
      reader.abort();
      reject(new Error('Operation aborted'));
    };

    signal?.addEventListener('abort', abortHandler);

    reader.onload = () => {
      signal?.removeEventListener('abort', abortHandler);
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };

    reader.onerror = () => {
      signal?.removeEventListener('abort', abortHandler);
      reject(reader.error);
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Chunked file to base64 conversion for large files
 * Reads file in chunks to prevent memory spikes
 */
async function chunkedFileToBase64(
  file: File,
  chunkSize: number,
  onProgress?: (progress: FileProgress) => void,
  signal?: AbortSignal
): Promise<string> {
  if (signal?.aborted) {
    throw new Error('Operation aborted');
  }

  const chunks: string[] = [];
  let offset = 0;

  while (offset < file.size) {
    if (signal?.aborted) {
      throw new Error('Operation aborted');
    }

    const end = Math.min(offset + chunkSize, file.size);
    const blob = file.slice(offset, end);

    // Read chunk as base64
    const chunkBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix
        resolve(result.split(',')[1]);
      };

      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });

    chunks.push(chunkBase64);

    // Report progress
    if (onProgress) {
      onProgress({
        loaded: end,
        total: file.size,
        percent: Math.round((end / file.size) * 100)
      });
    }

    offset = end;

    // Yield to event loop to prevent blocking
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  // Combine all chunks
  return chunks.join('');
}

/**
 * Create media info object for streaming
 */
export async function createMediaInfo(
  mediaId: string,
  url: string,
  localFile?: File,
  explicitType?: 'image' | 'video' | 'audio' | 'youtube' // Explicit type from question.media.type
): Promise<MediaInfo> {
  const isYouTube = isYouTubeUrl(url);
  const isBlob = isBlobUrl(url);
  const isExternal = isExternalUrl(url);

  // Use explicit type if provided, otherwise detect from URL/file
  let mediaType: 'image' | 'video' | 'audio' | 'youtube';
  if (explicitType) {
    mediaType = explicitType;
    console.log('[createMediaInfo] Using explicit media type:', explicitType);
  } else {
    mediaType = detectMediaType(url, localFile?.type);
    console.log('[createMediaInfo] Detected media type:', mediaType, 'from URL and file');
  }

  const mediaInfo: MediaInfo = {
    mediaId,
    mediaType,
    isYouTube,
    isLocalFile: isBlob
  };

  if (isYouTube) {
    // YouTube links don't need file data, just the URL
    mediaInfo.url = convertYouTubeToEmbed(url);
  } else if (isExternal && !isBlob) {
    // External URLs can be passed directly
    mediaInfo.url = url;
  } else if (isBlob && localFile) {
    // Local blob files need to be converted to base64
    mediaInfo.fileName = localFile.name;
    mediaInfo.fileType = localFile.type;
    mediaInfo.fileSize = localFile.size;
    mediaInfo.fileData = await fileToBase64(localFile);
  }

  return mediaInfo;
}

/**
 * Create media transfer message from media info
 */
export function createMediaTransferMessage(mediaInfo: MediaInfo, senderId: string): MediaTransferMessage {
  return {
    id: `media_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    category: 'state' as const,
    timestamp: Date.now(),
    senderId,
    type: 'MEDIA_TRANSFER',
    payload: {
      mediaId: mediaInfo.mediaId,
      mediaType: mediaInfo.mediaType,
      fileName: mediaInfo.fileName || '',
      fileType: mediaInfo.fileType || '',
      fileSize: mediaInfo.fileSize || 0,
      fileData: mediaInfo.fileData,
      url: mediaInfo.url,
      isYouTube: mediaInfo.isYouTube
    }
  };
}

/**
 * Convert base64 back to blob URL
 */
export function base64ToBlobUrl(base64: string, mimeType: string): string {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);

  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }

  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: mimeType });
  return URL.createObjectURL(blob);
}

/**
 * Process received media transfer message and return usable URL
 */
export async function processMediaTransfer(message: MediaTransferMessage): Promise<string | null> {
  const { payload } = message;

  if (payload.isYouTube && payload.url) {
    // YouTube links work directly
    return payload.url;
  }

  if (payload.url && isExternalUrl(payload.url) && !payload.fileData) {
    // External URL (not local file)
    return payload.url;
  }

  if (payload.fileData && payload.fileType) {
    // Local file transferred as base64
    try {
      return base64ToBlobUrl(payload.fileData, payload.fileType);
    } catch (error) {
      console.error('Error converting base64 to blob:', error);
      return null;
    }
  }

  console.warn('Unable to process media transfer:', payload);
  return null;
}

/**
 * Check if media needs to be transferred (vs being accessible directly)
 */
export function needsMediaTransfer(url: string): boolean {
  const result = isBlobUrl(url); // Only blob URLs need transfer
  console.log('[needsMediaTransfer] Check:', {
    url,
    isBlob: isBlobUrl(url),
    needsTransfer: result,
    urlPrefix: url?.substring(0, 20)
  });
  return result;
}