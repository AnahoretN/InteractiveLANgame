/**
 * Performance Metrics Utility
 *
 * Tracks baseline and current performance metrics for the application
 */

// Performance metric interfaces
export interface PerformanceMetrics {
  // Load metrics
  pageLoadTime: number;
  domContentLoaded: number;
  firstContentfulPaint: number;
  firstMeaningfulPaint: number;

  // Runtime metrics
  memoryUsage: number;
  bundleSize: number;
  timeToInteractive: number;

  // Rendering metrics
  totalRenderTime: number;
  averageRenderTime: number;
  renderCount: number;

  // Network metrics
  connectionType: string;
  downlink: number;
  rtt: number;

  // Custom metrics
  componentLoadTimes: Record<string, number>;
  apiResponseTimes: Record<string, number>;
}

export interface PerformanceSnapshot {
  timestamp: number;
  metrics: PerformanceMetrics;
}

class PerformanceMetricsTracker {
  private metrics: PerformanceMetrics;
  private snapshots: PerformanceSnapshot[] = [];
  private startTime: number = 0;
  private renderTimes: number[] = [];

  constructor() {
    this.metrics = this.getInitialMetrics();
    this.startTime = Date.now();
    this.initializeTracking();
  }

  private getInitialMetrics(): PerformanceMetrics {
    return {
      pageLoadTime: 0,
      domContentLoaded: 0,
      firstContentfulPaint: 0,
      firstMeaningfulPaint: 0,
      memoryUsage: 0,
      bundleSize: 0,
      timeToInteractive: 0,
      totalRenderTime: 0,
      averageRenderTime: 0,
      renderCount: 0,
      connectionType: 'unknown',
      downlink: 0,
      rtt: 0,
      componentLoadTimes: {},
      apiResponseTimes: {}
    };
  }

