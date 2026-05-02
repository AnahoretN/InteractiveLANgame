/**
 * Demo Screen Media Download Status Component
 *
 * Displays progress of media downloads on the demo screen.
 * Shows download status, progress indicators, and media readiness.
 */

import React, { useState, useEffect } from 'react';
import { demoScreenMediaHandler, type MediaDownloadProgress } from '../../../utils/demoScreenMediaHandler';
import { Loader2, CheckCircle, XCircle, Clock, Download, Film } from 'lucide-react';

interface MediaDownloadStatusProps {
  enabled?: boolean;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  showOnlyWhenActive?: boolean; // Only show when downloading
  autoHide?: boolean; // Auto-hide when all completed
  autoHideDelay?: number; // Delay before auto-hide (ms)
}

export const MediaDownloadStatus: React.FC<MediaDownloadStatusProps> = ({
  enabled = true,
  position = 'bottom-right',
  showOnlyWhenActive = true,
  autoHide = true,
  autoHideDelay = 3000
}) => {
  const [downloads, setDownloads] = useState<MediaDownloadProgress[]>([]);
  const [isVisible, setIsVisible] = useState(false);
  const [shouldHide, setShouldHide] = useState(false);

  // Initialize and track downloads
  useEffect(() => {
    if (!enabled) return;

    // Initialize handler with progress callback
    demoScreenMediaHandler.initialize((updates) => {
      setDownloads(updates);

      // Check if there are active downloads
      const activeDownloads = updates.filter(
        d => d.status === 'downloading' || d.status === 'assembling'
      );

      const hasActiveDownloads = activeDownloads.length > 0;
      const allCompleted = updates.length > 0 && updates.every(d => d.status === 'completed');

      // Show/hide based on settings
      if (showOnlyWhenActive) {
        setIsVisible(hasActiveDownloads);
      } else {
        setIsVisible(updates.length > 0);
      }

      // Auto-hide when all completed
      if (autoHide && allCompleted && !shouldHide) {
        setShouldHide(true);
        setTimeout(() => {
          setIsVisible(false);
          setShouldHide(false);
        }, autoHideDelay);
      }
    });

    // Initial refresh
    setDownloads(demoScreenMediaHandler.getDownloadProgress());

    return () => {
      // Cleanup
      demoScreenMediaHandler.clear();
    };
  }, [enabled, showOnlyWhenActive, autoHide, autoHideDelay, shouldHide]);

  if (!enabled || !isVisible || downloads.length === 0) {
    return null;
  }

  // Calculate statistics
  const stats = demoScreenMediaHandler.getMediaStats();

  const positionClasses = {
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4',
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4'
  };

  const getStatusIcon = (status: MediaDownloadProgress['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'downloading':
        return <Download className="w-4 h-4 text-blue-500" />;
      case 'assembling':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-gray-400" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
    }
  };

  const activeDownloads = downloads.filter(
    d => d.status === 'downloading' || d.status === 'assembling' || d.status === 'pending'
  );

  return (
    <div className={`fixed ${positionClasses[position]} z-50 bg-black/80 backdrop-blur-sm rounded-lg shadow-xl border border-blue-500/30 min-w-72`}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-blue-500/30">
        <div className="flex items-center gap-2">
          <Film className="w-5 h-5 text-blue-400" />
          <span className="text-white font-medium">Media Downloads</span>
        </div>

        <div className="flex items-center gap-3 text-sm">
          <span className="text-gray-300">
            {stats.completed}/{stats.total}
          </span>
          <span className="text-blue-400">
            {Math.round(stats.completionRate)}%
          </span>
        </div>
      </div>

      {/* Active downloads */}
      {activeDownloads.length > 0 && (
        <div className="max-h-48 overflow-y-auto">
          {activeDownloads.map((download) => (
            <div key={download.mediaId} className="p-3 border-b border-gray-700/50 hover:bg-black/50">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {getStatusIcon(download.status)}
                  <span className="text-white text-sm truncate">{download.mediaId}</span>
                </div>
                <span className="text-gray-400 text-xs ml-2">{download.progress}%</span>
              </div>

              {download.status === 'error' && download.error && (
                <div className="text-red-400 text-xs mt-1">{download.error}</div>
              )}

              {(download.status === 'downloading' || download.status === 'assembling') && (
                <div className="w-full bg-gray-700 rounded-full h-1 mt-1">
                  <div
                    className="bg-blue-500 h-1 rounded-full transition-all duration-300"
                    style={{ width: `${download.progress}%` }}
                  />
                </div>
              )}

              {download.mediaType && (
                <div className="text-gray-400 text-xs mt-1">
                  {download.mediaType}
                  {download.isYouTube && ' (YouTube)'}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Summary */}
      {activeDownloads.length === 0 && (
        <div className="p-4 text-center text-gray-300">
          <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
          <div className="text-sm">All media files ready</div>
        </div>
      )}

      {/* Overall progress */}
      {downloads.length > 0 && (
        <div className="p-3 border-t border-blue-500/30">
          <div className="flex items-center justify-between text-xs text-gray-300 mb-1">
            <span>Overall Progress</span>
            <span>{Math.round(stats.completionRate)}%</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${stats.completionRate}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Hook to access media download status on demo screen
 */
export function useMediaDownloadStatus() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'completed' | 'error'>('idle');
  const [stats, setStats] = useState({
    total: 0,
    completed: 0,
    downloading: 0,
    errors: 0,
    completionRate: 0
  });

  const refreshStatus = () => {
    const currentStats = demoScreenMediaHandler.getMediaStats();
    setStats(currentStats);

    // Determine status
    if (currentStats.total === 0) {
      setStatus('idle');
    } else if (currentStats.errors > 0) {
      setStatus('error');
    } else if (currentStats.completed === currentStats.total) {
      setStatus('completed');
    } else {
      setStatus('loading');
    }

    return currentStats;
  };

  return {
    status,
    stats,
    refreshStatus,
    isMediaReady: demoScreenMediaHandler.isMediaReady.bind(demoScreenMediaHandler),
    getMediaUrl: demoScreenMediaHandler.getMediaUrl.bind(demoScreenMediaHandler),
    getProgress: demoScreenMediaHandler.getMediaProgress.bind(demoScreenMediaHandler)
  };
}