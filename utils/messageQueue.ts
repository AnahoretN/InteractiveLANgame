import { QueuedMessage, PeerMessage } from '../types';
import { CONNECTION_CONFIG } from '../config';
import { STORAGE_KEYS } from '../hooks/useLocalStorage';

/**
 * Message Queue System
 * Provides guaranteed message delivery with retry logic and persistence
 */
export class MessageQueue {
  private queue: QueuedMessage[] = [];
  private processing: Set<string> = new Set();
  private sendCallback: (msg: PeerMessage) => boolean;
  private persistTimer: ReturnType<typeof setInterval> | null = null;

  constructor(sendCallback: (msg: PeerMessage) => boolean) {
    this.sendCallback = sendCallback;
    this.loadFromStorage();
    this.startPersistence();
    this.startRetryLoop();
  }

  /**
   * Add a message to the queue
   */
  enqueue(message: PeerMessage, priority: QueuedMessage['priority'] = 'normal'): string {
    const id = this.generateMessageId();
    const queuedMessage: QueuedMessage = {
      id,
      payload: message,
      attempts: 0,
      maxAttempts: CONNECTION_CONFIG.MAX_RETRY_ATTEMPTS,
      timestamp: Date.now(),
      priority
    };

    // Insert based on priority (high priority first)
    const insertIndex = this.queue.findIndex(m => m.priority === 'low');
    if (insertIndex === -1 && priority === 'low') {
      this.queue.push(queuedMessage);
    } else if (priority === 'high') {
      this.queue.unshift(queuedMessage);
    } else {
      this.queue.splice(insertIndex === -1 ? this.queue.length : insertIndex, 0, queuedMessage);
    }

    this.persist();
    return id;
  }

  /**
   * Mark a message as successfully delivered
   */
  acknowledge(messageId: string): void {
    const index = this.queue.findIndex(m => m.id === messageId);
    if (index !== -1) {
      this.queue.splice(index, 1);
      this.processing.delete(messageId);
      this.persist();
    }
  }

  /**
   * Process all pending messages
   */
  processQueue(): void {
    const now = Date.now();
    const readyToSend = this.queue.filter(msg => {
      // Skip if already processing
      if (this.processing.has(msg.id)) return false;

      // Skip if max attempts reached
      if (msg.attempts >= msg.maxAttempts) return false;

      // Calculate retry delay with exponential backoff
      const delay = Math.min(
        CONNECTION_CONFIG.RETRY_DELAY_BASE * Math.pow(2, msg.attempts),
        CONNECTION_CONFIG.RETRY_DELAY_MAX
      );

      // Check if enough time has passed for retry
      return now - msg.timestamp >= delay;
    });

    for (const msg of readyToSend) {
      this.processing.add(msg.id);
      msg.attempts++;

      const success = this.sendCallback(msg.payload);

      if (!success && msg.attempts >= msg.maxAttempts) {
        // Max attempts reached, remove from queue
        console.warn(`Message ${msg.id} failed after ${msg.attempts} attempts`);
        this.queue = this.queue.filter(m => m.id !== msg.id);
        this.processing.delete(msg.id);
      }

      this.persist();
    }
  }

  /**
   * Clear all pending messages
   */
  clear(): void {
    this.queue = [];
    this.processing.clear();
    this.persist();
  }

  /**
   * Get queue statistics
   */
  getStats(): { pending: number; processing: number; failed: number } {
    return {
      pending: this.queue.filter(m => m.attempts < m.maxAttempts).length,
      processing: this.processing.size,
      failed: this.queue.filter(m => m.attempts >= m.maxAttempts).length
    };
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.persistTimer) {
      clearInterval(this.persistTimer);
    }
    this.persist();
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private startPersistence(): void {
    // Persist to localStorage every 5 seconds
    this.persistTimer = setInterval(() => {
      this.persist();
    }, 5000);
  }

  private startRetryLoop(): void {
    // Process queue every 2 seconds
    setInterval(() => {
      this.processQueue();
    }, 2000);
  }

  private persist(): void {
    try {
      const data = JSON.stringify(this.queue);
      localStorage.setItem(STORAGE_KEYS.MESSAGE_QUEUE, data);
    } catch (e) {
      console.warn('Failed to persist message queue:', e);
    }
  }

  private loadFromStorage(): void {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.MESSAGE_QUEUE);
      if (data) {
        const parsed = JSON.parse(data);
        this.queue = Array.isArray(parsed) ? parsed : [];
      }
    } catch (e) {
      console.warn('Failed to load message queue from storage:', e);
    }
  }
}

/**
 * Extract messageId from a PeerMessage
 */
export function getMessageId(message: PeerMessage): string | null {
  switch (message.type) {
    case 'JOIN':
    case 'HEARTBEAT':
    case 'PING':
    case 'HEALTH_CHECK':
    case 'HEALTH_RESPONSE':
      return message.messageId;
    default:
      return null;
  }
}

/**
 * Create a message with acknowledgment wrapper
 */
export function createAckableMessage(
  baseMessage: PeerMessage,
  requiresAck: boolean
): { message: PeerMessage; requiresAck: boolean; id: string } {
  const id = getMessageId(baseMessage) || `ack_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  return {
    message: baseMessage,
    requiresAck,
    id
  };
}
