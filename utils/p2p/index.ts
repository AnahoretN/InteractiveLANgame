/**
 * P2P Module Index
 *
 * Central exports for all P2P-related utilities
 */

// Connection health monitoring
export { ConnectionHealthMonitor } from './ConnectionHealthMonitor';
export type { HealthStats, HealthMonitorOptions } from './ConnectionHealthMonitor';

// Pool statistics management
export { PoolStatsManager } from './PoolStatsManager';
export type { PoolStats, ConnectionMetadata } from './PoolStatsManager';
