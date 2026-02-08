'use client';

import React from 'react';
import { BarChart3 } from 'lucide-react';

/**
 * Minimum dimensions for chart fallback
 * Requirements: 2.3 - Use minimum fallback dimensions of 100px width and 100px height
 */
export const MIN_CHART_WIDTH = 100;
export const MIN_CHART_HEIGHT = 100;

export interface EmptyChartStateProps {
  /** Custom message for empty state */
  message?: string;
  /** Height of the empty state container */
  height?: number;
  /** Width of the empty state container */
  width?: number;
  /** Custom icon component */
  icon?: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
}

/**
 * EmptyChartState Component
 * 
 * Displays a placeholder visualization when chart data is empty or undefined.
 * 
 * Requirements: 2.1 - Render placeholder visualization without throwing errors
 * Requirements: 2.2 - Display chart with appropriate empty state styling
 * Requirements: 2.3 - Use minimum fallback dimensions
 */
export function EmptyChartState({
  message = 'Sem dados para exibir',
  height = MIN_CHART_HEIGHT,
  width,
  icon,
  className = '',
}: EmptyChartStateProps) {
  const containerStyle: React.CSSProperties = {
    minHeight: Math.max(height, MIN_CHART_HEIGHT),
    minWidth: width ? Math.max(width, MIN_CHART_WIDTH) : undefined,
    width: width || '100%',
    height: height || '100%',
  };

  return (
    <div
      className={`flex flex-col items-center justify-center bg-gray-50/50 rounded-lg border border-dashed border-gray-200 ${className}`}
      style={containerStyle}
      data-testid="empty-chart-state"
    >
      <div className="flex flex-col items-center gap-2 text-center p-4">
        {icon || (
          <div className="rounded-full bg-gray-100 p-2">
            <BarChart3 className="h-6 w-6 text-gray-400" />
          </div>
        )}
        <p className="text-sm text-gray-500">{message}</p>
      </div>
    </div>
  );
}

/**
 * Utility function to check if chart data is empty
 * 
 * @param data - The data to check
 * @returns true if data is empty, undefined, null, or an empty array
 */
export function isChartDataEmpty(data: unknown): boolean {
  if (data === undefined || data === null) {
    return true;
  }
  if (Array.isArray(data) && data.length === 0) {
    return true;
  }
  return false;
}

/**
 * Utility function to check if all values in chart data are zero
 * 
 * @param data - Array of data objects
 * @param valueKey - The key to check for zero values
 * @returns true if all values are zero
 */
export function isAllZeroValues(data: Record<string, unknown>[], valueKey: string): boolean {
  if (!Array.isArray(data) || data.length === 0) {
    return true;
  }
  return data.every((item) => {
    const value = item[valueKey];
    return typeof value === 'number' && value === 0;
  });
}

/**
 * ClientOnly wrapper for Recharts ResponsiveContainer.
 *
 * Recharts logs a console warning when the parent container has
 * zero dimensions at first render, which happens during SSR or
 * before the browser layout pass.  This wrapper defers rendering
 * until after the component mounts, guaranteeing the DOM has real
 * dimensions.
 *
 * Usage:
 *   <ClientOnlyChart height={300}>
 *     <ResponsiveContainer ...>
 *       <BarChart ... />
 *     </ResponsiveContainer>
 *   </ClientOnlyChart>
 */
export function ClientOnlyChart({
  children,
  height = MIN_CHART_HEIGHT,
  className = '',
}: {
  children: React.ReactNode;
  height?: number;
  className?: string;
}) {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    // Delay one frame so the browser has computed layout
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  if (!mounted) {
    return (
      <div
        className={`w-full ${className}`}
        style={{ height, minHeight: MIN_CHART_HEIGHT, minWidth: MIN_CHART_WIDTH }}
      />
    );
  }

  return <>{children}</>;
}

export default EmptyChartState;