  private initializeTracking(): void {
    // Wait for page to load
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      if (document.readyState === 'complete') {
        this.captureLoadMetrics();
      } else {
        window.addEventListener('load', () => this.captureLoadMetrics());
      }
    }
  }

  private captureLoadMetrics(): void {
    if (typeof window === 'undefined' || typeof performance === 'undefined') return;

    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    const paint = performance.getEntriesByType('paint');

    this.metrics.pageLoadTime = navigation?.loadEventEnd - navigation?.fetchStart || 0;
    this.metrics.domContentLoaded = navigation?.domContentLoadedEventEnd - navigation?.fetchStart || 0;

    const fcp = paint.find(entry => entry.name === 'first-contentful-paint');
    this.metrics.firstContentfulPaint = fcp?.startTime || 0;

    // Estimate First Meaningful Paint
    this.metrics.firstMeaningfulPaint = this.metrics.firstContentfulPaint + 100;

    // Get connection info if available
    if ('connection' in navigator) {
      const conn = (navigator as any).connection;
      this.metrics.connectionType = conn?.effectiveType || 'unknown';
      this.metrics.downlink = conn?.downlink || 0;
      this.metrics.rtt = conn?.rtt || 0;
    }

    // Estimate Time to Interactive
    this.metrics.timeToInteractive = this.metrics.domContentLoaded + 200;

    console.log('[PerformanceMetrics] Initial metrics captured:', this.metrics);
  }

  // Get current metrics
  public getCurrentMetrics(): PerformanceMetrics {
    this.updateRuntimeMetrics();
    return { ...this.metrics };
  }

  // Update runtime metrics
  private updateRuntimeMetrics(): void {
    if (typeof window === 'undefined' || typeof performance === 'undefined') return;

    // Memory usage (if available)
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      this.metrics.memoryUsage = memory?.usedJSHeapSize || 0;
    }

    // Calculate average render time
    if (this.renderTimes.length > 0) {
      const total = this.renderTimes.reduce((sum, time) => sum + time, 0);
      this.metrics.averageRenderTime = total / this.renderTimes.length;
      this.metrics.totalRenderTime = total;
      this.metrics.renderCount = this.renderTimes.length;
    }
  }

  // Track component render time
  public trackComponentRender(componentName: string, renderTime: number): void {
    this.metrics.componentLoadTimes[componentName] = renderTime;
    this.renderTimes.push(renderTime);
  }

  // Track API response time
  public trackApiResponse(apiName: string, responseTime: number): void {
    this.metrics.apiResponseTimes[apiName] = responseTime;
  }

  // Create snapshot
  public createSnapshot(): PerformanceSnapshot {
    this.updateRuntimeMetrics();
    const snapshot: PerformanceSnapshot = {
      timestamp: Date.now(),
      metrics: { ...this.metrics }
    };
    this.snapshots.push(snapshot);
    return snapshot;
  }

  // Get all snapshots
  public getSnapshots(): PerformanceSnapshot[] {
    return [...this.snapshots];
  }

  // Compare with baseline
  public compareWithBaseline(baseline?: PerformanceSnapshot): {
    improved: string[];
    degraded: string[];
    unchanged: string[];
  } {
    if (!baseline) {
      return { improved: [], degraded: [], unchanged: [] };
    }

    const current = this.getCurrentMetrics();
    const improved: string[] = [];
    const degraded: string[] = [];
    const unchanged: string[] = [];

    // Compare load times
    if (current.pageLoadTime < baseline.metrics.pageLoadTime * 0.9) {
      improved.push('pageLoadTime');
    } else if (current.pageLoadTime > baseline.metrics.pageLoadTime * 1.1) {
      degraded.push('pageLoadTime');
    } else {
      unchanged.push('pageLoadTime');
    }

    // Compare memory usage
    if (current.memoryUsage < baseline.metrics.memoryUsage * 0.9) {
      improved.push('memoryUsage');
    } else if (current.memoryUsage > baseline.metrics.memoryUsage * 1.1) {
      degraded.push('memoryUsage');
    } else {
      unchanged.push('memoryUsage');
    }

    // Compare render performance
    if (current.averageRenderTime < baseline.metrics.averageRenderTime * 0.9) {
      improved.push('averageRenderTime');
    } else if (current.averageRenderTime > baseline.metrics.averageRenderTime * 1.1) {
      degraded.push('averageRenderTime');
    } else {
      unchanged.push('averageRenderTime');
    }

    return { improved, degraded, unchanged };
  }

  // Get performance report
  public getPerformanceReport(): string {
    const metrics = this.getCurrentMetrics();
    const formatBytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    const formatMs = (ms: number) => `${ms.toFixed(2)} ms`;

    return `
Performance Report (${new Date().toISOString()})
============================

Load Metrics:
- Page Load Time: ${formatMs(metrics.pageLoadTime)}
- DOM Content Loaded: ${formatMs(metrics.domContentLoaded)}
- First Contentful Paint: ${formatMs(metrics.firstContentfulPaint)}
- First Meaningful Paint: ${formatMs(metrics.firstMeaningfulPaint)}
- Time to Interactive: ${formatMs(metrics.timeToInteractive)}

Runtime Metrics:
- Memory Usage: ${formatBytes(metrics.memoryUsage)}
- Bundle Size: ${formatBytes(metrics.bundleSize)}

Render Metrics:
- Total Render Time: ${formatMs(metrics.totalRenderTime)}
- Average Render Time: ${formatMs(metrics.averageRenderTime)}
- Render Count: ${metrics.renderCount}

Network Metrics:
- Connection Type: ${metrics.connectionType}
- Downlink: ${metrics.downlink} Mbps
- RTT: ${metrics.rtt} ms

Component Load Times:
${Object.entries(metrics.componentLoadTimes)
  .map(([name, time]) => `  - ${name}: ${formatMs(time)}`)
  .join('\n')}

API Response Times:
${Object.entries(metrics.apiResponseTimes)
  .map(([name, time]) => `  - ${name}: ${formatMs(time)}`)
  .join('\n')}
    `.trim();
  }

  // Set baseline manually
  public setBaseline(metrics?: PerformanceMetrics): void {
    if (metrics) {
      this.metrics = { ...metrics };
    }
    this.createSnapshot(); // Create automatic snapshot
  }

  // Export metrics as JSON
  public exportMetrics(): string {
    return JSON.stringify({
      current: this.getCurrentMetrics(),
      snapshots: this.snapshots,
      timestamp: Date.now()
    }, null, 2);
  }

  // Import metrics from JSON
  public importMetrics(json: string): boolean {
    try {
      const data = JSON.parse(json);
      if (data.current) {
        this.metrics = { ...this.metrics, ...data.current };
      }
      if (data.snapshots) {
        this.snapshots = data.snapshots;
      }
      return true;
    } catch (error) {
      console.error('[PerformanceMetrics] Failed to import metrics:', error);
      return false;
    }
  }

  // Clear metrics
  public clearMetrics(): void {
    this.metrics = this.getInitialMetrics();
    this.snapshots = [];
    this.renderTimes = [];
    this.startTime = Date.now();
  }

  // Get bundle size estimate
  public async measureBundleSize(): Promise<number> {
    if (typeof window === 'undefined' || typeof performance === 'undefined') return 0;

    // Get all resources
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    let totalSize = 0;

    for (const resource of resources) {
      // Include only JavaScript files from same origin
      if (resource.name.includes('.js') && !resource.name.includes('node_modules')) {
        totalSize += resource.transferSize || 0;
      }
    }

    this.metrics.bundleSize = totalSize;
    return totalSize;
  }
}

