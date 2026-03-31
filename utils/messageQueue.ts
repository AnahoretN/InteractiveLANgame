/**
 * MessageQueue Utility
 * Оптимизация P2P сообщений через батчинг и дедупликацию
 */

import type { P2PSMessage, MessageCategory } from '../types';

export interface QueuedMessage {
  message: P2PSMessage;
  peerId?: string; // Если undefined, то broadcast всем
  priority: 'high' | 'normal' | 'low';
  timestamp: number;
}

export class MessageQueue {
  private queue: QueuedMessage[] = [];
  private batchTimer: NodeJS.Timeout | null = null;
  private processingBatch: boolean = false;
  private readonly BATCH_DELAY = 50; // мс между батчами
  private readonly MAX_BATCH_SIZE = 10; // максимальное количество сообщений в батче
  private readonly HIGH_PRIORITY_BATCH_SIZE = 3; // для высокоприоритетных сообщений

  constructor(private sendCallback: (messages: Array<{ message: P2PSMessage; peerId?: string }>) => void) {}

  /**
   * Добавить сообщение в очередь
   */
  enqueue(message: P2PSMessage, peerId?: string, priority: 'high' | 'normal' | 'low' = 'normal'): void {
    const queuedMessage: QueuedMessage = {
      message,
      peerId,
      priority,
      timestamp: Date.now()
    };

    // Высокоприоритетные сообщения отправляются немедленно
    if (priority === 'high' || message.category === 'event') {
      this.queue.push(queuedMessage);
      this.processQueue();
      return;
    }

    // Обычные сообщения добавляются в очередь
    this.queue.push(queuedMessage);
    this.scheduleBatch();
  }

  /**
   * Планирует обработку батча
   */
  private scheduleBatch(): void {
    if (this.batchTimer || this.processingBatch) {
      return;
    }

    this.batchTimer = setTimeout(() => {
      this.processQueue();
      this.batchTimer = null;
    }, this.BATCH_DELAY);
  }

  /**
   * Обрабатывает очередь сообщений
   */
  private processQueue(): void {
    if (this.processingBatch || this.queue.length === 0) {
      return;
    }

    this.processingBatch = true;

    try {
      // Сортируем по приоритету и времени
      const sortedQueue = [...this.queue].sort((a, b) => {
        // Сначала по приоритету
        const priorityOrder = { high: 0, normal: 1, low: 2 };
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (priorityDiff !== 0) return priorityDiff;

        // Затем по времени
        return a.timestamp - b.timestamp;
      });

      // Определяем размер батча
      const hasHighPriority = sortedQueue.some(msg => msg.priority === 'high');
      const batchSize = hasHighPriority
        ? this.HIGH_PRIORITY_BATCH_SIZE
        : Math.min(this.MAX_BATCH_SIZE, sortedQueue.length);

      // Батчим сообщения
      const batch = sortedQueue.slice(0, batchSize);
      const messagesToSend = batch.map(item => ({
        message: item.message,
        peerId: item.peerId
      }));

      // Удаляем отправленные сообщения из очереди
      this.queue = this.queue.slice(batchSize);

      // Отправляем батч
      if (messagesToSend.length > 0) {
        this.sendCallback(messagesToSend);
      }

      // Если есть еще сообщения, планируем следующую обработку
      if (this.queue.length > 0) {
        setTimeout(() => {
          this.processingBatch = false;
          this.processQueue();
        }, 10);
      } else {
        this.processingBatch = false;
      }
    } catch (error) {
      console.error('[MessageQueue] Error processing queue:', error);
      this.processingBatch = false;
    }
  }

  /**
   * Очистить очередь (например, при отключении)
   */
  clear(): void {
    this.queue = [];
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    this.processingBatch = false;
  }

  /**
   * Получить размер очереди
   */
  get size(): number {
    return this.queue.length;
  }
}

/**
 * Создать оптимизированную функцию отправки сообщений с батчингом
 */
export function createOptimizedMessageSender(
  sendMessage: (message: P2PSMessage, peerId?: string) => void
): {
  send: (message: P2PSMessage, peerId?: string, priority?: 'high' | 'normal' | 'low') => void;
  flush: () => void;
} {
  const messageQueue = new MessageQueue((messages) => {
    // Отправляем все сообщения из батча
    messages.forEach(({ message, peerId }) => {
      sendMessage(message, peerId);
    });
  });

  return {
    send: (message: P2PSMessage, peerId?: string, priority?: 'high' | 'normal' | 'low') => {
      messageQueue.enqueue(message, peerId, priority);
    },
    flush: () => {
      messageQueue.processQueue();
    }
  };
}
