import { useRef, useCallback } from 'react';

/**
 * Custom hook to debounce rapid button presses
 * Prevents multiple buzzes within a short time window
 * @param delay Minimum time between actions in ms (default: 300ms)
 */
export function useBuzzerDebounce(delay: number = 300) {
  const lastActionRef = useRef<number>(0);

  const debouncedCallback = useCallback((
    callback: () => void,
    skipCondition?: () => boolean
  ) => {
    const now = Date.now();
    const timeSinceLastAction = now - lastActionRef.current;

    console.log('⏱️ [DEBOUNCE] Time since last action:', timeSinceLastAction, 'ms, required delay:', delay, 'ms');

    // Check if enough time has passed
    if (timeSinceLastAction < delay) {
      console.log('⛔ [DEBOUNCE] Buzz blocked - too soon! Time remaining:', delay - timeSinceLastAction, 'ms');
      return false; // Skip this action
    }

    // Check additional skip condition if provided
    if (skipCondition && skipCondition()) {
      console.log('⛔ [DEBOUNCE] Buzz blocked - skip condition returned true');
      return false;
    }

    // Execute the callback
    console.log('✅ [DEBOUNCE] Buzz allowed - executing callback');
    lastActionRef.current = now;
    callback();
    return true;
  }, [delay]);

  const reset = useCallback(() => {
    lastActionRef.current = 0;
  }, []);

  return { debouncedCallback, reset };
}
