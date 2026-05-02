/**
 * Sequence Generator
 * Assigns sequence numbers to messages on the host
 */

import { P2PMessage, MessageCategory } from '../types';

export class SequenceGenerator {
  private sequence: number = 0;
  private sessionId: string;

  constructor(sessionId?: string) {
    this.sessionId = sessionId ?? `session-${Date.now()}-${Math.random()}`;
  }

  /**
   * Get the next sequence number
   */
  getNextSequence(): number {
    return this.sequence++;
  }

  /**
   * Add sequence number to a message
   */
  sequenceMessage(message: P2PMessage): P2PMessage {
    return {
      ...message,
      sequence: this.getNextSequence()
    };
  }

  /**
   * Add sequence number to multiple messages
   */
  sequenceMessages(messages: P2PMessage[]): P2PMessage[] {
    return messages.map(msg => this.sequenceMessage(msg));
  }

  /**
   * Get current sequence number
   */
  getCurrentSequence(): number {
    return this.sequence;
  }

  /**
   * Reset sequence counter (e.g., for new session)
   */
  reset(newSessionId?: string): void {
    this.sequence = 0;
    if (newSessionId) {
      this.sessionId = newSessionId;
    }
  }

  /**
   * Get session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }
}

/**
 * Message sequencing utilities
 */
export class MessageSequencer {
  private sequenceGenerator: SequenceGenerator;
  private messageHistory: Map<string, P2PMessage> = new Map();
  private historySize: number;

  constructor(options?: {
    sessionId?: string;
    historySize?: number;
  }) {
    this.sequenceGenerator = new SequenceGenerator(options?.sessionId);
    this.historySize = options?.historySize ?? 1000;
  }

  /**
   * Prepare a message for sending by adding sequence number
   */
  prepareMessage(message: P2PMessage): P2PMessage {
    const sequenced = this.sequenceGenerator.sequenceMessage(message);

    // Store in history for potential resend
    this.messageHistory.set(message.id, sequenced);

    // Trim history if needed
    if (this.messageHistory.size > this.historySize) {
      const oldestId = this.messageHistory.keys().next().value;
      this.messageHistory.delete(oldestId);
    }

    return sequenced;
  }

  /**
   * Prepare multiple messages for sending
   */
  prepareMessages(messages: P2PMessage[]): P2PMessage[] {
    return messages.map(msg => this.prepareMessage(msg));
  }

  /**
   * Get a message from history by ID (for resend)
   */
  getMessageFromHistory(messageId: string): P2PMessage | undefined {
    return this.messageHistory.get(messageId);
  }

  /**
   * Get messages for resend (e.g., when client requests missing sequences)
   */
  getMessagesForResend(fromSequence: number, toSequence: number): P2PMessage[] {
    const messages: P2PMessage[] = [];

    for (const message of this.messageHistory.values()) {
      if (
        message.sequence !== undefined &&
        message.sequence >= fromSequence &&
        message.sequence <= toSequence
      ) {
        messages.push(message);
      }
    }

    return messages.sort((a, b) =>
      (a.sequence ?? 0) - (b.sequence ?? 0)
    );
  }

  /**
   * Get current session info
   */
  getSessionInfo(): {
    sessionId: string;
    currentSequence: number;
    historySize: number;
  } {
    return {
      sessionId: this.sequenceGenerator.getSessionId(),
      currentSequence: this.sequenceGenerator.getCurrentSequence(),
      historySize: this.messageHistory.size
    };
  }

  /**
   * Reset sequencer (e.g., for new game session)
   */
  reset(newSessionId?: string): void {
    this.sequenceGenerator.reset(newSessionId);
    this.messageHistory.clear();
  }
}
