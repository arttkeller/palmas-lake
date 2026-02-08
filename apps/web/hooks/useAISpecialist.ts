'use client';

/**
 * useAISpecialist Hook
 * 
 * Detects the current section and returns the corresponding AI specialist configuration.
 * 
 * Requirements: 5.3
 */

import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { 
  getAISpecialistByPath, 
  hasAISpecialist,
  type AISpecialistConfig,
  type AIContextType
} from '@/lib/ai-specialist-config';

export interface UseAISpecialistResult {
  /** The AI specialist configuration for the current section */
  config: AISpecialistConfig | undefined;
  /** Whether the current path has an AI specialist */
  hasSpecialist: boolean;
  /** The current path */
  currentPath: string;
  /** The context type for the current section */
  contextType: AIContextType | undefined;
  /** The section name */
  sectionName: string | undefined;
  /** The emoji for the current section */
  emoji: string | undefined;
  /** The placeholder text for the message input */
  placeholder: string | undefined;
}

/**
 * Hook to get the AI specialist configuration for the current section
 * 
 * @returns The AI specialist configuration and related utilities
 * 
 * @example
 * ```tsx
 * const { config, hasSpecialist, emoji, placeholder } = useAISpecialist();
 * 
 * if (hasSpecialist && config) {
 *   return <MessageDock emoji={emoji} placeholder={placeholder} />;
 * }
 * ```
 */
export function useAISpecialist(): UseAISpecialistResult {
  const pathname = usePathname();
  
  const result = useMemo(() => {
    const config = getAISpecialistByPath(pathname);
    const hasSpec = hasAISpecialist(pathname);
    
    return {
      config,
      hasSpecialist: hasSpec,
      currentPath: pathname,
      contextType: config?.contextType,
      sectionName: config?.section,
      emoji: config?.emoji,
      placeholder: config?.placeholder,
    };
  }, [pathname]);
  
  return result;
}

export default useAISpecialist;
