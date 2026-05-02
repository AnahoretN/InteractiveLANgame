/**
 * Message Queue for Demo Screen
 *
 * Буферизирует сообщения и применяет их в правильном порядке
 * Решает проблему race conditions при получении сообщений
 * Enhanced with binary protocol support for improved efficiency
 */

import { P2PSMessage } from '../types';
import {
  encodeMessage,
  decodeMessage,
  shouldUseBinaryEncoding,
  estimateSizeReduction,
  binaryProtocolStats
} from './binaryProtocol';

interface QueuedMessage {
  sequence: number;
  timestamp: number;
  payload: any;
  type: string;
}

class MessageQueue {
  private expectedSequence = 0;
  private buffer: Map<number, QueuedMessage> = new Map();
  private maxBufferSize = 100; // Максимальное количество сообщений в буфере
  private maxBufferTime = 5000; // Максимальное время хранения сообщения в буфере (мс)

  // Message deduplication
  private processedMessages = new Set<string>();
  private readonly maxProcessedHistory = 1000; // Maximum processed messages to track
  private deduplicationWindow = 60000; // 60 seconds deduplication window

  /**
   * Обработать входящее сообщение
   * @returns Сообщение для применения или null если нужно ждать
   */
  processMessage(message: any): any | null {
    // Check for duplicate messages
    const messageId = this.generateMessageId(message);
    if (this.isDuplicate(messageId)) {
      console.log(`[MessageQueue] ⚠️ Duplicate message detected: ${messageId}, ignoring`);
      return null;
    }

    // Сообщения без sequence number обрабатываются немедленно
    if (message.sequence === undefined) {
      this.markAsProcessed(messageId);
      return message.payload;
    }

    const sequence = message.sequence;
    const timestamp = Date.now();

    console.log(`[MessageQueue] Received message #${sequence}, expecting #${this.expectedSequence}`);

    // Если сообщение слишком старое, игнорируем
    if (sequence < this.expectedSequence) {
      console.log(`[MessageQueue] ⚠️ Stale message #${sequence} (expecting #${this.expectedSequence}), ignoring`);
      return null;
    }

    // Если сообщение следующее по порядку, применяем немедленно
    if (sequence === this.expectedSequence) {
      console.log(`[MessageQueue] ✅ Message #${sequence} is next, processing immediately`);

      // Проверяем буфер на наличие следующих сообщений
      const processed = this.processAndDrainBuffer(message.payload, timestamp);

      return processed;
    }

    // Если сообщение из будущего, буферизируем
    if (sequence > this.expectedSequence) {
      console.log(`[MessageQueue] 🔄 Future message #${sequence} (expecting #${this.expectedSequence}), buffering`);

      // Очищаем буфер от старых сообщений
      this.cleanBuffer(timestamp);

      // Проверяем размер буфера
      if (this.buffer.size >= this.maxBufferSize) {
        console.error(`[MessageQueue] ❌ Buffer overflow (${this.buffer.size} >= ${this.maxBufferSize}), clearing`);
        this.buffer.clear();
        this.expectedSequence = sequence;
        return message.payload;
      }

      // Добавляем в буфер
      this.buffer.set(sequence, {
        sequence,
        timestamp,
        payload: message.payload,
        type: message.type || 'unknown'
      });

      return null; // Ждем пропущенных сообщений
    }

    return null;
  }

  /**
   * Обработать сообщение и слить буфер
   */
  private processAndDrainBuffer(payload: any, timestamp: number): any {
    let result = payload;
    this.expectedSequence++;

    // Mark the current message as processed
    const currentMessageId = this.generateMessageId({ sequence: this.expectedSequence - 1, timestamp });
    this.markAsProcessed(currentMessageId);

    // Проверяем буфер на наличие следующих сообщений
    while (this.buffer.has(this.expectedSequence)) {
      const nextMessage = this.buffer.get(this.expectedSequence);
      if (!nextMessage) break;

      // Проверяем, не устарело ли сообщение
      if (timestamp - nextMessage.timestamp > this.maxBufferTime) {
        console.log(`[MessageQueue] ⚠️ Buffered message #${this.expectedSequence} expired, removing`);
        this.buffer.delete(this.expectedSequence);

        // Mark expired message as processed to prevent reprocessing
        const expiredMessageId = this.generateMessageId(nextMessage.payload);
        this.markAsProcessed(expiredMessageId);

        this.expectedSequence++;
        continue;
      }

      console.log(`[MessageQueue] ✅ Processing buffered message #${this.expectedSequence}`);

      // Mark buffered message as processed
      const bufferedMessageId = this.generateMessageId(nextMessage.payload);
      this.markAsProcessed(bufferedMessageId);

      result = nextMessage.payload;
      this.buffer.delete(this.expectedSequence);
      this.expectedSequence++;
    }

    return result;
  }

