/**
 * Adaptive message batching for the P2P host.
 *
 * Only the batching sender is kept: the receiver-side MessageQueue, the priority
 * queue and the binary protocol paths were removed as dead code (nothing consumed
 * sequence numbers, and the base64-wrapped binary path was undecodable by clients).
 * Messages travel as plain JSON strings over PeerJS DataConnections.
 */

interface BatchConfig {
  delay: number;      // Delay before sending batch (ms)
  maxSize: number;    // Maximum batch size
  immediateThreshold?: number; // Send immediately if batch exceeds this size
}

const BATCH_CONFIGS: Record<string, BatchConfig> = {
  event: {
    delay: 0,          // Immediate send for buzzer/critical events
    maxSize: 1,
    immediateThreshold: 1
  },
  state: {
    delay: 10,         // Fast batching for state changes
    maxSize: 50,
    immediateThreshold: 20
  },
  sync: {
    delay: 50,         // Aggressive batching for periodic sync
    maxSize: 100,
    immediateThreshold: 50
  },
  control: {
    delay: 0,          // Immediate for control messages
    maxSize: 1,
    immediateThreshold: 1
  }
};

/**
 * System load metrics for dynamic adjustment
 */
export interface SystemLoad {
  messageRate: number; // Messages per second
  avgLatency: number; // Average processing latency in ms
  queueDepth: number; // Current queue depth
  cpuUsage?: number; // Estimated CPU usage (0-1)
}

/**
 * Dynamic batch configuration that adjusts based on system load
 */
export class DynamicBatchConfig {
  private baseConfigs: Record<string, BatchConfig> = { ...BATCH_CONFIGS };
  private loadHistory: SystemLoad[] = [];
  private readonly maxHistorySize = 10;
  private currentLoad: SystemLoad = {
    messageRate: 0,
    avgLatency: 0,
    queueDepth: 0
  };

  /**
   * Update system load metrics
   */
  updateLoad(metrics: Partial<SystemLoad>) {
    this.currentLoad = {
      ...this.currentLoad,
      ...metrics
    };

    this.loadHistory.push({ ...this.currentLoad });
    if (this.loadHistory.length > this.maxHistorySize) {
      this.loadHistory.shift();
    }
  }

  /**
   * Get adjusted batch configuration based on current load
   */
  getConfig(category: string): BatchConfig {
    const baseConfig = this.baseConfigs[category] || this.baseConfigs.state;

    // No adjustment if no load data
    if (this.loadHistory.length < 3) {
      return baseConfig;
    }

    // Calculate average load metrics
    const avgMessageRate = this.loadHistory.reduce((sum, l) => sum + l.messageRate, 0) / this.loadHistory.length;
    const avgLatency = this.loadHistory.reduce((sum, l) => sum + l.avgLatency, 0) / this.loadHistory.length;
    const avgQueueDepth = this.loadHistory.reduce((sum, l) => sum + l.queueDepth, 0) / this.loadHistory.length;

    // Dynamic adjustment factors
    let delayMultiplier = 1;
    let sizeMultiplier = 1;

    // High message rate: increase batch size, reduce delay
    if (avgMessageRate > 100) {
      sizeMultiplier = 2;
      delayMultiplier = 0.5;
    } else if (avgMessageRate > 50) {
      sizeMultiplier = 1.5;
      delayMultiplier = 0.75;
    }

    // High latency: increase batch size to amortize
    if (avgLatency > 50) {
      sizeMultiplier *= 1.5;
    }

    // Deep queue: reduce delay to flush faster
    if (avgQueueDepth > 50) {
      delayMultiplier *= 0.5;
    }

    // Apply adjustments with limits
    return {
      delay: Math.max(0, Math.min(100, baseConfig.delay * delayMultiplier)),
      maxSize: Math.min(200, Math.max(5, baseConfig.maxSize * sizeMultiplier)),
      immediateThreshold: baseConfig.immediateThreshold
        ? Math.min(200, Math.max(5, baseConfig.immediateThreshold * sizeMultiplier))
        : undefined
    };
  }

  /**
   * Get current system load
   */
  getLoad(): SystemLoad {
    return { ...this.currentLoad };
  }

  /**
   * Reset load history
   */
  reset() {
    this.loadHistory = [];
    this.currentLoad = {
      messageRate: 0,
      avgLatency: 0,
      queueDepth: 0
    };
  }
}

