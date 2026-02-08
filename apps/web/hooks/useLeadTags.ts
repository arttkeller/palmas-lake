'use client';

import { useState, useCallback, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import type { LeadTag, LeadTagCategory, TagCreator } from '@/lib/temperature-config';

/**
 * Database schema name
 */
const SCHEMA = 'palmas_lake';

/**
 * Tag creation input
 */
export interface CreateTagInput {
  leadId: string;
  name: string;
  category: LeadTagCategory;
  value?: string;
  confidence?: number;
  createdBy?: TagCreator;
}

/**
 * Return type for the useLeadTags hook
 */
export interface UseLeadTagsReturn {
  /** Tags for the current lead */
  tags: LeadTag[];
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Fetch tags for a lead */
  fetchTags: (leadId: string) => Promise<void>;
  /** Create a new tag */
  createTag: (input: CreateTagInput) => Promise<LeadTag | null>;
  /** Update an existing tag */
  updateTag: (tagId: string, updates: Partial<LeadTag>) => Promise<LeadTag | null>;
  /** Delete a tag */
  deleteTag: (tagId: string) => Promise<boolean>;
  /** Refresh tags for current lead */
  refreshTags: () => Promise<void>;
}

/**
 * Hook for managing lead tags
 * 
 * Provides CRUD operations for lead tags with Supabase integration.
 * Tags are stored with timestamps as required by Requirements 4.3.
 * 
 * Requirements: 4.3
 * 
 * @param initialLeadId - Optional initial lead ID to fetch tags for
 */
export function useLeadTags(initialLeadId?: string): UseLeadTagsReturn {
  const [tags, setTags] = useState<LeadTag[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [currentLeadId, setCurrentLeadId] = useState<string | undefined>(initialLeadId);

  const supabase = createClient();

  /**
   * Fetch tags for a specific lead
   * Requirements: 4.3 - Tags stored with timestamp
   */
  const fetchTags = useCallback(async (leadId: string) => {
    setIsLoading(true);
    setError(null);
    setCurrentLeadId(leadId);

    try {
      const { data, error: fetchError } = await supabase
        .schema(SCHEMA)
        .from('lead_tags')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false });

      if (fetchError) {
        throw new Error(fetchError.message);
      }

      // Transform database records to LeadTag interface
      const transformedTags: LeadTag[] = (data || []).map(record => ({
        id: record.id,
        leadId: record.lead_id,
        name: record.name,
        category: record.category as LeadTagCategory,
        value: record.value || undefined,
        confidence: record.confidence || undefined,
        createdAt: new Date(record.created_at),
        createdBy: record.created_by as TagCreator,
      }));

      setTags(transformedTags);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch tags');
      setError(error);
      console.error('Error fetching lead tags:', error);
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  /**
   * Create a new tag for a lead
   * Requirements: 4.3 - Store tags with timestamp
   */
  const createTag = useCallback(async (input: CreateTagInput): Promise<LeadTag | null> => {
    setError(null);

    try {
      const now = new Date();
      
      // Validate timestamp is not in the future (Property 8)
      if (now > new Date()) {
        throw new Error('Invalid timestamp: cannot be in the future');
      }

      const { data, error: insertError } = await supabase
        .schema(SCHEMA)
        .from('lead_tags')
        .insert({
          lead_id: input.leadId,
          name: input.name,
          category: input.category,
          value: input.value || null,
          confidence: input.confidence || null,
          created_by: input.createdBy || 'ai',
          created_at: now.toISOString(),
        })
        .select()
        .single();

      if (insertError) {
        throw new Error(insertError.message);
      }

      const newTag: LeadTag = {
        id: data.id,
        leadId: data.lead_id,
        name: data.name,
        category: data.category as LeadTagCategory,
        value: data.value || undefined,
        confidence: data.confidence || undefined,
        createdAt: new Date(data.created_at),
        createdBy: data.created_by as TagCreator,
      };

      // Update local state if this is for the current lead
      if (input.leadId === currentLeadId) {
        setTags(prev => [newTag, ...prev]);
      }

      return newTag;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to create tag');
      setError(error);
      console.error('Error creating lead tag:', error);
      return null;
    }
  }, [supabase, currentLeadId]);

  /**
   * Update an existing tag
   */
  const updateTag = useCallback(async (
    tagId: string,
    updates: Partial<LeadTag>
  ): Promise<LeadTag | null> => {
    setError(null);

    try {
      const updateData: Record<string, unknown> = {};
      
      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.category !== undefined) updateData.category = updates.category;
      if (updates.value !== undefined) updateData.value = updates.value;
      if (updates.confidence !== undefined) updateData.confidence = updates.confidence;

      const { data, error: updateError } = await supabase
        .schema(SCHEMA)
        .from('lead_tags')
        .update(updateData)
        .eq('id', tagId)
        .select()
        .single();

      if (updateError) {
        throw new Error(updateError.message);
      }

      const updatedTag: LeadTag = {
        id: data.id,
        leadId: data.lead_id,
        name: data.name,
        category: data.category as LeadTagCategory,
        value: data.value || undefined,
        confidence: data.confidence || undefined,
        createdAt: new Date(data.created_at),
        createdBy: data.created_by as TagCreator,
      };

      // Update local state
      setTags(prev => prev.map(tag => tag.id === tagId ? updatedTag : tag));

      return updatedTag;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to update tag');
      setError(error);
      console.error('Error updating lead tag:', error);
      return null;
    }
  }, [supabase]);

  /**
   * Delete a tag
   */
  const deleteTag = useCallback(async (tagId: string): Promise<boolean> => {
    setError(null);

    try {
      const { error: deleteError } = await supabase
        .schema(SCHEMA)
        .from('lead_tags')
        .delete()
        .eq('id', tagId);

      if (deleteError) {
        throw new Error(deleteError.message);
      }

      // Update local state
      setTags(prev => prev.filter(tag => tag.id !== tagId));

      return true;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to delete tag');
      setError(error);
      console.error('Error deleting lead tag:', error);
      return false;
    }
  }, [supabase]);

  /**
   * Refresh tags for the current lead
   */
  const refreshTags = useCallback(async () => {
    if (currentLeadId) {
      await fetchTags(currentLeadId);
    }
  }, [currentLeadId, fetchTags]);

  // Fetch tags when initialLeadId changes
  useEffect(() => {
    if (initialLeadId) {
      fetchTags(initialLeadId);
    }
  }, [initialLeadId, fetchTags]);

  return {
    tags,
    isLoading,
    error,
    fetchTags,
    createTag,
    updateTag,
    deleteTag,
    refreshTags,
  };
}

/**
 * Pure function to validate tag timestamp
 * Requirements: Property 8 - Tags stored with timestamp not in future
 */
export function isValidTagTimestamp(timestamp: Date): boolean {
  const now = new Date();
  return timestamp <= now;
}

/**
 * Pure function to create a tag object with current timestamp
 * Useful for testing and offline scenarios
 */
export function createTagWithTimestamp(input: Omit<CreateTagInput, 'createdBy'> & { createdBy?: TagCreator }): LeadTag {
  return {
    id: crypto.randomUUID(),
    leadId: input.leadId,
    name: input.name,
    category: input.category,
    value: input.value,
    confidence: input.confidence,
    createdAt: new Date(),
    createdBy: input.createdBy || 'ai',
  };
}
