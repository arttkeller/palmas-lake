/**
 * Property-Based Tests for Lead Service
 * **Feature: palmas-lake-agent-maria, Property 8: Atualização de Status no CRM**
 * **Validates: Requirements 12.2**
 * 
 * **Feature: palmas-lake-agent-maria, Property 9: Notificação de Lead Quente**
 * **Validates: Requirements 12.5**
 * 
 * Tests that when a lead completes qualification, their status is updated to "Qualificado"
 * Tests that when a lead is identified as HOT, notifications are sent via WhatsApp and email
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { 
  PalmasLakeLead, 
  LeadStatus, 
  LeadSource, 
  QualificationState,
  QualificationStep,
  InterestType,
  Timeline,
} from '@/types/maria-agent';
import {
  updateLeadStatusOnQualification,
  isQualificationComplete,
  createLead,
} from '../lead-service';
import {
  shouldNotifyHotLead,
  generateHotLeadMessage,
  generateHotLeadEmailHtml,
  NOTIFICATION_CONFIG,
  type HotLeadNotificationData,
} from '../notification-service';

// ============================================
// Arbitraries (Generators)
// ============================================

const leadStatusArb: fc.Arbitrary<LeadStatus> = fc.constantFrom(
  'novo_lead',
  'qualificado',
  'visita_agendada',
  'visita_realizada',
  'proposta_enviada',
  'transferido'
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

const qualificationStateArb: fc.Arbitrary<QualificationState> = fc.record({
  step: qualificationStepArb,
  name: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  interestType: fc.option(interestTypeArb, { nil: undefined }),
  objective: fc.option(fc.constantFrom('morar', 'investir') as fc.Arbitrary<'morar' | 'investir'>, { nil: undefined }),
  timeline: fc.option(timelineArb, { nil: undefined }),
  knowsRegion: fc.option(fc.boolean(), { nil: undefined }),
  isFromPalmas: fc.option(fc.boolean(), { nil: undefined }),
  phone: fc.option(fc.string({ minLength: 10, maxLength: 15 }), { nil: undefined }),
  email: fc.option(fc.emailAddress(), { nil: undefined }),
});

const completeQualificationStateArb: fc.Arbitrary<QualificationState> = fc.record({
  step: fc.constant('complete' as QualificationStep),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  interestType: interestTypeArb,
  objective: fc.constantFrom('morar', 'investir') as fc.Arbitrary<'morar' | 'investir'>,
  timeline: timelineArb,
  knowsRegion: fc.boolean(),
  isFromPalmas: fc.boolean(),
  phone: fc.string({ minLength: 10, maxLength: 15 }),
  email: fc.option(fc.emailAddress(), { nil: undefined }),
});

// Helper to generate valid ISO date strings
const isoDateStringArb = fc.integer({ min: 1577836800000, max: 1924905600000 }) // 2020-01-01 to 2030-12-31
  .map(timestamp => new Date(timestamp).toISOString());

const palmasLakeLeadArb: fc.Arbitrary<PalmasLakeLead> = fc.record({
  id: fc.uuid(),
  full_name: fc.string({ minLength: 1, maxLength: 50 }),
  phone: fc.string({ minLength: 10, maxLength: 15 }),
  email: fc.option(fc.emailAddress(), { nil: undefined }),
  status: leadStatusArb,
  classification_type: fc.option(
    fc.constantFrom('cliente_final', 'corretor', 'investidor') as fc.Arbitrary<'cliente_final' | 'corretor' | 'investidor'>,
    { nil: undefined }
  ),
  classification_confidence: fc.option(fc.float({ min: 0, max: 1 }), { nil: undefined }),
  source: fc.option(leadSourceArb, { nil: undefined }),
  qualification_state: fc.option(qualificationStateArb, { nil: undefined }),
  is_hot: fc.boolean(),
  tags: fc.array(fc.string(), { maxLength: 10 }),
  created_at: isoDateStringArb,
  updated_at: isoDateStringArb,
  last_interaction_at: fc.option(isoDateStringArb, { nil: undefined }),
});

// Generator for a new lead (status = 'novo_lead')
const newLeadArb: fc.Arbitrary<PalmasLakeLead> = palmasLakeLeadArb.map(lead => ({
  ...lead,
  status: 'novo_lead' as LeadStatus,
}));

// ============================================
// Property Tests
// ============================================

describe('Lead Service - Property Tests', () => {
  /**
   * **Feature: palmas-lake-agent-maria, Property 8: Atualização de Status no CRM**
   * **Validates: Requirements 12.2**
   * 
   * *For any* lead that completes qualification, the status in CRM must be updated to "Qualificado"
   */
  describe('Property 8: Atualização de Status no CRM', () => {
    it('should update status to "qualificado" when a new lead completes qualification', () => {
      fc.assert(
        fc.property(
          newLeadArb,
          completeQualificationStateArb,
          (lead, completeState) => {
            // Act: Update lead with complete qualification
            const updatedLead = updateLeadStatusOnQualification(lead, completeState);
            
            // Assert: Status should be 'qualificado'
            expect(updatedLead.status).toBe('qualificado');
            expect(updatedLead.qualification_state).toEqual(completeState);
          }
        ),
        { numRuns: 100, verbose: true }
      );
    });

    it('should not change status if qualification is not complete', () => {
      // Generate incomplete qualification states (step !== 'complete')
      const incompleteStateArb = qualificationStateArb.filter(
        state => state.step !== 'complete'
      );

      fc.assert(
        fc.property(
          newLeadArb,
          incompleteStateArb,
          (lead, incompleteState) => {
            // Act: Update lead with incomplete qualification
            const updatedLead = updateLeadStatusOnQualification(lead, incompleteState);
            
            // Assert: Status should remain 'novo_lead'
            expect(updatedLead.status).toBe('novo_lead');
          }
        ),
        { numRuns: 100, verbose: true }
      );
    });

    it('should preserve other lead properties when updating status', () => {
      fc.assert(
        fc.property(
          newLeadArb,
          completeQualificationStateArb,
          (lead, completeState) => {
            // Act
            const updatedLead = updateLeadStatusOnQualification(lead, completeState);
            
            // Assert: All other properties should be preserved
            expect(updatedLead.id).toBe(lead.id);
            expect(updatedLead.phone).toBe(lead.phone);
            expect(updatedLead.full_name).toBe(lead.full_name);
            expect(updatedLead.email).toBe(lead.email);
            expect(updatedLead.source).toBe(lead.source);
            expect(updatedLead.is_hot).toBe(lead.is_hot);
            expect(updatedLead.tags).toEqual(lead.tags);
            expect(updatedLead.created_at).toBe(lead.created_at);
          }
        ),
        { numRuns: 100, verbose: true }
      );
    });
  });

  describe('isQualificationComplete', () => {
    it('should return true only when step is "complete"', () => {
      fc.assert(
        fc.property(qualificationStateArb, (state) => {
          const result = isQualificationComplete(state);
          expect(result).toBe(state.step === 'complete');
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('createLead', () => {
    it('should create a lead with status "novo_lead"', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 10, maxLength: 15 }),
          leadSourceArb,
          fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
          (phone, source, name) => {
            const lead = createLead(phone, source, name);
            
            expect(lead.status).toBe('novo_lead');
            expect(lead.phone).toBe(phone);
            expect(lead.source).toBe(source);
            expect(lead.is_hot).toBe(false);
            expect(lead.tags).toEqual([]);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: palmas-lake-agent-maria, Property 9: Notificação de Lead Quente**
   * **Validates: Requirements 12.5**
   * 
   * *For any* lead identified as HOT, a notification must be sent to the team via WhatsApp and email
   */
  describe('Property 9: Notificação de Lead Quente', () => {
    // Generator for hot lead notification data
    const hotLeadNotificationDataArb: fc.Arbitrary<HotLeadNotificationData> = fc.record({
      leadId: fc.uuid(),
      leadName: fc.string({ minLength: 1, maxLength: 50 }),
      leadPhone: fc.string({ minLength: 10, maxLength: 15 }),
      source: fc.option(leadSourceArb.map(s => s as string), { nil: undefined }),
      classification: fc.option(
        fc.constantFrom('cliente_final', 'corretor', 'investidor'),
        { nil: undefined }
      ),
      interestType: fc.option(interestTypeArb.map(i => i as string), { nil: undefined }),
      objective: fc.option(fc.constantFrom('morar', 'investir'), { nil: undefined }),
      timeline: fc.option(timelineArb.map(t => t as string), { nil: undefined }),
    });

    // Generator for hot leads (is_hot = true)
    const hotLeadArb: fc.Arbitrary<PalmasLakeLead> = palmasLakeLeadArb.map(lead => ({
      ...lead,
      is_hot: true,
    }));

    // Generator for non-hot leads (is_hot = false)
    const nonHotLeadArb: fc.Arbitrary<PalmasLakeLead> = palmasLakeLeadArb.map(lead => ({
      ...lead,
      is_hot: false,
    }));

    it('should identify hot leads for notification (shouldNotifyHotLead returns true for is_hot=true)', () => {
      fc.assert(
        fc.property(hotLeadArb, (lead) => {
          // Act: Check if lead should trigger notification
          const shouldNotify = shouldNotifyHotLead(lead);
          
          // Assert: Hot leads should always trigger notification
          expect(shouldNotify).toBe(true);
        }),
        { numRuns: 100, verbose: true }
      );
    });

    it('should NOT identify non-hot leads for notification (shouldNotifyHotLead returns false for is_hot=false)', () => {
      fc.assert(
        fc.property(nonHotLeadArb, (lead) => {
          // Act: Check if lead should trigger notification
          const shouldNotify = shouldNotifyHotLead(lead);
          
          // Assert: Non-hot leads should NOT trigger notification
          expect(shouldNotify).toBe(false);
        }),
        { numRuns: 100, verbose: true }
      );
    });

    it('should generate WhatsApp message containing lead name and phone for any hot lead', () => {
      fc.assert(
        fc.property(hotLeadNotificationDataArb, (data) => {
          // Act: Generate notification message
          const message = generateHotLeadMessage(data);
          
          // Assert: Message should contain lead name and phone
          expect(message).toContain(data.leadName);
          expect(message).toContain(data.leadPhone);
          // Should contain hot lead indicator
          expect(message).toContain('LEAD QUENTE');
        }),
        { numRuns: 100, verbose: true }
      );
    });

    it('should generate email HTML containing lead name and phone for any hot lead', () => {
      fc.assert(
        fc.property(hotLeadNotificationDataArb, (data) => {
          // Act: Generate email HTML
          const html = generateHotLeadEmailHtml(data);
          
          // Assert: HTML should contain lead name and phone
          expect(html).toContain(data.leadName);
          expect(html).toContain(data.leadPhone);
          // Should contain hot lead indicator
          expect(html).toContain('Lead Quente');
        }),
        { numRuns: 100, verbose: true }
      );
    });

    it('should have correct notification targets configured (WhatsApp and Email)', () => {
      // Assert: Notification config should have correct targets per Requirements 12.5
      expect(NOTIFICATION_CONFIG.whatsapp).toBe('27998724593');
      expect(NOTIFICATION_CONFIG.email).toBe('arthur_keller11@hotmail.com');
    });

    it('should include optional fields in message when provided', () => {
      // Generator for notification data with all optional fields
      const fullNotificationDataArb = fc.record({
        leadId: fc.uuid(),
        leadName: fc.string({ minLength: 1, maxLength: 50 }),
        leadPhone: fc.string({ minLength: 10, maxLength: 15 }),
        source: leadSourceArb.map(s => s as string),
        classification: fc.constantFrom('cliente_final', 'corretor', 'investidor'),
        interestType: interestTypeArb.map(i => i as string),
        objective: fc.constantFrom('morar', 'investir'),
        timeline: timelineArb.map(t => t as string),
      });

      fc.assert(
        fc.property(fullNotificationDataArb, (data) => {
          // Act: Generate notification message
          const message = generateHotLeadMessage(data);
          
          // Assert: Message should contain all provided fields
          expect(message).toContain(data.source);
          expect(message).toContain(data.classification);
          expect(message).toContain(data.interestType);
          expect(message).toContain(data.objective);
          expect(message).toContain(data.timeline);
        }),
        { numRuns: 100, verbose: true }
      );
    });
  });
});
