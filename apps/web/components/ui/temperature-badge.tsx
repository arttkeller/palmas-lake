'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import {
  getTemperatureConfig,
  type LeadTemperature,
} from '@/lib/temperature-config';

/**
 * Props for the TemperatureBadge component
 */
export interface TemperatureBadgeProps {
  /** Temperature classification of the lead */
  temperature: LeadTemperature;
  /** Size variant of the badge */
  size?: 'sm' | 'md' | 'lg';
  /** Whether to show the label alongside the emoji */
  showLabel?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Size configuration for the badge
 */
const SIZE_CONFIG = {
  sm: {
    container: 'p-1 rounded-md',
    emoji: 'text-xs',
    label: 'text-[10px]',
  },
  md: {
    container: 'p-1.5 rounded-lg',
    emoji: 'text-sm',
    label: 'text-xs',
  },
  lg: {
    container: 'p-2 rounded-xl',
    emoji: 'text-base',
    label: 'text-sm',
  },
} as const;

/**
 * TemperatureBadge Component
 * 
 * Displays a temperature classification badge with emoji and optional label.
 * Implements glassmorphism styling consistent with the design system.
 * 
 * Returns null when temperature is null (no AI classification yet).
 * 
 * Requirements: 1.2, 1.3
 * 
 * @example
 * ```tsx
 * // Basic usage - displays emoji only
 * <TemperatureBadge temperature="hot" />
 * 
 * // With label
 * <TemperatureBadge temperature="warm" showLabel />
 * 
 * // Different sizes
 * <TemperatureBadge temperature="cold" size="lg" />
 * 
 * // Null temperature - renders nothing
 * <TemperatureBadge temperature={null} />
 * ```
 */
export function TemperatureBadge({
  temperature,
  size = 'md',
  showLabel = false,
  className,
}: TemperatureBadgeProps) {
  // Handle null temperature - no display per Requirement 1.3
  if (temperature === null) {
    return null;
  }

  const config = getTemperatureConfig(temperature);
  
  // Safety check - should never happen with valid temperature
  if (!config) {
    return null;
  }

  const sizeConfig = SIZE_CONFIG[size];

  return (
    <div
      className={cn(
        // Base glassmorphism styles
        'inline-flex items-center gap-1',
        'bg-white/50 dark:bg-white/10 backdrop-blur-xl',
        'border border-white/30 dark:border-white/10',
        'shadow-sm',
        // Size-specific styles
        sizeConfig.container,
        // Temperature-specific background color
        config.bgColor,
        className
      )}
      role="status"
      aria-label={`Temperatura: ${config.label}`}
    >
      {/* Emoji */}
      <span 
        className={sizeConfig.emoji} 
        role="img" 
        aria-hidden="true"
      >
        {config.emoji}
      </span>
      
      {/* Optional label */}
      {showLabel && (
        <span className={cn(
          'font-medium',
          sizeConfig.label,
          config.color
        )}>
          {config.label}
        </span>
      )}
    </div>
  );
}

/**
 * Compact version of TemperatureBadge for tight spaces
 * Only shows the emoji without any container styling
 */
export function TemperatureBadgeCompact({
  temperature,
  className,
}: Pick<TemperatureBadgeProps, 'temperature' | 'className'>) {
  // Handle null temperature - no display per Requirement 1.3
  if (temperature === null) {
    return null;
  }

  const config = getTemperatureConfig(temperature);
  
  if (!config) {
    return null;
  }

  return (
    <span 
      className={cn('text-sm', className)}
      role="img" 
      aria-label={`Temperatura: ${config.label}`}
    >
      {config.emoji}
    </span>
  );
}
