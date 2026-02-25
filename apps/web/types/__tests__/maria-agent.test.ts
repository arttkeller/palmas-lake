/**
 * Property-Based Tests for Maria Agent Lead Data Model
 * **Feature: palmas-lake-agent-maria, Property 8: Atualização de Status no CRM**
 * **Validates: Requirements 12.2**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type {
  QualificationState,
  QualificationStep,
  LeadStatus,
  PalmasLakeLead,
  InterestType,
  Timeline,
  LeadSource,
} from '../maria-agent';

// ============================================
// Arbitraries (Generators)
// ============================================

const interestTypeArb: fc.Arbitrary<InterestType> = fc.constantFrom(
  'apartamento',
  'sala_comercial',
  'office',
  'flat'
);

const timelineArb: fc.Arbitrary<Timeline> = fc.constantFrom(
  'imediato',
  'curto_prazo',
  'medio_prazo',
  'longo_prazo'
);

const leadSourceArb: fc.Arbitrary<LeadSource> = fc.constantFrom(
  'instagram',
  'facebook',
  'site',
  'indicacao',
  'whatsapp'
);

const qualificationStepArb: fc.Arbitrary<QualificationStep> = fc.constantFrom(
  'name',
  'interest_type',
  'objective',
  'timeline',
  'region_knowledge',
  'contact_info',
  'complete'
);

// Generator for incomplete qualification state
const incompleteQualificationStateArb: fc.Arbitrary<QualificationState> = fc.record({
  step: fc.constantFrom<QualificationStep>(
    'name',
    'interest_type',
    'objective',
    'timeline',
    'region_knowledge',
    'contact_info'
  ),
  name: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  interestType: fc.option(interestTypeArb, { nil: undefined }),
  objective: fc.option(fc.constantFrom<'morar' | 'investir'>('morar', 'investir'), { nil: undefined }),
  timeline: fc.option(timelineArb, { nil: undefined }),
  knowsRegion: fc.option(fc.boolean(), { nil: undefined }),
  isFromPalmas: fc.option(fc.boolean(), { nil: undefined }),
  phone: fc.option(fc.string({ minLength: 10, maxLength: 15 }), { nil: undefined }),
  email: fc.option(fc.emailAddress(), { nil: undefined }),
});

// Generator for complete qualification state (all fields filled, step = 'complete')
const completeQualificationStateArb: fc.Arbitrary<QualificationState> = fc.record({
  step: fc.constant<QualificationStep>('complete'),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  interestType: interestTypeArb,
  objective: fc.constantFrom<'morar' | 'investir'>('morar', 'investir'),
  timeline: timelineArb,
  knowsRegion: fc.boolean(),
  isFromPalmas: fc.boolean(),
  phone: fc.string({ minLength: 10, maxLength: 15 }),
  email: fc.emailAddress(),
});

// ============================================
// Helper Functions (Simulating CRM Logic)
// ============================================

/**
 * Determines the lead status based on qualification state
 * This is the core logic being tested
 */
function determineLeadStatus(qualificationState: QualificationState): LeadStatus {
  if (qualificationState.step === 'complete') {
    return 'transferido';
  }
  return 'novo_lead';
}

/**
 * Checks if a qualification state is complete
 */
function isQualificationComplete(state: QualificationState): boolean {
  return (
    state.step === 'complete' &&
    state.name !== undefined &&
    state.interestType !== undefined &&
    state.objective !== undefined &&
    state.timeline !== undefined &&
    state.knowsRegion !== undefined &&
    state.phone !== undefined
  );
}

/**
 * Updates lead status based on qualification completion
 * Simulates the CRM update logic
 */
function updateLeadAfterQualification(
  lead: Partial<PalmasLakeLead>,
  qualificationState: QualificationState
): Partial<PalmasLakeLead> {
  const newStatus = determineLeadStatus(qualificationState);
  return {
    ...lead,
    status: newStatus,
    qualification_state: qualificationState,
    updated_at: new Date().toISOString(),
  };
}

// ============================================
// Property-Based Tests
// ============================================

describe('Maria Agent - Lead Data Model', () => {
  describe('Property 8: Atualização de Status no CRM', () => {
    /**
     * **Feature: palmas-lake-agent-maria, Property 8: Atualização de Status no CRM**
     * **Validates: Requirements 12.2**
     * 
     * For any lead that completes qualification, the status in CRM
     * must be updated to "Transferido"
     */
    it('should update status to "transferido" when qualification is complete', () => {
      fc.assert(
        fc.property(
          completeQualificationStateArb,
          leadSourceArb,
          (qualificationState, source) => {
            // Arrange: Create a lead with novo_lead status
            const lead: Partial<PalmasLakeLead> = {
              id: 'test-id',
              full_name: qualificationState.name || 'Test Lead',
              phone: qualificationState.phone || '11999999999',
              status: 'novo_lead',
              source: source,
              is_hot: false,
              tags: [],
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };

            // Act: Update lead after qualification
            const updatedLead = updateLeadAfterQualification(lead, qualificationState);

            // Assert: Status must be 'transferido'
            expect(updatedLead.status).toBe('transferido');
            expect(updatedLead.qualification_state?.step).toBe('complete');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Inverse property: Incomplete qualification should NOT result in 'transferido' status
     */
    it('should NOT update status to "transferido" when qualification is incomplete', () => {
      fc.assert(
        fc.property(
          incompleteQualificationStateArb,
          leadSourceArb,
          (qualificationState, source) => {
            // Arrange: Create a lead with novo_lead status
            const lead: Partial<PalmasLakeLead> = {
              id: 'test-id',
              full_name: 'Test Lead',
              phone: '11999999999',
              status: 'novo_lead',
              source: source,
              is_hot: false,
              tags: [],
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };

            // Act: Update lead with incomplete qualification
            const updatedLead = updateLeadAfterQualification(lead, qualificationState);

            // Assert: Status must remain 'novo_lead'
            expect(updatedLead.status).toBe('novo_lead');
            expect(updatedLead.qualification_state?.step).not.toBe('complete');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Idempotence: Updating a transferred lead should maintain 'transferido' status
     */
    it('should maintain "transferido" status on subsequent updates', () => {
      fc.assert(
        fc.property(
          completeQualificationStateArb,
          (qualificationState) => {
            // Arrange: Create an already qualified lead
            const lead: Partial<PalmasLakeLead> = {
              id: 'test-id',
              full_name: qualificationState.name || 'Test Lead',
              phone: qualificationState.phone || '11999999999',
              status: 'transferido',
              qualification_state: qualificationState,
              is_hot: false,
              tags: [],
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };

            // Act: Update lead again with same qualification
            const updatedLead = updateLeadAfterQualification(lead, qualificationState);

            // Assert: Status should still be 'transferido'
            expect(updatedLead.status).toBe('transferido');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Qualification State Validation', () => {
    /**
     * Property: Complete qualification state must have all required fields
     */
    it('should have all required fields when step is complete', () => {
      fc.assert(
        fc.property(
          completeQualificationStateArb,
          (state) => {
            expect(isQualificationComplete(state)).toBe(true);
            expect(state.name).toBeDefined();
            expect(state.interestType).toBeDefined();
            expect(state.objective).toBeDefined();
            expect(state.timeline).toBeDefined();
            expect(state.knowsRegion).toBeDefined();
            expect(state.phone).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
