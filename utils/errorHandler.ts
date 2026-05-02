/**
 * Universal Error Handling System
 * Provides consistent error handling across the application
 */

/**
 * Custom application error with additional metadata
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly recoverable: boolean = true,
    public readonly context?: Record<string, any>
  ) {
    super(message);
    this.name = 'AppError';

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }

  /**
   * Check if error is recoverable
   */
  isRecoverable(): boolean {
    return this.recoverable;
  }

  /**
   * Get error info for logging/display
   */
  getInfo() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      recoverable: this.recoverable,
      context: this.context
    };
  }
}

/**
 * Error codes for different types of errors
 */
export enum ErrorCode {
  // Network errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  CONNECTION_LOST = 'CONNECTION_LOST',
  SIGNALLING_SERVER_ERROR = 'SIGNALLING_SERVER_ERROR',

  // Media errors
  MEDIA_LOAD_FAILED = 'MEDIA_LOAD_FAILED',
  MEDIA_NOT_FOUND = 'MEDIA_NOT_FOUND',
  MEDIA_TOO_LARGE = 'MEDIA_TOO_LARGE',
  INVALID_MEDIA_TYPE = 'INVALID_MEDIA_TYPE',

  // P2P errors
  PEER_CONNECTION_FAILED = 'PEER_CONNECTION_FAILED',
  HANDSHAKE_FAILED = 'HANDSHAKE_FAILED',
  PROTOCOL_MISMATCH = 'PROTOCOL_MISMATCH',
  MESSAGE_SEND_FAILED = 'MESSAGE_SEND_FAILED',

  // Storage errors
  STORAGE_QUOTA_EXCEEDED = 'STORAGE_QUOTA_EXCEEDED',
  STORAGE_ACCESS_DENIED = 'STORAGE_ACCESS_DENIED',
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',

  // Application errors
  INVALID_STATE = 'INVALID_STATE',
  OPERATION_TIMEOUT = 'OPERATION_TIMEOUT',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

/**
 * Create specific error types
 */
export class NetworkError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, ErrorCode.NETWORK_ERROR, true, context);
    this.name = 'NetworkError';
  }
}

export class ConnectionError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, ErrorCode.CONNECTION_FAILED, true, context);
    this.name = 'ConnectionError';
  }
}

export class MediaError extends AppError {
  constructor(message: string, code: ErrorCode = ErrorCode.MEDIA_LOAD_FAILED, context?: Record<string, any>) {
    super(message, code, true, context);
    this.name = 'MediaError';
  }
}

export class StorageError extends AppError {
  constructor(message: string, code: ErrorCode, context?: Record<string, any>) {
    super(message, code, code !== ErrorCode.STORAGE_QUOTA_EXCEEDED, context);
    this.name = 'StorageError';
  }
}

/**
 * Error handler utility class
 */
export class ErrorHandler {
  private static instance: ErrorHandler;
  private errorListeners: Array<(error: AppError) => void> = [];

  private constructor() {}

  static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  /**
   * Subscribe to error events
   */
  onError(listener: (error: AppError) => void): () => void {
    this.errorListeners.push(listener);
    return () => {
      this.errorListeners = this.errorListeners.filter(l => l !== listener);
    };
  }

  /**
   * Handle error with proper logging and notification
   */
  handle(error: Error | AppError, context?: string): AppError {
    const appError = error instanceof AppError
      ? error
      : new AppError(error.message, ErrorCode.UNKNOWN_ERROR, true, { originalError: error });

    // Log error details
    console.error(`[ErrorHandler${context ? `:${context}` : ''}]`, {
      name: appError.name,
      message: appError.message,
      code: appError.code,
      recoverable: appError.recoverable,
      context: appError.context,
      stack: appError.stack
    });

    // Notify listeners
    this.errorListeners.forEach(listener => {
      try {
        listener(appError);
      } catch (err) {
        console.error('[ErrorHandler] Error in error listener:', err);
      }
    });

    return appError;
  }

  /**
   * Wrap async function with error handling
   */
  async wrap<T>(
    fn: () => Promise<T>,
    context: string,
    defaultCode: ErrorCode = ErrorCode.UNKNOWN_ERROR
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      const appError = error instanceof AppError
        ? error
        : new AppError(
            error instanceof Error ? error.message : String(error),
            defaultCode,
            true
          );
      throw this.handle(appError, context);
    }
  }
}

/**
 * P2P specific error handling
 */
export function handleP2PError(error: Error, context: string): never {
  const errorHandler = ErrorHandler.getInstance();

  let appError: AppError;

  if (error.message.includes('network') || error.message.includes('Failed to fetch')) {
    appError = new NetworkError('Network error accessing signalling server', { originalError: error.message });
  } else if (error.message.includes('server-error')) {
    appError = new AppError('Signalling server error', ErrorCode.SIGNALLING_SERVER_ERROR, true);
  } else if (error.message.includes('ssl-unavailable')) {
    appError = new AppError('SSL not available', ErrorCode.SIGNALLING_SERVER_ERROR, true);
  } else if (error.message.includes('unavailable-id')) {
    appError = new AppError('Host ID already taken', ErrorCode.CONNECTION_FAILED, false);
  } else {
    appError = new ConnectionError('P2P connection failed', { originalError: error.message });
  }

  throw errorHandler.handle(appError, context);
}

/**
 * Media specific error handling
 */
export function handleMediaError(error: Error, mediaId: string, context: string): never {
  const errorHandler = ErrorHandler.getInstance();

  let appError: AppError;

  if (error.message.includes('not found')) {
    appError = new MediaError('Media file not found', ErrorCode.MEDIA_NOT_FOUND, { mediaId });
  } else if (error.message.includes('quota') || error.message.includes('space')) {
    appError = new StorageError('Storage quota exceeded', ErrorCode.STORAGE_QUOTA_EXCEEDED, { mediaId });
  } else {
    appError = new MediaError('Failed to load media', ErrorCode.MEDIA_LOAD_FAILED, { mediaId, originalError: error.message });
  }

  throw errorHandler.handle(appError, context);
}

/**
 * Create safe version of async function that returns null on error
 */
export function safeAsync<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  context: string
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      ErrorHandler.getInstance().handle(
        error instanceof Error ? error : new Error(String(error)),
        context
      );
      return null;
    }
  }) as T;
}

/**
 * Export singleton instance
 */
export const errorHandler = ErrorHandler.getInstance();