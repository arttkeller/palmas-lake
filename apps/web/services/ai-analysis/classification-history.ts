/**
 * Classification History Service
 * 
 * Tracks and preserves the history of lead temperature classifications.
 * Ensures that previous classifications are saved before updates.
 * 
 * Requirements: 4.4
 */

import { createClient } from '@/lib/supabase';
import type { LeadTemperature, LeadClassificationHistory } from '@/lib/temperature-config';

/**
 * Database schema name
 */
const SCHEMA = 'palmas_lake';

/**
 * Input for creating a classification history entry
 */
export interface CreateHistoryInput {
  leadId: string;
  previousTemperature: LeadTemperature;
  newTemperature: LeadTemperature;
  reason?: string;
}

/**
 * Result of a classification update with history
 */
export interface ClassificationUpdateResult {
  success: boolean;
  historyEntry: LeadClassificationHistory | null;
  error?: string;
}

/**
 * Creates a classification history entry
 * 
 * Requirements: 4.4 - WHEN AI updates lead classification THEN preserve history
 */
export async function createClassificationHistory(
  input: CreateHistoryInput
): Promise<LeadClassificationHistory | null> {
  const supabase = createClient();

  try {
    const { data, error } = await supabase
      .schema(SCHEMA)
      .from('lead_classification_history')
      .insert({
        lead_id: input.leadId,
        previous_temperature: input.previousTemperature,
        new_temperature: input.newTemperature,
        reason: input.reason || null,
        changed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating classification history:', error);
      return null;
    }

    return {
      id: data.id,
      leadId: data.lead_id,
      previousTemperature: data.previous_temperature as LeadTemperature,
      newTemperature: data.new_temperature as LeadTemperature,
      reason: data.reason || undefined,
      changedAt: new Date(data.changed_at),
    };
  } catch (err) {
    console.error('Error creating classification history:', err);
    return null;
  }
}

/**
 * Gets classification history for a lead
 */
export async function getClassificationHistory(
  leadId: string
): Promise<LeadClassificationHistory[]> {
  const supabase = createClient();

  try {
    const { data, error } = await supabase
      .schema(SCHEMA)
      .from('lead_classification_history')
      .select('*')
      .eq('lead_id', leadId)
      .order('changed_at', { ascending: false });

    if (error) {
      console.error('Error fetching classification history:', error);
      return [];
    }

    return (data || []).map(record => ({
      id: record.id,
      leadId: record.lead_id,
      previousTemperature: record.previous_temperature as LeadTemperature,
      newTemperature: record.new_temperature as LeadTemperature,
      reason: record.reason || undefined,
      changedAt: new Date(record.changed_at),
    }));
  } catch (err) {
    console.error('Error fetching classification history:', err);
    return [];
  }
}

/**
 * Updates a lead's temperature and preserves history
 * 
 * Requirements: 4.4 - Preserve history of previous classifications
 */
export async function updateLeadTemperatureWithHistory(
  leadId: string,
  currentTemperature: LeadTemperature,
  newTemperature: LeadTemperature,
  reason?: string
): Promise<ClassificationUpdateResult> {
  const supabase = createClient();

  // Don't create history if temperature hasn't changed
  if (currentTemperature === newTemperature) {
    return {
      success: true,
      historyEntry: null,
    };
  }

  try {
    // First, create history entry (Requirements 4.4)
    const historyEntry = await createClassificationHistory({
      leadId,
      previousTemperature: currentTemperature,
      newTemperature,
      reason,
    });

    if (!historyEntry) {
      return {
        success: false,
        historyEntry: null,
        error: 'Failed to create classification history',
      };
    }

    // Then, update the lead's temperature
    const { error: updateError } = await supabase
      .schema(SCHEMA)
      .from('leads')
      .update({
        temperature: newTemperature,
        last_ai_analysis: new Date().toISOString(),
      })
      .eq('id', leadId);

    if (updateError) {
      console.error('Error updating lead temperature:', updateError);
      return {
        success: false,
        historyEntry,
        error: updateError.message,
      };
    }

    return {
      success: true,
      historyEntry,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    console.error('Error updating lead temperature with history:', err);
    return {
      success: false,
      historyEntry: null,
      error,
    };
  }
}

/**
 * Gets the most recent classification for a lead
 */
export async function getLatestClassification(
  leadId: string
): Promise<LeadClassificationHistory | null> {
  const supabase = createClient();

  try {
    const { data, error } = await supabase
      .schema(SCHEMA)
      .from('lead_classification_history')
      .select('*')
      .eq('lead_id', leadId)
      .order('changed_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      // No history found is not an error
      if (error.code === 'PGRST116') {
        return null;
      }
      console.error('Error fetching latest classification:', error);
      return null;
    }

    return {
      id: data.id,
      leadId: data.lead_id,
      previousTemperature: data.previous_temperature as LeadTemperature,
      newTemperature: data.new_temperature as LeadTemperature,
      reason: data.reason || undefined,
      changedAt: new Date(data.changed_at),
    };
  } catch (err) {
    console.error('Error fetching latest classification:', err);
    return null;
  }
}

// ============================================
// Pure Functions for Testing
// ============================================

/**
 * Creates a history entry object without database interaction
 * Useful for testing and offline scenarios
 */
export function createHistoryEntry(input: CreateHistoryInput): LeadClassificationHistory {
  return {
    id: crypto.randomUUID(),
    leadId: input.leadId,
    previousTemperature: input.previousTemperature,
    newTemperature: input.newTemperature,
    reason: input.reason,
    changedAt: new Date(),
  };
}

/**
 * Validates that a history entry preserves the previous classification
 * 
 * Requirements: Property 9 - Classification History Preserved
 */
export function isHistoryPreserved(
  history: LeadClassificationHistory,
  expectedPreviousTemperature: LeadTemperature
): boolean {
  return history.previousTemperature === expectedPreviousTemperature;
}

/**
 * Checks if a temperature change requires history tracking
 */
export function requiresHistoryTracking(
  currentTemperature: LeadTemperature,
  newTemperature: LeadTemperature
): boolean {
  return currentTemperature !== newTemperature;
}
