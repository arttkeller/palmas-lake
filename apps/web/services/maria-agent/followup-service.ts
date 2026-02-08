/**
 * Follow-up Service for Maria Agent (Palmas Lake Towers)
 * Handles automatic follow-up scheduling and messaging for unresponsive leads
 * Requirements: 8.1, 8.2, 8.3
 */

import type { PalmasLakeLead, PalmasLakeConversation } from '@/types/maria-agent';

// ============================================
// Follow-up Configuration
// Requirements 8.1, 8.2: Timing and limits
// ============================================

export const FOLLOW_UP_CONFIG = {
  /** First follow-up after 4 hours of no response */
  firstDelay: 4 * 60 * 60 * 1000, // 4 hours in milliseconds
  /** Subsequent follow-ups with 1 day interval */
  subsequentDelay: 24 * 60 * 60 * 1000, // 1 day in milliseconds
  /** Maximum number of follow-up attempts */
  maxAttempts: 3,
};

// ============================================
// Follow-up Result Interface
// ============================================

export interface FollowUpResult {
  sent: boolean;
  attempt: number;
  message?: string;
  nextScheduled?: Date;
  isLastAttempt: boolean;
}

// ============================================
// Follow-up Schedule Interface
// ============================================

export interface FollowUpSchedule {
  leadId: string;
  attempt: number;
  scheduledAt: Date;
  delay: number;
}

// ============================================
// Follow-up Message Templates
// Requirements 8.1, 8.3
// ============================================

/**
 * Gets the follow-up message based on attempt number
 * Requirements 8.1: First message template
 * Requirements 8.3: Final message template
 * 
 * @param attempt - Current attempt number (1-based)
 * @param leadName - Name of the lead (optional)
 * @returns The appropriate follow-up message
 */
export function getFollowUpMessage(attempt: number, leadName?: string): string {
  const name = leadName || 'Olá';
  
  // First and intermediate attempts
  // Requirements 8.1: "[Nome], ainda está interessado em conhecer nosso empreendimento?"
  if (attempt < FOLLOW_UP_CONFIG.maxAttempts) {
    return `${name}, ainda está interessado em conhecer nosso empreendimento? Posso te enviar mais informações!`;
  }
  
  // Final attempt
  // Requirements 8.3: "Ok [Nome], vou deixar registrado seu interesse."
  return `Ok ${name}, vou deixar registrado seu interesse. Qualquer coisa, me chama!`;
}

// ============================================
// Follow-up Scheduling Logic
// Requirements 8.1, 8.2
// ============================================

/**
 * Calculates the delay for the next follow-up based on attempt number
 * Requirements 8.1: First attempt after 4 hours
 * Requirements 8.2: Subsequent attempts with 1 day interval
 * 
 * @param attempt - Current attempt number (1-based)
 * @returns Delay in milliseconds
 */
export function getFollowUpDelay(attempt: number): number {
  if (attempt <= 1) {
    return FOLLOW_UP_CONFIG.firstDelay;
  }
  return FOLLOW_UP_CONFIG.subsequentDelay;
}

/**
 * Checks if more follow-up attempts are allowed
 * Requirements 8.2: Maximum 3 attempts
 * 
 * @param currentAttempts - Number of attempts already made
 * @returns true if more attempts are allowed
 */
export function canSendFollowUp(currentAttempts: number): boolean {
  return currentAttempts < FOLLOW_UP_CONFIG.maxAttempts;
}

/**
 * Checks if this is the last follow-up attempt
 * 
 * @param attempt - Current attempt number (1-based)
 * @returns true if this is the last attempt
 */
export function isLastAttempt(attempt: number): boolean {
  return attempt >= FOLLOW_UP_CONFIG.maxAttempts;
}

/**
 * Calculates the scheduled time for the next follow-up
 * 
 * @param fromDate - Base date to calculate from
 * @param attempt - Attempt number for delay calculation
 * @returns Scheduled date for the follow-up
 */
export function calculateNextFollowUpTime(fromDate: Date, attempt: number): Date {
  const delay = getFollowUpDelay(attempt);
  return new Date(fromDate.getTime() + delay);
}

