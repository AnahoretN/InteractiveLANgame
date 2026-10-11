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
    return;
  }


  const question = activeQuestion.question;


  // Обработка медиа вопроса
  if (question.media) {
    const mediaId = `question_${question.id}_media`;


    if (!transferredMediaIds.has(mediaId)) {
      try {
        let file: File | null = null;

        // Попытка получить файл из IndexedDB
        if (question.media.localFile?.mediaId) {
          file = await getMediaFile(question.media.localFile.mediaId);
        }

        // Создаем информацию о медиа
        const mediaInfo = await createMediaInfo(
          mediaId,
          question.media.url || '',
          file || undefined,
          question.media.type as 'image' | 'video' | 'audio' | 'youtube' // Pass explicit type from question
        );


        const transferMessage = createMediaTransferMessage(mediaInfo, hostId);


        onBroadcastMessage(transferMessage);
        transferredMediaIds.add(mediaId);


      } catch (error) {
        console.error('[SyncMediaStreamer] ❌ Error transferring question media:', error);
      }
    } else {
    }
  } else {
  }

  // Обработка медиа ответа
  if (question.answerMedia) {
    const mediaId = `question_${question.id}_answer_media`;


    if (!transferredMediaIds.has(mediaId)) {
      try {
        let file: File | null = null;

        if (question.answerMedia.localFile?.mediaId) {
          file = await getMediaFile(question.answerMedia.localFile.mediaId);
        }

        const mediaInfo = await createMediaInfo(
          mediaId,
          question.answerMedia.url || '',
          file || undefined,
          question.answerMedia.type as 'image' | 'video' | 'audio' | 'youtube' // Pass explicit type from question
        );


        const transferMessage = createMediaTransferMessage(mediaInfo, hostId);
        onBroadcastMessage(transferMessage);
        transferredMediaIds.add(mediaId);


      } catch (error) {
        console.error('[SyncMediaStreamer] ❌ Error transferring answer media:', error);
      }
    } else {
    }
  } else {
  }

}

/**
 * Clear transferred media cache when needed (e.g., when changing questions)
 */
export function clearTransferredMediaCache(): void {
  transferredMediaIds.clear();
}