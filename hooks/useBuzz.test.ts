/**
 * useBuzz Hook Tests
 * Тесты для системы буззера с автоочисткой
 */

import { renderHook, act, waitFor } from '@testing-library/react-hooks';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useBuzz } from './useBuzz';

describe('useBuzz', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize with empty buzzed clients', () => {
    const { result } = renderHook(() => useBuzz(3000));

    expect(result.current.buzzedClients.size).toBe(0);
    expect(result.current.hasBuzzed('client-1')).toBe(false);
  });

  it('should mark client as buzzed', () => {
    const { result } = renderHook(() => useBuzz(3000));

    act(() => {
      result.current.markBuzzed('client-1');
    });

    expect(result.current.hasBuzzed('client-1')).toBe(true);
    expect(result.current.buzzedClients.size).toBe(1);
  });

  it('should return buzz timestamp for client', () => {
    const { result } = renderHook(() => useBuzz(3000));

    const buzzTime = Date.now();
    act(() => {
      result.current.markBuzzed('client-1');
    });

    const timestamp = result.current.getBuzzTimestamp('client-1');
    expect(timestamp).toBeDefined();
    expect(timestamp).toBeGreaterThanOrEqual(buzzTime);
  });

  it('should clear buzz for specific client', () => {
    const { result } = renderHook(() => useBuzz(3000));

    act(() => {
      result.current.markBuzzed('client-1');
      result.current.markBuzzed('client-2');
    });

    expect(result.current.buzzedClients.size).toBe(2);

    act(() => {
      result.current.clearBuzz('client-1');
    });

    expect(result.current.hasBuzzed('client-1')).toBe(false);
    expect(result.current.hasBuzzed('client-2')).toBe(true);
    expect(result.current.buzzedClients.size).toBe(1);
  });

  it('should clear all buzzes', () => {
    const { result } = renderHook(() => useBuzz(3000));

    act(() => {
      result.current.markBuzzed('client-1');
      result.current.markBuzzed('client-2');
      result.current.markBuzzed('client-3');
    });

    expect(result.current.buzzedClients.size).toBe(3);

    act(() => {
      result.current.clearAllBuzzes();
    });

    expect(result.current.buzzedClients.size).toBe(0);
  });

  it('should auto-clear old buzzes after timeout', async () => {
    const { result } = renderHook(() => useBuzz(3000));

    act(() => {
      result.current.markBuzzed('client-1');
    });

    expect(result.current.hasBuzzed('client-1')).toBe(true);

    // Fast-forward time by 3.5 seconds (more than 3000ms cleanupDelay)
    act(() => {
      vi.advanceTimersByTime(3500);
    });

    // Wait for async cleanup
    await waitFor(() => {
      expect(result.current.hasBuzzed('client-1')).toBe(false);
    });
  });

  it('should not clear recent buzzes', () => {
    const { result } = renderHook(() => useBuzz(3000));

    act(() => {
      result.current.markBuzzed('client-1');
    });

    // Fast-forward by only 1 second (less than 3000ms)
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.hasBuzzed('client-1')).toBe(true);
  });

  it('should handle multiple clients buzzing', () => {
    const { result } = renderHook(() => useBuzz(3000));

    act(() => {
      result.current.markBuzzed('client-1');
      result.current.markBuzzed('client-2');
      result.current.markBuzzed('client-3');
    });

    expect(result.current.buzzedClients.size).toBe(3);
    expect(result.current.hasBuzzed('client-1')).toBe(true);
    expect(result.current.hasBuzzed('client-2')).toBe(true);
    expect(result.current.hasBuzzed('client-3')).toBe(true);
  });

  it('should preserve buzz order by timestamp', () => {
    const { result } = renderHook(() => useBuzz(3000));

    act(() => {
      result.current.markBuzzed('client-1');
      // Wait a bit
      vi.advanceTimersByTime(100);
      result.current.markBuzzed('client-2');
    });

    const buzz1 = result.current.getBuzzTimestamp('client-1');
    const buzz2 = result.current.getBuzzTimestamp('client-2');

    expect(buzz1).toBeLessThan(buzz2!);
  });
});
