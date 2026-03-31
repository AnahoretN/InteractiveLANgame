/**
 * MessageQueue Utility Tests
 * Тесты для системы батчинга P2P сообщений
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MessageQueue } from '../utils/messageQueue';
import type { P2PSMessage, MessageCategory } from '../types';

// Mock message factory
function createMockMessage(overrides?: Partial<P2PSMessage>): P2PSMessage {
  return {
    id: 'msg-' + Math.random(),
    category: 'event' as MessageCategory,
    timestamp: Date.now(),
    senderId: 'host-1',
    type: 'BUZZ',
    payload: { clientId: 'client-1', clientName: 'Test' },
    ...overrides
  };
}

describe('MessageQueue', () => {
  let messageQueue: MessageQueue;
  let sendCallback: ReturnType<typeof vi.fn>;
  let sentMessages: Array<{ message: P2PSMessage; peerId?: string }>;

  beforeEach(() => {
    sentMessages = [];
    sendCallback = vi.fn((messages) => {
      sentMessages.push(...messages);
    });
    messageQueue = new MessageQueue(sendCallback);
  });

  it('should initialize with empty queue', () => {
    expect(messageQueue.size).toBe(0);
  });

  it('should add message to queue', () => {
    const message = createMockMessage();
    messageQueue.enqueue(message);

    expect(messageQueue.size).toBeGreaterThan(0);
  });

  it('should send high priority messages immediately', () => {
    const message = createMockMessage({ category: 'event' as MessageCategory });
    messageQueue.enqueue(message, undefined, 'high');

    expect(sendCallback).toHaveBeenCalledTimes(1);
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0].message).toEqual(message);
  });

  it('should batch normal priority messages', () => {
    vi.useFakeTimers();

    // Add multiple normal messages
    for (let i = 0; i < 5; i++) {
      const message = createMockMessage({
        category: 'sync' as MessageCategory,
        id: `msg-${i}`
      });
      messageQueue.enqueue(message);
    }

    // Process queue after batch delay
    vi.advanceTimersByTime(60); // More than BATCH_DELAY (50ms)

    expect(sendCallback).toHaveBeenCalled();
    expect(sentMessages.length).toBeGreaterThan(0);
  });

  it('should respect batch size limits', () => {
    vi.useFakeTimers();

    // Add more messages than MAX_BATCH_SIZE
    for (let i = 0; i < 15; i++) {
      const message = createMockMessage({
        category: 'sync' as MessageCategory,
        id: `msg-${i}`
      });
      messageQueue.enqueue(message);
    }

    vi.advanceTimersByTime(60);

    // Should not send all 15 at once (max is 10)
    expect(sentMessages.length).toBeLessThanOrEqual(10);
  });

  it('should prioritize high priority messages', () => {
    vi.useFakeTimers();

    // Add normal messages
    for (let i = 0; i < 5; i++) {
      const message = createMockMessage({
        category: 'sync' as MessageCategory,
        id: `sync-${i}`
      });
      messageQueue.enqueue(message);
    }

    // Add high priority message
    const highPriorityMessage = createMockMessage({
      category: 'event' as MessageCategory,
      id: 'urgent-msg'
    });
    messageQueue.enqueue(highPriorityMessage, undefined, 'high');

    vi.advanceTimersByTime(60);

    // High priority should be in first batch
    const firstBatchIds = sentMessages.slice(0, 3).map(m => m.message.id);
    expect(firstBatchIds).toContain('urgent-msg');
  });

  it('should clear queue when requested', () => {
    // Add messages
    for (let i = 0; i < 5; i++) {
      const message = createMockMessage();
      messageQueue.enqueue(message);
    }

    expect(messageQueue.size).toBeGreaterThan(0);

    messageQueue.clear();

    expect(messageQueue.size).toBe(0);
  });

  it('should send to specific peer when peerId provided', () => {
    const message = createMockMessage();
    const peerId = 'client-123';

    messageQueue.enqueue(message, peerId, 'high');

    expect(sendCallback).toHaveBeenCalledWith([
      { message, peerId }
    ]);
  });

  it('should broadcast when no peerId provided', () => {
    const message = createMockMessage();

    messageQueue.enqueue(message, undefined, 'high');

    expect(sendCallback).toHaveBeenCalledWith([
      { message, peerId: undefined }
    ]);
  });

  it('should handle empty queue gracefully', () => {
    vi.useFakeTimers();

    messageQueue.processQueue();

    expect(sendCallback).not.toHaveBeenCalled();
  });

  it('should remove sent messages from queue', () => {
    vi.useFakeTimers();

    const message = createMockMessage();
    messageQueue.enqueue(message);

    const sizeBefore = messageQueue.size;

    vi.advanceTimersByTime(60);

    const sizeAfter = messageQueue.size;

    expect(sizeAfter).toBeLessThan(sizeBefore);
  });
});
