/**
 * Optimistic Updates Utilities
 *
 * Utilities for implementing optimistic UI updates with automatic rollback on error
 */

import { useState, useCallback, useRef } from 'react';

interface OptimisticState<T> {
  current: T;
  pending: T | null;
  error: Error | null;
}

interface OptimisticUpdateOptions {
  rollbackOnError?: boolean;
  debounceMs?: number;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

// Hook for optimistic updates
export function useOptimisticUpdate<T>(
  initialState: T,
  options: OptimisticUpdateOptions = {}
) {
  const [state, setState] = useState<OptimisticState<T>>({
    current: initialState,
    pending: null,
    error: null
  });

  const optimisticState = state.pending ?? state.current;
  const isUpdating = state.pending !== null;
  const hasError = state.error !== null;

  const updateWithOptimism = useCallback(async (
    optimisticValue: T,
    serverUpdate: () => Promise<T>
  ) => {
    // Apply optimistic update immediately
    setState(prev => ({
      ...prev,
      pending: optimisticValue,
      error: null
    }));

    try {
      // Debounce server update if configured
      if (options.debounceMs) {
        await new Promise(resolve => setTimeout(resolve, options.debounceMs));
      }

      // Perform actual server update
      const result = await serverUpdate();

      // Update with actual result
      setState({
        current: result,
        pending: null,
        error: null
      });

      options.onSuccess?.();
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Update failed');

      // Rollback to previous state on error
      setState(prev => ({
        ...prev,
        pending: null,
        error: options.rollbackOnError !== false ? err : null
      }));

      options.onError?.(err);
      throw err;
    }
  }, [options]);

  const resetError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  const reset = useCallback(() => {
    setState({
      current: initialState,
      pending: null,
      error: null
    });
  }, [initialState]);

  return {
    state: optimisticState,
    actualState: state.current,
    isUpdating,
    hasError,
    error: state.error,
    updateWithOptimism,
    resetError,
    reset
  };
}

// Optimistic list operations
export function useOptimisticList<T>(
  initialItems: T[],
  options: OptimisticUpdateOptions = {}
) {
  const optimistic = useOptimisticUpdate(initialItems, options);

  const addItem = useCallback(async (
    item: T,
    serverAdd: () => Promise<T[]>
  ) => {
    const optimisticList = [...optimistic.state, item];
    return optimistic.updateWithOptimism(optimisticList, serverAdd);
  }, [optimistic]);

  const updateItem = useCallback(async (
    itemId: string,
    updates: Partial<T>,
    serverUpdate: () => Promise<T[]>
  ) => {
    const optimisticList = optimistic.state.map(item =>
      (item as any).id === itemId ? { ...item, ...updates } : item
    );
    return optimistic.updateWithOptimism(optimisticList, serverUpdate);
  }, [optimistic]);

  const removeItem = useCallback(async (
    itemId: string,
    serverRemove: () => Promise<T[]>
  ) => {
    const optimisticList = optimistic.state.filter(item =>
      (item as any).id !== itemId
    );
    return optimistic.updateWithOptimism(optimisticList, serverRemove);
  }, [optimistic]);

  const reorderItem = useCallback(async (
    fromIndex: number,
    toIndex: number,
    serverReorder: () => Promise<T[]>
  ) => {
    const optimisticList = [...optimistic.state];
    const [removed] = optimisticList.splice(fromIndex, 1);
    optimisticList.splice(toIndex, 0, removed);
    return optimistic.updateWithOptimism(optimisticList, serverReorder);
  }, [optimistic]);

  return {
    ...optimistic,
    addItem,
    updateItem,
    removeItem,
    reorderItem
  };
}

// Optimistic toggle
export function useOptimisticToggle(
  initialState: boolean,
  options: OptimisticUpdateOptions = {}
) {
  const optimistic = useOptimisticUpdate(initialState, options);

  const toggle = useCallback(async (
    serverToggle: () => Promise<boolean>
  ) => {
    return optimistic.updateWithOptimism(!optimistic.state, serverToggle);
  }, [optimistic]);

  const setTrue = useCallback(async (
    serverSet: () => Promise<boolean>
  ) => {
    return optimistic.updateWithOptimism(true, serverSet);
  }, [optimistic]);

  const setFalse = useCallback(async (
    serverSet: () => Promise<boolean>
  ) => {
    return optimistic.updateWithOptimism(false, serverSet);
  }, [optimistic]);

  return {
    ...optimistic,
    toggle,
    setTrue,
    setFalse
  };
}

// Optimistic counter
export function useOptimisticCounter(
  initialCount: number = 0,
  options: OptimisticUpdateOptions = {}
) {
  const optimistic = useOptimisticUpdate(initialCount, options);

  const increment = useCallback(async (
    amount: number = 1,
    serverIncrement: () => Promise<number>
  ) => {
    return optimistic.updateWithOptimism(
      optimistic.state + amount,
      serverIncrement
    );
  }, [optimistic]);

  const decrement = useCallback(async (
    amount: number = 1,
    serverDecrement: () => Promise<number>
  ) => {
    return optimistic.updateWithOptimism(
      optimistic.state - amount,
      serverDecrement
    );
  }, [optimistic]);

  const set = useCallback(async (
    value: number,
    serverSet: () => Promise<number>
  ) => {
    return optimistic.updateWithOptimism(value, serverSet);
  }, [optimistic]);

  return {
    ...optimistic,
    increment,
    decrement,
    set
  };
}

// Batched optimistic updates
export function useOptimisticBatch<T extends Record<string, any>>(
  initialState: T,
  options: OptimisticUpdateOptions = {}
) {
  const optimistic = useOptimisticUpdate(initialState, options);

  const updateBatch = useCallback(async (
    updates: Partial<T>,
    serverUpdate: () => Promise<T>
  ) => {
    const optimisticState = { ...optimistic.state, ...updates };
    return optimistic.updateWithOptimism(optimisticState, serverUpdate);
  }, [optimistic]);

  return {
    ...optimistic,
    updateBatch
  };
}

// Optimistic form updates
interface FormField {
  value: any;
  touched: boolean;
  error: string | null;
}

export function useOptimisticForm<T extends Record<string, any>>(
  initialForm: T,
  options: OptimisticUpdateOptions = {}
) {
  const [fields, setFields] = useState<Record<keyof T, FormField>>(
    () => {
      const initialFields: Record<string, FormField> = {};
      Object.keys(initialForm).forEach(key => {
        initialFields[key] = {
          value: initialForm[key],
          touched: false,
          error: null
        };
      });
      return initialFields as Record<keyof T, FormField>;
    }
  );

  const updateField = useCallback((field: keyof T, value: any) => {
    setFields(prev => ({
      ...prev,
      [field]: {
        value,
        touched: true,
        error: null
      }
    }));
  }, []);

  const updateFields = useCallback((updates: Partial<T>) => {
    setFields(prev => {
      const updated = { ...prev };
      Object.entries(updates).forEach(([key, value]) => {
        updated[key as keyof T] = {
          value,
          touched: true,
          error: null
        };
      });
      return updated;
    });
  }, []);

  const submitForm = useCallback(async (
    serverSubmit: (data: T) => Promise<T>
  ) => {
    const formData = Object.entries(fields).reduce((acc, [key, field]) => {
      acc[key as keyof T] = field.value;
      return acc;
    }, {} as T);

    try {
      const result = await serverSubmit(formData);
      options.onSuccess?.();
      return result;
    } catch (error) {
      options.onError?.(error as Error);
      throw error;
    }
  }, [fields, options]);

  const resetForm = useCallback(() => {
    const initialFields: Record<string, FormField> = {};
    Object.keys(initialForm).forEach(key => {
      initialFields[key] = {
        value: initialForm[key],
        touched: false,
        error: null
      };
    });
    setFields(initialFields as Record<keyof T, FormField>);
  }, [initialForm]);

  return {
    fields,
    updateField,
    updateFields,
    submitForm,
    resetForm,
    isDirty: Object.values(fields).some(f => f.touched),
    isValid: Object.values(fields).every(f => !f.error)
  };
}

// Debounced optimistic updates
export function useDebouncedOptimisticUpdate<T>(
  initialState: T,
  delayMs: number = 300,
  options: OptimisticUpdateOptions = {}
) {
  const timeoutRef = useRef<NodeJS.Timeout>();
  const optimistic = useOptimisticUpdate(initialState, options);

  const debouncedUpdate = useCallback((
    optimisticValue: T,
    serverUpdate: () => Promise<T>
  ) => {
    // Apply optimistic update immediately
    optimistic.updateWithOptimism(optimisticValue, async () => {
      // Clear existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Create new timeout
      return new Promise<T>((resolve, reject) => {
        timeoutRef.current = setTimeout(async () => {
          try {
            const result = await serverUpdate();
            resolve(result);
          } catch (error) {
            reject(error);
          }
        }, delayMs);
      });
    });
  }, [optimistic, delayMs]);

  // Cleanup on unmount
  useState(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  });