  /**
   * Очистить буфер от старых сообщений
   */
  private cleanBuffer(currentTimestamp: number): void {
    for (const [sequence, message] of this.buffer.entries()) {
      if (currentTimestamp - message.timestamp > this.maxBufferTime) {
        console.log(`[MessageQueue] 🗑️ Removing expired buffered message #${sequence}`);
        this.buffer.delete(sequence);
      }
    }
  }

  /**
   * Сбросить очередь (например, при переподключении)
   */
  reset(): void {
    console.log('[MessageQueue] 🔄 Resetting queue');
    this.expectedSequence = 0;
    this.buffer.clear();
    this.processedMessages.clear();
  }

  /**
   * Generate unique message ID for deduplication
   */
  private generateMessageId(message: any): string {
    // Use combination of sequence, type, and timestamp for uniqueness
    const sequence = message.sequence ?? 'no-seq';
    const type = message.type ?? 'unknown';
    const timestamp = message.timestamp ?? Date.now();

    return `${sequence}-${type}-${timestamp}`;
  }

  /**
   * Check if message was already processed
   */
  private isDuplicate(messageId: string): boolean {
    return this.processedMessages.has(messageId);
  }

  /**
   * Mark message as processed
   */
  private markAsProcessed(messageId: string): void {
    this.processedMessages.add(messageId);

    // Cleanup old processed messages to prevent memory bloat
    if (this.processedMessages.size > this.maxProcessedHistory) {
      // Remove oldest entries (first half of the set)
      const entriesToRemove = Array.from(this.processedMessages).slice(0, this.maxProcessedHistory / 2);
      entriesToRemove.forEach(id => this.processedMessages.delete(id));
    }
  }

  /**
   * Cleanup expired processed messages based on time window
   */
  private cleanupProcessedMessages(currentTimestamp: number): void {
    // This is called periodically to remove old message IDs
    // Implementation depends on whether we store timestamps with message IDs
    // For now, we'll rely on size-based cleanup in markAsProcessed
  }

  /**
   * Получить статистику буфера
   */
  getStats() {
    return {
      expectedSequence: this.expectedSequence,
      bufferSize: this.buffer.size,
      bufferedSequences: Array.from(this.buffer.keys()).sort((a, b) => a - b),
      processedCount: this.processedMessages.size,
      deduplicationEnabled: true
    };
  }
}

// Глобальный экземпляр для демоэкрана
let messageQueue: MessageQueue | null = null;

export function getMessageQueue(): MessageQueue {
  if (!messageQueue) {
    messageQueue = new MessageQueue();
  }
  return messageQueue;
}

export { MessageQueue };

/**
 * Adaptive Batching Configuration
 * Different message categories require different batching strategies
 */
interface BatchConfig {
  delay: number;      // Delay before sending batch (ms)
  maxSize: number;    // Maximum batch size
  immediateThreshold?: number; // Send immediately if batch exceeds this size
}

const BATCH_CONFIGS: Record<string, BatchConfig> = {
  event: {
    delay: 0,          // Immediate send for buzzer/critical events
    maxSize: 1,
    immediateThreshold: 1
  },
  state: {
    delay: 10,         // Fast batching for state changes
    maxSize: 50,
    immediateThreshold: 20
  },
  sync: {
    delay: 50,         // Aggressive batching for periodic sync
    maxSize: 100,
    immediateThreshold: 50
  },
  control: {
    delay: 0,          // Immediate for control messages
    maxSize: 1,
    immediateThreshold: 1
  }
};

/**
 * System load metrics for dynamic adjustment
 */
export interface SystemLoad {
  messageRate: number; // Messages per second
  avgLatency: number; // Average processing latency in ms
  queueDepth: number; // Current queue depth
  cpuUsage?: number; // Estimated CPU usage (0-1)
}

/**
 * Dynamic batch configuration that adjusts based on system load
 */
