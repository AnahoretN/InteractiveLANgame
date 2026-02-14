/**
 * ErrorBoundary Component
 * Catches JavaScript errors in child component tree
 * Displays fallback UI instead of crashing
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary class component
 * Catches errors anywhere in the child component tree
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="min-h-screen flex items-center justify-center bg-gray-900 p-6">
          <div className="max-w-md w-full bg-gray-800 rounded-lg p-6 border border-red-500/50">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="w-8 h-8 text-red-500 flex-shrink-0" />
              <h1 className="text-xl font-bold text-white">Something went wrong</h1>
            </div>
            <p className="text-gray-400 mb-4">
              An unexpected error occurred. Please try refreshing the page.
            </p>
            {this.state.error && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-400">
                  Error details
                </summary>
                <pre className="mt-2 p-3 bg-gray-900 rounded text-xs text-red-400 overflow-auto">
                  {this.state.error.toString()}
                  {this.state.error.stack}
                </pre>
              </details>
            )}
            <button
              onClick={() => window.location.reload()}
              className="w-full mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Fallback component for async errors (e.g., in useEffect)
 */
export const AsyncErrorBoundary = ({
  error,
  resetError
}: {
  error: Error;
  resetError: () => void;
}) => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 p-6">
      <div className="max-w-md w-full bg-gray-800 rounded-lg p-6 border border-red-500/50">
        <div className="flex items-center gap-3 mb-4">
          <AlertCircle className="w-8 h-8 text-red-500 flex-shrink-0" />
          <h1 className="text-xl font-bold text-white">Loading Error</h1>
        </div>
        <p className="text-gray-400 mb-4">{error.message}</p>
        <button
          onClick={resetError}
          className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
        >
          Try Again
        </button>
      </div>
    </div>
  );
};
