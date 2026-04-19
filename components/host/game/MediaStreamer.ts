/**
 * Media Streamer Component
 *
 * Manages streaming media files from host to demo screen via P2P.
 * Handles local files, YouTube links, and external URLs.
 */

import { useEffect, useRef } from 'react';
import { createMediaInfo, createMediaTransferMessage, needsMediaTransfer } from '../../../utils/mediaStream';
import type { MediaTransferMessage } from '../../../types';
import { getMediaFile } from '../../../utils/mediaManager';

interface MediaStreamerProps {
  activeQuestion: {
    question: {
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
    };
  } | null;
  onBroadcastMessage?: (message: MediaTransferMessage) => void;
  hostId: string;
}

export const MediaStreamer = ({ activeQuestion, onBroadcastMessage, hostId }: MediaStreamerProps) => {
  const transferredMediaIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const streamMediaFiles = async () => {
      if (!activeQuestion || !onBroadcastMessage) return;

      const question = activeQuestion.question;

      // Check question media
      if (question.media?.url) {
        const mediaId = `question_${question.id}_media`;

        // Only transfer if not already transferred and needs transfer
        if (!transferredMediaIdsRef.current.has(mediaId) && needsMediaTransfer(question.media.url)) {
          console.log('[MediaStreamer] Transferring question media:', mediaId);

          try {
            // Get file from IndexedDB if it's a local file
            let file: File | null = null;
            if (question.media.localFile?.mediaId) {
              file = await getMediaFile(question.media.localFile.mediaId);
            }

            // Create media info and transfer message
            const mediaInfo = await createMediaInfo(mediaId, question.media.url, file || undefined);
            const transferMessage = createMediaTransferMessage(mediaInfo, hostId);

            onBroadcastMessage(transferMessage);
            transferredMediaIdsRef.current.add(mediaId);

            console.log('[MediaStreamer] Question media transferred successfully');
          } catch (error) {
            console.error('[MediaStreamer] Error transferring question media:', error);
          }
        } else if (question.media.url && !needsMediaTransfer(question.media.url)) {
          // For YouTube or external URLs, still send a transfer message but without file data
          const mediaId = `question_${question.id}_media`;

          if (!transferredMediaIdsRef.current.has(mediaId)) {
            console.log('[MediaStreamer] Sending external/YouTube media info:', mediaId);

            const mediaInfo = await createMediaInfo(mediaId, question.media.url);
            const transferMessage = createMediaTransferMessage(mediaInfo, hostId);

            onBroadcastMessage(transferMessage);
            transferredMediaIdsRef.current.add(mediaId);
          }
        }
      }

      // Check answer media
      if (question.answerMedia?.url) {
        const mediaId = `question_${question.id}_answer_media`;

        if (!transferredMediaIdsRef.current.has(mediaId) && needsMediaTransfer(question.answerMedia.url)) {
          console.log('[MediaStreamer] Transferring answer media:', mediaId);

          try {
            let file: File | null = null;
            if (question.answerMedia.localFile?.mediaId) {
              file = await getMediaFile(question.answerMedia.localFile.mediaId);
            }

            const mediaInfo = await createMediaInfo(mediaId, question.answerMedia.url, file || undefined);
            const transferMessage = createMediaTransferMessage(mediaInfo, hostId);

            onBroadcastMessage(transferMessage);
            transferredMediaIdsRef.current.add(mediaId);

            console.log('[MediaStreamer] Answer media transferred successfully');
          } catch (error) {
            console.error('[MediaStreamer] Error transferring answer media:', error);
          }
        } else if (question.answerMedia.url && !needsMediaTransfer(question.answerMedia.url)) {
          const mediaId = `question_${question.id}_answer_media`;

          if (!transferredMediaIdsRef.current.has(mediaId)) {
            console.log('[MediaStreamer] Sending external/YouTube answer media info:', mediaId);

            const mediaInfo = await createMediaInfo(mediaId, question.answerMedia.url);
            const transferMessage = createMediaTransferMessage(mediaInfo, hostId);

            onBroadcastMessage(transferMessage);
            transferredMediaIdsRef.current.add(mediaId);
          }
        }
      }
    };

    streamMediaFiles();
  }, [activeQuestion?.question.id, onBroadcastMessage, hostId]);

  // Clean up transferred media IDs when question changes
  useEffect(() => {
    if (!activeQuestion) {
      transferredMediaIdsRef.current.clear();
    }
  }, [activeQuestion]);

  return null; // This component doesn't render anything
};