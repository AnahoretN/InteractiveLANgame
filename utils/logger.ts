/**
 * Logger utility with levels and context support
 * Provides consistent logging across the application
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
}

export interface LoggerOptions {
  level?: LogLevel;
  context?: string;
  enabled?: boolean;
  timestamp?: boolean;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  context?: string;
  timestamp?: string;
  data?: unknown;
}

class Logger {
  private level: LogLevel;
  private context: string;
  private enabled: boolean;
  private includeTimestamp: boolean;

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? this.getLevelFromEnv();
    this.context = options.context ?? 'App';
    this.enabled = options.enabled ?? true;
    this.includeTimestamp = options.timestamp ?? true;
  }

  private getLevelFromEnv(): LogLevel {
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') {
      return LogLevel.WARN;
    }
    return LogLevel.DEBUG;
  }

  private shouldLog(level: LogLevel): boolean {
    return this.enabled && level >= this.level;
  }

  private formatMessage(level: LogLevel, message: string, data?: unknown): LogEntry {
    const entry: LogEntry = {
      level,
      message,
      context: this.context,
    };

    if (this.includeTimestamp) {
      entry.timestamp = new Date().toISOString();
    }

    if (data !== undefined) {
      entry.data = data;
    }

    return entry;
  }

  private log(entry: LogEntry): void {
    const prefix = entry.timestamp
      ? `[${entry.timestamp}] [${entry.context}]`
      : `[${entry.context}]`;

    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(prefix, entry.message, entry.data ?? '');
        break;
      case LogLevel.INFO:
        console.info(prefix, entry.message, entry.data ?? '');
        break;
      case LogLevel.WARN:
        console.warn(prefix, entry.message, entry.data ?? '');
        break;
      case LogLevel.ERROR:
        console.error(prefix, entry.message, entry.data ?? '');
        break;
    }
  }

  debug(message: string, data?: unknown): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;
    this.log(this.formatMessage(LogLevel.DEBUG, message, data));
  }

  info(message: string, data?: unknown): void {
    if (!this.shouldLog(LogLevel.INFO)) return;
    this.log(this.formatMessage(LogLevel.INFO, message, data));
  }

  warn(message: string, data?: unknown): void {
    if (!this.shouldLog(LogLevel.WARN)) return;
    this.log(this.formatMessage(LogLevel.WARN, message, data));
  }

  error(message: string, data?: unknown): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;
    this.log(this.formatMessage(LogLevel.ERROR, message, data));
  }

  // Create a child logger with inherited settings but different context
  child(context: string): Logger {
    const child = new Logger({
      level: this.level,
      context,
      enabled: this.enabled,
      timestamp: this.includeTimestamp,
    });
    return child;
  }

  // Set log level dynamically
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  // Enable/disable logging
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
}

// Default logger instance
export const logger = new Logger();

// Context-specific loggers for common areas
export const mediaLogger = logger.child('Media');
export const p2pLogger = logger.child('P2P');
export const uiLogger = logger.child('UI');
export const storageLogger = logger.child('Storage');
export const networkLogger = logger.child('Network');

// Factory function to create custom loggers
export function createLogger(context: string, options?: LoggerOptions): Logger {
  return new Logger({ ...options, context });
}

export default Logger;