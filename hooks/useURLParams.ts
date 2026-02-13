/**
 * useURLParams Hook
 * Provides easy access to URL search parameters
 */

import { useMemo } from 'react';

/**
 * Hook for parsing and accessing URL search parameters
 * @returns URLSearchParams instance or null if not available
 */
export function useURLParams() {
  return useMemo(() => {
    if (typeof window === 'undefined') {
      return null;
    }

    const params = new URLSearchParams(window.location.search);
    return params;
  }, [window.location.search]);
}

/**
 * Hook for getting a specific URL parameter value
 * @param key - The parameter key to get
 * @returns The parameter value or null if not found
 */
export function useURLParam(key: string): string | null {
  const params = useURLParams();
  return useMemo(() => {
    return params?.get(key) ?? null;
  }, [params, key]);
}

/**
 * Hook for getting multiple URL parameters at once
 * @param keys - Array of parameter keys to get
 * @returns Record with key-value pairs
 */
export function useURLParamsMap<K extends string>(keys: K[]): Partial<Record<K, string | null>> {
  const params = useURLParams();
  return useMemo(() => {
    const result: Partial<Record<K, string | null>> = {};
    for (const key of keys) {
      result[key] = (params?.get(key) ?? null) as string | null;
    }
    return result;
  }, [params, keys]);
}