export class DynamicBatchConfig {
  private baseConfigs: Record<string, BatchConfig> = { ...BATCH_CONFIGS };
  private loadHistory: SystemLoad[] = [];
  private readonly maxHistorySize = 10;
  private currentLoad: SystemLoad = {
    messageRate: 0,
    avgLatency: 0,
    queueDepth: 0
  };

  /**
   * Update system load metrics
   */
  updateLoad(metrics: Partial<SystemLoad>) {
    this.currentLoad = {
      ...this.currentLoad,
      ...metrics
    };

    this.loadHistory.push({ ...this.currentLoad });
    if (this.loadHistory.length > this.maxHistorySize) {
      this.loadHistory.shift();
    }
  }

  /**
   * Get adjusted batch configuration based on current load
   */
  getConfig(category: string): BatchConfig {
    const baseConfig = this.baseConfigs[category] || this.baseConfigs.state;

    // No adjustment if no load data
    if (this.loadHistory.length < 3) {
      return baseConfig;
    }

    // Calculate average load metrics
    const avgMessageRate = this.loadHistory.reduce((sum, l) => sum + l.messageRate, 0) / this.loadHistory.length;
    const avgLatency = this.loadHistory.reduce((sum, l) => sum + l.avgLatency, 0) / this.loadHistory.length;
    const avgQueueDepth = this.loadHistory.reduce((sum, l) => sum + l.queueDepth, 0) / this.loadHistory.length;

    // Dynamic adjustment factors
    let delayMultiplier = 1;
    let sizeMultiplier = 1;

    // High message rate: increase batch size, reduce delay
    if (avgMessageRate > 100) {
      sizeMultiplier = 2;
      delayMultiplier = 0.5;
    } else if (avgMessageRate > 50) {
      sizeMultiplier = 1.5;
      delayMultiplier = 0.75;
    }

    // High latency: increase batch size to amortize
    if (avgLatency > 50) {
      sizeMultiplier *= 1.5;
    }

    // Deep queue: reduce delay to flush faster
    if (avgQueueDepth > 50) {
      delayMultiplier *= 0.5;
    }

    // Apply adjustments with limits
    return {
      delay: Math.max(0, Math.min(100, baseConfig.delay * delayMultiplier)),
      maxSize: Math.min(200, Math.max(5, baseConfig.maxSize * sizeMultiplier)),
      immediateThreshold: baseConfig.immediateThreshold
        ? Math.min(200, Math.max(5, baseConfig.immediateThreshold * sizeMultiplier))
        : undefined
    };
  }

  /**
   * Get current system load
   */
  getLoad(): SystemLoad {
    return { ...this.currentLoad };
  }

  /**
   * Reset load history
   */
  reset() {
    this.loadHistory = [];
    this.currentLoad = {
      messageRate: 0,
      avgLatency: 0,
      queueDepth: 0
    };
  }
}

/**
 * Creates an adaptive message sender with category-based batching and dynamic adjustment
 * @param sendFn - Function to send message (message, peerId) => void
 * @returns Object with .send() method for sending messages
 */
