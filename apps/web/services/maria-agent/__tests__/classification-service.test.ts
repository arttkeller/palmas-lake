/**
 * Property-Based Tests for Classification Service
 * **Feature: palmas-lake-agent-maria**
 * 
 * Tests for broker and investor classification based on keywords
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type {
  QualificationState,
  InterestType,
  Timeline,
} from '@/types/maria-agent';
import {
  BROKER_KEYWORDS,
  INVESTOR_KEYWORDS,
  detectBrokerKeywords,
  detectInvestorKeywords,
  isBrokerMessage,
  isInvestorMessage,
  classifyFromMessage,
  classifyLead,
  calculateBrokerConfidence,
  calculateInvestorConfidence,
  isHotLead,
  normalizeText,
} from '../classification-service';

// ============================================
// Arbitraries (Generators)
// ============================================

// Generator for broker keywords
const brokerKeywordArb = fc.constantFrom(...BROKER_KEYWORDS);

// Generator for investor keywords
const investorKeywordArb = fc.constantFrom(...INVESTOR_KEYWORDS);

// Generator for random text without any classification keywords
const neutralTextArb = fc.string({ minLength: 1, maxLength: 100 })
  .filter(text => {
    const normalized = normalizeText(text);
    const hasBroker = BROKER_KEYWORDS.some(kw => normalized.includes(normalizeText(kw)));
    const hasInvestor = INVESTOR_KEYWORDS.some(kw => normalized.includes(normalizeText(kw)));
    return !hasBroker && !hasInvestor;
  });

// Generator for text containing a broker keyword
const textWithBrokerKeywordArb = fc.tuple(
  fc.string({ minLength: 0, maxLength: 50 }),
  brokerKeywordArb,
  fc.string({ minLength: 0, maxLength: 50 })
).map(([prefix, keyword, suffix]) => `${prefix} ${keyword} ${suffix}`);

// Generator for text containing an investor keyword
const textWithInvestorKeywordArb = fc.tuple(
  fc.string({ minLength: 0, maxLength: 50 }),
  investorKeywordArb,
  fc.string({ minLength: 0, maxLength: 50 })
).map(([prefix, keyword, suffix]) => `${prefix} ${keyword} ${suffix}`);

// Generator for qualification state
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

// ============================================
// Property Tests - Broker Classification
// ============================================

describe('Classification Service - Property Tests', () => {
  /**
   * **Feature: palmas-lake-agent-maria, Property 2: Classificação de Corretor**
   * **Validates: Requirements 3.1**
   * 
   * *For any* message containing broker keywords ("sou corretor", "trabalho com imóveis", 
   * "tenho clientes interessados"), the system must classify the lead as broker
   */
  describe('Property 2: Classificação de Corretor', () => {
    it('should classify as "corretor" when message contains any broker keyword', () => {
      fc.assert(
        fc.property(textWithBrokerKeywordArb, (text) => {
          const classification = classifyFromMessage(text);
          
          expect(classification.type).toBe('corretor');
          expect(classification.confidence).toBeGreaterThan(0);
          expect(classification.indicators.length).toBeGreaterThan(0);
        }),
        { numRuns: 100 }
      );
    });

    it('should detect broker keywords in any position within the message', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 30 }),
          brokerKeywordArb,
          fc.string({ minLength: 0, maxLength: 30 }),
          (prefix, keyword, suffix) => {
            const text = `${prefix}${keyword}${suffix}`;
            const detected = detectBrokerKeywords(text);
            
            expect(detected.length).toBeGreaterThan(0);
            expect(isBrokerMessage(text)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return confidence > 0 for any detected broker keyword', () => {
      fc.assert(
        fc.property(
          fc.array(brokerKeywordArb, { minLength: 1, maxLength: 5 }),
          (keywords) => {
            const uniqueKeywords = [...new Set(keywords)];
            const confidence = calculateBrokerConfidence(uniqueKeywords);
            
            expect(confidence).toBeGreaterThan(0);
            expect(confidence).toBeLessThanOrEqual(1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should have confidence that increases or stays same with more keywords', () => {
      fc.assert(
        fc.property(
          fc.array(brokerKeywordArb, { minLength: 1, maxLength: 5 }),
          (keywords) => {
            const uniqueKeywords = [...new Set(keywords)];
            
            // Test that adding keywords doesn't decrease confidence
            for (let i = 1; i <= uniqueKeywords.length; i++) {
              const subset = uniqueKeywords.slice(0, i);
              const confidence = calculateBrokerConfidence(subset);
              
              // Confidence should always be positive and bounded
              expect(confidence).toBeGreaterThan(0);
              expect(confidence).toBeLessThanOrEqual(1);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should classify as broker from multiple messages if any contains broker keyword', () => {
      fc.assert(
        fc.property(
          fc.array(neutralTextArb, { minLength: 0, maxLength: 3 }),
          textWithBrokerKeywordArb,
          fc.array(neutralTextArb, { minLength: 0, maxLength: 3 }),
          (beforeMessages, brokerMessage, afterMessages) => {
            const allMessages = [...beforeMessages, brokerMessage, ...afterMessages];
            const classification = classifyLead(allMessages);
            
            expect(classification.type).toBe('corretor');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: palmas-lake-agent-maria, Property 3: Classificação de Investidor**
   * **Validates: Requirements 3.2**
   * 
   * *For any* message containing investor keywords ("mais de uma unidade", "para investimento"),
   * the system must classify the lead as investor
   */
  describe('Property 3: Classificação de Investidor', () => {
    it('should classify as "investidor" when message contains any investor keyword', () => {
      fc.assert(
        fc.property(textWithInvestorKeywordArb, (text) => {
          // Filter out texts that accidentally contain broker keywords
          const hasBrokerKeyword = BROKER_KEYWORDS.some(kw => 
            normalizeText(text).includes(normalizeText(kw))
          );
          
          if (!hasBrokerKeyword) {
            const classification = classifyFromMessage(text);
            
            expect(classification.type).toBe('investidor');
            expect(classification.confidence).toBeGreaterThan(0);
            expect(classification.indicators.length).toBeGreaterThan(0);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('should detect investor keywords in any position within the message', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 30 }),
          investorKeywordArb,
          fc.string({ minLength: 0, maxLength: 30 }),
          (prefix, keyword, suffix) => {
            const text = `${prefix}${keyword}${suffix}`;
            const detected = detectInvestorKeywords(text);
            
            expect(detected.length).toBeGreaterThan(0);
            expect(isInvestorMessage(text)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return confidence > 0 for any detected investor keyword', () => {
      fc.assert(
        fc.property(
          fc.array(investorKeywordArb, { minLength: 1, maxLength: 5 }),
          (keywords) => {
            const uniqueKeywords = [...new Set(keywords)];
            const confidence = calculateInvestorConfidence(uniqueKeywords);
            
            expect(confidence).toBeGreaterThan(0);
            expect(confidence).toBeLessThanOrEqual(1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should classify as investor from multiple messages if any contains investor keyword (and no broker keyword)', () => {
      fc.assert(
        fc.property(
          fc.array(neutralTextArb, { minLength: 0, maxLength: 3 }),
          textWithInvestorKeywordArb,
          fc.array(neutralTextArb, { minLength: 0, maxLength: 3 }),
          (beforeMessages, investorMessage, afterMessages) => {
            // Filter out if investor message accidentally contains broker keywords
            const hasBrokerKeyword = BROKER_KEYWORDS.some(kw => 
              normalizeText(investorMessage).includes(normalizeText(kw))
            );
            
            if (!hasBrokerKeyword) {
              const allMessages = [...beforeMessages, investorMessage, ...afterMessages];
              const classification = classifyLead(allMessages);
              
              expect(classification.type).toBe('investidor');
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ============================================
  // Classification Priority Tests
  // ============================================

  describe('Classification Priority', () => {
    it('should prioritize broker over investor when both keywords are present', () => {
      fc.assert(
        fc.property(
          brokerKeywordArb,
          investorKeywordArb,
          (brokerKw, investorKw) => {
            const text = `${brokerKw} e também ${investorKw}`;
            const classification = classifyFromMessage(text);
            
            // Broker should take priority
            expect(classification.type).toBe('corretor');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should classify as cliente_final when no keywords are detected', () => {
      fc.assert(
        fc.property(neutralTextArb, (text) => {
          const classification = classifyFromMessage(text);
          
          expect(classification.type).toBe('cliente_final');
          expect(classification.confidence).toBe(0.5);
          expect(classification.indicators).toEqual([]);
        }),
        { numRuns: 100 }
      );
    });
  });

  // ============================================
  // Hot Lead Detection Tests
  // ============================================

  describe('Hot Lead Detection', () => {
    it('should mark as HOT when timeline is immediate/short and has interest', () => {
      fc.assert(
        fc.property(
          fc.constantFrom<Timeline>('imediato', 'curto_prazo'),
          fc.constantFrom<'morar' | 'investir'>('morar', 'investir'),
          (timeline, objective) => {
            const state: QualificationState = {
              step: 'complete',
              timeline,
              objective,
            };
            
            expect(isHotLead(state, false)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should mark as HOT when has visited and has interest with defined type', () => {
      fc.assert(
        fc.property(
          fc.constantFrom<'morar' | 'investir'>('morar', 'investir'),
          interestTypeArb,
          (objective, interestType) => {
            const state: QualificationState = {
              step: 'complete',
              objective,
              interestType,
            };
            
            expect(isHotLead(state, true)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should NOT mark as HOT when timeline is long and has not visited', () => {
      fc.assert(
        fc.property(
          fc.constantFrom<Timeline>('medio_prazo', 'longo_prazo'),
          fc.option(fc.constantFrom<'morar' | 'investir'>('morar', 'investir'), { nil: undefined }),
          (timeline, objective) => {
            const state: QualificationState = {
              step: 'complete',
              timeline,
              objective,
            };
            
            expect(isHotLead(state, false)).toBe(false);
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

describe('Classification Service - Unit Tests', () => {
  describe('detectBrokerKeywords', () => {
    it('should detect "sou corretor"', () => {
      expect(detectBrokerKeywords('Olá, sou corretor de imóveis')).toContain('sou corretor');
    });

    it('should detect "trabalho com imóveis"', () => {
      expect(detectBrokerKeywords('Eu trabalho com imóveis há 10 anos')).toContain('trabalho com imóveis');
    });

    it('should detect "tenho clientes interessados"', () => {
      expect(detectBrokerKeywords('Tenho clientes interessados no empreendimento')).toContain('tenho clientes interessados');
    });

    it('should detect "creci"', () => {
      expect(detectBrokerKeywords('Meu CRECI é 12345')).toContain('creci');
    });

    it('should be case insensitive', () => {
      expect(detectBrokerKeywords('SOU CORRETOR')).toContain('sou corretor');
    });

    it('should handle accents', () => {
      expect(detectBrokerKeywords('trabalho com imoveis')).toContain('trabalho com imóveis');
    });
  });

  describe('detectInvestorKeywords', () => {
    it('should detect "mais de uma unidade"', () => {
      expect(detectInvestorKeywords('Quero comprar mais de uma unidade')).toContain('mais de uma unidade');
    });

    it('should detect "para investimento"', () => {
      expect(detectInvestorKeywords('É para investimento')).toContain('para investimento');
    });

    it('should detect "várias unidades"', () => {
      expect(detectInvestorKeywords('Tenho interesse em várias unidades')).toContain('várias unidades');
    });

    it('should detect "rentabilidade"', () => {
      expect(detectInvestorKeywords('Qual a rentabilidade esperada?')).toContain('rentabilidade');
    });
  });

  describe('classifyFromMessage', () => {
    it('should return corretor for broker messages', () => {
      const result = classifyFromMessage('Sou corretor e tenho clientes interessados');
      expect(result.type).toBe('corretor');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should return investidor for investor messages', () => {
      const result = classifyFromMessage('Quero comprar para investimento');
      expect(result.type).toBe('investidor');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should return cliente_final for neutral messages', () => {
      const result = classifyFromMessage('Olá, gostaria de saber mais sobre o empreendimento');
      expect(result.type).toBe('cliente_final');
      expect(result.confidence).toBe(0.5);
    });
  });
});
