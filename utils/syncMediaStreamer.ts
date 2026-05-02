/**
 * Synchronous Media Streamer Utility
 *
 * Вызывается синхронно перед broadcastGameState для обеспечения правильного порядка сообщений
 */

import { createMediaInfo, createMediaTransferMessage } from './mediaStream';
import type { MediaTransferMessage } from '../types';
import { getMediaFile } from './mediaManager';

interface QuestionMedia {
  id: string;
  media?: {
    type: string;
    url?: string;
    localFile?: {
      mediaId?: string;
    };
  };
  answerMedia?: {
    type: string;
    url?: string;
    localFile?: {
      mediaId?: string;
    };
  };
}

interface ActiveQuestion {
  question: QuestionMedia;
}

// Глобальное хранилище для отслеживания переданных медиа
const transferredMediaIds = new Set<string>();

/**
 * Stream media files synchronously before game state broadcast
 * Это гарантирует, что медиа.transfer сообщения приходят BEFORE GAME_STATE_UPDATE
 */
export async function streamMediaFilesSynchronously(
  activeQuestion: ActiveQuestion | null,
  onBroadcastMessage: ((message: MediaTransferMessage) => void) | undefined,
  hostId: string
): Promise<void> {
  if (!activeQuestion || !onBroadcastMessage) {
    console.log('[SyncMediaStreamer] ⚠️ Skipping - missing required data:', {
      hasActiveQuestion: !!activeQuestion,
      hasOnBroadcastMessage: !!onBroadcastMessage
    });
    return;
  }

  console.log('[SyncMediaStreamer] ===== MEDIA STREAMER START =====');
  console.log('[SyncMediaStreamer] activeQuestion:', activeQuestion);

  const question = activeQuestion.question;

  console.log('[SyncMediaStreamer] Processing question:', {
    questionId: question.id,
    hasMedia: !!question.media,
    mediaType: question.media?.type,
    mediaUrl: question.media?.url,
    hasLocalFile: !!question.media?.localFile,
    localFileId: question.media?.localFile?.mediaId,
    hasAnswerMedia: !!question.answerMedia,
    answerMediaUrl: question.answerMedia?.url
  });

  // Обработка медиа вопроса
  if (question.media) {
    const mediaId = `question_${question.id}_media`;

    console.log('[SyncMediaStreamer] Processing question media:', {
      mediaId,
      type: question.media.type,
      url: question.media.url?.substring(0, 50),
      hasLocalFile: !!question.media.localFile,
      localFileId: question.media.localFile?.mediaId,
      alreadyTransferred: transferredMediaIds.has(mediaId)
    });

    if (!transferredMediaIds.has(mediaId)) {
      try {
        let file: File | null = null;

        // Попытка получить файл из IndexedDB
        if (question.media.localFile?.mediaId) {
          console.log('[SyncMediaStreamer] Getting file from IndexedDB:', question.media.localFile.mediaId);
          file = await getMediaFile(question.media.localFile.mediaId);
          console.log('[SyncMediaStreamer] File from IndexedDB:', {
            found: !!file,
            fileName: file?.name,
            fileSize: file?.size,
            fileType: file?.type
          });
        }

        // Создаем информацию о медиа
        const mediaInfo = await createMediaInfo(
          mediaId,
          question.media.url || '',
          file || undefined,
          question.media.type as 'image' | 'video' | 'audio' | 'youtube' // Pass explicit type from question
        );

        console.log('[SyncMediaStreamer] Created media info:', {
          mediaId: mediaInfo.mediaId,
          mediaType: mediaInfo.mediaType,
          expectedType: question.media.type,
          hasFileData: !!mediaInfo.fileData,
          hasUrl: !!mediaInfo.url,
          isLocalFile: mediaInfo.isLocalFile,
          fileSize: mediaInfo.fileSize
        });

        const transferMessage = createMediaTransferMessage(mediaInfo, hostId);

        console.log('[SyncMediaStreamer] Sending transfer message:', {
          messageId: transferMessage.id,
          mediaId: transferMessage.payload.mediaId,
          mediaType: transferMessage.payload.mediaType,
          hasFileData: !!transferMessage.payload.fileData,
          hasUrl: !!transferMessage.payload.url
        });

        onBroadcastMessage(transferMessage);
        transferredMediaIds.add(mediaId);

        console.log('[SyncMediaStreamer] ✅ Question media transferred successfully');

      } catch (error) {
        console.error('[SyncMediaStreamer] ❌ Error transferring question media:', error);
      }
    } else {
      console.log('[SyncMediaStreamer] Question media already transferred');
    }
  } else {
    console.log('[SyncMediaStreamer] No question media to transfer');
  }

  // Обработка медиа ответа
  if (question.answerMedia) {
    console.log('[SyncMediaStreamer] Found answerMedia, starting transfer...');
    const mediaId = `question_${question.id}_answer_media`;

    console.log('[SyncMediaStreamer] Processing answer media:', {
      mediaId,
      type: question.answerMedia.type,
      url: question.answerMedia.url?.substring(0, 50),
      hasLocalFile: !!question.answerMedia.localFile,
      localFileId: question.answerMedia.localFile?.mediaId,
      alreadyTransferred: transferredMediaIds.has(mediaId)
    });

    if (!transferredMediaIds.has(mediaId)) {
      try {
        let file: File | null = null;

        if (question.answerMedia.localFile?.mediaId) {
          console.log('[SyncMediaStreamer] Getting answer file from IndexedDB:', question.answerMedia.localFile.mediaId);
          file = await getMediaFile(question.answerMedia.localFile.mediaId);
          console.log('[SyncMediaStreamer] Answer file from IndexedDB:', {
            found: !!file,
            fileName: file?.name,
            fileSize: file?.size,
            fileType: file?.type
          });
        }

        const mediaInfo = await createMediaInfo(
          mediaId,
          question.answerMedia.url || '',
          file || undefined,
          question.answerMedia.type as 'image' | 'video' | 'audio' | 'youtube' // Pass explicit type from question
        );

        console.log('[SyncMediaStreamer] Created answer media info:', {
          mediaId: mediaInfo.mediaId,
          mediaType: mediaInfo.mediaType,
          expectedType: question.answerMedia.type,
          hasFileData: !!mediaInfo.fileData,
          hasUrl: !!mediaInfo.url,
          isLocalFile: mediaInfo.isLocalFile
        });

        const transferMessage = createMediaTransferMessage(mediaInfo, hostId);
        onBroadcastMessage(transferMessage);
        transferredMediaIds.add(mediaId);

        console.log('[SyncMediaStreamer] ✅ Answer media transferred successfully');

      } catch (error) {
        console.error('[SyncMediaStreamer] ❌ Error transferring answer media:', error);
      }
    } else {
      console.log('[SyncMediaStreamer] Answer media already transferred');
    }
  } else {
    console.log('[SyncMediaStreamer] No answer media to transfer');
  }

  console.log('[SyncMediaStreamer] ===== MEDIA STREAMER END =====');
}

/**
 * Clear transferred media cache when needed (e.g., when changing questions)
 */
export function clearTransferredMediaCache(): void {
  console.log('[SyncMediaStreamer] Clearing transferred media IDs');
  transferredMediaIds.clear();
}