export function createOptimizedMessageSender(
  sendFn: (message: string, peerId?: string) => void,
  options?: {
    batchDelay?: number;    // Legacy: default delay if category not found
    maxBatchSize?: number;  // Legacy: default max batch size
    enableDynamic?: boolean; // Enable dynamic batch adjustment
  }
): { send: (message: any, peerId?: string, priority?: string) => void; updateLoad?: (metrics: Partial<SystemLoad>) => void } {
  // Legacy fallback values
  const defaultDelay = options?.batchDelay || 10;
  const defaultMaxSize = options?.maxBatchSize || 50;
  const enableDynamic = options?.enableDynamic ?? true;

  const batch = new Map<string, any[]>();
  const timeouts = new Map<string, NodeJS.Timeout>();
  const batchMetadata = new Map<string, { category: string; createdAt: number }>();
  const dynamicConfig = enableDynamic ? new DynamicBatchConfig() : null;

  // Performance tracking for dynamic adjustment
  const perfTracking = {
    messagesSent: 0,
    startTime: Date.now(),
    lastUpdateTime: Date.now()
  };

  /**
   * Get batch configuration for message category
   */
  const getConfig = (category?: string): BatchConfig => {
    if (!category) return { delay: defaultDelay, maxSize: defaultMaxSize };

    if (dynamicConfig) {
      return dynamicConfig.getConfig(category);
    }

    return BATCH_CONFIGS[category] || { delay: defaultDelay, maxSize: defaultMaxSize };
  };

  /**
   * Update performance metrics for dynamic adjustment
   */
  const updatePerformanceMetrics = () => {
    if (!dynamicConfig) return;

    const now = Date.now();
    const elapsed = now - perfTracking.lastUpdateTime;

    if (elapsed > 1000) { // Update every second
      const messageRate = perfTracking.messagesSent / (elapsed / 1000);
      const queueDepth = Array.from(batch.values()).reduce((sum, b) => sum + b.length, 0);

      dynamicConfig.updateLoad({
        messageRate,
        queueDepth,
        avgLatency: 0 // Would need actual latency measurement
      });

      perfTracking.messagesSent = 0;
      perfTracking.lastUpdateTime = now;
    }
  };

  /**
   * Send batch of messages immediately
   * Enhanced with binary protocol support
   */
  const sendBatch = (key: string, messages: any[], peerId?: string) => {
    for (const msg of messages) {
      try {
        // Check if we should use binary encoding
        if (shouldUseBinaryEncoding(msg)) {
          const binaryData = encodeMessage(msg);
          const base64Data = btoa(String.fromCharCode(...binaryData));

          // Wrap binary message for identification
          const wrappedMessage = JSON.stringify({
            __binary: true,
            data: base64Data
          });

          sendFn(wrappedMessage, peerId);

          // Track stats
          const jsonSize = JSON.stringify(msg).length;
          const binarySize = binaryData.length;
          binaryProtocolStats.recordEncoded(jsonSize, binarySize);
        } else {
          // Use JSON encoding
          sendFn(JSON.stringify(msg), peerId);
        }

        perfTracking.messagesSent++;
      } catch (err) {
        console.error('[createOptimizedMessageSender] Error sending message:', err);
      }
    }
    updatePerformanceMetrics();
  };

  const send = (message: any, peerId?: string, priority?: string) => {
    const key = peerId || 'broadcast';
    const category = message?.category || 'state';
    const config = getConfig(category);
    const immediate = priority === 'high' || config.delay === 0;

    // Initialize batch if needed
    if (!batch.has(key)) {
      batch.set(key, []);
      batchMetadata.set(key, { category, createdAt: Date.now() });
    }

    const currentBatch = batch.get(key)!;
    currentBatch.push(message);

    // Check if we should send immediately
    const shouldSendImmediate = immediate ||
      currentBatch.length >= config.maxSize ||
      (config.immediateThreshold && currentBatch.length >= config.immediateThreshold);

    if (shouldSendImmediate) {
      // Send immediately
      batch.set(key, []);
      batchMetadata.set(key, { category, createdAt: Date.now() });

      // Clear existing timeout
      if (timeouts.has(key)) {
        clearTimeout(timeouts.get(key)!);
        timeouts.delete(key);
      }

      sendBatch(key, currentBatch, peerId);
    } else {
      // Schedule delayed send
      if (timeouts.has(key)) {
        clearTimeout(timeouts.get(key)!);
      }

      const timeout = setTimeout(() => {
        const messages = batch.get(key);
        if (messages && messages.length > 0) {
          batch.set(key, []);
          batchMetadata.delete(key);
          sendBatch(key, messages, peerId);
        }
        timeouts.delete(key);
      }, config.delay);

      timeouts.set(key, timeout);
    }
  };

  const result: any = { send };

  if (dynamicConfig) {
    result.updateLoad = (metrics: Partial<SystemLoad>) => {
      dynamicConfig.updateLoad(metrics);
    };
  }

  return result;
}

/**
 * Создаёт простой отправщик сообщений без батчинга
 * @param sendFn - Функция отправки сообщения
 * @returns Функция отправки сообщения
 */
export function createSimpleMessageSender(
  sendFn: (message: string, peerId?: string) => void
): (message: any, peerId?: string) => void {
  return (message: any, peerId?: string) => {
    try {
      sendFn(JSON.stringify(message), peerId);
    } catch (err) {
      console.error('[createSimpleMessageSender] Error sending message:', err);
    }
  };
}

/**
 * Message Priority Levels
 */
export enum MessagePriority {
  CRITICAL = 0,  // Buzzer, timer events - immediate processing
  HIGH = 1,      // State changes affecting gameplay
  NORMAL = 2,    // Regular sync messages
  LOW = 3,       // Background data, analytics
  BULK = 4       // Media chunks, file transfers
}

/**
 * Priority message queue item
 */