// Singleton instance
let performanceTracker: PerformanceMetricsTracker | null = null;

export function getPerformanceTracker(): PerformanceMetricsTracker {
  if (!performanceTracker) {
    performanceTracker = new PerformanceMetricsTracker();
  }
  return performanceTracker;
}

// Hook for React components
export function usePerformanceMetrics(componentName: string) {
  const tracker = getPerformanceTracker();

  return {
    trackRender: (renderFn: () => void) => {
      const start = performance.now();
      renderFn();
      const end = performance.now();
      tracker.trackComponentRender(componentName, end - start);
    },

    trackApiResponse: (apiName: string, responseTime: number) => {
      tracker.trackApiResponse(apiName, responseTime);
    },

    getCurrentMetrics: () => tracker.getCurrentMetrics(),

    createSnapshot: () => tracker.createSnapshot(),

    getReport: () => tracker.getPerformanceReport()
  };
}

// Baseline performance targets based on optimization goals
export const PERFORMANCE_TARGETS = {
  pageLoadTime: 2000,        // Target: < 2s
  domContentLoaded: 1500,    // Target: < 1.5s
  firstContentfulPaint: 1000, // Target: < 1s
  timeToInteractive: 1800,   // Target: < 1.8s (40% improvement from 3s)
  memoryUsage: 50 * 1024 * 1024, // Target: < 50MB (85% improvement from 333MB)
  averageRenderTime: 16,     // Target: < 16ms (60fps)
  bundleSize: 1.5 * 1024 * 1024 // Target: < 1.5MB (40% improvement from 2.5MB)
};

// Check if metrics meet targets
export function checkPerformanceTargets(metrics: PerformanceMetrics): {
  passed: string[];
  failed: string[];
  score: number; // 0-100
} {
  const passed: string[] = [];
  const failed: string[] = [];

  if (metrics.pageLoadTime <= PERFORMANCE_TARGETS.pageLoadTime) {
    passed.push('pageLoadTime');
  } else {
    failed.push('pageLoadTime');
  }

  if (metrics.domContentLoaded <= PERFORMANCE_TARGETS.domContentLoaded) {
    passed.push('domContentLoaded');
  } else {
    failed.push('domContentLoaded');
  }

  if (metrics.firstContentfulPaint <= PERFORMANCE_TARGETS.firstContentfulPaint) {
    passed.push('firstContentfulPaint');
  } else {
    failed.push('firstContentfulPaint');
  }

  if (metrics.timeToInteractive <= PERFORMANCE_TARGETS.timeToInteractive) {
    passed.push('timeToInteractive');
  } else {
    failed.push('timeToInteractive');
  }

  if (metrics.memoryUsage <= PERFORMANCE_TARGETS.memoryUsage) {
    passed.push('memoryUsage');
  } else {
    failed.push('memoryUsage');
  }

  if (metrics.averageRenderTime <= PERFORMANCE_TARGETS.averageRenderTime) {
    passed.push('averageRenderTime');
  } else {
    failed.push('averageRenderTime');
  }

  if (metrics.bundleSize <= PERFORMANCE_TARGETS.bundleSize) {
    passed.push('bundleSize');
  } else {
    failed.push('bundleSize');
  }

  const score = Math.round((passed.length / (passed.length + failed.length)) * 100);

  return { passed, failed, score };
}