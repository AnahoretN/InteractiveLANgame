/**
 * NetworkCache Utility
 * Кэширование и дедупликация сетевых запросов
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

export class NetworkCache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private pendingRequests: Map<string, Promise<T>> = new Map();
  private readonly DEFAULT_TTL = 5000; // 5 секунд

  /**
   * Получить данные из кэша или выполнить запрос
   */
  async get(
    key: string,
    fetcher: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    // Проверяем кэш
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      console.log(`[NetworkCache] Cache hit for: ${key}`);
      return cached.data;
    }

    // Проверяем, есть ли уже выполняющийся запрос
    const pending = this.pendingRequests.get(key);
    if (pending) {
      console.log(`[NetworkCache] Using pending request for: ${key}`);
      return pending;
    }

    // Выполняем новый запрос
    console.log(`[NetworkCache] Cache miss for: ${key}`);
    const requestPromise = fetcher().then(data => {
      // Сохраняем в кэш
      const expiresAt = Date.now() + (ttl || this.DEFAULT_TTL);
      this.cache.set(key, { data, timestamp: Date.now(), expiresAt });

      // Удаляем из pending
      this.pendingRequests.delete(key);

      return data;
    }).finally(() => {
      // Всегда удаляем из pending после завершения
      this.pendingRequests.delete(key);
    });

    // Сохраняем как pending
    this.pendingRequests.set(key, requestPromise);

    return requestPromise;
  }

  /**
   * Инвалидировать конкретный ключ
   */
  invalidate(key: string): void {
    this.cache.delete(key);
    console.log(`[NetworkCache] Invalidated: ${key}`);
  }

  /**
   * Очистить весь кэш
   */
  clear(): void {
    this.cache.clear();
    this.pendingRequests.clear();
    console.log('[NetworkCache] Cache cleared');
  }

  /**
   * Удалить истекшие записи
   */
  cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt < now) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[NetworkCache] Cleaned up ${cleaned} expired entries`);
    }
  }

  /**
   * Получить статистику кэша
   */
  getStats(): { size: number; pending: number } {
    return {
      size: this.cache.size,
      pending: this.pendingRequests.size
    };
  }
}

/**
 * Создать оптимизированную функцию fetch с кэшированием
 */
export function createCachedFetch<T>(
  fetchFn: (key: string) => Promise<T>,
  ttl?: number
): (key: string) => Promise<T> {
  const cache = new NetworkCache<T>();

  // Периодическая очистка истекших записей
  if (typeof window !== 'undefined') {
    setInterval(() => {
      cache.cleanup();
    }, 30000); // Каждые 30 секунд
  }

  return (key: string) => {
    return cache.get(key, () => fetchFn(key), ttl);
  };
}
