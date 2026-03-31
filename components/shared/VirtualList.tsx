/**
 * VirtualList Component
 * Виртуальный скроллинг для больших списков без внешних зависимостей
 */

import React, { memo, useRef, useEffect, useState, useCallback } from 'react';

interface VirtualListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  itemHeight: number;
  containerHeight: number;
  overscan?: number; // Количество дополнительных элементов для рендеринга
  className?: string;
}

export function VirtualList<T>({
  items,
  renderItem,
  itemHeight,
  containerHeight,
  overscan = 3,
  className = ''
}: VirtualListProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Вычисляем видимые элементы
  const { visibleRange, offsetY } = useMemo(() => {
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const endIndex = Math.min(
      items.length - 1,
      Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
    );

    return {
      visibleRange: { start: startIndex, end: endIndex },
      offsetY: startIndex * itemHeight
    };
  }, [scrollTop, itemHeight, containerHeight, overscan, items.length]);

  // Обработчик скролла с throttle
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    requestAnimationFrame(() => {
      setScrollTop(target.scrollTop);
    });
  }, []);

  // Видимые элементы
  const visibleItems = useMemo(() => {
    const { visibleRange } = visibleRange;
    return items.slice(visibleRange.start, visibleRange.end + 1);
  }, [items, visibleRange]);

  return (
    <div
      ref={scrollContainerRef}
      onScroll={handleScroll}
      className={`overflow-auto ${className}`}
      style={{ height: `${containerHeight}px` }}
    >
      <div
        style={{
          height: `${items.length * itemHeight}px`,
          position: 'relative'
        }}
      >
        {visibleItems.map((item, index) => {
          const actualIndex = visibleRange.start + index;
          return (
            <div
              key={actualIndex}
              style={{
                position: 'absolute',
                top: `${actualIndex * itemHeight}px`,
                left: 0,
                right: 0,
                height: `${itemHeight}px`
              }}
            >
              {renderItem(item, actualIndex)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Хук для автоматического определения высоты элемента
export function useItemHeight<T>(
  items: T[],
  renderItem: (item: T, index: number) => React.ReactNode,
  defaultHeight: number = 80
): { itemHeight: number; measureItemHeight: (index: number) => void } {
  const [itemHeights, setItemHeights] = useState<Map<number, number>>(new Map());
  const measureRef = useRef<Map<number, HTMLDivElement>>(new Map());

  const averageHeight = useMemo(() => {
    if (itemHeights.size === 0) return defaultHeight;
    const heights = Array.from(itemHeights.values());
    return heights.reduce((sum, h) => sum + h, 0) / heights.length;
  }, [itemHeights, defaultHeight]);

  const measureItemHeight = useCallback((index: number) => {
    if (measureRef.current.has(index)) {
      const element = measureRef.current.get(index);
      if (element) {
        const height = element.offsetHeight;
        setItemHeights(prev => new Map(prev).set(index, height));
      }
    }
  }, []);

  return {
    itemHeight: averageHeight,
    measureItemHeight
  };
}

// Утилита для memo
function useMemo<T>(factory: () => T, deps: React.DependencyList): T {
  return React.useMemo(factory, deps);
}
