/**
 * Media Transfer Progress Component
 *
 * Displays progress of background media transfers from host to demo screen.
 * Shows transfer status, progress bars, and statistics.
 */

import React, { useState, useEffect } from 'react';
import { backgroundMediaPreloader, type TransferProgress } from '../../../utils/backgroundMediaPreloader';
import { Loader2, CheckCircle, XCircle, Clock, Film } from 'lucide-react';

interface MediaTransferProgressProps {
  enabled?: boolean;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  showDetails?: boolean;
  onStatusChange?: (status: 'idle' | 'loading' | 'completed' | 'error') => void;
}

export const MediaTransferProgress: React.FC<MediaTransferProgressProps> = ({
  enabled = true,
  position = 'top-right',
  showDetails = false,
  onStatusChange
}) => {
  const [progress, setProgress] = useState<TransferProgress[]>([]);
  const [isVisible, setIsVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Refresh progress data
  useEffect(() => {
    if (!enabled) return;

    const refreshProgress = () => {
      const currentProgress = backgroundMediaPreloader.getTransferProgress();
      setProgress(currentProgress);

      // Auto-show when there's active transfers
      const hasActiveTransfers = currentProgress.some(
        p => p.status === 'pending' || p.status === 'transferring'
      );
      setIsVisible(hasActiveTransfers || currentProgress.length > 0);

      // Calculate overall status
      if (currentProgress.length === 0) {
        onStatusChange?.('idle');
      } else {
        const hasErrors = currentProgress.some(p => p.status === 'error');
        const allCompleted = currentProgress.every(p => p.status === 'completed');

        if (hasErrors) {
          onStatusChange?.('error');
        } else if (allCompleted) {
          onStatusChange?.('completed');
        } else {
          onStatusChange?.('loading');
        }
      }
    };

    // Initial refresh
    refreshProgress();

    // Set up interval to refresh progress
    const interval = setInterval(refreshProgress, 1000);

    return () => clearInterval(interval);
  }, [enabled, onStatusChange]);

  if (!enabled || !isVisible || progress.length === 0) {
    return null;
  }

  // Calculate statistics
  const stats = {
    total: progress.length,
    completed: progress.filter(p => p.status === 'completed').length,
    transferring: progress.filter(p => p.status === 'transferring').length,
    pending: progress.filter(p => p.status === 'pending').length,
    errors: progress.filter(p => p.status === 'error').length,
    overallProgress: progress.length > 0
      ? Math.round(progress.reduce((sum, p) => sum + p.percentage, 0) / progress.length)
      : 0
  };

  const positionClasses = {
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4',
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4'
  };

  const getStatusIcon = (status: TransferProgress['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'transferring':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-gray-400" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
    }
  };

  return (
    <div className={`fixed ${positionClasses[position]} z-50 bg-gray-900 rounded-lg shadow-xl border border-gray-700 min-w-64`}>
      {/* Header */}
      <div
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-800 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <Film className="w-5 h-5 text-blue-400" />
          <span className="text-white font-medium">Media Transfer</span>
          <span className="text-gray-400 text-sm">({stats.completed}/{stats.total})</span>
        </div>

        <div className="flex items-center gap-2">
          {stats.transferring > 0 && (
            <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
          )}
          {stats.errors > 0 && (
            <XCircle className="w-4 h-4 text-red-500" />
          )}
          <span className="text-gray-400 text-sm">{stats.overallProgress}%</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-3 pb-2">
        <div className="w-full bg-gray-700 rounded-full h-2">
          <div
            className="bg-blue-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${stats.overallProgress}%` }}
          />
        </div>
      </div>

      {/* Expanded details */}
      {expanded && showDetails && (
        <div className="border-t border-gray-700 max-h-64 overflow-y-auto">
          {progress.map((item) => (
            <div key={item.mediaId} className="p-3 border-b border-gray-800 hover:bg-gray-800">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {getStatusIcon(item.status)}
                  <span className="text-white text-sm truncate">{item.mediaId}</span>
                </div>
                <span className="text-gray-400 text-xs ml-2">{item.percentage}%</span>
              </div>

              {item.status === 'error' && item.error && (
                <div className="text-red-400 text-xs mt-1">{item.error}</div>
              )}

              {item.status === 'transferring' && (
                <div className="w-full bg-gray-700 rounded-full h-1 mt-1">
                  <div
                    className="bg-blue-500 h-1 rounded-full transition-all duration-300"
                    style={{ width: `${item.percentage}%` }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Quick summary */}
      {!expanded && (
        <div className="px-3 pb-2 flex gap-3 text-xs">
          <span className="text-gray-400">
            <span className="text-blue-400">{stats.transferring}</span> transferring
          </span>
          <span className="text-gray-400">
            <span className="text-gray-500">{stats.pending}</span> pending
          </span>
          {stats.errors > 0 && (
            <span className="text-gray-400">
              <span className="text-red-400">{stats.errors}</span> errors
            </span>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Hook to access media transfer progress
 */
export function useMediaTransferProgress() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'completed' | 'error'>('idle');
  const [stats, setStats] = useState({
    total: 0,
    completed: 0,
    transferring: 0,
    pending: 0,
    errors: 0,
    overallProgress: 0
  });

  const refreshStats = () => {
    const progress = backgroundMediaPreloader.getTransferProgress();

    const newStats = {
      total: progress.length,
      completed: progress.filter(p => p.status === 'completed').length,
      transferring: progress.filter(p => p.status === 'transferring').length,
      pending: progress.filter(p => p.status === 'pending').length,
      errors: progress.filter(p => p.status === 'error').length,
      overallProgress: progress.length > 0
        ? Math.round(progress.reduce((sum, p) => sum + p.percentage, 0) / progress.length)
        : 0
    };

    setStats(newStats);

    // Determine status
    if (progress.length === 0) {
      setStatus('idle');
    } else if (newStats.errors > 0) {
      setStatus('error');
    } else if (newStats.completed === newStats.total) {
      setStatus('completed');
    } else {
      setStatus('loading');
    }

    return newStats;
  };

  return {
    status,
    stats,
    refreshStats,
    isMediaReady: backgroundMediaPreloader.isMediaReady.bind(backgroundMediaPreloader),
    getProgress: backgroundMediaPreloader.getTransferProgress.bind(backgroundMediaPreloader)
  };
}