/**
 * Host Message Sequencer
 * Assigns sequence numbers to all outgoing messages on the host
 * Handles resend requests from demo screens
 */

import { P2PMessage, P2PSMessage, MessageResendRequestMessage, MessageResendResponseMessage } from '../types';
import { MessageSequencer } from './sequenceGenerator';

export interface HostSequencerOptions {
  sessionId?: string;
  historySize?: number;
  onResendRequested?: (missingSequences: number[]) => void;
  debug?: boolean;
}

export class HostMessageSequencer {
  private sequencer: MessageSequencer;
  private onResendRequested?: (missingSequences: number[]) => void;
  private debug: boolean;

  constructor(options?: HostSequencerOptions) {
    this.sequencer = new MessageSequencer({
      sessionId: options?.sessionId,
      historySize: options?.historySize ?? 1000
    });
    this.onResendRequested = options?.onResendRequested;
    this.debug = options?.debug ?? false;
  }

  /**
   * Prepare a single message for sending by adding sequence number
   */
  prepareMessage<T extends P2PMessage>(message: T): T {
    const prepared = this.sequencer.prepareMessage(message);

    if (this.debug) {
      console.log('[HostMessageSequencer] Prepared message:', {
        type: message.type,
        sequence: prepared.sequence,
        category: message.category
      });
    }

    return prepared as T;
  }

  /**
   * Prepare multiple messages for sending
   */
  prepareMessages<T extends P2PMessage>(messages: T[]): T[] {
    const prepared = this.sequencer.prepareMessages(messages);

    if (this.debug) {
      console.log('[HostMessageSequencer] Prepared messages:', {
        count: messages.length,
        sequences: prepared.map(m => m.sequence)
      });
    }

    return prepared as T[];
  }

  /**
   * Handle resend request from demo screen
   */
  handleResendRequest(request: MessageResendRequestMessage): MessageResendResponseMessage | null {
    const { fromSequence, toSequence, requestedSequences } = request.payload;

    if (this.debug) {
      console.log('[HostMessageSequencer] Resend request received:', {
        fromSequence,
        toSequence,
        requestedSequences: requestedSequences.length
      });
    }

    // Get messages for resend from history
    const messages = this.sequencer.getMessagesForResend(fromSequence, toSequence);

    if (messages.length === 0) {
      console.warn('[HostMessageSequencer] No messages found for resend:', {
        fromSequence,
        toSequence
      });
      return null;
    }

    if (this.debug) {
      console.log('[HostMessageSequencer] Resending messages:', {
        count: messages.length,
        sequences: messages.map(m => m.sequence)
      });
    }

    // Create resend response
    const response: MessageResendResponseMessage = {
      id: `resend-response-${Date.now()}`,
      category: 'control' as const,
      type: 'MESSAGE_RESEND_RESPONSE',
      timestamp: Date.now(),
      senderId: 'host',
      sequence: undefined, // Response messages don't need sequence numbers
      payload: {
        messages: messages as P2PSMessage[],
        fromSequence,
        toSequence
      }
    };

    return response;
  }

  /**
   * Get current session info
   */
  getSessionInfo(): {
    sessionId: string;
    currentSequence: number;
    historySize: number;
  } {
    return this.sequencer.getSessionInfo();
  }

  /**
   * Reset sequencer (e.g., for new game session)
   */
  reset(newSessionId?: string): void {
    if (this.debug) {
      console.log('[HostMessageSequencer] Resetting sequencer');
    }
    this.sequencer.reset(newSessionId);
  }

  /**
   * Get statistics about the sequencer
   */
  getStats(): {
    sessionId: string;
    currentSequence: number;
    historySize: number;
  } {
    return this.sequencer.getSessionInfo();
  }
}

/**
 * React hook for using host message sequencer
 */
import { useEffect, useRef, useCallback, useMemo } from 'react';

export function useHostMessageSequencer(options?: HostSequencerOptions) {
  const sequencerRef = useRef<HostMessageSequencer | null>(null);

  // Initialize sequencer
  useEffect(() => {
    sequencerRef.current = new HostMessageSequencer({
      ...options,
      sessionId: options?.sessionId || `session-${Date.now()}`
    });

    return () => {
      sequencerRef.current = null;
    };
  }, []); // Only initialize once

  // Prepare a single message
  const prepareMessage = useCallback(<T extends P2PMessage>(message: T): T => {
    if (!sequencerRef.current) {
      console.warn('[useHostMessageSequencer] Sequencer not initialized, returning message as-is');
      return message;
    }
    return sequencerRef.current.prepareMessage(message);
  }, []);

  // Prepare multiple messages
  const prepareMessages = useCallback(<T extends P2PMessage>(messages: T[]): T[] => {
    if (!sequencerRef.current) {
      console.warn('[useHostMessageSequencer] Sequencer not initialized, returning messages as-is');
      return messages;
    }
    return sequencerRef.current.prepareMessages(messages);
  }, []);

  // Handle resend request
  const handleResendRequest = useCallback((request: MessageResendRequestMessage): MessageResendResponseMessage | null => {
    if (!sequencerRef.current) {
      console.warn('[useHostMessageSequencer] Sequencer not initialized');
      return null;
    }
    return sequencerRef.current.handleResendRequest(request);
  }, []);

  // Get session info
  const getSessionInfo = useCallback(() => {
    if (!sequencerRef.current) {
      return {
        sessionId: 'unknown',
        currentSequence: 0,
        historySize: 0
      };
    }
    return sequencerRef.current.getSessionInfo();
  }, []);

  // Reset sequencer
  const reset = useCallback((newSessionId?: string) => {
    if (sequencerRef.current) {
      sequencerRef.current.reset(newSessionId);
    }
  }, []);

  return useMemo(() => ({
    prepareMessage,
    prepareMessages,
    handleResendRequest,
    getSessionInfo,
    reset
  }), [prepareMessage, prepareMessages, handleResendRequest, getSessionInfo, reset]);
}
