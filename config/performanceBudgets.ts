/**
 * Performance Budgets Configuration
 *
 * Defines acceptable performance thresholds for the application
 * Used by CI/CD pipelines and development tools to enforce quality standards
 */

export interface PerformanceBudget {
  name: string;
  description: string;
  metrics: {
    bundleSize?: number; // KB
    initialLoadTime?: number; // ms
    timeToInteractive?: number; // ms
    firstContentfulPaint?: number; // ms
    largestContentfulPaint?: number; // ms
    cumulativeLayoutShift?: number; // score
    firstInputDelay?: number; // ms
    totalBlockingTime?: number; // ms
  };
}

export const PERFORMANCE_BUDGETS: PerformanceBudget[] = [
  {
    name: 'Initial Bundle Size',
    description: 'Total size of all JavaScript bundles',
    metrics: {
      bundleSize: 500, // 500KB max for initial bundle
      initialLoadTime: 3000 // 3 seconds max
    }
  },
  {
    name: 'Core Performance',
    description: 'Core Web Vitals thresholds',
    metrics: {
      timeToInteractive: 3500, // 3.5 seconds
      firstContentfulPaint: 2000, // 2 seconds
      largestContentfulPaint: 2500, // 2.5 seconds
      cumulativeLayoutShift: 0.1, // CLS score
      firstInputDelay: 100, // 100ms
      totalBlockingTime: 300 // 300ms
    }
  },
  {
    name: 'Runtime Performance',
    description: 'Runtime performance metrics',
    metrics: {
      bundleSize: 500,
      initialLoadTime: 3000
    }
  },
  {
    name: 'Game Session',
    description: 'Performance during active game session',
    metrics: {
      timeToInteractive: 5000, // More lenient during gameplay
      firstInputDelay: 200 // 200ms during gameplay
    }
  }
];

/**
 * Check if performance metrics meet budget requirements
 */
export function checkPerformanceBudget(
  budgetName: string,
  actualMetrics: Partial<PerformanceBudget['metrics']>
): { passed: boolean; violations: string[] } {
  const budget = PERFORMANCE_BUDGETS.find(b => b.name === budgetName);
  if (!budget) {
    return {
      passed: false,
      violations: [`Unknown budget: ${budgetName}`]
    };
  }

  const violations: string[] = [];

  for (const [metric, threshold] of Object.entries(budget.metrics)) as Array<[string, number]>) {
    if (actualMetrics[metric as keyof PerformanceBudget['metrics']] && actualMetrics[metric as keyof PerformanceBudget['metrics']]! > threshold) {
      violations.push(`${metric}: ${actualMetrics[metric as keyof PerformanceBudget['metrics']]}ms exceeds threshold of ${threshold}ms`);
    }
  }

  return {
    passed: violations.length === 0,
    violations
  };
}

/**
 * Format performance metrics for display
 */
export function formatPerformanceMetrics(metrics: Partial<PerformanceBudget['metrics']>): string {
  const parts: string[] = [];

  if (metrics.bundleSize) {
    parts.push(`Bundle: ${(metrics.bundleSize / 1024).toFixed(1)}KB`);
  }
  if (metrics.timeToInteractive) {
    parts.push(`TTI: ${metrics.timeToInteractive}ms`);
  }
  if (metrics.firstContentfulPaint) {
    parts.push(`FCP: ${metrics.firstContentfulPaint}ms`);
  }
  if (metrics.largestContentfulPaint) {
    parts.push(`LCP: ${metrics.largestContentfulPaint}ms`);
  }

  return parts.join(' | ') || 'No metrics available';
}

/**
 * Get performance grade based on metrics
 */
export function getPerformanceGrade(metrics: Partial<PerformanceBudget['metrics']>): 'A' | 'B' | 'C' | 'D' | 'F' {
  let score = 100;

  // TTI (Time to Interactive)
  if (metrics.timeToInteractive) {
    if (metrics.timeToInteractive < 2000) score -= 0;
    else if (metrics.timeToInteractive < 3000) score -= 10;
    else if (metrics.timeToInteractive < 5000) score -= 20;
    else score -= 30;
  }

  // FCP (First Contentful Paint)
  if (metrics.firstContentfulPaint) {
    if (metrics.firstContentfulPaint < 1800) score -= 0;
    else if (metrics.firstContentfulPaint < 3000) score -= 10;
    else score -= 20;
  }

  // LCP (Largest Contentful Paint)
  if (metrics.largestContentfulPaint) {
    if (metrics.largestContentfulPaint < 2500) score -= 0;
    else if (metrics.largestContentfulPaint < 4000) score -= 10;
    else score -= 20;
  }

  // CLS (Cumulative Layout Shift)
  if (metrics.cumulativeLayoutShift) {
    if (metrics.cumulativeLayoutShift < 0.1) score -= 0;
    else if (metrics.cumulativeLayoutShift < 0.25) score -= 10;
    else score -= 20;
  }

  // TBT (Total Blocking Time)
  if (metrics.totalBlockingTime) {
    if (metrics.totalBlockingTime < 200) score -= 0;
    else if (metrics.totalBlockingTime < 300) score -= 10;
    else score -= 25;
  }

  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

/**
 * Suggested optimizations based on failed metrics
 */
export function getSuggestedOptimizations(violations: string[]): string[] {
  const suggestions: string[] = [];

  violations.forEach(violation => {
    if (violation.includes('bundleSize')) {
      suggestions.push('Consider code splitting and lazy loading');
    }
    if (violation.includes('timeToInteractive')) {
      suggestions.push('Optimize main thread work and reduce JavaScript execution time');
    }
    if (violation.includes('firstContentfulPaint')) {
      suggestions.push('Minimize render-blocking resources and prioritize above-the-fold content');
    }
    if (violation.includes('cumulativeLayoutShift')) {
      suggestions.push('Reserve space for images and avoid layout shifts');
    }
    if (violation.includes('totalBlockingTime')) {
      suggestions.push('Reduce long tasks and break up JavaScript execution');
    }
  });

  return suggestions;
}
