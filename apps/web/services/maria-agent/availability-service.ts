/**
 * Availability Service for Maria Agent (Palmas Lake Towers)
 * Ensures 24/7 message processing regardless of time
 * Requirements: 13.1, 13.2
 */

// ============================================
// Configuration
// ============================================

/**
 * Availability configuration
 * The agent operates 24/7 without any time restrictions
 */
export const AVAILABILITY_CONFIG = {
  /** Agent is available 24 hours a day */
  hoursPerDay: 24,
  /** Agent is available 7 days a week */
  daysPerWeek: 7,
  /** No business hours restriction - always available */
  hasBusinessHoursRestriction: false,
  /** Processing is continuous without interruption */
  continuousProcessing: true,
} as const;

// ============================================
// Availability Check Functions
// ============================================

/**
 * Checks if the agent is available to process messages
 * Always returns true for 24/7 availability
 * 
 * Requirements: 13.1, 13.2
 * 
 * @param timestamp - The timestamp of the incoming message
 * @returns Always true - agent is available 24/7
 */
export function isAgentAvailable(timestamp?: Date): boolean {
  // Agent is always available - 24/7 operation
  // No time-based restrictions
  return true;
}

/**
 * Checks if the current time is within business hours
 * Note: This is informational only - agent still processes messages 24/7
 * 
 * Business hours: Monday-Friday, 9h-19h
 * 
 * @param timestamp - The timestamp to check (defaults to now)
 * @returns true if within business hours, false otherwise
 */
export function isWithinBusinessHours(timestamp: Date = new Date()): boolean {
  const day = timestamp.getDay();
  const hour = timestamp.getHours();
  
  // Weekend (0 = Sunday, 6 = Saturday)
  if (day === 0 || day === 6) {
    return false;
  }
  
  // Business hours: 9h-19h
  return hour >= 9 && hour < 19;
}

/**
 * Determines if a message should be processed
 * Always returns true - messages are processed 24/7
 * 
 * Requirements: 13.1, 13.2
 * 
 * @param timestamp - The timestamp of the message
 * @returns Always true - all messages should be processed
 */
export function shouldProcessMessage(timestamp?: Date): boolean {
  // All messages should be processed regardless of time
  // This ensures 24/7 availability as per requirements
  return isAgentAvailable(timestamp);
}

/**
 * Gets the availability status message
 * Used for informational purposes
 * 
 * @param timestamp - The timestamp to check
 * @returns Status message indicating availability
 */
export function getAvailabilityStatus(timestamp: Date = new Date()): AvailabilityStatus {
  const withinBusinessHours = isWithinBusinessHours(timestamp);
  
  return {
    isAvailable: true, // Always available
    isWithinBusinessHours: withinBusinessHours,
    message: withinBusinessHours
      ? 'Atendimento disponível - horário comercial'
      : 'Atendimento disponível - fora do horário comercial',
    canProcessMessages: true,
    canScheduleVisits: true, // Visits can be scheduled anytime, but occur during business hours
  };
}

// ============================================
// Types
// ============================================

export interface AvailabilityStatus {
  /** Whether the agent is available (always true for 24/7) */
  isAvailable: boolean;
  /** Whether current time is within business hours */
  isWithinBusinessHours: boolean;
  /** Human-readable status message */
  message: string;
  /** Whether messages can be processed (always true) */
  canProcessMessages: boolean;
  /** Whether visits can be scheduled (always true, visits occur during business hours) */
  canScheduleVisits: boolean;
}

// ============================================
// Message Processing Wrapper
// ============================================

/**
 * Wraps message processing to ensure 24/7 availability
 * This function validates that messages are processed regardless of time
 * 
 * Requirements: 13.1, 13.2
 * 
 * @param messageTimestamp - When the message was received
 * @param processFunction - The function to process the message
 * @returns The result of processing the message
 */
export async function processMessageWithAvailability<T>(
  messageTimestamp: Date,
  processFunction: () => Promise<T>
): Promise<ProcessingResult<T>> {
  // Validate availability (always true for 24/7)
  const available = isAgentAvailable(messageTimestamp);
  
  if (!available) {
    // This should never happen with 24/7 availability
    // But included for completeness and future-proofing
    throw new Error('Agent unavailable - this should not occur with 24/7 configuration');
  }
  
  // Record processing metadata
  const processingStartTime = new Date();
  const withinBusinessHours = isWithinBusinessHours(messageTimestamp);
  
  // Process the message
  const result = await processFunction();
  
  const processingEndTime = new Date();
  
  return {
    result,
    metadata: {
      messageReceivedAt: messageTimestamp,
      processedAt: processingStartTime,
      completedAt: processingEndTime,
      processingTimeMs: processingEndTime.getTime() - processingStartTime.getTime(),
      wasWithinBusinessHours: withinBusinessHours,
      availabilityMode: '24/7',
    },
  };
}

export interface ProcessingResult<T> {
  result: T;
  metadata: ProcessingMetadata;
}

export interface ProcessingMetadata {
  /** When the message was received */
  messageReceivedAt: Date;
  /** When processing started */
  processedAt: Date;
  /** When processing completed */
  completedAt: Date;
  /** Processing time in milliseconds */
  processingTimeMs: number;
  /** Whether message was received during business hours */
  wasWithinBusinessHours: boolean;
  /** Availability mode (always '24/7') */
  availabilityMode: '24/7';
}

// ============================================
// Validation Functions
// ============================================

/**
 * Validates that the system is configured for 24/7 operation
 * Used for health checks and monitoring
 * 
 * @returns Validation result
 */
export function validateAvailabilityConfiguration(): ConfigurationValidation {
  const config = AVAILABILITY_CONFIG;
  
  const isValid = 
    config.hoursPerDay === 24 &&
    config.daysPerWeek === 7 &&
    config.hasBusinessHoursRestriction === false &&
    config.continuousProcessing === true;
  
  return {
    isValid,
    configuration: config,
    errors: isValid ? [] : ['Configuration does not meet 24/7 requirements'],
  };
}

export interface ConfigurationValidation {
  isValid: boolean;
  configuration: typeof AVAILABILITY_CONFIG;
  errors: string[];
}