/**
 * Creates a follow-up schedule for a lead
 * 
 * @param leadId - ID of the lead
 * @param currentAttempts - Number of attempts already made
 * @param fromDate - Base date to calculate from (defaults to now)
 * @returns FollowUpSchedule or null if max attempts reached
 */
export function scheduleFollowUp(
  leadId: string,
  currentAttempts: number,
  fromDate: Date = new Date()
): FollowUpSchedule | null {
  if (!canSendFollowUp(currentAttempts)) {
    return null;
  }
  
  const nextAttempt = currentAttempts + 1;
  const delay = getFollowUpDelay(nextAttempt);
  const scheduledAt = calculateNextFollowUpTime(fromDate, nextAttempt);
  
  return {
    leadId,
    attempt: nextAttempt,
    scheduledAt,
    delay,
  };
}

// ============================================
// Follow-up Processing
// ============================================

/**
 * Determines if a lead needs a follow-up based on last interaction
 * 
 * @param lastInteractionAt - Date of last interaction
 * @param currentAttempts - Number of follow-up attempts already made
 * @param now - Current date (defaults to now)
 * @returns true if follow-up should be sent
 */
export function needsFollowUp(
  lastInteractionAt: Date,
  currentAttempts: number,
  now: Date = new Date()
): boolean {
  if (!canSendFollowUp(currentAttempts)) {
    return false;
  }
  
  const nextAttempt = currentAttempts + 1;
  const requiredDelay = getFollowUpDelay(nextAttempt);
  const timeSinceLastInteraction = now.getTime() - lastInteractionAt.getTime();
  
  return timeSinceLastInteraction >= requiredDelay;
}

/**
 * Processes a follow-up for a lead
 * Returns the result with message and next schedule
 * 
 * @param lead - The lead to follow up with
 * @param conversation - The conversation with follow-up tracking
 * @returns FollowUpResult with message and scheduling info
 */
export function processFollowUp(
  lead: PalmasLakeLead,
  conversation: PalmasLakeConversation
): FollowUpResult {
  const currentAttempts = conversation.follow_up_attempts;
  
  // Check if we can send more follow-ups
  if (!canSendFollowUp(currentAttempts)) {
    return {
      sent: false,
      attempt: currentAttempts,
      isLastAttempt: true,
    };
  }
  
  const nextAttempt = currentAttempts + 1;
  const message = getFollowUpMessage(nextAttempt, lead.full_name);
  const isLast = isLastAttempt(nextAttempt);
  
  // Calculate next scheduled follow-up if not last attempt
  let nextScheduled: Date | undefined;
  if (!isLast) {
    nextScheduled = calculateNextFollowUpTime(new Date(), nextAttempt + 1);
  }
  
  return {
    sent: true,
    attempt: nextAttempt,
    message,
    nextScheduled,
    isLastAttempt: isLast,
  };
}

/**
 * Gets the remaining follow-up attempts for a lead
 * 
 * @param currentAttempts - Number of attempts already made
 * @returns Number of remaining attempts
 */
export function getRemainingAttempts(currentAttempts: number): number {
  return Math.max(0, FOLLOW_UP_CONFIG.maxAttempts - currentAttempts);
}

/**
 * Formats the follow-up delay for display
 * 
 * @param delayMs - Delay in milliseconds
 * @returns Human-readable delay string
 */
export function formatFollowUpDelay(delayMs: number): string {
  const hours = delayMs / (60 * 60 * 1000);
  
  if (hours < 24) {
    return `${hours} hora${hours !== 1 ? 's' : ''}`;
  }
  
  const days = hours / 24;
  return `${days} dia${days !== 1 ? 's' : ''}`;
}

/**
 * Creates an updated conversation state after a follow-up is sent
 * 
 * @param conversation - Current conversation state
 * @returns Updated conversation with incremented follow-up count
 */
export function updateConversationAfterFollowUp(
  conversation: PalmasLakeConversation
): Partial<PalmasLakeConversation> {
  return {
    follow_up_attempts: conversation.follow_up_attempts + 1,
    last_follow_up_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}
