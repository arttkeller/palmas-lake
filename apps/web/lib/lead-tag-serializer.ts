/**
 * Lead Tag Serialization System
 * 
 * Provides functions for serializing, parsing, and pretty-printing lead tags.
 * Used for data export, import, and round-trip testing validation.
 * 
 * Requirements: 6.1, 6.2, 6.3
 */

import { LeadTag, LeadTemperature, LeadTagCategory, TagCreator } from './temperature-config';

/**
 * Serialized tag format for JSON export
 */
export interface SerializedTag {
  id: string;
  name: string;
  category: string;
  value?: string;
  confidence?: number;
  createdAt: string; // ISO 8601
  createdBy: 'ai' | 'user';
}

/**
 * Serialized lead tags format
 */
export interface SerializedLeadTags {
  version: string;
  leadId: string;
  temperature: LeadTemperature;
  tags: SerializedTag[];
  exportedAt: string; // ISO 8601
}

/**
 * Lead data structure for serialization
 */
export interface LeadForSerialization {
  id: string;
  temperature: LeadTemperature;
  aiTags: LeadTag[];
}

/**
 * Current serialization format version
 */
export const SERIALIZATION_VERSION = '1.0.0';

/**
 * Valid tag categories for validation
 */
const VALID_CATEGORIES: readonly LeadTagCategory[] = ['temperature', 'interest', 'behavior', 'custom'];

/**
 * Valid tag creators for validation
 */
const VALID_CREATORS: readonly TagCreator[] = ['ai', 'user'];

/**
 * Serializes lead tags to JSON string
 * 
 * @param lead - Lead object with tags to serialize
 * @returns JSON string representation of lead tags
 * @throws Error if lead data is invalid
 * 
 * Requirements: 6.1
 */
export function serializeLeadTags(lead: LeadForSerialization): string {
  if (!lead || typeof lead.id !== 'string' || lead.id.trim() === '') {
    throw new Error('Invalid lead: id is required and must be a non-empty string');
  }

  const serialized: SerializedLeadTags = {
    version: SERIALIZATION_VERSION,
    leadId: lead.id,
    temperature: lead.temperature,
    tags: (lead.aiTags || []).map(tag => serializeTag(tag)),
    exportedAt: new Date().toISOString(),
  };

  return JSON.stringify(serialized);
}

/**
 * Serializes a single tag to the serialized format
 */
function serializeTag(tag: LeadTag): SerializedTag {
  const serialized: SerializedTag = {
    id: tag.id,
    name: tag.name,
    category: tag.category,
    createdAt: tag.createdAt instanceof Date 
      ? tag.createdAt.toISOString() 
      : new Date(tag.createdAt).toISOString(),
    createdBy: tag.createdBy,
  };

  // Only include optional fields if they have values
  if (tag.value !== undefined && tag.value !== null) {
    serialized.value = tag.value;
  }
  if (tag.confidence !== undefined && tag.confidence !== null) {
    serialized.confidence = tag.confidence;
  }

  return serialized;
}

/**
 * Parses JSON string back to SerializedLeadTags object
 * 
 * @param json - JSON string to parse
 * @returns Parsed SerializedLeadTags object
 * @throws Error if JSON is invalid or missing required fields
 * 
 * Requirements: 6.2
 */