  return {
    ...optimistic,
    update: debouncedUpdate
  };
}

// Optimistic array operations with specific operations
export function useOptimisticArray<T>(
  initialArray: T[],
  options: OptimisticUpdateOptions = {}
) {
  const optimistic = useOptimisticList(initialArray, options);

  const moveUp = useCallback(async (
    index: number,
    serverMove: () => Promise<T[]>
  ) => {
    if (index === 0) return;
    return optimistic.reorderItem(index, index - 1, serverMove);
  }, [optimistic]);

  const moveDown = useCallback(async (
    index: number,
    serverMove: () => Promise<T[]>
  ) => {
    if (index === optimistic.state.length - 1) return;
    return optimistic.reorderItem(index, index + 1, serverMove);
  }, [optimistic]);

  const moveToTop = useCallback(async (
    index: number,
    serverMove: () => Promise<T[]>
  ) => {
    if (index === 0) return;
    return optimistic.reorderItem(index, 0, serverMove);
  }, [optimistic]);

  const moveToBottom = useCallback(async (
    index: number,
    serverMove: () => Promise<T[]>
  ) => {
    if (index === optimistic.state.length - 1) return;
    return optimistic.reorderItem(index, optimistic.state.length - 1, serverMove);
  }, [optimistic]);

  return {
    ...optimistic,
    moveUp,
    moveDown,
    moveToTop,
    moveToBottom
  };
}