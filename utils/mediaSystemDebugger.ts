/**
 * Media System Debugger
 *
 * Utility for debugging media streaming issues
 */

export class MediaSystemDebugger {
  /**
   * Debug media ID generation
   */
  static debugMediaId(question: any, mediaType: 'question' | 'answer') {
    const mediaId = `question_${question.id}_${mediaType}_media`;
    return mediaId;
  }

  /**
   * Check media cache on demo screen
   */
  static checkMediaCache(mediaId: string) {
    if (!window.mediaTransferCache) {
      console.warn('[MediaSystemDebugger] No mediaTransferCache found on window');
      return false;
    }

    const cachedMedia = window.mediaTransferCache.get(mediaId);

    return !!cachedMedia;
  }

  /**
   * Validate media URL
   */
  static validateMediaUrl(url: string, type: string) {
    if (!url) {
      console.error('[MediaSystemDebugger] Empty media URL for type:', type);
      return false;
    }

    try {
      new URL(url);
      return true;
    } catch (err) {
      console.error('[MediaSystemDebugger] Invalid URL:', { url, type, error: err });
      return false;
    }
  }

  /**
   * Debug active question media
   */
  static debugActiveQuestionMedia(activeQuestion: any) {

    if (activeQuestion?.id) {
      const questionMediaId = `question_${activeQuestion.id}_media`;
      const answerMediaId = `question_${activeQuestion.id}_answer_media`;


      this.checkMediaCache(questionMediaId);
      this.checkMediaCache(answerMediaId);
    }
  }

  /**
   * Test blob URL creation
   */
  static async testBlobUrlCreation(base64Data: string, mimeType: string) {
    try {

      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);

      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }

      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: mimeType });
      const blobUrl = URL.createObjectURL(blob);


      return blobUrl;
    } catch (error) {
      console.error('[MediaSystemDebugger] Blob URL creation failed:', error);
      return null;
    }
  }

  /**
   * Comprehensive media system health check
   */
  static healthCheck() {
    const health = {
      mediaTransferCache: false,
      indexedDB: false,
      mediaItems: 0,
      issues: [] as string[]
    };

    // Check mediaTransferCache
    if (window.mediaTransferCache) {
      health.mediaTransferCache = true;
      health.mediaItems = window.mediaTransferCache.size;

      // Check each cached item
      window.mediaTransferCache.forEach((value, key) => {
      });
    } else {
      health.issues.push('No mediaTransferCache found');
    }

    // Check IndexedDB
    try {
      const request = indexedDB.open('GamePackMedia', 1);

      request.onsuccess = () => {
        const db = request.result;

        // Check if the object store exists before trying to open a transaction
        if (db.objectStoreNames.contains('mediaFiles')) {
          health.indexedDB = true;
          try {
            const transaction = db.transaction(['mediaFiles'], 'readonly');
            const objectStore = transaction.objectStore('mediaFiles');
            const countRequest = objectStore.count();

            countRequest.onsuccess = () => {
            };

            countRequest.onerror = () => {
              health.issues.push('IndexedDB count failed');
            };
          } catch (err) {
            health.issues.push('IndexedDB transaction failed');
          }
        } else {
          health.indexedDB = false;
          health.issues.push('No mediaFiles object store found');
        }
      };

      request.onerror = () => {
        health.issues.push('IndexedDB access failed');
      };

      request.onupgradeneeded = () => {
        // This event is triggered when the database is being created or upgraded
        // We can create the object store here if needed
        const db = request.result;
        if (!db.objectStoreNames.contains('mediaFiles')) {
          db.createObjectStore('mediaFiles', { keyPath: 'id' });
        }
      };
    } catch (err) {
      health.issues.push('IndexedDB check failed');
    }

    return health;
  }

  /**
   * Monitor media element events
   */
  static monitorMediaElement(element: HTMLVideoElement | HTMLAudioElement, mediaId: string) {
    const events = [
      'loadstart', 'progress', 'suspend', 'abort', 'error', 'emptied',
      'stalled', 'loadedmetadata', 'loadeddata', 'canplay', 'canplaythrough'
    ];

    events.forEach(eventType => {
      element.addEventListener(eventType, (e) => {
      });
    });
  }
}

// Expose to window for easy debugging in console
if (typeof window !== 'undefined') {
  (window as any).MediaSystemDebugger = MediaSystemDebugger;
}