'use client';

import { BarChart3, RefreshCw, Loader2, AlertTriangle, Clock } from 'lucide-react';

export interface AnalyticsEmptyStateProps {
  /** Whether data is currently loading */
  isLoading?: boolean;
  /** Error that occurred during data fetch */
  error?: Error | null;
  /** Whether the data is stale */
  isStale?: boolean;
  /** Last update timestamp */
  lastUpdate?: Date | null;
  /** Callback to retry loading data */
  onRetry?: () => void;
  /** Whether retry is in progress */
  isRetrying?: boolean;
  /** Custom message for empty state */
  emptyMessage?: string;
}

/**
 * AnalyticsEmptyState Component
 * 
 * Displays appropriate UI for empty, error, or stale data states.
 * 
 * Requirements: 1.2 - Display Placeholder_Metrics with visual indicator when data unavailable
 * Requirements: 1.3 - Display Placeholder_Metrics without loading spinner for empty/null data
 * Requirements: 4.2 - Display clear visual indicator with last known update time for stale data
 */
export function AnalyticsEmptyState({
  isLoading = false,
  error = null,
  isStale = false,
  lastUpdate = null,
  onRetry,
  isRetrying = false,
  emptyMessage = 'Nenhum dado disponível no momento.',
}: AnalyticsEmptyStateProps) {
  // Format last update time
  const formatLastUpdate = (date: Date | null): string => {
    if (!date) return 'Nunca atualizado';
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Error state - Requirements: 1.4
  if (error) {
    return (
      <div className="rounded-xl bg-red-50 border border-red-200 p-6">
        <div className="flex flex-col items-center text-center gap-4">
          <div className="rounded-full bg-red-100 p-3">
            <AlertTriangle className="h-8 w-8 text-red-500" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-red-800">
              Erro ao carregar dados
            </h3>
            <p className="text-sm text-red-600 mt-1">
              {error.message || 'Ocorreu um erro inesperado.'}
            </p>
          </div>
          {onRetry && (
            <button
              onClick={onRetry}
              disabled={isRetrying}
              className="flex items-center gap-2 rounded-lg bg-red-100 px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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

  // Stale data indicator - Requirements: 4.2
  if (isStale && lastUpdate) {
    return (
      <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-amber-100 p-2">
            <Clock className="h-5 w-5 text-amber-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">
              Dados desatualizados
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              Última atualização: {formatLastUpdate(lastUpdate)}
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
              Atualizar
            </button>
          )}
        </div>
      </div>
    );
  }

  // Empty state - Requirements: 1.2, 1.3
  return (
    <div className="rounded-xl bg-gray-50 border border-gray-200 p-8">
      <div className="flex flex-col items-center text-center gap-4">
        <div className="rounded-full bg-gray-100 p-4">
          <BarChart3 className="h-10 w-10 text-gray-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-700">
            Sem dados para exibir
          </h3>
          <p className="text-sm text-gray-500 mt-1 max-w-sm">
            {emptyMessage}
          </p>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            disabled={isRetrying || isLoading}
            className="flex items-center gap-2 rounded-lg bg-emerald-100 px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isRetrying || isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Carregar dados
          </button>
        )}
      </div>
    </div>
  );
}

export default AnalyticsEmptyState;
