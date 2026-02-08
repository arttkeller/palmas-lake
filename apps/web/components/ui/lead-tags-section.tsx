'use client';

import * as React from 'react';
import { Tag, Brain, TrendingUp, User, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LeadTag, LeadTagCategory } from '@/lib/temperature-config';

/**
 * Props for the LeadTagsSection component
 */
export interface LeadTagsSectionProps {
  /** Array of AI-generated tags to display */
  tags: LeadTag[];
  /** Additional CSS classes */
  className?: string;
}

/**
 * Configuration for tag category display
 */
interface CategoryConfig {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
}

const CATEGORY_CONFIG: Record<LeadTagCategory, CategoryConfig> = {
  temperature: {
    label: 'Temperatura',
    icon: TrendingUp,
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
  },
  interest: {
    label: 'Interesse',
    icon: Sparkles,
    color: 'text-violet-500',
    bgColor: 'bg-violet-500/10',
  },
  behavior: {
    label: 'Comportamento',
    icon: Brain,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  custom: {
    label: 'Personalizado',
    icon: User,
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10',
  },
};

/**
 * Groups tags by their category
 */
export function groupTagsByCategory(tags: LeadTag[]): Record<LeadTagCategory, LeadTag[]> {
  const grouped: Record<LeadTagCategory, LeadTag[]> = {
    temperature: [],
    interest: [],
    behavior: [],
    custom: [],
  };

  for (const tag of tags) {
    if (tag.category in grouped) {
      grouped[tag.category].push(tag);
    }
  }

  return grouped;
}

/**
 * LeadTagsSection Component
 * 
 * Displays all AI-generated tags for a lead, grouped by category.
 * Shows confidence scores where available.
 * 
 * Requirements: 3.2
 * 
 * @example
 * ```tsx
 * <LeadTagsSection tags={lead.aiTags} />
 * ```
 */
export function LeadTagsSection({ tags, className }: LeadTagsSectionProps) {
  // Group tags by category
  const groupedTags = React.useMemo(() => groupTagsByCategory(tags || []), [tags]);

  // Get categories that have tags
  const categoriesWithTags = React.useMemo(
    () =>
      (Object.keys(groupedTags) as LeadTagCategory[]).filter(
        (category) => groupedTags[category].length > 0
      ),
    [groupedTags]
  );

  if (!tags || tags.length === 0) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center py-8',
          'text-muted-foreground',
          className
        )}
      >
        <Tag className="w-8 h-8 mb-2 opacity-50" />
        <p className="text-sm">Nenhuma tag gerada pela IA ainda</p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {categoriesWithTags.map((category) => {
        const config = CATEGORY_CONFIG[category];
        const categoryTags = groupedTags[category];
        const Icon = config.icon;

        return (
          <div key={category} className="space-y-2">
            {/* Category Header */}
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'p-1.5 rounded-lg',
                  config.bgColor
                )}
              >
                <Icon className={cn('w-3.5 h-3.5', config.color)} />
              </div>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {config.label}
              </span>
              <span className="text-xs text-muted-foreground/60">
                ({categoryTags.length})
              </span>
            </div>

            {/* Tags Grid */}
            <div className="flex flex-wrap gap-2">
              {categoryTags.map((tag) => (
                <TagBadge key={tag.id} tag={tag} categoryConfig={config} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Props for TagBadge component
 */
interface TagBadgeProps {
  tag: LeadTag;
  categoryConfig: CategoryConfig;
}

/**
 * Individual tag badge with confidence indicator
 */
function TagBadge({ tag, categoryConfig }: TagBadgeProps) {
  const hasConfidence = tag.confidence !== undefined && tag.confidence !== null;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 px-3 py-1.5',
        'bg-white/60 backdrop-blur-sm',
        'border border-white/30',
        'rounded-xl',
        'text-sm'
      )}
      title={
        hasConfidence
          ? `Confiança: ${Math.round((tag.confidence || 0) * 100)}%`
          : undefined
      }
    >
      {/* Tag name */}
      <span className="font-medium text-foreground">{tag.name}</span>

      {/* Tag value if present */}
      {tag.value && (
        <span className="text-muted-foreground text-xs">
          {tag.value}
        </span>
      )}

      {/* Confidence indicator */}
      {hasConfidence && (
        <ConfidenceIndicator confidence={tag.confidence!} />
      )}

      {/* Creator badge */}
      <span
        className={cn(
          'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
          tag.createdBy === 'ai'
            ? 'bg-violet-100 text-violet-600'
            : 'bg-emerald-100 text-emerald-600'
        )}
      >
        {tag.createdBy === 'ai' ? 'IA' : 'Manual'}
      </span>
    </div>
  );
}

/**
 * Props for ConfidenceIndicator component
 */
interface ConfidenceIndicatorProps {
  confidence: number;
}

/**
 * Visual confidence score indicator
 */
function ConfidenceIndicator({ confidence }: ConfidenceIndicatorProps) {
  const percentage = Math.round(confidence * 100);

  // Determine color based on confidence level
  const getColorClass = () => {
    if (confidence >= 0.8) return 'bg-emerald-500';
    if (confidence >= 0.6) return 'bg-amber-500';
    return 'bg-red-400';
  };

  return (
    <div className="flex items-center gap-1">
      {/* Mini progress bar */}
      <div className="w-8 h-1.5 bg-black/10 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', getColorClass())}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {/* Percentage text */}
      <span className="text-[10px] text-muted-foreground font-medium">
        {percentage}%
      </span>
    </div>
  );
}

/**
 * Extracts all tags from a lead for display
 * Utility function for use with LeadTagsSection
 */
export function extractLeadTags(lead: { aiTags?: LeadTag[] }): LeadTag[] {
  return lead.aiTags || [];
}
