/**
 * useInterval Hook
 * Provides a declarative way to use setInterval with automatic cleanup
 */

import { useEffect, useRef, type DependencyList } from 'react';

/**
 * Hook for setting up an interval with automatic cleanup
 * @param callback - Function to call on each interval
 * @param delay - Interval delay in milliseconds (null to pause)
 * @param deps - Dependencies array (when changed, interval resets)
 */
export function useInterval(callback: () => void, delay: number | null, deps: DependencyList = []) {
  const savedCallback = useRef(callback);

  // Remember the latest callback if it changes
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback, ...deps]);

  // Set up the interval
  useEffect(() => {
    if (delay === null) {
      return;
    }

    const tick = () => {
      savedCallback.current();
    };

    const id = setInterval(tick, delay);

    return () => {
      clearInterval(id);
    };
  }, [delay, ...deps]);
}