export function parseLeadTags(json: string): SerializedLeadTags {
  if (!json || typeof json !== 'string') {
    throw new Error('Invalid input: JSON string is required');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    throw new Error(`Invalid JSON: ${e instanceof Error ? e.message : 'parse error'}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid JSON: must be an object');
  }

  const obj = parsed as Record<string, unknown>;

  // Validate required fields
  if (typeof obj.version !== 'string') {
    throw new Error('Invalid format: version is required');
  }
  if (typeof obj.leadId !== 'string') {
    throw new Error('Invalid format: leadId is required');
  }
  if (!Array.isArray(obj.tags)) {
    throw new Error('Invalid format: tags must be an array');
  }
  if (typeof obj.exportedAt !== 'string') {
    throw new Error('Invalid format: exportedAt is required');
  }

  // Validate temperature
  const temperature = validateTemperature(obj.temperature);

  // Validate and parse tags
  const tags = obj.tags.map((tag, index) => validateAndParseTag(tag, index));

  return {
    version: obj.version,
    leadId: obj.leadId,
    temperature,
    tags,
    exportedAt: obj.exportedAt,
  };
}

/**
 * Validates temperature value
 */
function validateTemperature(value: unknown): LeadTemperature {
  if (value === null) {
    return null;
  }
  if (value === 'hot' || value === 'warm' || value === 'cold') {
    return value;
  }
  throw new Error(`Invalid temperature value: ${value}`);
}

/**
 * Validates and parses a single tag from parsed JSON
 */
function validateAndParseTag(tag: unknown, index: number): SerializedTag {
  if (!tag || typeof tag !== 'object') {
    throw new Error(`Invalid tag at index ${index}: must be an object`);
  }

  const t = tag as Record<string, unknown>;

  if (typeof t.id !== 'string') {
    throw new Error(`Invalid tag at index ${index}: id is required`);
  }
  if (typeof t.name !== 'string') {
    throw new Error(`Invalid tag at index ${index}: name is required`);
  }
  if (typeof t.category !== 'string' || !VALID_CATEGORIES.includes(t.category as LeadTagCategory)) {
    throw new Error(`Invalid tag at index ${index}: category must be one of ${VALID_CATEGORIES.join(', ')}`);
  }
  if (typeof t.createdAt !== 'string') {
    throw new Error(`Invalid tag at index ${index}: createdAt is required`);
  }
  if (typeof t.createdBy !== 'string' || !VALID_CREATORS.includes(t.createdBy as TagCreator)) {
    throw new Error(`Invalid tag at index ${index}: createdBy must be one of ${VALID_CREATORS.join(', ')}`);
  }

  const result: SerializedTag = {
    id: t.id,
    name: t.name,
    category: t.category,
    createdAt: t.createdAt,
    createdBy: t.createdBy as TagCreator,
  };

  if (t.value !== undefined && t.value !== null) {
    if (typeof t.value !== 'string') {
      throw new Error(`Invalid tag at index ${index}: value must be a string`);
    }
    result.value = t.value;
  }

  if (t.confidence !== undefined && t.confidence !== null) {
    if (typeof t.confidence !== 'number' || t.confidence < 0 || t.confidence > 1) {
      throw new Error(`Invalid tag at index ${index}: confidence must be a number between 0 and 1`);
    }
    result.confidence = t.confidence;
  }

  return result;
}

/**
 * Pretty prints lead tags in a human-readable format
 * 
 * @param lead - Lead object with tags to format
 * @returns Formatted string representation
 * 
 * Requirements: 6.3
 */
export function prettyPrintLeadTags(lead: LeadForSerialization): string {
  const lines: string[] = [];
  
  lines.push('='.repeat(50));
  lines.push(`Lead Tags Report`);
  lines.push('='.repeat(50));
  lines.push('');
  lines.push(`Lead ID: ${lead.id}`);
  lines.push(`Temperature: ${formatTemperature(lead.temperature)}`);
  lines.push(`Total Tags: ${(lead.aiTags || []).length}`);
  lines.push('');

  if (!lead.aiTags || lead.aiTags.length === 0) {
    lines.push('No tags assigned.');
  } else {
    lines.push('-'.repeat(50));
    lines.push('Tags:');
    lines.push('-'.repeat(50));
    
    // Group tags by category
    const tagsByCategory = groupTagsByCategory(lead.aiTags);
    
    for (const [category, tags] of Object.entries(tagsByCategory)) {
      lines.push('');
      lines.push(`[${category.toUpperCase()}]`);
      
      for (const tag of tags) {
        lines.push(formatTag(tag));
      }
    }
  }

  lines.push('');
  lines.push('='.repeat(50));
  lines.push(`Exported: ${new Date().toISOString()}`);
  lines.push('='.repeat(50));

  return lines.join('\n');
}

/**
 * Formats temperature for display
 */
function formatTemperature(temperature: LeadTemperature): string {
  if (temperature === null) {
    return 'Not classified';
  }
  const emojiMap: Record<string, string> = {
    hot: '🔥 Hot (Quente)',
    warm: '🌤️ Warm (Morno)',
    cold: '❄️ Cold (Frio)',
  };
  return emojiMap[temperature] || temperature;
}

/**
 * Groups tags by category
 */
function groupTagsByCategory(tags: LeadTag[]): Record<string, LeadTag[]> {
  return tags.reduce((acc, tag) => {
    const category = tag.category;
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(tag);
    return acc;
  }, {} as Record<string, LeadTag[]>);
}

/**
 * Formats a single tag for display
 */
function formatTag(tag: LeadTag): string {
  const parts: string[] = [`  • ${tag.name}`];
  
  if (tag.value) {
    parts.push(`    Value: ${tag.value}`);
  }
  if (tag.confidence !== undefined) {
    parts.push(`    Confidence: ${(tag.confidence * 100).toFixed(1)}%`);
  }
  parts.push(`    Created: ${formatDate(tag.createdAt)} by ${tag.createdBy.toUpperCase()}`);
  
  return parts.join('\n');
}

/**
 * Formats date for display
 */
function formatDate(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString().replace('T', ' ').substring(0, 19);
}

/**
 * Converts SerializedLeadTags back to LeadForSerialization
 * Useful for completing the round-trip
 */
export function deserializeToLead(serialized: SerializedLeadTags): LeadForSerialization {
  return {
    id: serialized.leadId,
    temperature: serialized.temperature,
    aiTags: serialized.tags.map(tag => ({
      id: tag.id,
      leadId: serialized.leadId,
      name: tag.name,
      category: tag.category as LeadTagCategory,
      value: tag.value,
      confidence: tag.confidence,
      createdAt: new Date(tag.createdAt),
      createdBy: tag.createdBy,
    })),
  };
}

/**
 * Checks if two lead tag objects are equivalent
 * Used for round-trip validation
 */
export function areLeadTagsEquivalent(
  original: LeadForSerialization,
  restored: LeadForSerialization
): boolean {
  // Check basic properties
  if (original.id !== restored.id) return false;
  if (original.temperature !== restored.temperature) return false;
  
  const originalTags = original.aiTags || [];
  const restoredTags = restored.aiTags || [];
  
  if (originalTags.length !== restoredTags.length) return false;
  
  // Check each tag
  for (let i = 0; i < originalTags.length; i++) {
    const orig = originalTags[i];
    const rest = restoredTags[i];
    
    if (orig.id !== rest.id) return false;
    if (orig.name !== rest.name) return false;
    if (orig.category !== rest.category) return false;
    if (orig.createdBy !== rest.createdBy) return false;
    
    // Compare optional fields
    if (orig.value !== rest.value) return false;
    if (orig.confidence !== rest.confidence) return false;
    
    // Compare dates (allow for ISO string conversion)
    const origDate = orig.createdAt instanceof Date ? orig.createdAt.getTime() : new Date(orig.createdAt).getTime();
    const restDate = rest.createdAt instanceof Date ? rest.createdAt.getTime() : new Date(rest.createdAt).getTime();
    if (origDate !== restDate) return false;
  }
  
  return true;
}
