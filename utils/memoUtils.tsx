/**
 * Memo Utilities
 *
 * Advanced memoization utilities for React components with custom comparison functions
 */

import { memo, useMemo, useCallback, useRef, useEffect } from 'react';

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
export function shallowCompare(props: Record<string, any>, nextProps: Record<string, any>, keys: string[]): boolean {
  for (const key of keys) {
    if (props[key] !== nextProps[key]) {
      return false;
    }
  }
  return true;
}

// Deep comparison for specific props
export function deepCompare(props: Record<string, any>, nextProps: Record<string, any>, keys: string[]): boolean {
  for (const key of keys) {
    if (!deepEqual(props[key], nextProps[key])) {
      return false;
    }
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
      ? deepCompare(prevProps as any, nextProps as any, compareKeys as string[])
      : shallowCompare(prevProps as any, nextProps as any, compareKeys as string[]);
  });
}

// Memo with exclusion (re-render if any prop except these changes)
export function memoExceptProps<P extends object>(
  component: React.FC<P>,
  excludeKeys: (keyof P)[]
): React.FC<P> {
  return memo(component, (prevProps, nextProps) => {
    const allKeys = new Set([...Object.keys(prevProps), ...Object.keys(nextProps)]);
    const compareKeys = Array.from(allKeys).filter(key => !excludeKeys.includes(key as keyof P));

    return shallowCompare(prevProps as any, nextProps as any, compareKeys);
  });
}

// Memo with timeout (debounce re-renders)
export function memoWithTimeout<P extends object>(
  component: React.FC<P>,
  timeoutMs: number
): React.FC<P> {
  let timeoutId: NodeJS.Timeout | null = null;
  let lastProps: P | null = null;
  let pendingUpdate: (() => void) | null = null;

  const MemoizedComponent = memo(component);

  return function MemoWithTimeout(props: P) {
    const mountRef = useRef(true);
    const forceUpdateRef = useRef(0);

    useEffect(() => {
      mountRef.current = false;
      return () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      };
    }, []);

    // Quick shallow check
    if (lastProps && shallowCompare(lastProps as any, props as any, Object.keys(props) as string[])) {
      return <MemoizedComponent {...props} />;
    }

    lastProps = props;

    // Schedule update
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      timeoutId = null;
      if (pendingUpdate) {
        pendingUpdate();
        pendingUpdate = null;
      }
    }, timeoutMs);

    return <MemoizedComponent {...props} />;
  };
}

// Memo with size-based comparison (for large objects)
export function memoWithSizeCheck<P extends object>(
  component: React.FC<P>,
  maxSize: number = 1024 * 1024 // 1MB default
): React.FC<P> {
  return memo(component, (prevProps, nextProps) => {
    // For each prop, check if size changed
    const propKeys = Object.keys(nextProps);

    for (const key of propKeys) {
      const prevValue = prevProps[key as keyof P];
      const nextValue = nextProps[key as keyof P];

      // If reference is same, no change
      if (prevValue === nextValue) continue;

      // Check if primitive value changed
      if (typeof prevValue !== 'object' || typeof nextValue !== 'object') {
        if (prevValue !== nextValue) return false;
        continue;
      }

      // For objects, check size
      const prevSize = JSON.stringify(prevValue).length;
      const nextSize = JSON.stringify(nextValue).length;

      // If size difference is significant, re-render
      if (Math.abs(prevSize - nextSize) > maxSize) {
        return false;
      }
    }

    return true;
  });
}

