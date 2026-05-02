/**
 * Sequenced Message Handler for Demo Screen
 * Wraps ScreenView to add message sequencing support
 */

import React, { useEffect, useCallback, useRef, useState } from 'react';
import { P2PMessage } from '../types';
import { useSequencedMessages } from '../hooks/useSequencedMessages';
import { ScreenView } from '../ScreenView';

interface SequencedScreenViewProps {
  sessionId: string | null;
  urlHostId: string | null;
  signallingUrl: string | undefined;
}

export const SequencedScreenView: React.FC<SequencedScreenViewProps> = ({
  sessionId,
  urlHostId,
  signallingUrl
}) => {
  const [key, setKey] = useState(0);
  const forceUpdateRef = useRef(0);

  // Handler for processing messages in sequence
  const handleMessageProcessed = useCallback((message: P2PMessage) => {
    console.log('[SequencedScreenView] Processing sequenced message:', {
      type: message.type,
      sequence: message.sequence,
      category: message.category,
      timestamp: message.timestamp
    });

    // Force re-render of ScreenView by updating key
    // This ensures the screen processes messages in the correct order
    forceUpdateRef.current += 1;
    setKey(prev => prev + 1);

    // Store the message for ScreenView to process
    // We use a custom event to pass it to the ScreenView component
    window.dispatchEvent(new CustomEvent('sequenced-message-processed', {
      detail: { message }
    }));
  }, []);

  // Sequenced message handler
  const sequencedHandler = useSequencedMessages({
    onMessageProcessed: handleMessageProcessed,
    batchSize: 50,
    batchTimeout: 100,
    debug: true // Enable debug logging for sequencing
  });

  // Listen for gaps in sequence and request missing messages
  useEffect(() => {
    const handleGaps = (event: CustomEvent) => {
      const { missingSequences } = event.detail;
      console.log('[SequencedScreenView] Detected gaps in sequence:', missingSequences);

      // Request missing sequences from host
      // This will be handled by the P2P client
      window.dispatchEvent(new CustomEvent('request-missing-sequences', {
        detail: { missingSequences }
      }));
    };

    window.addEventListener('sequenced-messages-gaps', handleGaps as EventListener);
    return () => {
      window.removeEventListener('sequenced-messages-gaps', handleGaps as EventListener);
    };
  }, []);

  // Intercept incoming messages and add them to the sequenced queue
  useEffect(() => {
    const originalConsoleLog = console.log;
    let messageIntercepted = false;

    // Override console.log to intercept P2P messages (temporary hack)
    // In production, this should be done through proper P2P client hooks
    const interceptMessage = (data: any) => {
      if (data?.message?.type) {
        messageIntercepted = true;
        console.log = originalConsoleLog; // Restore console.log
        sequencedHandler.addMessage(data.message);
      }
    };

    // Listen for P2P messages
    window.addEventListener('p2p-message', interceptMessage as EventListener);

    // Listen for connection events to reset queue
    const handleConnectionChange = () => {
      console.log('[SequencedScreenView] Connection changed, resetting message queue');
      sequencedHandler.reset();
    };

    window.addEventListener('p2p-connection-change', handleConnectionChange);

    return () => {
      console.log = originalConsoleLog;
      window.removeEventListener('p2p-message', interceptMessage as EventListener);
      window.removeEventListener('p2p-connection-change', handleConnectionChange);
    };
  }, [sequencedHandler]);

  // Log queue statistics periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const stats = sequencedHandler.getStats();
      if (stats.pendingMessages > 0 || stats.gapRanges.length > 0) {
        console.log('[SequencedScreenView] Queue stats:', stats);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [sequencedHandler]);

  return (
    <div key={`sequenced-screen-${key}`}>
      <ScreenView />
    </div>
  );
};
