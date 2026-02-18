/**
 * Temperature Classification System Configuration
 * 
 * Defines types and constants for the lead temperature classification system.
 * Used by AI analysis to classify leads as hot, warm, or cold.
 * 
 * Requirements: 1.1, 1.2
 */

/**
 * Lead temperature classification values
 * - hot: Lead with high conversion probability, showing active interest and urgency
 * - warm: Lead with moderate interest, still in consideration phase
 * - cold: Lead with low engagement or initial interest
 * - null: Lead not yet classified by AI
 */
export type LeadTemperature = 'hot' | 'warm' | 'cold' | null;

/**
 * Non-null temperature values for type-safe operations
 */
export type NonNullLeadTemperature = Exclude<LeadTemperature, null>;

/**
 * Valid temperature values array for validation
 */
export const VALID_TEMPERATURES: readonly NonNullLeadTemperature[] = ['hot', 'warm', 'cold'] as const;

/**
 * Configuration for each temperature classification
 */
export interface TemperatureConfig {
  value: NonNullLeadTemperature;
  emoji: string;
  lottieUrl: string;
  label: string;
  color: string;
  bgColor: string;
  ringColor: string;
}

/**
 * Temperature configuration mapping
 * Maps each temperature value to its visual representation
 */
export const TEMPERATURE_CONFIG: Record<NonNullLeadTemperature, TemperatureConfig> = {
  hot: {
    value: 'hot',
    emoji: '🔥',
    lottieUrl: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f525/lottie.json',
    label: 'Quente',
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/20',
    ringColor: 'ring-orange-500',
  },
  warm: {
    value: 'warm',
    emoji: '🌞',
    lottieUrl: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f31e/lottie.json',
    label: 'Morno',
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/20',
    ringColor: 'ring-amber-500',
  },
  cold: {
    value: 'cold',
    emoji: '❄️',
    lottieUrl: 'https://fonts.gstatic.com/s/e/notoemoji/latest/2744_fe0f/lottie.json',
    label: 'Frio',
    color: 'text-blue-400',
    bgColor: 'bg-blue-400/20',
    ringColor: 'ring-blue-400',
  },
};

/**
 * Lead tag categories
 */
export type LeadTagCategory = 'temperature' | 'interest' | 'behavior' | 'custom';

/**
 * Tag creator type
 */
export type TagCreator = 'ai' | 'user';

/**
 * Lead tag interface for AI-generated and user-created tags
 */
export interface LeadTag {
  id: string;
  leadId: string;
  name: string;
  category: LeadTagCategory;
  value?: string;
  confidence?: number; // 0-1 score from AI
  createdAt: Date;
  createdBy: TagCreator;
}

/**
 * Lead classification history entry
 */
export interface LeadClassificationHistory {
  id: string;
  leadId: string;
  previousTemperature: LeadTemperature;
  newTemperature: LeadTemperature;
  reason?: string;
  changedAt: Date;
}

/**
 * Type guard to check if a value is a valid temperature
 */
export function isValidTemperature(value: unknown): value is NonNullLeadTemperature {
  return typeof value === 'string' && VALID_TEMPERATURES.includes(value as NonNullLeadTemperature);
}

/**
 * Get emoji for a temperature classification
 * Returns empty string for null temperature
 */
export function getTemperatureEmoji(temperature: LeadTemperature): string {
  if (temperature === null) {
    return '';
  }
  return TEMPERATURE_CONFIG[temperature].emoji;
}

/**
 * Get full configuration for a temperature
 * Returns undefined for null temperature
 */
export function getTemperatureConfig(temperature: LeadTemperature): TemperatureConfig | undefined {
  if (temperature === null) {
    return undefined;
  }
  return TEMPERATURE_CONFIG[temperature];
}

/**
 * Get all temperature configurations as an array
 */
export function getAllTemperatureConfigs(): TemperatureConfig[] {
  return VALID_TEMPERATURES.map(temp => TEMPERATURE_CONFIG[temp]);
}

/**
 * Portuguese-to-English temperature mapping
 */
const PORTUGUESE_TO_ENGLISH: Record<string, NonNullLeadTemperature> = {
  quente: 'hot',
  morno: 'warm',
  frio: 'cold',
};

/**
 * Normalizes a temperature value from Portuguese or English to canonical English.
 * Returns null for unrecognized inputs.
 *
 * Requirements: 1.1, 1.3
 */
export function normalizeTemperature(value: string): NonNullLeadTemperature | null {
  if (typeof value !== 'string') return null;
  const lower = value.toLowerCase().trim();
  if (VALID_TEMPERATURES.includes(lower as NonNullLeadTemperature)) {
    return lower as NonNullLeadTemperature;
  }
  if (Object.prototype.hasOwnProperty.call(PORTUGUESE_TO_ENGLISH, lower)) {
    return PORTUGUESE_TO_ENGLISH[lower];
  }
  return null;
}

/**
 * Serializes a canonical temperature value to its string representation.
 *
 * Requirements: 8.1
 */
export function serializeTemperature(temp: NonNullLeadTemperature): string {
  return temp;
}

/**
 * Deserializes a string back to a canonical temperature value.
 * Returns null for unrecognized strings.
 *
 * Requirements: 8.2
 */
export function deserializeTemperature(str: string): NonNullLeadTemperature | null {
  if (typeof str !== 'string') return null;
  const lower = str.toLowerCase().trim();
  if (VALID_TEMPERATURES.includes(lower as NonNullLeadTemperature)) {
    return lower as NonNullLeadTemperature;
  }
  return null;
}