// Memo with performance monitoring
export function memoWithPerfMonitoring<P extends object>(
  component: React.FC<P>,
  componentName: string = 'Component'
): React.FC<P> {
  let renderCount = 0;
  let memoHitCount = 0;
  let lastRenderTime = 0;

  const MemoizedComponent = memo(component, (prevProps, nextProps) => {
    const startTime = performance.now();

    // Simple shallow comparison
    const keys = Object.keys(nextProps);
    const isEqual = shallowCompare(prevProps as any, nextProps as any, keys);

    if (isEqual) {
      memoHitCount++;
    }

    const endTime = performance.now();
    lastRenderTime = endTime - startTime;

    if (lastRenderTime > 16) { // Slower than 60fps
      console.warn(`[Perf] ${componentName} comparison took ${lastRenderTime.toFixed(2)}ms`);
    }

    return isEqual;
  });

  // Attach monitoring info to component
  (MemoizedComponent as any).getPerfStats = () => ({
    renderCount,
    memoHitCount,
    hitRate: renderCount > 0 ? memoHitCount / renderCount : 0,
    lastRenderTime
  });

  return MemoizedComponent;
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
    strategy?: 'shallow' | 'deep' | 'selective' | 'size';
    compareKeys?: (keyof P)[];
    maxSize?: number;
    componentName?: string;
    enablePerfMonitoring?: boolean;
  } = {}
): React.FC<P> {
  const {
    strategy = 'selective',
    compareKeys,
    maxSize,
    componentName = 'Component',
    enablePerfMonitoring = false
  } = options;

  let memoizedComponent: React.FC<P>;

  switch (strategy) {
    case 'shallow':
      memoizedComponent = memo(component);
      break;
    case 'deep':
      memoizedComponent = memo(component, (prevProps, nextProps) => {
        return deepEqual(prevProps, nextProps);
      });
      break;
    case 'selective':
      if (compareKeys) {
        memoizedComponent = memoWithProps(component, compareKeys, false);
      } else {
        memoizedComponent = memo(component);
      }
      break;
    case 'size':
      memoizedComponent = memoWithSizeCheck(component, maxSize);
      break;
    default:
      memoizedComponent = memo(component);
  }

  if (enablePerfMonitoring) {
    return memoWithPerfMonitoring(memoizedComponent as React.FC<P>, componentName);
  }

  return memoizedComponent;
}

// Hook for tracking component render performance
export function useRenderPerf(componentName: string = 'Component') {
  const renderCount = useRef(0);
  const lastRenderTime = useRef(0);
  const totalRenderTime = useRef(0);

  useEffect(() => {
    renderCount.current++;
    const now = performance.now();

    if (lastRenderTime.current > 0) {
      const renderTime = now - lastRenderTime.current;
      totalRenderTime.current += renderTime;

      if (renderTime > 16) {
        console.warn(`[Perf] ${componentName} render took ${renderTime.toFixed(2)}ms`);
      }
    }

    lastRenderTime.current = now;
  });

  return useMemo(() => ({
    renderCount: renderCount.current,
    lastRenderTime: lastRenderTime.current,
    totalRenderTime: totalRenderTime.current,
    avgRenderTime: renderCount.current > 0 ? totalRenderTime.current / renderCount.current : 0
  }), [renderCount.current]);
}

// Utility functions for common comparison patterns
export const memoComparisons = {
  // For components with children
  withChildren: <P extends { children?: React.ReactNode }>(
    component: React.FC<P>
  ) => memo(component, (prevProps, nextProps) =>
    prevProps.children === nextProps.children
  ),

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

// Specialized memo for lists
export function memoListItem<P extends { id: string }>(
  component: React.FC<P>
): React.FC<P> {
  return memo(component, (prevProps, nextProps) => {
    return prevProps.id === nextProps.id &&
           shallowCompare(prevProps as any, nextProps as any, Object.keys(nextProps).filter(k => k !== 'id'));
  });
}

// Specialized memo for form inputs
export function memoFormInput<P extends {
  value?: any;
  onChange?: (value: any) => void;
  disabled?: boolean;
  error?: string;
}>(
  component: React.FC<P>
): React.FC<P> {
  return memo(component, (prevProps, nextProps) => {
    return prevProps.value === nextProps.value &&
           prevProps.disabled === nextProps.disabled &&
           prevProps.error === nextProps.error;
  });
}

// Performance debugging utility
export function withMemoDebug<P extends object>(
  component: React.FC<P>,
  componentName: string = 'Component'
): React.FC<P> {
  let renderCount = 0;
  let memoSkipCount = 0;

  return memo(component, (prevProps, nextProps) => {
    renderCount++;

    const keys = Object.keys(nextProps);
    const changedProps = keys.filter(key => prevProps[key as keyof P] !== nextProps[key as keyof P]);

    if (changedProps.length === 0) {
      memoSkipCount++;
      console.log(`[Memo] ${componentName} skipped render #${memoSkipCount}`);
      return true;
    }

    console.log(`[Memo] ${componentName} re-render #${renderCount} due to:`, changedProps);
    return false;
  });
}