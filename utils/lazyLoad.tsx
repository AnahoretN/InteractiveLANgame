/**
 * Lazy Loading Utilities
 *
 * Utilities for lazy loading components with skeleton loading states
 */

import React, { lazy, Suspense, ComponentType } from 'react';
import { SkeletonCard, SkeletonListItem, SkeletonTeamList } from '../components/shared/Skeleton';

// Error boundary component for lazy loaded components
interface LazyLoadErrorProps {
  error: Error;
  retry: () => void;
}

const LazyLoadError = ({ error, retry }: LazyLoadErrorProps) => (
  <div className="p-6 bg-red-900/20 border border-red-700 rounded-lg">
    <div className="text-red-400 font-semibold mb-2">Failed to load component</div>
    <div className="text-red-300 text-sm mb-4">{error.message}</div>
    <button
      onClick={retry}
      className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors"
    >
      Retry
    </button>
  </div>
);

// Loading timeout component
interface LoadingTimeoutProps {
  timeout: number;
  onTimeout: () => void;
  children: React.ReactNode;
}

class LoadingTimeout extends React.Component<LoadingTimeoutProps> {
  timeoutId: NodeJS.Timeout | null = null;

  componentDidMount() {
    this.timeoutId = setTimeout(() => {
      this.props.onTimeout();
    }, this.props.timeout);
  }

  componentWillUnmount() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
  }

  render() {
    return this.props.children;
  }
}

// Higher-order component for lazy loading with custom skeleton
export function withLazyLoad<P extends object>(
  importFn: () => Promise<{ default: ComponentType<P> }>,
  Skeleton: ComponentType,
  fallback?: ComponentType<{ error: Error; retry: () => void }>
): ComponentType<P> {
  const LazyComponent = lazy(importFn);

  return (props: P) => (
    <Suspense fallback={<Skeleton />}>
      <LazyComponent {...props} />
    </Suspense>
  );
}

// Lazy load with skeleton card
export function lazyWithCardSkeleton<P extends object>(
  importFn: () => Promise<{ default: ComponentType<P> }>,
  CustomSkeleton?: ComponentType
): ComponentType<P> {
  return withLazyLoad(importFn, CustomSkeleton || SkeletonCard);
}

// Lazy load with skeleton list
export function lazyWithListSkeleton<P extends object>(
  importFn: () => Promise<{ default: ComponentType<P> }>,
  itemCount: number = 5,
  CustomSkeleton?: ComponentType
): ComponentType<P> {
  const SkeletonList = CustomSkeleton || (() => <SkeletonTeamList count={itemCount} />);

  return withLazyLoad(importFn, SkeletonList);
}

// Lazy load with timeout
export function lazyWithTimeout<P extends object>(
  importFn: () => Promise<{ default: ComponentType<P> }>,
  timeoutMs: number,
  onTimeout?: () => void,
  SkeletonComponent?: ComponentType
): ComponentType<P> {
  const LazyComponent = lazy(importFn);
  const Skeleton = SkeletonComponent || SkeletonCard;

  return (props: P) => (
    <LoadingTimeout timeout={timeoutMs} onTimeout={() => onTimeout?.()}>
      <Suspense fallback={<Skeleton />}>
        <LazyComponent {...props} />
      </Suspense>
    </LoadingTimeout>
  );
}

// Preload utility
export function preloadComponent(
  importFn: () => Promise<{ default: ComponentType<any> }>
): void {
  importFn();
}

// Lazy load GamePlay component
export const LazyGamePlay = lazyWithCardSkeleton(
  () => import('../components/host/GamePlay').then(m => ({ default: m.GamePlay })),
  () => (
    <div className="p-6 bg-gray-900 rounded-lg space-y-4">
      <SkeletonCard />
      <SkeletonTeamList count={3} />
    </div>
  )
);

// Lazy load PackEditor component
export const LazyPackEditor = lazyWithCardSkeleton(
  () => import('../components/host/PackEditor').then(m => ({ default: m.PackEditor })),
  () => (
    <div className="p-6 bg-gray-900 rounded-lg space-y-4">
      <SkeletonCard />
      <SkeletonCard />
    </div>
  )
);

// Lazy load QuestionModal component
export const LazyQuestionModal = lazyWithCardSkeleton(
  () => import('../components/host/game/modals/QuestionModal').then(m => ({ default: m.QuestionModal })),
  () => (
    <div className="p-6 bg-gray-900 rounded-lg">
      <SkeletonCard />
    </div>
  )
);

// Lazy load SuperGameModals components
export const LazySuperGameQuestionModal = lazyWithCardSkeleton(
  () => import('../components/host/game/SuperGameModals').then(m => ({ default: m.SuperGameQuestionModal })),
  () => (
    <div className="p-6 bg-gray-900 rounded-lg">
      <SkeletonCard />
    </div>
  )
);

export const LazySuperGameAnswersModal = lazyWithCardSkeleton(
  () => import('../components/host/game/SuperGameModals').then(m => ({ default: m.SuperGameAnswersModal })),
  () => (
    <div className="p-6 bg-gray-900 rounded-lg space-y-3">
      <SkeletonListItem />
      <SkeletonListItem />
      <SkeletonListItem />
    </div>
  )
);

// Lazy load GameSelectorModal
export const LazyGameSelectorModal = lazyWithCardSkeleton(
  () => import('../components/host/GameSelectorModal').then(m => ({ default: m.GameSelectorModal })),
  () => (
    <div className="p-6 bg-gray-900 rounded-lg space-y-4">
      <SkeletonCard />
      <SkeletonPackList count={5} />
    </div>
  )
);

// Lazy load OptimizedGameSelectorModal (recommended)
export const LazyOptimizedGameSelectorModal = lazyWithCardSkeleton(
  () => import('../components/host/OptimizedGameSelectorModal').then(m => ({ default: m.OptimizedGameSelectorModal })),
  () => (
    <div className="p-6 bg-gray-900 rounded-lg space-y-4">
      <SkeletonCard />
      <SkeletonPackList count={5} />
    </div>
  )
);

// Lazy load MediaStreamer components
export const LazyEnhancedMediaStreamer = lazyWithCardSkeleton(
  () => import('../components/host/game/EnhancedMediaStreamer').then(m => ({ default: m.EnhancedMediaStreamer })),
  () => (
    <div className="p-4 bg-gray-900 rounded-lg space-y-2">
      <SkeletonListItem />
      <SkeletonListItem />
    </div>
  )
);

export const LazyMediaTransferProgress = lazyWithCardSkeleton(
  () => import('../components/host/game/MediaTransferProgress').then(m => ({ default: m.MediaTransferProgress })),
  () => (
    <div className="p-4 bg-gray-900 rounded-lg">
      <SkeletonListItem />
    </div>
  )
);

// Utility to preload all critical components
export function preloadCriticalComponents(): void {
  // Preload components that are likely to be used soon
  preloadComponent(() => import('../components/host/GamePlay'));
  preloadComponent(() => import('../components/host/game/modals/QuestionModal'));
  preloadComponent(() => import('../components/host/game/SuperGameModals'));
}

// Utility to preload all media components
export function preloadMediaComponents(): void {
  preloadComponent(() => import('../components/host/game/EnhancedMediaStreamer'));
  preloadComponent(() => import('../components/host/game/MediaTransferProgress'));
}

// Export SkeletonPackList for local use
const SkeletonPackList = ({ count = 5 }: { count?: number }) => (
  <div className="space-y-2">
    {Array.from({ length: count }).map((_, i) => (
      <SkeletonCard key={i} />
    ))}
  </div>
);