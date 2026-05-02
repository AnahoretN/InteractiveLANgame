/**
 * Safe Media Display Component
 *
 * Displays media with error handling and validation
 */

import React, { useState, useEffect } from 'react';
import { Film, AlertCircle } from 'lucide-react';
import { SkeletonCard } from '../shared/Skeleton';

interface SafeMediaDisplayProps {
  url: string;
  type: 'image' | 'video' | 'audio' | 'youtube';
  className?: string;
  alt?: string;
  onError?: (error: string) => void;
}

export const SafeMediaDisplay: React.FC<SafeMediaDisplayProps> = ({
  url,
  type,
  className = '',
  alt = 'Media',
  onError
}) => {
  const [isValid, setIsValid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Validate URL
    if (!url || url.trim() === '') {
      const errorMsg = 'Empty media URL';
      setError(errorMsg);
      setIsValid(false);
      setIsLoading(false);
      onError?.(errorMsg);
      return;
    }

    // Check if it's a valid URL format
    try {
      new URL(url);
      setIsValid(true);
      setError(null);
    } catch (err) {
      const errorMsg = 'Invalid media URL format';
      setError(errorMsg);
      setIsValid(false);
      setIsLoading(false);
      onError?.(errorMsg);
    }
  }, [url, onError]);

  const handleMediaError = (e: any) => {
    const mediaElement = e.currentTarget;
    let errorMsg = 'Unknown media error';

    if (mediaElement.error) {
      switch (mediaElement.error.code) {
        case mediaElement.error.MEDIA_ERR_ABORTED:
          errorMsg = 'Media loading aborted';
          break;
        case mediaElement.error.MEDIA_ERR_NETWORK:
          errorMsg = 'Network error while loading media';
          break;
        case mediaElement.error.MEDIA_ERR_DECODE:
          errorMsg = 'Media decoding error';
          break;
        case mediaElement.error.MEDIA_ERR_SRC_NOT_SUPPORTED:
          errorMsg = 'Media format not supported';
          break;
        default:
          errorMsg = `Media error code: ${mediaElement.error.code}`;
      }
    }

    console.error('[SafeMediaDisplay] Media error:', errorMsg, { url, type });
    setError(errorMsg);
    setIsValid(false);
    setIsLoading(false);
    onError?.(errorMsg);
  };

  const handleLoadStart = () => {
    console.log('[SafeMediaDisplay] Media loading started:', { url, type });
    setIsLoading(true);
  };

  const handleCanPlay = () => {
    console.log('[SafeMediaDisplay] Media can play:', { url, type });
    setIsLoading(false);
    setError(null);
  };

  const handleLoad = () => {
    console.log('[SafeMediaDisplay] Media loaded:', { url, type });
    setIsLoading(false);
    setError(null);
  };

  // Show error state
  if (!isValid || error) {
    return (
      <div className={`flex flex-col items-center justify-center bg-gray-800/50 rounded-lg p-6 border border-gray-700 ${className}`}>
        <AlertCircle className="w-12 h-12 text-red-500 mb-2" />
        <p className="text-white text-sm">Media Error</p>
        <p className="text-gray-400 text-xs mt-1">{error || 'Unknown error'}</p>
        <p className="text-gray-500 text-xs mt-2 font-mono break-all">{url}</p>
      </div>
    );
  }

  // Show loading state with skeleton
  if (isLoading) {
    return (
      <div className={`${className}`}>
        <SkeletonCard />
      </div>
    );
  }

  // Render media based on type
  switch (type) {
    case 'image':
      return (
        <img
          src={url}
          alt={alt}
          className={className}
          onError={handleMediaError}
          onLoad={handleLoad}
        />
      );

    case 'video':
      return (
        <video
          src={url}
          controls
          className={className}
          onError={handleMediaError}
          onLoadStart={handleLoadStart}
          onCanPlay={handleCanPlay}
        />
      );

    case 'audio':
      return (
        <audio
          src={url}
          controls
          className={className}
          onError={handleMediaError}
          onLoadStart={handleLoadStart}
          onCanPlay={handleCanPlay}
        />
      );

    case 'youtube':
      return (
        <iframe
          src={url}
          className={className}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title="YouTube video"
          onError={handleMediaError}
          onLoad={handleLoad}
        />
      );

    default:
      return (
        <div className={`flex items-center justify-center bg-gray-800/50 rounded-lg p-6 ${className}`}>
          <p className="text-white text-sm">Unknown media type: {type}</p>
        </div>
      );
  }
};