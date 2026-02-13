/**
 * useBuzzerTimer Hook
 * Manages buzzer timer state for reading and response phases
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useInterval } from './useInterval';
import type { BuzzerState } from '../components/host/game/types';

interface UseBuzzerTimerProps {
  readingTimeEnabled: boolean;
  readingTime: number;
  responseTimeEnabled: boolean;
  responseTime: number;
  onTimerChange?: (state: BuzzerState) => void;
  onComplete?: () => void;
}

export function useBuzzerTimer({
  readingTimeEnabled,
  readingTime,
  responseTimeEnabled,
  responseTime,
  onTimerChange,
  onComplete
}: UseBuzzerTimerProps) {
  const [isActive, setIsActive] = useState(false);
  const [currentPhase, setCurrentPhase] = useState<'reading' | 'response' | 'inactive'>('inactive');
  const [readingTimeRemaining, setReadingTimeRemaining] = useState(0);
  const [responseTimeRemaining, setResponseTimeRemaining] = useState(0);

  const intervalRef = useRef<number | null>(null);

  const startReadingTimer = useCallback(() => {
    if (!readingTimeEnabled) {
      setCurrentPhase('reading');
      setIsActive(true);
      onTimerChange?.({
        active: true,
        timerPhase: 'reading',
        readingTimerRemaining: -1,
        responseTimerRemaining: -1,
        handicapActive: false,
      });
      return;
    }

    setReadingTimeRemaining(readingTime * 1000);
    setResponseTimeRemaining(responseTime * 1000);
    setCurrentPhase('reading');
    setIsActive(true);

    onTimerChange?.({
      active: true,
      timerPhase: 'reading',
      readingTimerRemaining: readingTime * 1000,
      responseTimerRemaining: responseTime * 1000,
      handicapActive: false,
    });
  }, [readingTimeEnabled, readingTime, responseTime, onTimerChange]);

  const startResponseTimer = useCallback(() => {
    if (!responseTimeEnabled) {
      setCurrentPhase('response');
      setIsActive(true);
      return;
    }

    setReadingTimeRemaining(0);
    setResponseTimeRemaining(responseTime * 1000);
    setCurrentPhase('response');

    onTimerChange?.({
      active: true,
      timerPhase: 'response',
      readingTimerRemaining: 0,
      responseTimerRemaining: responseTime * 1000,
      handicapActive: false,
    });
  }, [responseTimeEnabled, responseTime, onTimerChange]);

  const stopTimer = useCallback(() => {
    setIsActive(false);
    setCurrentPhase('inactive');
    setReadingTimeRemaining(0);
    setResponseTimeRemaining(0);

    onTimerChange?.({
      active: false,
      timerPhase: 'inactive',
      readingTimerRemaining: 0,
      responseTimerRemaining: 0,
      handicapActive: false,
    });
  }, [onTimerChange]);

  // Handle reading timer countdown
  useInterval(() => {
    if (currentPhase === 'reading' && readingTimeRemaining > 0) {
      setReadingTimeRemaining(prev => {
        const newTime = Math.max(0, prev - 100);
        if (newTime === 0) {
          // Reading timer finished, switch to response
          startResponseTimer();
        } else {
          onTimerChange?.({
            active: true,
            timerPhase: 'reading',
            readingTimerRemaining: newTime,
            responseTimerRemaining: responseTime * 1000,
            handicapActive: false,
          });
        }
        return newTime;
      });
    }
  }, 100, [currentPhase, isActive, readingTime, responseTime, onTimerChange, startResponseTimer, onComplete]);

  // Handle response timer countdown
  useInterval(() => {
    if (currentPhase === 'response' && responseTimeRemaining > 0) {
      setResponseTimeRemaining(prev => {
        const newTime = Math.max(0, prev - 100);
        if (newTime === 0) {
          // Response timer finished
          stopTimer();
          onComplete?.();
        } else {
          onTimerChange?.({
            active: true,
            timerPhase: 'response',
            readingTimerRemaining: 0,
            responseTimerRemaining: newTime,
            handicapActive: false,
          });
        }
        return newTime;
      });
    }
  }, 100, currentPhase === 'response' && isActive);

  return {
    isActive,
    currentPhase,
    readingTimeRemaining,
    responseTimeRemaining,
    startReadingTimer,
    startResponseTimer,
    stopTimer,
  };
}
