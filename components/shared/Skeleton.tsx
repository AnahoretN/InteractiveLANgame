/**
 * Skeleton Components
 *
 * Loading placeholders for various UI elements with smooth animations
 */

import React from 'react';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded';
  width?: string | number;
  height?: string | number;
  animation?: 'pulse' | 'wave' | 'none';
}

export const Skeleton = React.memo<SkeletonProps>(({
  variant = 'text',
  width,
  height,
  animation = 'pulse',
  className = '',
  style = {},
  ...props
}) => {
  const baseClasses = 'inline-block bg-gray-700/50';

  const variantClasses = {
    text: 'rounded h-4 w-full',
    circular: 'rounded-full',
    rectangular: 'rounded-sm',
    rounded: 'rounded-lg'
  };

  const animationClasses = {
    pulse: 'animate-pulse',
    wave: 'animate-shimmer',
    none: ''
  };

  const combinedStyle = {
    ...style,
    ...(width && { width }),
    ...(height && { height })
  };

  return (
    <div
      className={`${baseClasses} ${variantClasses[variant]} ${animationClasses[animation]} ${className}`.trim()}
      style={combinedStyle}
      {...props}
    />
  );
});

Skeleton.displayName = 'Skeleton';

// specialized skeleton components
export const SkeletonText = React.memo(({ lines = 3, className = '' }: { lines?: number; className?: string }) => (
  <div className={`space-y-2 ${className}`}>
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton
        key={i}
        variant="text"
        width={i === lines - 1 ? '60%' : '100%'}
      />
    ))}
  </div>
));

SkeletonText.displayName = 'SkeletonText';

export const SkeletonAvatar = React.memo(({ size = 40, className = '' }: { size?: number; className?: string }) => (
  <Skeleton
    variant="circular"
    width={size}
    height={size}
    className={className}
  />
));

SkeletonAvatar.displayName = 'SkeletonAvatar';

export const SkeletonCard = React.memo(({ className = '' }: { className?: string }) => (
  <div className={`p-4 bg-gray-800/50 rounded-lg space-y-3 ${className}`}>
    <div className="flex items-center gap-3">
      <SkeletonAvatar size={40} />
      <div className="flex-1">
        <Skeleton variant="text" width="70%" />
        <Skeleton variant="text" width="40%" />
      </div>
    </div>
    <SkeletonText lines={2} />
  </div>
));

SkeletonCard.displayName = 'SkeletonCard';

export const SkeletonListItem = React.memo(({ className = '' }: { className?: string }) => (
  <div className={`flex items-center gap-3 p-3 bg-gray-800/30 rounded-lg ${className}`}>
    <SkeletonAvatar size={32} />
    <div className="flex-1 space-y-2">
      <Skeleton variant="text" width="60%" />
      <Skeleton variant="text" width="30%" />
    </div>
  </div>
));

SkeletonListItem.displayName = 'SkeletonListItem';

export const SkeletonGameCard = React.memo(({ className = '' }: { className?: string }) => (
  <div className={`p-4 bg-gray-800/50 rounded-lg border border-gray-700/50 ${className}`}>
    <Skeleton variant="rectangular" width="100%" height={120} className="mb-3" />
    <Skeleton variant="text" width="80%" />
    <Skeleton variant="text" width="40%" />
  </div>
));

SkeletonGameCard.displayName = 'SkeletonGameCard';

export const SkeletonPackList = React.memo(({ count = 5 }: { count?: number }) => (
  <div className="space-y-2">
    {Array.from({ length: count }).map((_, i) => (
      <SkeletonCard key={i} />
    ))}
  </div>
));

SkeletonPackList.displayName = 'SkeletonPackList';

export const SkeletonTeamList = React.memo(({ count = 3 }: { count?: number }) => (
  <div className="space-y-2">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="p-3 bg-gray-800/30 rounded-lg space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton variant="circular" width={28} height={28} />
          <Skeleton variant="text" width="40%" />
        </div>
        <div className="ml-6 space-y-1">
          <SkeletonListItem />
          <SkeletonListItem />
        </div>
      </div>
    ))}
  </div>
));

SkeletonTeamList.displayName = 'SkeletonTeamList';