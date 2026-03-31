/**
 * Test Setup File
 * Глобальная конфигурация для всех тестов
 */

import { vi } from 'vitest';

// Mock console methods to reduce noise in test output
global.console = {
  ...console,
  // Keep error/warning but make log less verbose
  log: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

// Mock performance API for performance monitoring tests
global.performance = {
  ...performance,
  memory: {
    usedJSHeapSize: 50 * 1024 * 1024, // 50 MB
    totalJSHeapSize: 100 * 1024 * 1024, // 100 MB
    jsHeapSizeLimit: 200 * 1024 * 1024 // 200 MB
  }
} as unknown as Performance;

// Mock requestAnimationFrame for animations
global.requestAnimationFrame = (callback: FrameRequestCallback) => {
  return setTimeout(callback, 16) as unknown as number;
};

global.cancelAnimationFrame = (id: number) => {
  clearTimeout(id);
};

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  root: null,
  rootMargin: '',
  threshold: [],
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
  takeRecords: vi.fn(),
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => {
      return Object.keys(store)[index] || null;
    }
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

// Mock URL.createObjectURL and URL.revokeObjectURL
const blobUrls = new Set<string>();

global.URL.createObjectURL = (blob: Blob) => {
  const url = `blob:${Date.now()}-${Math.random()}`;
  blobUrls.add(url);
  return url;
};

global.URL.revokeObjectURL = (url: string) => {
  blobUrls.delete(url);
};

// Clean up after each test
afterEach(() => {
  vi.clearAllMocks();
  blobUrls.clear();
});
