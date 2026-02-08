'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, RefreshCw, Loader2 } from 'lucide-react';

/**
 * Configuration constants for timeout warning
 * Requirements: 4.1 - Show warning when loading takes more than 2 seconds
 */
const LOADING_WARNING_MS = 2000;

export interface TimeoutWarningProps {
  /** Whether the component is in loading state */
  isLoading: boolean;
  /** Whether a timeout has occurred */
  hasTimedOut?: boolean;
  /** Callback function to retry the operation */
  onRetry?: () => void;
  /** Whether retry is in progress */
  isRetrying?: boolean;
  /** Custom warning message */
  warningMessage?: string;
  /** Custom timeout message */
  timeoutMessage?: string;
}

/**
 * TimeoutWarning Component
 * 
 * Displays a warning message when loading takes longer than expected,
 * and shows a timeout error with retry option when the operation times out.
 * 
 * Requirements: 4.1 - Show warning when loading takes more than 2 seconds
 * Requirements: 1.4 - Display retry button in warning/error state
 */
export function TimeoutWarning({
  isLoading,
  hasTimedOut = false,
  onRetry,
  isRetrying = false,
  warningMessage = 'O carregamento está demorando mais que o esperado...',
  timeoutMessage = 'A conexão expirou. Os dados podem estar indisponíveis.',
}: TimeoutWarningProps) {
  const [showWarning, setShowWarning] = useState(false);

  // Show warning after LOADING_WARNING_MS when loading
  useEffect(() => {
    let timeoutId: NodeJS.Timeout | null = null;

    if (isLoading && !hasTimedOut) {
      timeoutId = setTimeout(() => {
        setShowWarning(true);
      }, LOADING_WARNING_MS);
    } else {
      setShowWarning(false);
    }

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [isLoading, hasTimedOut]);

  // Show timeout error state
  if (hasTimedOut) {
    return (
      <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">
              Tempo limite excedido
            </p>
            <p className="text-sm text-amber-700 mt-0.5">
              {timeoutMessage}
            </p>
          </div>
          {onRetry && (
            <button
              onClick={onRetry}
              disabled={isRetrying}
              className="flex items-center gap-2 rounded-lg bg-amber-100 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isRetrying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Tentar novamente
            </button>
          )}
        </div>
      </div>
    );
  }

  // Show loading warning after delay
  if (showWarning && isLoading) {
    return (
      <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 text-blue-500 animate-spin flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-800">
              Carregando...
            </p>
            <p className="text-sm text-blue-700 mt-0.5">
              {warningMessage}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export default TimeoutWarning;
