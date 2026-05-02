/**
 * PerformanceMonitor Component
 * Отслеживание метрик производительности в реальном времени
 */

import React, { memo, useState, useEffect, useRef } from 'react';
import { Activity, Zap, Clock } from 'lucide-react';

interface PerformanceMetrics {
  renderCount: number;
  averageRenderTime: number;
  lastRenderTime: number;
  memoryUsage?: number;
}

interface PerformanceMonitorProps {
  enabled?: boolean;
  onReport?: (metrics: PerformanceMetrics) => void;
}

export const PerformanceMonitor = memo(({
  enabled = process.env.NODE_ENV === 'development',
  onReport
}: PerformanceMonitorProps) => {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    renderCount: 0,
    averageRenderTime: 0,
    lastRenderTime: 0
  });
  const [isVisible, setIsVisible] = useState(false);
  const renderTimesRef = useRef<number[]>([]);
  const componentMountTime = useRef<number>(Date.now());

  // Отслеживание рендеров
  useEffect(() => {
    if (!enabled) return;

    const renderStart = performance.now();
    renderTimesRef.current.push(renderStart);

    // Обновляем метрики после рендера
    requestAnimationFrame(() => {
      const renderEnd = performance.now();
      const renderTime = renderEnd - renderStart;

      setMetrics(prev => {
        const newRenderCount = prev.renderCount + 1;
        const newAverageRenderTime = (
          (prev.averageRenderTime * (newRenderCount - 1) + renderTime) / newRenderCount
        );

        const newMetrics: PerformanceMetrics = {
          renderCount: newRenderCount,
          averageRenderTime: newAverageRenderTime,
          lastRenderTime: renderTime
        };

        // Проверяем memory usage если доступно
        if ('memory' in performance) {
          const memory = (performance as any).memory;
          newMetrics.memoryUsage = memory.usedJSHeapSize / 1024 / 1024; // MB
        }

        onReport?.(newMetrics);
        return newMetrics;
      });
    });
  });

  // Keyboard shortcut для показа/скрытия (Ctrl+Shift+P)
  useEffect(() => {
    if (!enabled) return;

    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'P') {
        setIsVisible(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [enabled]);

  if (!enabled || !isVisible) {
    return null;
  }

  const getPerformanceColor = (avgTime: number) => {
    if (avgTime < 16) return 'text-green-400'; // 60+ FPS
    if (avgTime < 33) return 'text-yellow-400'; // 30-60 FPS
    return 'text-red-400'; // < 30 FPS
  };

  const uptime = ((Date.now() - componentMountTime.current) / 1000).toFixed(1);

  return (
    <div className="fixed top-4 right-4 bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-lg p-4 shadow-xl z-50 min-w-[250px]">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Activity className="w-4 h-4 text-blue-400" />
          Performance
        </h3>
        <button
          onClick={() => setIsVisible(false)}
          className="text-gray-400 hover:text-white"
        >
          ×
        </button>
      </div>

      <div className="space-y-2 text-xs">
        {/* Render Stats */}
        <div className="flex items-center justify-between">
          <span className="text-gray-400">Renders:</span>
          <span className="text-white font-mono">{metrics.renderCount}</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-gray-400">Last Render:</span>
          <span className={`font-mono ${getPerformanceColor(metrics.lastRenderTime)}`}>
            {metrics.lastRenderTime.toFixed(2)}ms
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-gray-400">Avg Render:</span>
          <span className={`font-mono ${getPerformanceColor(metrics.averageRenderTime)}`}>
            {metrics.averageRenderTime.toFixed(2)}ms
          </span>
        </div>

        {metrics.memoryUsage && (
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Memory:</span>
            <span className="text-white font-mono">
              {metrics.memoryUsage.toFixed(1)} MB
            </span>
          </div>
        )}

        {/* FPS Indicator */}
        <div className="flex items-center justify-between">
          <span className="text-gray-400">Est. FPS:</span>
          <span className={`font-mono ${getPerformanceColor(metrics.averageRenderTime)}`}>
            {metrics.averageRenderTime > 0
              ? Math.min(60, Math.round(1000 / metrics.averageRenderTime))
              : '-'}
          </span>
        </div>

        {/* Uptime */}
        <div className="flex items-center justify-between">
          <span className="text-gray-400">Uptime:</span>
          <span className="text-white font-mono flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {uptime}s
          </span>
        </div>

        {/* Performance Grade */}
        <div className="pt-2 border-t border-gray-700">
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Grade:</span>
            <span className={`font-bold ${
              metrics.averageRenderTime < 16 ? 'text-green-400' :
              metrics.averageRenderTime < 33 ? 'text-yellow-400' :
              'text-red-400'
            }`}>
              {metrics.averageRenderTime < 16 ? 'A' :
               metrics.averageRenderTime < 33 ? 'B' :
               metrics.averageRenderTime < 50 ? 'C' : 'D'}
            </span>
          </div>
        </div>

        {/* Tips */}
        {metrics.averageRenderTime > 33 && (
          <div className="mt-2 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-yellow-400 text-[10px]">
            <Zap className="w-3 h-3 inline mr-1" />
            Consider using React.memo or useMemo
          </div>
        )}
      </div>
    </div>
  );
});

PerformanceMonitor.displayName = 'PerformanceMonitor';
