'use client';

import * as React from 'react';
import Lottie from 'lottie-react';
import { cn } from '@/lib/utils';
import {
  getTemperatureConfig,
  type LeadTemperature,
} from '@/lib/temperature-config';
import { useLottieData } from '@/hooks/useLottieData';

// ---------------------------------------------------------------------------
// Size config
// ---------------------------------------------------------------------------
const SIZE_CONFIG = {
  sm: { container: 'p-1 rounded-md',   lottie: 18, label: 'text-[10px]' },
  md: { container: 'p-1.5 rounded-lg', lottie: 22, label: 'text-xs'     },
  lg: { container: 'p-2 rounded-xl',   lottie: 28, label: 'text-sm'     },
} as const;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface TemperatureBadgeProps {
  temperature: LeadTemperature;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

// ---------------------------------------------------------------------------
// TemperatureBadge
// ---------------------------------------------------------------------------
export function TemperatureBadge({
  temperature,
  size = 'md',
  showLabel = false,
  className,
}: TemperatureBadgeProps) {
  if (temperature === null) return null;

  const config = getTemperatureConfig(temperature);
  if (!config) return null;

  const sizeConfig = SIZE_CONFIG[size];
  const animationData = useLottieData(config.lottieUrl);

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1',
        'bg-white/50 backdrop-blur-xl',
        'border border-white/30',
        'shadow-sm',
        sizeConfig.container,
        config.bgColor,
        className
      )}
      role="status"
      aria-label={`Temperatura: ${config.label}`}
    >
      {/* Animated emoji — falls back to static text while loading */}
      {animationData ? (
        <Lottie
          animationData={animationData}
          loop
          autoplay
          style={{ width: sizeConfig.lottie, height: sizeConfig.lottie }}
        />
      ) : (
        <span role="img" aria-hidden="true" style={{ fontSize: sizeConfig.lottie * 0.65 }}>
          {config.emoji}
        </span>
      )}

      {showLabel && (
        <span className={cn('font-medium', sizeConfig.label, config.color)}>
          {config.label}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TemperatureBadgeCompact — emoji only, no container
// ---------------------------------------------------------------------------
export function TemperatureBadgeCompact({
  temperature,
  className,
}: Pick<TemperatureBadgeProps, 'temperature' | 'className'>) {
  if (temperature === null) return null;

  const config = getTemperatureConfig(temperature);
  if (!config) return null;

  const animationData = useLottieData(config.lottieUrl);

  if (animationData) {
    return (
      <span className={cn('inline-flex', className)} role="img" aria-label={`Temperatura: ${config.label}`}>
        <Lottie
          animationData={animationData}
          loop
          autoplay
          style={{ width: 20, height: 20 }}
        />
      </span>
    );
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
