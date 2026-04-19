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

  if (mimeType) {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
  }

  if (url) {
    const extension = url.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(extension || '')) return 'image';
    if (['mp4', 'webm', 'ogg', 'mov'].includes(extension || '')) return 'video';
    if (['mp3', 'wav', 'ogg', 'flac'].includes(extension || '')) return 'audio';
  }

  return 'image'; // Default fallback
}

/**
 * Convert File to base64 string
 */
export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix (e.g., "data:image/png;base64,")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Create media info object for streaming
 */
export async function createMediaInfo(
  mediaId: string,
  url: string,
  localFile?: File
): Promise<MediaInfo> {
  const isYouTube = isYouTubeUrl(url);
  const isBlob = isBlobUrl(url);
  const isExternal = isExternalUrl(url);

  const mediaType = detectMediaType(url, localFile?.type);

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
  return isBlobUrl(url); // Only blob URLs need transfer
}