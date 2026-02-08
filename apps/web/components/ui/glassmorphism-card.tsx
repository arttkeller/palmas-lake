'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Glassmorphism variant types
 */
export type GlassmorphismVariant = 'default' | 'elevated' | 'subtle' | 'solid';

/**
 * Props for the GlassmorphismCard component
 */
export interface GlassmorphismCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant of the card */
  variant?: GlassmorphismVariant;
  /** Whether the card has hover effects */
  hoverable?: boolean;
  /** Whether the card is in an active/selected state */
  active?: boolean;
  /** Whether the card is clickable (adds cursor pointer) */
  clickable?: boolean;
  /** Custom gradient for the card background */
  gradient?: string;
  /** Additional CSS classes */
  className?: string;
  /** Children elements */
  children?: React.ReactNode;
}

/**
 * Variant-specific styles for glassmorphism cards
 * Supports both light and dark themes
 * 
 * Requirements: 5.1, 5.5
 */
const VARIANT_STYLES: Record<GlassmorphismVariant, string> = {
  default: cn(
    // Light theme
    'bg-white/70 dark:bg-white/5',
    'backdrop-blur-xl',
    'border border-white/30 dark:border-white/10',
    'shadow-lg shadow-black/5 dark:shadow-black/20'
  ),
  elevated: cn(
    // More prominent glassmorphism
    'bg-white/80 dark:bg-white/10',
    'backdrop-blur-2xl',
    'border border-white/40 dark:border-white/15',
    'shadow-xl shadow-black/10 dark:shadow-black/30'
  ),
  subtle: cn(
    // Lighter glassmorphism effect
    'bg-white/50 dark:bg-white/[0.03]',
    'backdrop-blur-lg',
    'border border-white/20 dark:border-white/5',
    'shadow-md shadow-black/[0.03] dark:shadow-black/10'
  ),
  solid: cn(
    // More opaque, less glass effect
    'bg-white/90 dark:bg-gray-900/90',
    'backdrop-blur-xl',
    'border border-white/50 dark:border-white/10',
    'shadow-xl shadow-black/10 dark:shadow-black/30'
  ),
};

/**
 * Hover state styles
 */
const HOVER_STYLES = cn(
  'hover:shadow-xl hover:shadow-black/10 dark:hover:shadow-black/40',
  'hover:-translate-y-0.5',
  'hover:border-white/40 dark:hover:border-white/20',
  'transition-all duration-300 ease-out'
);

/**
 * Active state styles
 */
const ACTIVE_STYLES = cn(
  'ring-2 ring-emerald-500/50 dark:ring-emerald-400/50',
  'border-emerald-300/50 dark:border-emerald-500/30'
);

/**
 * GlassmorphismCard Component
 * 
 * A reusable card component with glassmorphism styling that supports
 * both light and dark themes. Provides consistent visual design across
 * the application.
 * 
 * Requirements: 5.1, 5.5
 * 
 * @example
 * ```tsx
 * // Basic usage
 * <GlassmorphismCard>
 *   <p>Card content</p>
 * </GlassmorphismCard>
 * 
 * // With hover effects
 * <GlassmorphismCard hoverable clickable>
 *   <p>Hoverable card</p>
 * </GlassmorphismCard>
 * 
 * // Elevated variant
 * <GlassmorphismCard variant="elevated">
 *   <p>Elevated card</p>
 * </GlassmorphismCard>
 * 
 * // With custom gradient
 * <GlassmorphismCard gradient="from-blue-500/20 to-blue-600/5">
 *   <p>Gradient card</p>
 * </GlassmorphismCard>
 * ```
 */
export const GlassmorphismCard = React.forwardRef<HTMLDivElement, GlassmorphismCardProps>(
  (
    {
      variant = 'default',
      hoverable = false,
      active = false,
      clickable = false,
      gradient,
      className,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          // Base styles
          'rounded-2xl',
          // Variant styles
          VARIANT_STYLES[variant],
          // Optional gradient background
          gradient && ['bg-gradient-to-b', gradient],
          // Hover effects
          hoverable && HOVER_STYLES,
          // Active state
          active && ACTIVE_STYLES,
          // Clickable cursor
          clickable && 'cursor-pointer',
          // Custom classes
          className
        )}
        data-glassmorphism-variant={variant}
        data-glassmorphism-active={active}
        {...props}
      >
        {children}
      </div>
    );
  }
);

GlassmorphismCard.displayName = 'GlassmorphismCard';

/**
 * GlassmorphismCardHeader Component
 * Header section for glassmorphism cards
 */
export const GlassmorphismCardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex flex-col space-y-1.5 p-4 md:p-6', className)}
    {...props}
  />
));

GlassmorphismCardHeader.displayName = 'GlassmorphismCardHeader';

/**
 * GlassmorphismCardTitle Component
 * Title element for glassmorphism cards
 */
export const GlassmorphismCardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      'text-lg font-semibold leading-none tracking-tight',
      'text-gray-900 dark:text-white',
      className
    )}
    {...props}
  />
));

GlassmorphismCardTitle.displayName = 'GlassmorphismCardTitle';

/**
 * GlassmorphismCardDescription Component
 * Description text for glassmorphism cards
 */
export const GlassmorphismCardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn('text-sm text-gray-500 dark:text-gray-400', className)}
    {...props}
  />
));

GlassmorphismCardDescription.displayName = 'GlassmorphismCardDescription';

/**
 * GlassmorphismCardContent Component
 * Main content area for glassmorphism cards
 */
export const GlassmorphismCardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('p-4 md:p-6 pt-0', className)} {...props} />
));

GlassmorphismCardContent.displayName = 'GlassmorphismCardContent';

/**
 * GlassmorphismCardFooter Component
 * Footer section for glassmorphism cards
 */
export const GlassmorphismCardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'flex items-center p-4 md:p-6 pt-0',
      'border-t border-black/5 dark:border-white/5',
      className
    )}
    {...props}
  />
));

GlassmorphismCardFooter.displayName = 'GlassmorphismCardFooter';

/**
 * Helper function to get glassmorphism CSS classes
 * Useful for applying glassmorphism styles to non-card elements
 * 
 * @param variant - The glassmorphism variant
 * @param options - Additional options
 * @returns CSS class string
 */
export function getGlassmorphismClasses(
  variant: GlassmorphismVariant = 'default',
  options?: {
    hoverable?: boolean;
    active?: boolean;
    rounded?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  }
): string {
  const roundedMap = {
    sm: 'rounded-sm',
    md: 'rounded-md',
    lg: 'rounded-lg',
    xl: 'rounded-xl',
    '2xl': 'rounded-2xl',
    full: 'rounded-full',
  };

  return cn(
    VARIANT_STYLES[variant],
    options?.rounded && roundedMap[options.rounded],
    options?.hoverable && HOVER_STYLES,
    options?.active && ACTIVE_STYLES
  );
}

export default GlassmorphismCard;
