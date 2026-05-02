/**
 * TimerDisplay Component
 *
 * Displays a countdown timer with progress bar
 * Used in question modals on demo screen
 */

import React, { useRef, useEffect } from 'react';

export interface BuzzerTimerState {
  active: boolean;
  timerPhase?: 'reading' | 'response' | 'complete' | 'inactive';
  readingTimerRemaining: number;
  responseTimerRemaining: number;
  readingTimeTotal?: number;
  responseTimeTotal?: number;
  isPaused?: boolean;
  // Color information from host
  timerColor?: 'yellow' | 'green' | 'gray';
  timerBarColor?: string;
  timerTextColor?: string;
}

export interface TimerDisplayProps {
  buzzerState: BuzzerTimerState;
  className?: string;
}

export function TimerDisplay({ buzzerState, className = '' }: TimerDisplayProps) {
  const timerTextRef = useRef<HTMLSpanElement>(null);
  const timerBarRef = useRef<HTMLDivElement>(null);

  // Update display when buzzer state changes
  useEffect(() => {
    const timerPhase = buzzerState.timerPhase || 'inactive';
    const isPaused = buzzerState.isPaused || false;

    if (!timerTextRef.current) return;

    let displayTime = 0;
    let textColor = buzzerState.timerTextColor;

    if (timerPhase === 'reading') {
      displayTime = buzzerState.readingTimerRemaining || 0;
      if (!textColor) textColor = 'text-yellow-300';
    } else if (timerPhase === 'response') {
      displayTime = buzzerState.responseTimerRemaining || 0;
      if (!textColor) textColor = 'text-green-300';
    }

    if (timerPhase === 'reading' || timerPhase === 'response') {
      const pauseText = isPaused
        ? ' <span class="text-red-400 text-sm font-bold">[PAUSED]</span>'
        : '';
      timerTextRef.current.innerHTML = `${displayTime.toFixed(1)}сек${pauseText}`;
      timerTextRef.current.className = `text-xl font-bold ${textColor}`;
    } else {
      timerTextRef.current.textContent = '';
    }

    // Update progress bar
    if (timerBarRef.current) {
      let progress = 0;
      const timerBarColor = buzzerState.timerBarColor || 'bg-gray-500';

      if (timerPhase === 'reading') {
        const totalTime = buzzerState.readingTimeTotal ?? 5;
        const currentTime = buzzerState.readingTimerRemaining || 0;
        const elapsed = totalTime - currentTime;
        progress = Math.min(100, Math.max(0, (elapsed / totalTime) * 100));
      } else if (timerPhase === 'response') {
        const totalTime = buzzerState.responseTimeTotal ?? 30;
        const currentTime = buzzerState.responseTimerRemaining || 0;
        const elapsed = totalTime - currentTime;
        progress = Math.min(100, Math.max(0, (elapsed / totalTime) * 100));
      }

      timerBarRef.current.style.width = `${progress}%`;
      timerBarRef.current.className = `h-full transition-all duration-100 ease-linear ${timerBarColor}`;
    }
  }, [
    buzzerState.timerPhase,
    buzzerState.readingTimerRemaining,
    buzzerState.responseTimerRemaining,
    buzzerState.readingTimeTotal,
    buzzerState.responseTimeTotal,
    buzzerState.isPaused,
    buzzerState.timerBarColor,
    buzzerState.timerTextColor
  ]);

  if (!buzzerState.active || buzzerState.timerPhase === 'inactive') {
    return null;
  }

  return (
    <div className={`timer-display ${className}`}>
      {/* Timer text */}
      <span ref={timerTextRef} className="text-xl font-bold" />

      {/* Timer bar - if rendered separately */}
      {timerBarRef && <div ref={timerBarRef} className="h-full transition-all duration-100 ease-linear bg-gray-500" style={{ width: '0%' }} />}
    </div>
  );
}

/**
 * TimerBar Component - separate progress bar component
 */
export interface TimerBarProps {
  buzzerState: BuzzerTimerState;
  className?: string;
}

export function TimerBar({ buzzerState, className = '' }: TimerBarProps) {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!barRef.current) return;

    const timerPhase = buzzerState.timerPhase || 'inactive';
    let progress = 0;
    const timerBarColor = buzzerState.timerBarColor || 'bg-gray-500';

    if (timerPhase === 'reading') {
      const totalTime = buzzerState.readingTimeTotal ?? 5;
      const currentTime = buzzerState.readingTimerRemaining || 0;
      const elapsed = totalTime - currentTime;
      progress = Math.min(100, Math.max(0, (elapsed / totalTime) * 100));
    } else if (timerPhase === 'response') {
      const totalTime = buzzerState.responseTimeTotal ?? 30;
      const currentTime = buzzerState.responseTimerRemaining || 0;
      const elapsed = totalTime - currentTime;
      progress = Math.min(100, Math.max(0, (elapsed / totalTime) * 100));
    }

    barRef.current.style.width = `${progress}%`;
    barRef.current.className = `h-full transition-all duration-100 ease-linear ${timerBarColor}`;
  }, [
    buzzerState.timerPhase,
    buzzerState.readingTimerRemaining,
    buzzerState.responseTimerRemaining,
    buzzerState.readingTimeTotal,
    buzzerState.responseTimeTotal,
    buzzerState.timerBarColor
  ]);

  if (!buzzerState.active || buzzerState.timerPhase === 'inactive') {
    return null;
  }

  return (
    <div ref={barRef} className={`h-full transition-all duration-100 ease-linear ${buzzerState.timerBarColor || 'bg-gray-500'} ${className}`} style={{ width: '0%' }} />
  );
}
