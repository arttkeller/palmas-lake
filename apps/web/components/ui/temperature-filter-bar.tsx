'use client';

import * as React from 'react';
import Lottie from 'lottie-react';
import { cn } from '@/lib/utils';
import {
  TEMPERATURE_CONFIG,
  getAllTemperatureConfigs,
  type NonNullLeadTemperature,
} from '@/lib/temperature-config';
import { useLottieData } from '@/hooks/useLottieData';

/**
 * Props for the TemperatureFilterBar component
 */
export interface TemperatureFilterBarProps {
  /** Currently active temperature filter (single-select, null = none) */
  activeFilter: NonNullLeadTemperature | null;
  /** Callback when a filter is toggled */
  onFilterChange: (temp: NonNullLeadTemperature) => void;
  /** Optional lead counts per temperature for badge display */
  leadCounts?: Partial<Record<NonNullLeadTemperature, number>>;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Props for individual filter button
 */
interface FilterButtonProps {
  temperature: NonNullLeadTemperature;
  isActive: boolean;
  count?: number;
  onClick: () => void;
}

/**
 * Individual temperature filter button with glassmorphism styling
 * 
 * Requirements: 2.1, 2.2, 2.3
 */
function FilterButton({ temperature, isActive, count, onClick }: FilterButtonProps) {
  const config = TEMPERATURE_CONFIG[temperature];
  const animationData = useLottieData(config.lottieUrl);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        // Base glassmorphism styles
        'px-4 py-2 rounded-xl transition-all duration-200',
        'bg-white/50 backdrop-blur-xl',
        'border border-white/20',
        'hover:scale-105 hover:shadow-lg',
        'flex items-center gap-2',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        // Active state with ring and background color
        isActive && [
          'ring-2 ring-offset-2',
          config.ringColor,
          config.bgColor,
        ],
        // Text color
        isActive ? config.color : 'text-gray-600'
      )}
      aria-pressed={isActive}
      aria-label={`Filtrar por ${config.label}`}
    >
      {/* Animated emoji */}
      {animationData ? (
        <Lottie
          animationData={animationData}
          loop
          autoplay
          style={{ width: 24, height: 24 }}
        />
      ) : (
        <span className="text-lg" role="img" aria-hidden="true">
          {config.emoji}
        </span>
      )}
      
      {/* Label (hidden on small screens) */}
      <span className="hidden sm:inline text-sm font-medium">
        {config.label}
      </span>
      
      {/* Count badge */}
      {count !== undefined && count > 0 && (
        <span
          className={cn(
            'min-w-[1.25rem] h-5 px-1.5 rounded-full text-xs font-semibold',
            'flex items-center justify-center',
            isActive
              ? 'bg-white/30'
              : 'bg-gray-200'
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

/**
 * Temperature Filter Bar Component
 * 
 * Displays filter buttons for hot, warm, and cold lead temperatures.
 * Implements glassmorphism styling with active state indicators.
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4
 * 
 * @example
 * ```tsx
 * const { activeFilter, toggleFilter } = useLeadFilters();
 * 
 * <TemperatureFilterBar
 *   activeFilter={activeFilter}
 *   onFilterChange={toggleFilter}
 *   leadCounts={{ hot: 5, warm: 12, cold: 8 }}
 * />
 * ```
 */
export function TemperatureFilterBar({
  activeFilter,
  onFilterChange,
  leadCounts,
  className,
}: TemperatureFilterBarProps) {
  const configs = getAllTemperatureConfigs();

  return (
    <div
      className={cn(
        'flex items-center gap-2',
        className
      )}
      role="group"
      aria-label="Filtros de temperatura de leads"
    >
      {configs.map((config) => (
        <FilterButton
          key={config.value}
          temperature={config.value}
          isActive={activeFilter === config.value}
          count={leadCounts?.[config.value]}
          onClick={() => onFilterChange(config.value)}
        />
      ))}
    </div>
  );
}

/**
 * Compact version of the filter bar for mobile/smaller spaces
 */
export function TemperatureFilterBarCompact({
  activeFilter,
  onFilterChange,
  leadCounts,
  className,
}: TemperatureFilterBarProps) {
  const configs = getAllTemperatureConfigs();

  return (
    <div
      className={cn(
        'flex items-center gap-1',
        className
      )}
      role="group"
      aria-label="Filtros de temperatura de leads"
    >
      {configs.map((config) => {
        const isActive = activeFilter === config.value;
        const count = leadCounts?.[config.value];

        const animationData = useLottieData(config.lottieUrl);

        return (
          <button
            key={config.value}
            type="button"
            onClick={() => onFilterChange(config.value)}
            className={cn(
              'p-2 rounded-lg transition-all duration-200',
              'bg-white/50 backdrop-blur-xl',
              'border border-white/20',
              'hover:scale-105',
              'focus:outline-none focus-visible:ring-2',
              isActive && [
                'ring-2',
                TEMPERATURE_CONFIG[config.value].ringColor,
                TEMPERATURE_CONFIG[config.value].bgColor,
              ]
            )}
            aria-pressed={isActive}
            aria-label={`Filtrar por ${config.label}${count ? ` (${count})` : ''}`}
          >
            {animationData ? (
              <Lottie
                animationData={animationData}
                loop
                autoplay
                style={{ width: 22, height: 22 }}
              />
            ) : (
              <span className="text-base" role="img" aria-hidden="true">
                {config.emoji}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
