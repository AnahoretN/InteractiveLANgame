/**
 * TimerDisplay Component
 * Displays reading and response timers during gameplay
 */

import React, { memo } from 'react';
import { Clock } from 'lucide-react';

interface TimerDisplayProps {
  phase: 'reading' | 'response' | 'inactive';
  readingTimeRemaining: number;
  responseTimeRemaining: number;
  totalTime?: number;
}

export const TimerDisplay = memo(({
  phase,
  readingTimeRemaining,
  responseTimeRemaining,
  totalTime
}: TimerDisplayProps) => {
  const formatTime = (ms: number): string => {
    const seconds = Math.ceil(ms / 1000);
    return `${seconds}s`;
  };

  const getProgress = (remaining: number, total: number): number => {
    if (total === 0) return 0;
    return ((total - remaining) / total) * 100;
  };

  if (phase === 'inactive') {
    return null;
  }

  return (
    <div className="flex items-center gap-4">
      {/* Reading timer */}
      {phase === 'reading' && (
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-blue-400" />
          <div className="text-white">
            <span className="text-sm text-gray-400 mr-1">Чтение:</span>
            <span className="text-xl font-bold font-mono">
              {formatTime(readingTimeRemaining)}
            </span>
          </div>
          {totalTime && totalTime > 0 && (
            <div className="w-2 h-8 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-1000 ease-linear"
                style={{ width: `${getProgress(readingTimeRemaining, totalTime)}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Response timer */}
      {phase === 'response' && (
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-orange-400" />
          <div className="text-white">
            <span className="text-sm text-gray-400 mr-1">Ответ:</span>
            <span className="text-xl font-bold font-mono">
              {formatTime(responseTimeRemaining)}
            </span>
          </div>
          {totalTime && totalTime > 0 && (
            <div className="w-2 h-8 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-orange-500 transition-all duration-1000 ease-linear"
                style={{ width: `${getProgress(responseTimeRemaining, totalTime)}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Timer finished indicator */}
      {(readingTimeRemaining === 0 || responseTimeRemaining === 0) && (
        <div className="text-green-400 font-semibold">
          Время!
        </div>
      )}
    </div>
  );
});

TimerDisplay.displayName = 'TimerDisplay';
