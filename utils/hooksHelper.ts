/**
 * React Hooks Helper Utilities
 * Provides utilities for proper dependency management in React hooks
 */

import { useRef, useEffect, useCallback } from 'react';

/**
 * Track previous value for comparison
 */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>();

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref.current;
}

/**
 * Stable callback that only updates when dependencies actually change
 * Useful for preventing unnecessary re-renders
 */
export function useStableCallback<T extends (...args: any[]) => any>(
  callback: T,
  deps: any[]
): T {
  const ref = useRef<T>(callback);

  // Only update ref if dependencies change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    ref.current = callback;
  }, deps);

  return useCallback((...args: any[]) => ref.current(...args), []) as T;
}

/**
 * Deep comparison for objects/arrays in dependencies
 * Prevents unnecessary re-renders when object references change but content is same
 */
export function useDeepCompareMemoize(value: any) {
  const ref = useRef(value);
  const signalRef = useRef(0);

  useEffect(() => {
    if (JSON.stringify(value) !== JSON.stringify(ref.current)) {
      ref.current = value;
      signalRef.current += 1;
    }
  }, [value]);

  return signalRef.current;
}

/**
 * Safe useEffect with proper cleanup
 * Ensures cleanup function is called on unmount
 */
export function useSafeEffect(
  effect: () => (() => void) | void,
  deps?: any[]
) {
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;

    const cleanup = effect();

    return () => {
      isMounted.current = false;
      if (cleanup) {
        cleanup();
      }
    };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * Track component mount state
 * Useful for preventing state updates after unmount
 */
export function useMountedState() {
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return useCallback(() => mountedRef.current, []);
}

/**
 * Safely update state only if component is mounted
 */
export function useSafeStateUpdate<T>(setState: (value: T | ((prev: T) => T)) => void) {
  const isMounted = useMountedState();

  return useCallback((value: T | ((prev: T) => T)) => {
    if (isMounted()) {
      setState(value);
    }
  }, [setState, isMounted]);
}

/**
 * Helper to create proper dependency arrays for callbacks
 * Prevents common mistakes with dependency management
 */
export function createCallbackDeps(
  callback: (...args: any[]) => any,
  deps: Record<string, any>
): any[] {
  // Extract values from dependency object
  return Object.values(deps);
}

/**
 * Safe async effect that handles component unmount
 * Prevents memory leaks and state updates after unmount
 */
export function useAsyncEffect(
  effect: () => Promise<void | (() => void)>,
  deps?: any[]
) {
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;

    let cleanup: (() => void) | void;

    effect().then((result) => {
      if (!isMounted.current) {
        // Component unmounted during async operation
        if (result && typeof result === 'function') {
          result();
        }
        return;
      }
      cleanup = result;
    }).catch((error) => {
      console.error('[useAsyncEffect] Error in async effect:', error);
    });

    return () => {
      isMounted.current = false;
      if (cleanup && typeof cleanup === 'function') {
        cleanup();
      }
    };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * Dependency checker for development
 * Helps identify missing or unnecessary dependencies
 */
export function useDependencyChecker(
  hookName: string,
  dependencies: Record<string, any>,
  actualDeps: any[]
) {
  if (process.env.NODE_ENV === 'development') {
    const depKeys = Object.keys(dependencies);
    const depValues = Object.values(dependencies);

    useEffect(() => {
      const missingDeps = depKeys.filter((key, index) => {
        return actualDeps[index] !== depValues[index];
      });

      if (missingDeps.length > 0) {
        console.warn(`[${hookName}] Possible dependency mismatch:`, {
          expected: depKeys,
          actual: actualDeps,
          missing: missingDeps
        });
      }
    }, [...depValues, ...actualDeps]);
  }
}

/**
 * Proper dependency extraction for specific properties
 * Use instead of including entire object in dependencies
 */
export function usePropDeps<T extends Record<string, any>, K extends keyof T>(
  props: T,
  keys: K[]
): Pick<T, K> {
  const ref = useRef<Pick<T, K>>({} as any);

  const selected = keys.reduce((acc, key) => {
    acc[key] = props[key];
    return acc;
  }, {} as Pick<T, K>);

  // Only update if selected values actually changed
  const hasChanged = keys.some(key => ref.current[key] !== props[key]);

  if (hasChanged) {
    ref.current = selected;
  }

  return ref.current;
}

/**
 * Example usage:
 *
 * // Instead of:
 * useEffect(() => {
 *   // ...
 * }, [config]); // Re-runs when ANY config property changes
 *
 * // Use:
 * useEffect(() => {
 *   // ...
 * }, [config.hostId, config.onMessage]); // Only re-runs when specific properties change
 *
 * // Or use the helper:
 * const importantConfig = usePropDeps(config, ['hostId', 'onMessage']);
 * useEffect(() => {
 *   // ...
 * }, [importantConfig.hostId, importantConfig.onMessage]);
 */