/**
 * useKeyboardNavigation Hook
 * Manages keyboard navigation for game play (Space, arrows, number keys, double press)
 */

import { useEffect, useCallback, useRef } from 'react';
import type { GameScreen } from '@components/host/game/types';

export interface KeyboardNavigationOptions {
  activeQuestion: any;
  currentRoundIndex: number;
  totalRounds: number;
  currentRoundType?: 'normal' | 'super';
  selectedSuperThemeId: string | null;
  disabledSuperThemeIds: Set<string>;
  superGameBets: any[];
  packRounds: any[];
  onScreenChange: (screen: GameScreen) => void;
  onRoundIndexChange: (index: number) => void;
}

export function useKeyboardNavigation({
  activeQuestion,
  currentRoundIndex,
  totalRounds,
  currentRoundType,
  selectedSuperThemeId,
  disabledSuperThemeIds,
  superGameBets,
  packRounds,
  onScreenChange,
  onRoundIndexChange,
}: KeyboardNavigationOptions) {
  const previousScreenRef = useRef<GameScreen>('cover');
  const scrollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const themesScrollRef = useRef<HTMLDivElement | null>(null);
  const doublePressRef = useRef<{ lastKey: string; lastTime: number }>({ lastKey: '', lastTime: 0 });

  // Navigate between screens with Space
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if question modal is open or CTRL pressed
      if (activeQuestion) return;
      if (e.ctrlKey || e.key === 'Control') return;

      if (e.key === ' ') {
        e.preventDefault();
        const isSuperRound = currentRoundType === 'super';

        onScreenChange((prev: GameScreen): GameScreen => {
          const nextScreen = (() => {
            switch (prev) {
              case 'cover': return isSuperRound ? 'selectSuperThemes' : 'themes';
              case 'themes':
                // Always show round cover
                return 'round';
              case 'selectSuperThemes':
                // Only proceed to placeBets when exactly one theme remains
                const remainingCount = 1; // Would be calculated
                return remainingCount === 1 ? 'placeBets' : 'selectSuperThemes';
              case 'round':
                // For super rounds, skip board and go to selectSuperThemes
                return isSuperRound ? 'selectSuperThemes' : 'board';
              case 'placeBets':
                // Always proceed to superQuestion when Space is pressed
                return 'superQuestion';
              case 'board': return 'board'; // Stay on board
              case 'superQuestion': return 'superAnswers';
              case 'superAnswers': return 'showWinner';
              case 'showWinner': return 'showWinner'; // Stay on winner screen
              default: return prev;
            }
          }) as GameScreen;

          return nextScreen;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeQuestion, currentRoundIndex, currentRoundType, selectedSuperThemeId, superGameBets, onScreenChange]);

  // Handle double-press R (next round) and E (previous round)
  useEffect(() => {
    const DOUBLE_PRESS_THRESHOLD = 400; // ms between presses

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle when question modal is open
      if (activeQuestion) return;

      // Use e.code instead of e.key to work with any keyboard layout
      const code = e.code;
      if (code !== 'KeyR' && code !== 'KeyE') return;

      const now = Date.now();
      const { lastKey, lastTime } = doublePressRef.current;

      // Check if same key was pressed twice within threshold
      if (lastKey === code && (now - lastTime) < DOUBLE_PRESS_THRESHOLD) {
        e.preventDefault();

        if (code === 'KeyR') {
          // Next round - only if there is a next round
          if (currentRoundIndex < totalRounds - 1) {
            const nextRoundIndex = currentRoundIndex + 1;
            onRoundIndexChange(nextRoundIndex);
            onScreenChange('round');
          }
        } else if (code === 'KeyE') {
          // Previous round - only if there is a previous round
          if (currentRoundIndex > 0) {
            const prevRoundIndex = currentRoundIndex - 1;
            onRoundIndexChange(prevRoundIndex);
            onScreenChange('round');
          }
        }

        // Reset to prevent triple-press
        doublePressRef.current = { lastKey: '', lastTime: 0 };
      } else {
        doublePressRef.current = { lastKey: code, lastTime: now };
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeQuestion, totalRounds, onRoundIndexChange, onScreenChange]);

  // Handle number keys 1-9 for direct round preview
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle when question modal is open
      if (activeQuestion) return;

      // Check for digit keys 1-9 using e.code (Digit1-Digit9)
      const code = e.code;
      const digitMatch = code.match(/^Digit([1-9])$/);

      if (digitMatch) {
        const roundNumber = parseInt(digitMatch[1], 10);

        // Only proceed if this round exists (1-indexed)
        if (roundNumber <= totalRounds) {
          e.preventDefault();
          // Convert to 0-indexed
          const targetRoundIndex = roundNumber - 1;
          onRoundIndexChange(targetRoundIndex);
          onScreenChange('round');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeQuestion, totalRounds, onScreenChange, onRoundIndexChange]);

  // Handle continuous scroll with ArrowDown/ArrowUp
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only on themes or superThemes screens, not when question modal is open
      const validScreens: GameScreen[] = ['themes', 'selectSuperThemes'];
      if (!validScreens.includes(previousScreenRef.current) || activeQuestion) return;
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;

      e.preventDefault();

      // Start scrolling if not already scrolling
      if (!scrollIntervalRef.current) {
        const SCROLL_SPEED = 100; // pixels per second
        const pixelsPerFrame = SCROLL_SPEED / 60; // 60 FPS
        const direction = e.key === 'ArrowDown' ? 1 : -1;

        scrollIntervalRef.current = setInterval(() => {
          if (themesScrollRef.current) {
            themesScrollRef.current.scrollTop += pixelsPerFrame * direction;
          }
        }, 1000 / 60);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        // Stop scrolling
        if (scrollIntervalRef.current) {
          clearInterval(scrollIntervalRef.current);
          scrollIntervalRef.current = null;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current);
      }
    };
  }, [activeQuestion, previousScreenRef]);

  // Return ref for themes scroll container
  return {
    themesScrollRef,
    previousScreenRef,
  };
}
