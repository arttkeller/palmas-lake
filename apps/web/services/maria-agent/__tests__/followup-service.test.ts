/**
 * Property-Based Tests for Follow-up Service
 * **Feature: palmas-lake-agent-maria**
 * 
 * Tests for follow-up limit and scheduling logic
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  FOLLOW_UP_CONFIG,
  canSendFollowUp,
  isLastAttempt,
  scheduleFollowUp,
  getFollowUpMessage,
  getRemainingAttempts,
  processFollowUp,
} from '../followup-service';
import type { PalmasLakeLead, PalmasLakeConversation } from '@/types/maria-agent';

// ============================================
// Arbitraries (Generators)
// ============================================

// Generator for valid attempt counts (0 to maxAttempts + some buffer)
const attemptCountArb = fc.integer({ min: 0, max: FOLLOW_UP_CONFIG.maxAttempts + 5 });

// Generator for lead IDs
const leadIdArb = fc.uuid();

// Generator for lead names
const leadNameArb = fc.string({ minLength: 2, maxLength: 50 });

// Generator for dates
const dateArb = fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') });

// Generator for a minimal PalmasLakeLead
const leadArb: fc.Arbitrary<PalmasLakeLead> = fc.record({
  id: leadIdArb,
  phone: fc.string({ minLength: 10, maxLength: 15 }),
  full_name: fc.option(leadNameArb, { nil: undefined }),
  email: fc.option(fc.emailAddress(), { nil: undefined }),
  status: fc.constantFrom('novo_lead', 'qualificado', 'visita_agendada', 'visita_realizada', 'proposta_enviada', 'transferido'),
  classification: fc.constantFrom('cliente_final', 'corretor', 'investidor'),
  source: fc.constantFrom('instagram', 'facebook', 'site', 'indicacao', 'whatsapp'),
  is_hot: fc.boolean(),
  tags: fc.array(fc.string(), { maxLength: 5 }),
  created_at: fc.string(),
  updated_at: fc.string(),
  last_interaction_at: fc.string(),
});

// Generator for a minimal PalmasLakeConversation with follow-up tracking
const conversationArb = (followUpAttempts: number): fc.Arbitrary<PalmasLakeConversation> => fc.record({
  id: leadIdArb,
  lead_id: leadIdArb,
  messages: fc.constant([]),
  state: fc.constant({
    phase: 'qualification' as const,
    qualificationState: { step: 'name' as const },
    transferRequested: false,
  }),
  follow_up_attempts: fc.constant(followUpAttempts),
  last_follow_up_at: fc.option(fc.string(), { nil: undefined }),
  created_at: fc.string(),
  updated_at: fc.string(),
});

// ============================================
// Property Tests - Follow-up Limit
// ============================================

describe('Follow-up Service - Property Tests', () => {
  /**
   * **Feature: palmas-lake-agent-maria, Property 6: Limite de Follow-up**
   * **Validates: Requirements 8.2**
   * 
   * *For any* sequence of follow-ups for a lead, the maximum number of attempts must be 3
   */
  describe('Property 6: Limite de Follow-up', () => {
    it('should allow follow-ups only when attempts are below maxAttempts (3)', () => {
      fc.assert(
        fc.property(attemptCountArb, (currentAttempts) => {
          const canSend = canSendFollowUp(currentAttempts);
          
          if (currentAttempts < FOLLOW_UP_CONFIG.maxAttempts) {
            expect(canSend).toBe(true);
          } else {
            expect(canSend).toBe(false);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('should never schedule more than 3 follow-up attempts', () => {
      fc.assert(
        fc.property(leadIdArb, attemptCountArb, dateArb, (leadId, currentAttempts, fromDate) => {
          const schedule = scheduleFollowUp(leadId, currentAttempts, fromDate);
          
          if (currentAttempts >= FOLLOW_UP_CONFIG.maxAttempts) {
            // Should not schedule if already at or above max
            expect(schedule).toBeNull();
          } else {
            // Should schedule with attempt number <= maxAttempts
            expect(schedule).not.toBeNull();
            expect(schedule!.attempt).toBeLessThanOrEqual(FOLLOW_UP_CONFIG.maxAttempts);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('should mark isLastAttempt=true only at attempt 3', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 10 }), (attempt) => {
          const isLast = isLastAttempt(attempt);
          
          if (attempt >= FOLLOW_UP_CONFIG.maxAttempts) {
            expect(isLast).toBe(true);
          } else {
            expect(isLast).toBe(false);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('should return remaining attempts correctly bounded by maxAttempts', () => {
      fc.assert(
        fc.property(attemptCountArb, (currentAttempts) => {
          const remaining = getRemainingAttempts(currentAttempts);
          
          // Remaining should never be negative
          expect(remaining).toBeGreaterThanOrEqual(0);
          
          // Remaining should never exceed maxAttempts
          expect(remaining).toBeLessThanOrEqual(FOLLOW_UP_CONFIG.maxAttempts);
          
          // Remaining should be maxAttempts - currentAttempts (clamped to 0)
          const expected = Math.max(0, FOLLOW_UP_CONFIG.maxAttempts - currentAttempts);
          expect(remaining).toBe(expected);
        }),
        { numRuns: 100 }
      );
    });

    it('should not send follow-up when processFollowUp is called at maxAttempts', () => {
      fc.assert(
        fc.property(
          leadArb,
          fc.integer({ min: FOLLOW_UP_CONFIG.maxAttempts, max: FOLLOW_UP_CONFIG.maxAttempts + 5 }),
          (lead, attempts) => {
            // Create conversation at or above max attempts
            const conversation: PalmasLakeConversation = {
              id: 'test-conv-id',
              lead_id: lead.id,
              messages: [],
              state: {
                phase: 'follow_up',
                qualificationState: { step: 'name' },
                transferRequested: false,
              },
              follow_up_attempts: attempts,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            
            const result = processFollowUp(lead, conversation);
            
            // Should not send when at or above max attempts
            expect(result.sent).toBe(false);
            expect(result.isLastAttempt).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should send follow-up when processFollowUp is called below maxAttempts', () => {
      fc.assert(
        fc.property(
          leadArb,
          fc.integer({ min: 0, max: FOLLOW_UP_CONFIG.maxAttempts - 1 }),
          (lead, attempts) => {
            const conversation: PalmasLakeConversation = {
              id: 'test-conv-id',
              lead_id: lead.id,
              messages: [],
              state: {
                phase: 'follow_up',
                qualificationState: { step: 'name' },
                transferRequested: false,
              },
              follow_up_attempts: attempts,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            
            const result = processFollowUp(lead, conversation);
            
            // Should send when below max attempts
            expect(result.sent).toBe(true);
            expect(result.attempt).toBe(attempts + 1);
            expect(result.attempt).toBeLessThanOrEqual(FOLLOW_UP_CONFIG.maxAttempts);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should use final message template only at attempt 3', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 5 }),
          leadNameArb,
          (attempt, name) => {
            const message = getFollowUpMessage(attempt, name);
            
            if (attempt >= FOLLOW_UP_CONFIG.maxAttempts) {
              // Final message should contain "vou deixar registrado"
              expect(message).toContain('vou deixar registrado');
            } else {
              // Non-final message should contain "ainda está interessado"
              expect(message).toContain('ainda está interessado');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should ensure maxAttempts constant equals 3', () => {
      // This is a sanity check to ensure the config matches requirements
      expect(FOLLOW_UP_CONFIG.maxAttempts).toBe(3);
    });
  });
});

// ============================================
// Unit Tests
// ============================================

describe('Follow-up Service - Unit Tests', () => {
  describe('canSendFollowUp', () => {
    it('should return true for 0 attempts', () => {
      expect(canSendFollowUp(0)).toBe(true);
    });

    it('should return true for 1 attempt', () => {
      expect(canSendFollowUp(1)).toBe(true);
    });

    it('should return true for 2 attempts', () => {
      expect(canSendFollowUp(2)).toBe(true);
    });

    it('should return false for 3 attempts', () => {
      expect(canSendFollowUp(3)).toBe(false);
    });

    it('should return false for more than 3 attempts', () => {
      expect(canSendFollowUp(4)).toBe(false);
      expect(canSendFollowUp(10)).toBe(false);
    });
  });

  describe('getFollowUpMessage', () => {
    it('should include lead name in message', () => {
      const message = getFollowUpMessage(1, 'João');
      expect(message).toContain('João');
    });

    it('should use "Olá" when name is not provided', () => {
      const message = getFollowUpMessage(1);
      expect(message).toContain('Olá');
    });

    it('should return interest message for attempts 1 and 2', () => {
      expect(getFollowUpMessage(1, 'Maria')).toContain('ainda está interessado');
      expect(getFollowUpMessage(2, 'Maria')).toContain('ainda está interessado');
    });

    it('should return final message for attempt 3', () => {
      const message = getFollowUpMessage(3, 'Pedro');
      expect(message).toContain('vou deixar registrado');
      expect(message).toContain('Pedro');
    });
  });

  describe('scheduleFollowUp', () => {
    it('should return schedule for 0 attempts', () => {
      const schedule = scheduleFollowUp('lead-123', 0);
      expect(schedule).not.toBeNull();
      expect(schedule!.attempt).toBe(1);
    });

    it('should return null for 3 or more attempts', () => {
      expect(scheduleFollowUp('lead-123', 3)).toBeNull();
      expect(scheduleFollowUp('lead-123', 4)).toBeNull();
    });
  });
});
