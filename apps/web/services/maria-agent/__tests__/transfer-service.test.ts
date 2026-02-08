/**
 * Property-Based Tests for Transfer Service
 * **Feature: palmas-lake-agent-maria**
 * 
 * Tests for transfer decision criteria
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type {
  QualificationState,
  InterestType,
  Timeline,
  LeadStatus,
  LeadSource,
  LeadClassification,
  PalmasLakeLead,
} from '@/types/maria-agent';
import {
  shouldTransfer,
  detectNegotiationKeywords,
  detectClosingKeywords,
  detectUrgentVisitKeywords,
  NEGOTIATION_KEYWORDS,
  CLOSING_KEYWORDS,
  URGENT_VISIT_KEYWORDS,
  type TransferContext,
} from '../transfer-service';
import { normalizeText } from '../classification-service';

// ============================================
// Arbitraries (Generators)
// ============================================

// Generator for negotiation keywords
const negotiationKeywordArb = fc.constantFrom(...NEGOTIATION_KEYWORDS);

// Generator for closing keywords
const closingKeywordArb = fc.constantFrom(...CLOSING_KEYWORDS);

// Generator for urgent visit keywords
const urgentVisitKeywordArb = fc.constantFrom(...URGENT_VISIT_KEYWORDS);

// Generator for text containing a negotiation keyword
const textWithNegotiationKeywordArb = fc.tuple(
  fc.string({ minLength: 0, maxLength: 30 }),
  negotiationKeywordArb,
  fc.string({ minLength: 0, maxLength: 30 })
).map(([prefix, keyword, suffix]) => `${prefix} ${keyword} ${suffix}`);

// Generator for text containing a closing keyword
const textWithClosingKeywordArb = fc.tuple(
  fc.string({ minLength: 0, maxLength: 30 }),
  closingKeywordArb,
  fc.string({ minLength: 0, maxLength: 30 })
).map(([prefix, keyword, suffix]) => `${prefix} ${keyword} ${suffix}`);

// Generator for text containing an urgent visit keyword
const textWithUrgentVisitKeywordArb = fc.tuple(
  fc.string({ minLength: 0, maxLength: 30 }),
  urgentVisitKeywordArb,
  fc.string({ minLength: 0, maxLength: 30 })
).map(([prefix, keyword, suffix]) => `${prefix} ${keyword} ${suffix}`);


// Generator for neutral text (no transfer keywords)
const neutralTextArb = fc.string({ minLength: 1, maxLength: 100 })
  .filter(text => {
    const normalized = normalizeText(text);
    const hasNegotiation = NEGOTIATION_KEYWORDS.some(kw => normalized.includes(normalizeText(kw)));
    const hasClosing = CLOSING_KEYWORDS.some(kw => normalized.includes(normalizeText(kw)));
    const hasUrgent = URGENT_VISIT_KEYWORDS.some(kw => normalized.includes(normalizeText(kw)));
    return !hasNegotiation && !hasClosing && !hasUrgent;
  });

// Generator for interest type
const interestTypeArb: fc.Arbitrary<InterestType> = fc.constantFrom(
  'apartamento',
  'sala_comercial',
  'office',
  'flat'
);

// Generator for timeline
const timelineArb: fc.Arbitrary<Timeline> = fc.constantFrom(
  'imediato',
  'curto_prazo',
  'medio_prazo',
  'longo_prazo'
);

// Generator for short timeline (HOT criteria)
const shortTimelineArb: fc.Arbitrary<Timeline> = fc.constantFrom(
  'imediato',
  'curto_prazo'
);

// Generator for long timeline (non-HOT)
const longTimelineArb: fc.Arbitrary<Timeline> = fc.constantFrom(
  'medio_prazo',
  'longo_prazo'
);

// Generator for qualification state
const qualificationStateArb: fc.Arbitrary<QualificationState> = fc.record({
  step: fc.constantFrom(
    'name',
    'interest_type',
    'objective',
    'timeline',
    'region_knowledge',
    'contact_info',
    'complete'
  ),
  name: fc.option(fc.string({ minLength: 2, maxLength: 50 }), { nil: undefined }),
  interestType: fc.option(interestTypeArb, { nil: undefined }),
  objective: fc.option(fc.constantFrom<'morar' | 'investir'>('morar', 'investir'), { nil: undefined }),
  timeline: fc.option(timelineArb, { nil: undefined }),
  knowsRegion: fc.option(fc.boolean(), { nil: undefined }),
  isFromPalmas: fc.option(fc.boolean(), { nil: undefined }),
  phone: fc.option(fc.string({ minLength: 10, maxLength: 11 }), { nil: undefined }),
  email: fc.option(fc.emailAddress(), { nil: undefined }),
});

// Generator for HOT qualification state (short timeline + objective)
const hotQualificationStateArb: fc.Arbitrary<QualificationState> = fc.record({
  step: fc.constant('complete' as const),
  name: fc.option(fc.string({ minLength: 2, maxLength: 50 }), { nil: undefined }),
  interestType: fc.option(interestTypeArb, { nil: undefined }),
  objective: fc.constantFrom<'morar' | 'investir'>('morar', 'investir'),
  timeline: shortTimelineArb,
  knowsRegion: fc.option(fc.boolean(), { nil: undefined }),
  isFromPalmas: fc.option(fc.boolean(), { nil: undefined }),
  phone: fc.option(fc.string({ minLength: 10, maxLength: 11 }), { nil: undefined }),
  email: fc.option(fc.emailAddress(), { nil: undefined }),
});

// Generator for lead status
const leadStatusArb: fc.Arbitrary<LeadStatus> = fc.constantFrom(
  'novo_lead',
  'qualificado',
  'visita_agendada',
  'visita_realizada',
  'proposta_enviada',
  'transferido'
);

// Generator for lead source
const leadSourceArb: fc.Arbitrary<LeadSource> = fc.constantFrom(
  'instagram',
  'facebook',
  'site',
  'indicacao',
  'whatsapp'
);


// Generator for valid ISO date strings (simpler approach to avoid invalid dates)
const isoDateStringArb = fc.integer({ min: 1577836800000, max: 1924905600000 }) // 2020-01-01 to 2030-12-31
  .map(timestamp => new Date(timestamp).toISOString());

// Generator for PalmasLakeLead
const palmasLakeLeadArb = (isHot: boolean = false): fc.Arbitrary<PalmasLakeLead> => fc.record({
  id: fc.uuid(),
  full_name: fc.string({ minLength: 2, maxLength: 50 }),
  phone: fc.string({ minLength: 10, maxLength: 11 }),
  email: fc.option(fc.emailAddress(), { nil: undefined }),
  status: leadStatusArb,
  notes: fc.option(fc.string({ minLength: 0, maxLength: 200 }), { nil: undefined }),
  temperature: fc.option(fc.constantFrom<'quente' | 'morno' | 'frio'>('quente', 'morno', 'frio'), { nil: undefined }),
  sentiment_score: fc.option(fc.float({ min: Math.fround(0), max: Math.fround(1) }), { nil: undefined }),
  sentiment_label: fc.option(fc.string(), { nil: undefined }),
  source: fc.option(leadSourceArb, { nil: undefined }),
  classification_type: fc.option(fc.constantFrom<'cliente_final' | 'corretor' | 'investidor'>('cliente_final', 'corretor', 'investidor'), { nil: undefined }),
  classification_confidence: fc.option(fc.float({ min: Math.fround(0), max: Math.fround(1) }), { nil: undefined }),
  qualification_state: fc.option(qualificationStateArb, { nil: undefined }),
  is_hot: fc.constant(isHot),
  tags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 5 }),
  created_at: isoDateStringArb,
  updated_at: isoDateStringArb,
  last_interaction_at: fc.option(isoDateStringArb, { nil: undefined }),
});

// Generator for broker classification
const brokerClassificationArb: fc.Arbitrary<LeadClassification> = fc.record({
  type: fc.constant('corretor' as const),
  confidence: fc.float({ min: Math.fround(0.5), max: Math.fround(1) }),
  indicators: fc.array(fc.string(), { minLength: 1, maxLength: 3 }),
});

// Generator for investor classification
const investorClassificationArb: fc.Arbitrary<LeadClassification> = fc.record({
  type: fc.constant('investidor' as const),
  confidence: fc.float({ min: Math.fround(0.5), max: Math.fround(1) }),
  indicators: fc.array(fc.string(), { minLength: 1, maxLength: 3 }),
});

// Generator for cliente_final classification
const clienteFinalClassificationArb: fc.Arbitrary<LeadClassification> = fc.record({
  type: fc.constant('cliente_final' as const),
  confidence: fc.float({ min: Math.fround(0.3), max: Math.fround(0.7) }),
  indicators: fc.constant([]),
});

// ============================================
// Property Tests - Transfer Criteria
// ============================================

describe('Transfer Service - Property Tests', () => {
  /**
   * **Feature: palmas-lake-agent-maria, Property 5: Critérios de Transferência**
   * **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**
   * 
   * *For any* context where lead is HOT (orçamento adequado + prazo curto) OR 
   * solicita negociação OR solicita fechamento OR solicita visita urgente,
   * the system must decide for transfer
   */
  describe('Property 5: Critérios de Transferência', () => {
    
    // ============================================
    // Requirement 7.2: Closing Request Transfer
    // ============================================
    
    it('should transfer when message contains closing keywords (Req 7.2)', () => {
      fc.assert(
        fc.property(
          palmasLakeLeadArb(false),
          qualificationStateArb,
          textWithClosingKeywordArb,
          (lead, qualState, message) => {
            const context: TransferContext = {
              lead,
              qualificationState: qualState,
              lastMessage: message,
            };
            
            const decision = shouldTransfer(context);
            
            expect(decision.shouldTransfer).toBe(true);
            expect(decision.reason).toBe('closing_request');
            expect(decision.priority).toBe('urgent');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should detect closing keywords in any position within the message', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 30 }),
          closingKeywordArb,
          fc.string({ minLength: 0, maxLength: 30 }),
          (prefix, keyword, suffix) => {
            const text = `${prefix}${keyword}${suffix}`;
            const detected = detectClosingKeywords(text);
            
            expect(detected.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });


    // ============================================
    // Requirement 7.3: Negotiation Request Transfer
    // ============================================
    
    it('should transfer when message contains negotiation keywords (Req 7.3)', () => {
      fc.assert(
        fc.property(
          palmasLakeLeadArb(false),
          qualificationStateArb,
          textWithNegotiationKeywordArb,
          (lead, qualState, message) => {
            // Filter out messages that accidentally contain closing keywords (higher priority)
            const hasClosingKeyword = CLOSING_KEYWORDS.some(kw => 
              normalizeText(message).includes(normalizeText(kw))
            );
            
            if (!hasClosingKeyword) {
              const context: TransferContext = {
                lead,
                qualificationState: qualState,
                lastMessage: message,
              };
              
              const decision = shouldTransfer(context);
              
              expect(decision.shouldTransfer).toBe(true);
              expect(decision.reason).toBe('negotiation_request');
              expect(decision.priority).toBe('high');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should detect negotiation keywords in any position within the message', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 30 }),
          negotiationKeywordArb,
          fc.string({ minLength: 0, maxLength: 30 }),
          (prefix, keyword, suffix) => {
            const text = `${prefix}${keyword}${suffix}`;
            const detected = detectNegotiationKeywords(text);
            
            expect(detected.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    // ============================================
    // Requirement 7.4: Urgent Visit Transfer
    // ============================================
    
    it('should transfer when message contains urgent visit keywords (Req 7.4)', () => {
      fc.assert(
        fc.property(
          palmasLakeLeadArb(false),
          qualificationStateArb,
          textWithUrgentVisitKeywordArb,
          (lead, qualState, message) => {
            // Filter out messages that contain higher priority keywords
            const hasClosingKeyword = CLOSING_KEYWORDS.some(kw => 
              normalizeText(message).includes(normalizeText(kw))
            );
            const hasNegotiationKeyword = NEGOTIATION_KEYWORDS.some(kw => 
              normalizeText(message).includes(normalizeText(kw))
            );
            
            if (!hasClosingKeyword && !hasNegotiationKeyword) {
              const context: TransferContext = {
                lead,
                qualificationState: qualState,
                lastMessage: message,
              };
              
              const decision = shouldTransfer(context);
              
              expect(decision.shouldTransfer).toBe(true);
              expect(decision.reason).toBe('urgent_visit');
              expect(decision.priority).toBe('high');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should detect urgent visit keywords in any position within the message', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 30 }),
          urgentVisitKeywordArb,
          fc.string({ minLength: 0, maxLength: 30 }),
          (prefix, keyword, suffix) => {
            const text = `${prefix}${keyword}${suffix}`;
            const detected = detectUrgentVisitKeywords(text);
            
            expect(detected.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });


    // ============================================
    // Requirement 7.5: HOT Lead Transfer
    // ============================================
    
    it('should transfer when lead is marked as HOT (Req 7.5)', () => {
      fc.assert(
        fc.property(
          palmasLakeLeadArb(true), // is_hot = true
          qualificationStateArb,
          neutralTextArb,
          (lead, qualState, message) => {
            const context: TransferContext = {
              lead,
              qualificationState: qualState,
              lastMessage: message,
            };
            
            const decision = shouldTransfer(context);
            
            expect(decision.shouldTransfer).toBe(true);
            expect(decision.reason).toBe('hot_lead');
            expect(decision.priority).toBe('high');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should transfer when qualification state indicates HOT (short timeline + objective) (Req 7.5)', () => {
      fc.assert(
        fc.property(
          palmasLakeLeadArb(false),
          hotQualificationStateArb,
          neutralTextArb,
          (lead, qualState, message) => {
            const context: TransferContext = {
              lead,
              qualificationState: qualState,
              lastMessage: message,
            };
            
            const decision = shouldTransfer(context);
            
            expect(decision.shouldTransfer).toBe(true);
            expect(decision.reason).toBe('hot_lead');
            expect(decision.priority).toBe('high');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should transfer when lead has visited and has interest (Req 7.5)', () => {
      fc.assert(
        fc.property(
          palmasLakeLeadArb(false),
          fc.constantFrom<'morar' | 'investir'>('morar', 'investir'),
          interestTypeArb,
          neutralTextArb,
          (lead, objective, interestType, message) => {
            const qualState: QualificationState = {
              step: 'complete',
              objective,
              interestType,
            };
            
            const context: TransferContext = {
              lead,
              qualificationState: qualState,
              lastMessage: message,
              hasVisited: true,
            };
            
            const decision = shouldTransfer(context);
            
            expect(decision.shouldTransfer).toBe(true);
            expect(decision.reason).toBe('hot_lead');
            expect(decision.priority).toBe('high');
          }
        ),
        { numRuns: 100 }
      );
    });

    // ============================================
    // Requirement 7.1: Unknown Answer Transfer
    // ============================================
    
    it('should transfer when Maria cannot answer (unansweredQuestion = true) (Req 7.1)', () => {
      fc.assert(
        fc.property(
          palmasLakeLeadArb(false),
          qualificationStateArb,
          neutralTextArb,
          (lead, qualState, message) => {
            // Ensure qualification state doesn't trigger HOT
            const nonHotQualState: QualificationState = {
              ...qualState,
              timeline: 'longo_prazo',
              objective: undefined,
            };
            
            const context: TransferContext = {
              lead,
              qualificationState: nonHotQualState,
              lastMessage: message,
              unansweredQuestion: true,
            };
            
            const decision = shouldTransfer(context);
            
            expect(decision.shouldTransfer).toBe(true);
            expect(decision.reason).toBe('unknown_answer');
            expect(decision.priority).toBe('low');
          }
        ),
        { numRuns: 100 }
      );
    });


    // ============================================
    // Broker and Investor Detection Transfer
    // ============================================
    
    it('should transfer when broker is detected', () => {
      fc.assert(
        fc.property(
          palmasLakeLeadArb(false),
          qualificationStateArb,
          neutralTextArb,
          brokerClassificationArb,
          (lead, qualState, message, classification) => {
            // Ensure qualification state doesn't trigger HOT
            const nonHotQualState: QualificationState = {
              ...qualState,
              timeline: 'longo_prazo',
              objective: undefined,
            };
            
            const context: TransferContext = {
              lead,
              qualificationState: nonHotQualState,
              lastMessage: message,
              classification,
            };
            
            const decision = shouldTransfer(context);
            
            expect(decision.shouldTransfer).toBe(true);
            expect(decision.reason).toBe('broker_detected');
            expect(decision.priority).toBe('medium');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should transfer when investor is detected', () => {
      fc.assert(
        fc.property(
          palmasLakeLeadArb(false),
          qualificationStateArb,
          neutralTextArb,
          investorClassificationArb,
          (lead, qualState, message, classification) => {
            // Ensure qualification state doesn't trigger HOT
            const nonHotQualState: QualificationState = {
              ...qualState,
              timeline: 'longo_prazo',
              objective: undefined,
            };
            
            const context: TransferContext = {
              lead,
              qualificationState: nonHotQualState,
              lastMessage: message,
              classification,
            };
            
            const decision = shouldTransfer(context);
            
            expect(decision.shouldTransfer).toBe(true);
            expect(decision.reason).toBe('investor_detected');
            expect(decision.priority).toBe('medium');
          }
        ),
        { numRuns: 100 }
      );
    });

    // ============================================
    // No Transfer Cases
    // ============================================
    
    it('should NOT transfer when no transfer criteria are met', () => {
      fc.assert(
        fc.property(
          palmasLakeLeadArb(false),
          longTimelineArb,
          neutralTextArb,
          clienteFinalClassificationArb,
          (lead, timeline, message, classification) => {
            // Create a non-HOT qualification state
            const qualState: QualificationState = {
              step: 'complete',
              timeline,
              objective: undefined, // No objective = not HOT
            };
            
            const context: TransferContext = {
              lead,
              qualificationState: qualState,
              lastMessage: message,
              classification,
              hasVisited: false,
              unansweredQuestion: false,
            };
            
            const decision = shouldTransfer(context);
            
            expect(decision.shouldTransfer).toBe(false);
            expect(decision.reason).toBeUndefined();
            expect(decision.priority).toBe('low');
          }
        ),
        { numRuns: 100 }
      );
    });

    // ============================================
    // Priority Order Tests
    // ============================================
    
    it('should prioritize closing_request over negotiation_request', () => {
      fc.assert(
        fc.property(
          palmasLakeLeadArb(false),
          qualificationStateArb,
          closingKeywordArb,
          negotiationKeywordArb,
          (lead, qualState, closingKw, negotiationKw) => {
            const message = `${closingKw} e também ${negotiationKw}`;
            
            const context: TransferContext = {
              lead,
              qualificationState: qualState,
              lastMessage: message,
            };
            
            const decision = shouldTransfer(context);
            
            expect(decision.shouldTransfer).toBe(true);
            expect(decision.reason).toBe('closing_request');
            expect(decision.priority).toBe('urgent');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should prioritize negotiation_request over urgent_visit', () => {
      fc.assert(
        fc.property(
          palmasLakeLeadArb(false),
          qualificationStateArb,
          negotiationKeywordArb,
          urgentVisitKeywordArb,
          (lead, qualState, negotiationKw, urgentKw) => {
            const message = `${negotiationKw} e também ${urgentKw}`;
            
            // Filter out if negotiation keyword accidentally contains closing keywords
            const hasClosingKeyword = CLOSING_KEYWORDS.some(kw => 
              normalizeText(message).includes(normalizeText(kw))
            );
            
            if (!hasClosingKeyword) {
              const context: TransferContext = {
                lead,
                qualificationState: qualState,
                lastMessage: message,
              };
              
              const decision = shouldTransfer(context);
              
              expect(decision.shouldTransfer).toBe(true);
              expect(decision.reason).toBe('negotiation_request');
              expect(decision.priority).toBe('high');
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});


// ============================================
// Unit Tests
// ============================================

describe('Transfer Service - Unit Tests', () => {
  describe('detectNegotiationKeywords', () => {
    it('should detect "desconto"', () => {
      expect(detectNegotiationKeywords('Vocês dão desconto?')).toContain('desconto');
    });

    it('should detect "negociar"', () => {
      expect(detectNegotiationKeywords('Quero negociar o valor')).toContain('negociar');
    });

    it('should detect "valor menor"', () => {
      expect(detectNegotiationKeywords('Tem como fazer um valor menor?')).toContain('valor menor');
    });

    it('should be case insensitive', () => {
      expect(detectNegotiationKeywords('DESCONTO')).toContain('desconto');
    });
  });

  describe('detectClosingKeywords', () => {
    it('should detect "fechar negócio"', () => {
      expect(detectClosingKeywords('Quero fechar negócio')).toContain('fechar negócio');
    });

    it('should detect "quero comprar"', () => {
      expect(detectClosingKeywords('Quero comprar essa unidade')).toContain('quero comprar');
    });

    it('should detect "assinar contrato"', () => {
      expect(detectClosingKeywords('Quando posso assinar contrato?')).toContain('assinar contrato');
    });

    it('should detect "reservar"', () => {
      expect(detectClosingKeywords('Quero reservar a unidade')).toContain('reservar');
    });
  });

  describe('detectUrgentVisitKeywords', () => {
    it('should detect "visita urgente"', () => {
      expect(detectUrgentVisitKeywords('Preciso de uma visita urgente')).toContain('visita urgente');
    });

    it('should detect "hoje mesmo"', () => {
      expect(detectUrgentVisitKeywords('Posso ir hoje mesmo?')).toContain('hoje mesmo');
    });

    it('should detect "o mais rápido possível"', () => {
      expect(detectUrgentVisitKeywords('Preciso ver o mais rápido possível')).toContain('o mais rápido possível');
    });
  });

  describe('shouldTransfer', () => {
    const baseLead: PalmasLakeLead = {
      id: 'test-id',
      full_name: 'Test Lead',
      phone: '11999999999',
      status: 'novo_lead',
      is_hot: false,
      tags: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const baseQualState: QualificationState = {
      step: 'complete',
      timeline: 'longo_prazo',
    };

    it('should return shouldTransfer=true for closing request', () => {
      const context: TransferContext = {
        lead: baseLead,
        qualificationState: baseQualState,
        lastMessage: 'Quero fechar negócio agora',
      };

      const decision = shouldTransfer(context);
      
      expect(decision.shouldTransfer).toBe(true);
      expect(decision.reason).toBe('closing_request');
    });

    it('should return shouldTransfer=true for negotiation request', () => {
      const context: TransferContext = {
        lead: baseLead,
        qualificationState: baseQualState,
        lastMessage: 'Vocês dão desconto?',
      };

      const decision = shouldTransfer(context);
      
      expect(decision.shouldTransfer).toBe(true);
      expect(decision.reason).toBe('negotiation_request');
    });

    it('should return shouldTransfer=true for urgent visit', () => {
      const context: TransferContext = {
        lead: baseLead,
        qualificationState: baseQualState,
        lastMessage: 'Preciso de uma visita urgente',
      };

      const decision = shouldTransfer(context);
      
      expect(decision.shouldTransfer).toBe(true);
      expect(decision.reason).toBe('urgent_visit');
    });

    it('should return shouldTransfer=true for HOT lead', () => {
      const hotLead: PalmasLakeLead = { ...baseLead, is_hot: true };
      const context: TransferContext = {
        lead: hotLead,
        qualificationState: baseQualState,
        lastMessage: 'Olá',
      };

      const decision = shouldTransfer(context);
      
      expect(decision.shouldTransfer).toBe(true);
      expect(decision.reason).toBe('hot_lead');
    });

    it('should return shouldTransfer=false when no criteria met', () => {
      const context: TransferContext = {
        lead: baseLead,
        qualificationState: baseQualState,
        lastMessage: 'Olá, gostaria de mais informações',
        classification: { type: 'cliente_final', confidence: 0.5, indicators: [] },
        hasVisited: false,
        unansweredQuestion: false,
      };

      const decision = shouldTransfer(context);
      
      expect(decision.shouldTransfer).toBe(false);
    });
  });
});