interface PriorityMessage {
  message: any;
  priority: MessagePriority;
  timestamp: number;
  peerId?: string;
  retries?: number;
}

/**
 * Message Prioritization Queue
 * Processes messages based on priority while preventing starvation
 */
export class MessagePriorityQueue {
  private queues: Map<MessagePriority, PriorityMessage[]> = new Map();
  private processing = false;
  private sendFn: (message: string, peerId?: string) => void;
  private readonly maxRetries = 3;
  private readonly maxQueueSize = 1000;

  // Starvation prevention - boost priority of old messages
  private readonly starvationThreshold = 5000; // 5 seconds
  private readonly starvationBoost = 1; // Priority levels to boost

  constructor(sendFn: (message: string, peerId?: string) => void) {
    this.sendFn = sendFn;

    // Initialize queues for all priority levels
    for (const priority of Object.values(MessagePriority)) {
      if (typeof priority === 'number') {
        this.queues.set(priority, []);
      }
    }
  }

  /**
   * Add message to priority queue
   */
  enqueue(message: any, priority: MessagePriority = MessagePriority.NORMAL, peerId?: string): boolean {
    // Check total queue size
    const totalSize = this.getTotalQueueSize();
    if (totalSize >= this.maxQueueSize) {
      console.warn('[MessagePriorityQueue] Queue full, dropping low priority message');
      return false;
    }

    const queue = this.queues.get(priority);
    if (!queue) {
      console.error('[MessagePriorityQueue] Invalid priority level:', priority);
      return false;
    }

    queue.push({
      message,
      priority,
      timestamp: Date.now(),
      peerId,
      retries: 0
    });

    return true;
  }

  /**
   * Process messages from queue based on priority
   */
  async process(batchSize = 10): Promise<{ processed: number; failed: number }> {
    if (this.processing) {
      return { processed: 0, failed: 0 };
    }

    this.processing = true;

    let processed = 0;
    let failed = 0;

    try {
      while (processed < batchSize && this.getTotalQueueSize() > 0) {
        // Check for starvation and boost priorities
        this.boostStarvingMessages();

        // Get next message from highest priority non-empty queue
        const nextMessage = this.getNextMessage();

        if (!nextMessage) break;

        try {
          this.sendFn(JSON.stringify(nextMessage.message), nextMessage.peerId);
          processed++;
        } catch (error) {
          console.error('[MessagePriorityQueue] Error sending message:', error);

          // Retry logic
          if (nextMessage.retries && nextMessage.retries < this.maxRetries) {
            nextMessage.retries++;
            const queue = this.queues.get(nextMessage.priority);
            queue?.push(nextMessage);
          } else {
            failed++;
          }
        }
      }
    } finally {
      this.processing = false;
    }

    return { processed, failed };
  }

  /**
   * Get next message from highest priority non-empty queue
   */
  private getNextMessage(): PriorityMessage | null {
    for (const priority of Object.values(MessagePriority)) {
      if (typeof priority === 'number') {
        const queue = this.queues.get(priority);
        if (queue && queue.length > 0) {
          return queue.shift() || null;
        }
      }
    }
    return null;
  }

  /**
   * Boost priority of messages that have been waiting too long
   * Prevents starvation of low-priority messages
   */
  private boostStarvingMessages() {
    const now = Date.now();

    for (const priority of Object.values(MessagePriority)) {
      if (typeof priority === 'number' && priority < MessagePriority.BULK) {
        const queue = this.queues.get(priority);
        if (!queue) continue;

        const starving = queue.filter(msg =>
          now - msg.timestamp > this.starvationThreshold
        );

        if (starving.length > 0) {
          const targetPriority = Math.max(
            MessagePriority.CRITICAL,
            priority - this.starvationBoost
          );

          const targetQueue = this.queues.get(targetPriority);
          if (targetQueue) {
            // Move starving messages to higher priority queue
            for (const msg of starving) {
              const index = queue.indexOf(msg);
              if (index > -1) {
                queue.splice(index, 1);
                msg.priority = targetPriority;
                targetQueue.push(msg);
              }
            }

            console.log(`[MessagePriorityQueue] Boosted ${starving.length} starving messages from ${priority} to ${targetPriority}`);
          }
        }
      }
    }
  }

  /**
   * Get total queue size across all priorities
   */
  getTotalQueueSize(): number {
    let total = 0;
    for (const queue of this.queues.values()) {
      total += queue.length;
    }
    return total;
  }

