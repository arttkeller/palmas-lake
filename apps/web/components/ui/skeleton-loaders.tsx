'use client';

/**
 * Skeleton Loaders Components
 * 
 * Provides skeleton loading placeholders for various UI components
 * to display during page transitions and lazy loading.
 * 
 * Requirements: 4.4
 */

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Base Skeleton component with pulse animation
 */
export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Additional CSS classes */
  className?: string;
}

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-muted',
        className
      )}
      {...props}
    />
  );
}

/**
 * Card Skeleton - mimics the Card component structure
 */
export interface CardSkeletonProps {
  /** Whether to show header skeleton */
  showHeader?: boolean;
  /** Whether to show footer skeleton */
  showFooter?: boolean;
  /** Number of content lines */
  contentLines?: number;
  /** Additional CSS classes */
  className?: string;
}

export function CardSkeleton({
  showHeader = true,
  showFooter = false,
  contentLines = 3,
  className,
}: CardSkeletonProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800',
        className
      )}
    >
      {showHeader && (
        <div className="flex flex-col space-y-1.5 p-6">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      )}
      <div className="p-6 pt-0 space-y-3">
        {Array.from({ length: contentLines }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-4"
            style={{ width: `${Math.max(40, 100 - i * 15)}%` }}
          />
        ))}
      </div>
      {showFooter && (
        <div className="flex items-center p-6 pt-0">
          <Skeleton className="h-10 w-24" />
        </div>
      )}
    </div>
  );
}

/**
 * Table Skeleton - mimics the Table component structure
 */
export interface TableSkeletonProps {
  /** Number of columns */
  columns?: number;
  /** Number of rows */
  rows?: number;
  /** Whether to show header */
  showHeader?: boolean;
  /** Additional CSS classes */
  className?: string;
}

export function TableSkeleton({
  columns = 4,
  rows = 5,
  showHeader = true,
  className,
}: TableSkeletonProps) {
  return (
    <div className={cn('relative w-full overflow-auto', className)}>
      <div className="w-full">
        {showHeader && (
          <div className="flex border-b border-border">
            {Array.from({ length: columns }).map((_, i) => (
              <div key={i} className="flex-1 h-12 px-3 flex items-center">
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        )}
        <div>
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <div
              key={rowIndex}
              className="flex border-b border-border"
            >
              {Array.from({ length: columns }).map((_, colIndex) => (
                <div key={colIndex} className="flex-1 p-3 flex items-center">
                  <Skeleton
                    className="h-4"
                    style={{ width: `${Math.max(50, 100 - colIndex * 10)}%` }}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Chart Skeleton - mimics chart/graph components
 */
export interface ChartSkeletonProps {
  /** Type of chart skeleton */
  type?: 'bar' | 'line' | 'pie' | 'area';
  /** Height of the chart area */
  height?: number;
  /** Additional CSS classes */
  className?: string;
}

export function ChartSkeleton({
  type = 'bar',
  height = 300,
  className,
}: ChartSkeletonProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800',
        className
      )}
    >
      {/* Chart title */}
      <div className="mb-4">
        <Skeleton className="h-5 w-32 mb-2" />
        <Skeleton className="h-3 w-48" />
      </div>
      
      {/* Chart area */}
      <div
        className="relative flex items-end justify-around gap-2"
        style={{ height }}
      >
        {type === 'bar' && (
          <>
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton
                key={i}
                className="flex-1 max-w-12"
                style={{ height: `${Math.max(20, Math.random() * 100)}%` }}
              />
            ))}
          </>
        )}
        
        {type === 'line' && (
          <div className="w-full h-full flex items-center justify-center">
            <Skeleton className="w-full h-1/2 rounded-none" />
          </div>
        )}
        
        {type === 'pie' && (
          <div className="flex items-center justify-center w-full">
            <Skeleton className="w-48 h-48 rounded-full" />
          </div>
        )}
        
        {type === 'area' && (
          <div className="w-full h-full flex items-end">
            <Skeleton className="w-full h-3/4 rounded-t-lg rounded-b-none" />
          </div>
        )}
      </div>
      
      {/* Legend */}
      <div className="mt-4 flex gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton className="h-3 w-3 rounded-full" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * List Skeleton - mimics list/feed components
 */
export interface ListSkeletonProps {
  /** Number of items */
  items?: number;
  /** Whether to show avatar */
  showAvatar?: boolean;
  /** Whether to show action button */
  showAction?: boolean;
  /** Additional CSS classes */
  className?: string;
}

export function ListSkeleton({
  items = 5,
  showAvatar = true,
  showAction = false,
  className,
}: ListSkeletonProps) {
  return (
    <div className={cn('space-y-4', className)}>
      {Array.from({ length: items }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 p-4 rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
        >
          {showAvatar && (
            <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
          )}
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          {showAction && (
            <Skeleton className="h-8 w-20 flex-shrink-0" />
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Dashboard Skeleton - combines multiple skeletons for dashboard pages
 */
export interface DashboardSkeletonProps {
  /** Layout type */
  layout?: 'default' | 'analytics' | 'list';
  /** Additional CSS classes */
  className?: string;
}

export function DashboardSkeleton({
  layout = 'default',
  className,
}: DashboardSkeletonProps) {
  if (layout === 'analytics') {
    return (
      <div className={cn('space-y-6', className)}>
        {/* Stats row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} contentLines={1} showHeader={false} />
          ))}
        </div>
        {/* Charts row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ChartSkeleton type="bar" />
          <ChartSkeleton type="line" />
        </div>
      </div>
    );
  }

  if (layout === 'list') {
    return (
      <div className={cn('space-y-6', className)}>
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <ListSkeleton items={6} showAvatar showAction />
      </div>
    );
  }

  // Default layout
  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex justify-between items-center">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-32" />
      </div>
      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <CardSkeleton key={i} contentLines={2} />
        ))}
      </div>
      {/* Table */}
      <TableSkeleton columns={5} rows={5} />
    </div>
  );
}

export type SkeletonType = 'card' | 'table' | 'chart' | 'list' | 'dashboard';

export interface SkeletonConfig {
  type: SkeletonType;
  count?: number;
  props?: Record<string, unknown>;
}

/**
 * Factory function to create skeleton based on config
 */
export function createSkeleton(config: SkeletonConfig): React.ReactNode {
  const { type, count = 1, props = {} } = config;

  const skeletons = Array.from({ length: count }).map((_, i) => {
    switch (type) {
      case 'card':
        return <CardSkeleton key={i} {...props} />;
      case 'table':
        return <TableSkeleton key={i} {...props} />;
      case 'chart':
        return <ChartSkeleton key={i} {...props} />;
      case 'list':
        return <ListSkeleton key={i} {...props} />;
      case 'dashboard':
        return <DashboardSkeleton key={i} {...props} />;
      default:
        return <Skeleton key={i} className="h-20 w-full" />;
    }
  });

  return count === 1 ? skeletons[0] : <>{skeletons}</>;
}

export default Skeleton;