/**
 * Creates an adaptive message sender with category-based batching and dynamic adjustment
 * @param sendFn - Function to send message (message, peerId) => void
 * @returns Object with .send() method for sending messages
 */
export function createOptimizedMessageSender(
  sendFn: (message: string, peerId?: string) => void,
  options?: {
    batchDelay?: number;    // Legacy: default delay if category not found
    maxBatchSize?: number;  // Legacy: default max batch size
    enableDynamic?: boolean; // Enable dynamic batch adjustment
  }
): { send: (message: any, peerId?: string, priority?: string) => void; updateLoad?: (metrics: Partial<SystemLoad>) => void } {
  // Legacy fallback values
  const defaultDelay = options?.batchDelay || 10;
  const defaultMaxSize = options?.maxBatchSize || 50;
  const enableDynamic = options?.enableDynamic ?? true;

  const batch = new Map<string, any[]>();
  const timeouts = new Map<string, NodeJS.Timeout>();
  const batchMetadata = new Map<string, { category: string; createdAt: number }>();
  const dynamicConfig = enableDynamic ? new DynamicBatchConfig() : null;

  // Performance tracking for dynamic adjustment
  const perfTracking = {
    messagesSent: 0,
    startTime: Date.now(),
    lastUpdateTime: Date.now()
  };

  /**
   * Get batch configuration for message category
   */
  const getConfig = (category?: string): BatchConfig => {
    if (!category) return { delay: defaultDelay, maxSize: defaultMaxSize };

    if (dynamicConfig) {
      return dynamicConfig.getConfig(category);
    }

    return BATCH_CONFIGS[category] || { delay: defaultDelay, maxSize: defaultMaxSize };
  };

  /**
   * Update performance metrics for dynamic adjustment
   */
  const updatePerformanceMetrics = () => {
    if (!dynamicConfig) return;

    const now = Date.now();
    const elapsed = now - perfTracking.lastUpdateTime;

    if (elapsed > 1000) { // Update every second
      const messageRate = perfTracking.messagesSent / (elapsed / 1000);
      const queueDepth = Array.from(batch.values()).reduce((sum, b) => sum + b.length, 0);

      dynamicConfig.updateLoad({
        messageRate,
        queueDepth,
        avgLatency: 0 // Would need actual latency measurement
      });

      perfTracking.messagesSent = 0;
      perfTracking.lastUpdateTime = now;
    }
  };

  /**
   * Send batch of messages immediately (plain JSON - PeerJS handles framing)
   */
  const sendBatch = (key: string, messages: any[], peerId?: string) => {
    for (const msg of messages) {
      try {
        sendFn(JSON.stringify(msg), peerId);
        perfTracking.messagesSent++;
      } catch (err) {
        console.error('[createOptimizedMessageSender] Error sending message:', err);
      }
    }
    updatePerformanceMetrics();
  };

  const send = (message: any, peerId?: string, priority?: string) => {
    const key = peerId || 'broadcast';
    const category = message?.category || 'state';
    const config = getConfig(category);
    const immediate = priority === 'high' || config.delay === 0;

    // Initialize batch if needed
    if (!batch.has(key)) {
      batch.set(key, []);
      batchMetadata.set(key, { category, createdAt: Date.now() });
    }

    const currentBatch = batch.get(key)!;
    currentBatch.push(message);

    // Check if we should send immediately
    const shouldSendImmediate = immediate ||
      currentBatch.length >= config.maxSize ||
      (config.immediateThreshold && currentBatch.length >= config.immediateThreshold);

    if (shouldSendImmediate) {
      // Send immediately
      batch.set(key, []);
      batchMetadata.set(key, { category, createdAt: Date.now() });

      // Clear existing timeout
      if (timeouts.has(key)) {
        clearTimeout(timeouts.get(key)!);
        timeouts.delete(key);
      }

      sendBatch(key, currentBatch, peerId);
    } else {
      // Schedule delayed send
      if (timeouts.has(key)) {
        clearTimeout(timeouts.get(key)!);
      }

      const timeout = setTimeout(() => {
        const messages = batch.get(key);
        if (messages && messages.length > 0) {
          batch.set(key, []);
          batchMetadata.delete(key);
          sendBatch(key, messages, peerId);
        }
        timeouts.delete(key);
      }, config.delay);

      timeouts.set(key, timeout);
    }
  };

  const result: any = { send };

  if (dynamicConfig) {
    result.updateLoad = (metrics: Partial<SystemLoad>) => {
      dynamicConfig.updateLoad(metrics);
    };
  }

  return result;
}
