/**
 * Memo Utilities
 *
 * Simplified memoization utilities for React components.
 * Only keeps the functions actually used in the codebase.
 */

import { memo, useMemo } from 'react';

// Deep comparison utility for objects
function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!keysB.includes(key)) return false;
    if (!deepEqual(a[key], b[key])) return false;
  }
  return true;
}

// Shallow comparison for specific props
function shallowCompare(props: Record<string, any>, nextProps: Record<string, any>, keys: string[]): boolean {
  for (const key of keys) {
    if (props[key] !== nextProps[key]) return false;
  }
  return true;
}

// Custom memo with specific prop comparison
export function memoWithProps<P extends object>(
  component: React.FC<P>,
  compareKeys: (keyof P)[],
  deep: boolean = false
): React.FC<P> {
  return memo(component, (prevProps, nextProps) => {
    return deep
      ? compareKeys.every(key => deepEqual(prevProps[key as string], nextProps[key as string]))
      : shallowCompare(prevProps as any, nextProps as any, compareKeys as string[]);
  });
}

// Memo with custom equality function
export function memoWithCustomEquality<P extends object>(
  component: React.FC<P>,
  areEqual: (prevProps: P, nextProps: P) => boolean
): React.FC<P> {
  return memo(component, areEqual);
}

// Higher-order component for multiple memo strategies
export function withSmartMemo<P extends object>(
  component: React.FC<P>,
  options: {
    strategy?: 'shallow' | 'deep' | 'selective';
    compareKeys?: (keyof P)[];
    componentName?: string;
  } = {}
): React.FC<P> {
  const {
    strategy = 'selective',
    compareKeys,
    componentName = 'Component'
  } = options;

  switch (strategy) {
    case 'shallow':
      return memo(component);
    case 'deep':
      return memo(component, (prevProps, nextProps) => deepEqual(prevProps, nextProps));
    case 'selective':
      if (compareKeys) {
        return memoWithProps(component, compareKeys, false);
      }
      return memo(component);
    default:
      return memo(component);
  }
}

// Utility functions for common comparison patterns
export const memoComparisons = {
  // For components with style prop
  withStyle: <P extends { style?: React.CSSProperties }>(
    component: React.FC<P>
  ) => memo(component, (prevProps, nextProps) =>
    deepEqual(prevProps.style, nextProps.style)
  ),

  // For components with className prop
  withClassName: <P extends { className?: string }>(
    component: React.FC<P>
  ) => memo(component, (prevProps, nextProps) =>
    prevProps.className === nextProps.className
  ),

  // For components with onClick handler
  withOnClick: <P extends { onClick?: () => void }>(
    component: React.FC<P>
  ) => memo(component, (prevProps, nextProps) =>
    prevProps.onClick === nextProps.onClick
  ),

  // For components with data prop
  withData: <T, P extends { data?: T }>(
    component: React.FC<P>
  ) => memo(component, (prevProps, nextProps) =>
    deepEqual(prevProps.data, nextProps.data)
  ),

  // For components with loading state
  withLoading: <P extends { loading?: boolean }>(
    component: React.FC<P>
  ) => memo(component, (prevProps, nextProps) =>
    prevProps.loading === nextProps.loading
  ),

  // For components with error state
  withError: <P extends { error?: Error | null }>(
    component: React.FC<P>
  ) => memo(component, (prevProps, nextProps) =>
    prevProps.error === nextProps.error
  )
};
