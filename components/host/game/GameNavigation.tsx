/**
 * GameNavigation Component
 * Navigation controls for game screen transitions
 */

import React, { memo, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface GameNavigationProps {
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  currentScreen: string;
  totalScreens?: number;
}

export const GameNavigation = memo(({
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  currentScreen,
  totalScreens = 5
}: GameNavigationProps) => {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' && canGoBack) {
      onBack();
    } else if (e.key === 'ArrowRight' && canGoForward) {
      onForward();
    }
  }, [canGoBack, canGoForward, onBack, onForward]);

  React.useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-gray-900/90 backdrop-blur rounded-full px-6 py-3 border border-gray-700">
      <button
        onClick={onBack}
        disabled={!canGoBack}
        className="p-2 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        title="Назад (←)"
      >
        <ChevronLeft className="w-6 h-6" />
      </button>

      {/* Screen indicator */}
      {totalScreens && (
        <div className="flex gap-2">
          {Array.from({ length: totalScreens }, (_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === 0 ? 'bg-blue-500' : 'bg-gray-600'
              }`}
            />
          ))}
        </div>
      )}

      <span className="text-gray-400 text-sm px-3">
        {currentScreen}
      </span>

      <button
        onClick={onForward}
        disabled={!canGoForward}
        className="p-2 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        title="Вперёд (→)"
      >
        <ChevronRight className="w-6 h-6" />
      </button>
    </div>
  );
});

GameNavigation.displayName = 'GameNavigation';
