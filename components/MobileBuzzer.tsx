/**
 * MobileBuzzer Component
 * Buzzer button for mobile clients during gameplay
 */

import React, { memo, useState, useEffect, useCallback } from 'react';
import { Volume2, Signal } from 'lucide-react';

interface MobileBuzzerProps {
  canBuzz: boolean;
  onBuzz: () => void;
  teamName?: string;
  teamScore?: number;
  connectionQuality: {
    rtt: number;
    healthScore: number;
  };
}

export const MobileBuzzer = memo(({
  canBuzz,
  onBuzz,
  teamName,
  teamScore = 0,
  connectionQuality
}: MobileBuzzerProps) => {
  const [isPressed, setIsPressed] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  // Handle buzz with haptic feedback
  const handleBuzz = useCallback(() => {
    if (!canBuzz) return;

    setIsPressed(true);
    onBuzz();

    // Haptic feedback (if supported)
    if ('vibrate' in navigator) {
      navigator.vibrate(100);
    }

    // Reset after animation
    setTimeout(() => setIsPressed(false), 300);
  }, [canBuzz, onBuzz]);

  // Keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.code === 'Space' || e.key === 'Enter') && canBuzz) {
        e.preventDefault();
        handleBuzz();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canBuzz, handleBuzz]);

  // Health color
  const getHealthColor = () => {
    if (connectionQuality.healthScore >= 80) return 'text-green-400';
    if (connectionQuality.healthScore >= 50) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 bg-gray-950">
      {/* Connection quality indicator */}
      <div className="absolute top-4 left-4">
        <div className={`flex items-center gap-2 px-3 py-1 rounded-full border ${
          connectionQuality.healthScore >= 80
            ? 'bg-green-500/20 text-green-400 border-green-500/20'
            : connectionQuality.healthScore >= 50
            ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/20'
            : 'bg-red-500/20 text-red-400 border-red-500/20'
        }`}>
          <Signal className="w-3 h-3" />
          <span className="text-xs font-semibold">{connectionQuality.rtt}ms</span>
        </div>
      </div>

      {/* Team info */}
      {(teamName || teamScore !== undefined) && (
        <div className="absolute top-4 right-4 flex items-center gap-2 bg-gray-800/50 px-3 py-1.5 rounded-full">
          <span className="text-sm text-white">{teamName}</span>
          {teamScore !== undefined && (
            <span className="text-sm text-gray-300">• {teamScore}</span>
          )}
        </div>
      )}

      {/* Main buzz button */}
      <div className="flex-1 flex items-center justify-center">
        <button
          onClick={handleBuzz}
          disabled={!canBuzz}
          className={`
            relative w-64 h-64 rounded-full
            transition-all duration-150 ease-out
            ${isPressed
              ? 'scale-90 bg-gradient-to-br from-blue-500 to-blue-600'
              : 'scale-100 active:scale-95'
            }
            ${canBuzz
              ? 'bg-gradient-to-br from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 shadow-2xl shadow-blue-500/50 cursor-pointer'
              : 'bg-gray-800 cursor-not-allowed opacity-50'
            }
          `}
        >
          {/* Button content */}
          <div className="flex flex-col items-center justify-center">
            <Volume2 className={`w-16 h-16 text-white mb-2 transition-transform duration-150 ${isPressed ? 'scale-110' : 'scale-100'}`} />
            <span className="text-white text-3xl font-black">{isPressed ? 'BUZZED!' : 'BUZZ!'}</span>
          </div>

          {/* Progress ring */}
          {canBuzz && !isPressed && (
            <div className="absolute inset-0 rounded-full border-4 border-blue-400/50"></div>
          )}

          {/* Pressed ring effect */}
          {isPressed && (
            <div className="absolute inset-0 rounded-full border-4 border-white/50 animate-ping"></div>
          )}
        </button>
      </div>

      {/* Instructions */}
      <p className="text-gray-500 text-sm text-center mt-4">
        {canBuzz ? 'Нажмите на кнопку или Space' : 'Ожидание разрешения...'}
      </p>
    </div>
  );
});

MobileBuzzer.displayName = 'MobileBuzzer';