  /**
   * Get queue size for specific priority
   */
  getQueueSize(priority: MessagePriority): number {
    return this.queues.get(priority)?.length || 0;
  }

  /**
   * Clear all queues
   */
  clear() {
    for (const queue of this.queues.values()) {
      queue.length = 0;
    }
  }

  /**
   * Get queue statistics
   */
  getStats() {
    const stats: Record<string, number> = {};
    for (const [priority, queue] of this.queues.entries()) {
      stats[`priority_${priority}`] = queue.length;
    }
    stats['total'] = this.getTotalQueueSize();
    return stats;
  }
}

/**
 * Create a priority-based message sender
 */
export function createPriorityMessageSender(
  sendFn: (message: string, peerId?: string) => void,
  options?: {
    processInterval?: number; // ms between processing batches
    batchSize?: number; // messages per batch
  }
): {
  send: (message: any, priority?: MessagePriority, peerId?: string) => boolean;
  stop: () => void;
  getStats: () => Record<string, number>;
} {
  const queue = new MessagePriorityQueue(sendFn);
  const processInterval = options?.processInterval || 16; // ~60fps
  const batchSize = options?.batchSize || 10;

  let intervalId: NodeJS.Timeout | null = null;
  let totalProcessed = 0;
  let totalFailed = 0;

  const startProcessing = () => {
    if (intervalId) return;

    intervalId = setInterval(async () => {
      const result = await queue.process(batchSize);
      totalProcessed += result.processed;
      totalFailed += result.failed;

      // Log stats periodically
      if (totalProcessed > 0 && totalProcessed % 100 === 0) {
        console.log('[PriorityMessageSender] Stats:', {
          processed: totalProcessed,
          failed: totalFailed,
          queueSize: queue.getTotalQueueSize()
        });
      }
    }, processInterval);
  };

  // Auto-start processing
  startProcessing();

  return {
    send: (message: any, priority?: MessagePriority, peerId?: string) => {
      return queue.enqueue(message, priority || MessagePriority.NORMAL, peerId);
    },
    stop: () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    },
    getStats: () => queue.getStats()
  };
}

/**
 * Convenience function to get message priority from message type
 */
export function getMessagePriority(messageType: string): MessagePriority {
  const criticalTypes = ['BUZZER_PRESSED', 'TIMER_START', 'TIMER_END', 'TIMER_PAUSE'];
  const highTypes = ['STATE_UPDATE', 'QUESTION_ACTIVATE', 'SCORE_UPDATE'];
  const bulkTypes = ['MEDIA_CHUNK', 'MEDIA_TRANSFER', 'FILE_DATA'];

  if (criticalTypes.includes(messageType)) return MessagePriority.CRITICAL;
  if (highTypes.includes(messageType)) return MessagePriority.HIGH;
  if (bulkTypes.includes(messageType)) return MessagePriority.BULK;

  return MessagePriority.NORMAL;
}

/**
 * Parse incoming message data (handles both JSON and binary format)
 * Enhanced with automatic binary protocol detection and decoding
 */
export function parseMessageData(data: string | ArrayBuffer | Uint8Array): P2PSMessage | null {
  try {
    // Handle binary data
    if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
      const message = decodeMessage(data);
      if (message) {
        binaryProtocolStats.recordDecoded();
        return message;
      }
      binaryProtocolStats.recordJsonFallback();
      return null;
    }

    // Handle string data
    if (typeof data === 'string') {
      // Check for wrapped binary message
      if (data.startsWith('{')) {
        const parsed = JSON.parse(data);
        if (parsed.__binary && parsed.data) {
          // Decode binary message from base64
          const binaryString = atob(parsed.data);
          const binaryData = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            binaryData[i] = binaryString.charCodeAt(i);
          }

          const message = decodeMessage(binaryData);
          if (message) {
            binaryProtocolStats.recordDecoded();
            return message;
          }
          binaryProtocolStats.recordChecksumError();
          return null;
        }
      }

      // Regular JSON message
      return JSON.parse(data);
    }

    return null;
  } catch (error) {
    console.error('[parseMessageData] Error parsing message:', error);
    binaryProtocolStats.recordJsonFallback();
    return null;
  }
}

/**
 * Get binary protocol statistics
 */
export function getBinaryProtocolStats() {
  return binaryProtocolStats.getStats();
}

/**
 * Reset binary protocol statistics
 */
export function resetBinaryProtocolStats() {
  binaryProtocolStats.reset();
}