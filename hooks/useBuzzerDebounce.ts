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

    // Check if enough time has passed
    if (timeSinceLastAction < delay) {
      return false; // Skip this action
    }

    // Check additional skip condition if provided
    if (skipCondition && skipCondition()) {
      return false;
    }

    // Execute the callback
    lastActionRef.current = now;
    callback();
    return true;
  }, [delay]);

  const reset = useCallback(() => {
    lastActionRef.current = 0;
  }, []);

  return { debouncedCallback, reset };
}
