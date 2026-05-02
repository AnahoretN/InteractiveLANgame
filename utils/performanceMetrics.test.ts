/**
 * Performance Metrics Utility Tests
 * Тесты для системы метрик производительности
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { getPerformanceTracker, checkPerformanceTargets, PERFORMANCE_TARGETS } from './performanceMetrics';

describe('PerformanceMetricsTracker', () => {
  let tracker: ReturnType<typeof getPerformanceTracker>;

  beforeEach(() => {
    // Clear any existing tracker instance
    vi.clearAllMocks();
    tracker = getPerformanceTracker();
    tracker.clearMetrics();
  });

  describe('initialization', () => {
    it('should create singleton instance', () => {
      const tracker1 = getPerformanceTracker();
      const tracker2 = getPerformanceTracker();
      expect(tracker1).toBe(tracker2);
    });

    it('should initialize with zero metrics', () => {
      const metrics = tracker.getCurrentMetrics();
      expect(metrics.pageLoadTime).toBe(0);
      expect(metrics.memoryUsage).toBe(0);
      expect(metrics.renderCount).toBe(0);
    });
  });

  describe('component render tracking', () => {
    it('should track component render times', () => {
      tracker.trackComponentRender('TestComponent', 16.5);
      tracker.trackComponentRender('AnotherComponent', 32.1);

      const metrics = tracker.getCurrentMetrics();
      expect(metrics.componentLoadTimes['TestComponent']).toBe(16.5);
      expect(metrics.componentLoadTimes['AnotherComponent']).toBe(32.1);
      expect(metrics.renderCount).toBe(2);
    });

    it('should calculate average render time', () => {
      tracker.trackComponentRender('Component1', 10);
      tracker.trackComponentRender('Component2', 20);
      tracker.trackComponentRender('Component3', 30);

      const metrics = tracker.getCurrentMetrics();
      expect(metrics.averageRenderTime).toBe(20);
      expect(metrics.totalRenderTime).toBe(60);
    });
  });

  describe('API response tracking', () => {
    it('should track API response times', () => {
      tracker.trackApiResponse('/api/questions', 150);
      tracker.trackApiResponse('/api/teams', 75);

      const metrics = tracker.getCurrentMetrics();
      expect(metrics.apiResponseTimes['/api/questions']).toBe(150);
      expect(metrics.apiResponseTimes['/api/teams']).toBe(75);
    });
  });

  describe('snapshots', () => {
    it('should create performance snapshots', () => {
      tracker.trackComponentRender('Test', 100);
      const snapshot = tracker.createSnapshot();

      expect(snapshot).toBeDefined();
      expect(snapshot.timestamp).toBeGreaterThan(0);
      expect(snapshot.metrics).toBeDefined();
    });

    it('should maintain snapshot history', () => {
      tracker.createSnapshot();
      tracker.createSnapshot();

      const snapshots = tracker.getSnapshots();
      expect(snapshots.length).toBe(2);
    });

    it('should compare with baseline', () => {
      // Create baseline
      tracker.trackComponentRender('Test', 100);
      const baseline = tracker.createSnapshot();

      // Improve performance
      tracker.clearMetrics();
      tracker.trackComponentRender('Test', 50); // Better time
      tracker.createSnapshot();

      const comparison = tracker.compareWithBaseline(baseline);
      expect(comparison.improved).toContain('averageRenderTime');
    });
  });

  describe('performance report', () => {
    it('should generate formatted performance report', () => {
      tracker.trackComponentRender('TestComponent', 16.5);
      tracker.trackApiResponse('/api/test', 150);

      const report = tracker.getPerformanceReport();
      expect(report).toContain('Performance Report');
      expect(report).toContain('TestComponent');
      expect(report).toContain('/api/test');
    });
  });

  describe('export/import', () => {
    it('should export metrics as JSON', () => {
      tracker.trackComponentRender('Test', 100);
      const exported = tracker.exportMetrics();

      expect(exported).toBeDefined();
      const data = JSON.parse(exported);
      expect(data.current).toBeDefined();
      expect(data.snapshots).toBeDefined();
    });

    it('should import metrics from JSON', () => {
      tracker.trackComponentRender('Test1', 100);
      const exported = tracker.exportMetrics();

      tracker.clearMetrics();
      expect(tracker.getCurrentMetrics().componentLoadTimes['Test1']).toBeUndefined();

      const imported = tracker.importMetrics(exported);
      expect(imported).toBe(true);
      expect(tracker.getCurrentMetrics().componentLoadTimes['Test1']).toBe(100);
    });

    it('should handle invalid import data', () => {
      const imported = tracker.importMetrics('invalid json');
      expect(imported).toBe(false);
    });
  });

  describe('clear metrics', () => {
    it('should clear all metrics', () => {
      tracker.trackComponentRender('Test', 100);
      tracker.trackApiResponse('/api/test', 150);
      tracker.createSnapshot();

      tracker.clearMetrics();

      const metrics = tracker.getCurrentMetrics();
      expect(metrics.renderCount).toBe(0);
      expect(Object.keys(metrics.componentLoadTimes).length).toBe(0);
      expect(Object.keys(metrics.apiResponseTimes).length).toBe(0);
      expect(tracker.getSnapshots().length).toBe(0);
    });
  });
});

describe('checkPerformanceTargets', () => {
  it('should check all performance targets', () => {
    const metrics = {
      pageLoadTime: 1500,
      domContentLoaded: 1000,
      firstContentfulPaint: 800,
      timeToInteractive: 1500,
      memoryUsage: 40 * 1024 * 1024,
      averageRenderTime: 10,
      bundleSize: 1 * 1024 * 1024,
      // Add other required fields
      firstMeaningfulPaint: 900,
      totalRenderTime: 100,
      renderCount: 10,
      connectionType: 'wifi',
      downlink: 10,
      rtt: 50,
      componentLoadTimes: {},
      apiResponseTimes: {}
    };

    const result = checkPerformanceTargets(metrics);
    expect(result.passed.length).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('should calculate correct score', () => {
    // All metrics pass
    const goodMetrics = {
      pageLoadTime: 1000,
      domContentLoaded: 1000,
      firstContentfulPaint: 500,
      timeToInteractive: 1000,
      memoryUsage: 30 * 1024 * 1024,
      averageRenderTime: 10,
      bundleSize: 1 * 1024 * 1024,
      firstMeaningfulPaint: 600,
      totalRenderTime: 100,
      renderCount: 10,
      connectionType: 'wifi',
      downlink: 10,
      rtt: 50,
      componentLoadTimes: {},
      apiResponseTimes: {}
    };

    const goodResult = checkPerformanceTargets(goodMetrics);
    expect(goodResult.score).toBe(100);

    // All metrics fail
    const badMetrics = {
      pageLoadTime: 5000,
      domContentLoaded: 5000,
      firstContentfulPaint: 3000,
      timeToInteractive: 5000,
      memoryUsage: 200 * 1024 * 1024,
      averageRenderTime: 50,
      bundleSize: 5 * 1024 * 1024,
      firstMeaningfulPaint: 3500,
      totalRenderTime: 500,
      renderCount: 10,
      connectionType: '2g',
      downlink: 0.1,
      rtt: 500,
      componentLoadTimes: {},
      apiResponseTimes: {}
    };

    const badResult = checkPerformanceTargets(badMetrics);
    expect(badResult.score).toBe(0);
  });
});

describe('PERFORMANCE_TARGETS', () => {
  it('should have all required targets defined', () => {
    expect(PERFORMANCE_TARGETS.pageLoadTime).toBeDefined();
    expect(PERFORMANCE_TARGETS.domContentLoaded).toBeDefined();
    expect(PERFORMANCE_TARGETS.firstContentfulPaint).toBeDefined();
    expect(PERFORMANCE_TARGETS.timeToInteractive).toBeDefined();
    expect(PERFORMANCE_TARGETS.memoryUsage).toBeDefined();
    expect(PERFORMANCE_TARGETS.averageRenderTime).toBeDefined();
    expect(PERFORMANCE_TARGETS.bundleSize).toBeDefined();
  });

  it('should have realistic target values', () => {
    expect(PERFORMANCE_TARGETS.pageLoadTime).toBeGreaterThan(0);
    expect(PERFORMANCE_TARGETS.timeToInteractive).toBeLessThan(3000);
    expect(PERFORMANCE_TARGETS.memoryUsage).toBeLessThan(200 * 1024 * 1024); // < 200MB
    expect(PERFORMANCE_TARGETS.averageRenderTime).toBeLessThan(50); // < 50ms for 60fps
  });
});