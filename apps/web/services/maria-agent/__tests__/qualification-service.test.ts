/**
 * Property-Based Tests for Qualification Service
 * **Feature: palmas-lake-agent-maria, Property 1: Sequência de Qualificação**
 * **Validates: Requirements 2.1**
 * 
 * Tests that qualification questions follow the sequence:
 * Nome → Tipo de Interesse → Objetivo → Prazo → Conhecimento da Região
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type {
  QualificationState,
  QualificationStep,
  InterestType,
  Timeline,
} from '@/types/maria-agent';
import {
  QUALIFICATION_SEQUENCE,
  createInitialQualificationState,
  getNextStep,
  getStepIndex,
  isValidStepTransition,
  advanceToNextStep,
  processAnswer,
  isQualificationComplete,
  getNextQuestion,
  extractName,
  extractInterestType,
  extractObjective,
  extractTimeline,
  extractBooleanResponse,
  extractPhone,
} from '../qualification-service';

// ============================================
// Arbitraries (Generators)
// ============================================

const qualificationStepArb: fc.Arbitrary<QualificationStep> = fc.constantFrom(
  'name',
  'interest_type',
  'objective',
  'timeline',
  'region_knowledge',
  'contact_info',
  'complete'
);

const nonCompleteStepArb: fc.Arbitrary<QualificationStep> = fc.constantFrom(
  'name',
  'interest_type',
  'objective',
  'timeline',
  'region_knowledge',
  'contact_info'
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

// Generator for valid names
const validNameArb = fc.string({ minLength: 2, maxLength: 50 })
  .filter(s => s.trim().length >= 2);

// Generator for valid phone numbers (Brazilian format)
const validPhoneArb = fc.array(
  fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'),
  { minLength: 10, maxLength: 11 }
).map(arr => arr.join(''));

// Generator for qualification state at any step
const qualificationStateArb: fc.Arbitrary<QualificationState> = fc.record({
  step: qualificationStepArb,
  name: fc.option(validNameArb, { nil: undefined }),
  interestType: fc.option(interestTypeArb, { nil: undefined }),
  objective: fc.option(fc.constantFrom<'morar' | 'investir'>('morar', 'investir'), { nil: undefined }),
  timeline: fc.option(timelineArb, { nil: undefined }),
  knowsRegion: fc.option(fc.boolean(), { nil: undefined }),
  isFromPalmas: fc.option(fc.boolean(), { nil: undefined }),
  phone: fc.option(validPhoneArb, { nil: undefined }),
  email: fc.option(fc.emailAddress(), { nil: undefined }),
});

// ============================================
// Property Tests
// ============================================

describe('Qualification Service - Property Tests', () => {
  /**
   * **Feature: palmas-lake-agent-maria, Property 1: Sequência de Qualificação**
   * **Validates: Requirements 2.1**
   * 
   * *For any* qualification conversation, questions must follow the order:
   * Nome → Tipo de Interesse → Objetivo → Prazo → Conhecimento da Região
   */
  describe('Property 1: Sequência de Qualificação', () => {
    it('should follow the defined sequence: name → interest_type → objective → timeline → region_knowledge → contact_info → complete', () => {
      // Verify the sequence is correctly defined
      expect(QUALIFICATION_SEQUENCE).toEqual([
        'name',
        'interest_type',
        'objective',
        'timeline',
        'region_knowledge',
        'contact_info',
        'complete',
      ]);
    });

    it('should always advance to the next step in sequence', () => {
      fc.assert(
        fc.property(nonCompleteStepArb, (currentStep) => {
          const nextStep = getNextStep(currentStep);
          const currentIndex = getStepIndex(currentStep);
          const nextIndex = getStepIndex(nextStep);
          
          // Next step should always be exactly one position ahead
          expect(nextIndex).toBe(currentIndex + 1);
        }),
        { numRuns: 100 }
      );
    });

    it('should return "complete" when advancing from the last non-complete step', () => {
      const lastStep = QUALIFICATION_SEQUENCE[QUALIFICATION_SEQUENCE.length - 2];
      const nextStep = getNextStep(lastStep);
      
      expect(nextStep).toBe('complete');
    });

    it('should maintain step order when processing valid answers', () => {
      fc.assert(
        fc.property(
          validNameArb,
          interestTypeArb,
          fc.constantFrom<'morar' | 'investir'>('morar', 'investir'),
          timelineArb,
          fc.boolean(),
          validPhoneArb,
          (name, interestType, objective, timeline, knowsRegion, phone) => {
            // Start with initial state
            let state = createInitialQualificationState();
            const visitedSteps: QualificationStep[] = [state.step];
            
            // Process name
            state = processAnswer(state, name);
            visitedSteps.push(state.step);
            
            // Process interest type
            const interestTypeAnswer = interestType === 'apartamento' ? 'apartamento' :
              interestType === 'sala_comercial' ? 'sala comercial' :
              interestType === 'office' ? 'office' : 'flat';
            state = processAnswer(state, interestTypeAnswer);
            visitedSteps.push(state.step);
            
            // Process objective
            state = processAnswer(state, objective);
            visitedSteps.push(state.step);
            
            // Process timeline
            const timelineAnswer = timeline === 'imediato' ? 'imediato' :
              timeline === 'curto_prazo' ? 'proximo mes' :
              timeline === 'medio_prazo' ? '6 meses' : 'longo prazo';
            state = processAnswer(state, timelineAnswer);
            visitedSteps.push(state.step);
            
            // Process region knowledge
            state = processAnswer(state, knowsRegion ? 'sim' : 'não');
            visitedSteps.push(state.step);
            
            // Process contact info
            state = processAnswer(state, phone);
            visitedSteps.push(state.step);
            
            // Verify steps were visited in order
            for (let i = 1; i < visitedSteps.length; i++) {
              const prevIndex = getStepIndex(visitedSteps[i - 1]);
              const currIndex = getStepIndex(visitedSteps[i]);
              
              // Each step should be at most one position ahead (or same if answer wasn't valid)
              expect(currIndex).toBeGreaterThanOrEqual(prevIndex);
              expect(currIndex).toBeLessThanOrEqual(prevIndex + 1);
            }
            
            // Final state should be complete
            expect(state.step).toBe('complete');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not skip steps when advancing', () => {
      fc.assert(
        fc.property(nonCompleteStepArb, (step) => {
          const state: QualificationState = { step };
          const advancedState = advanceToNextStep(state);
          
          // Should only advance by one step
          expect(isValidStepTransition(step, advancedState.step)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('should not advance if answer is invalid for current step', () => {
      fc.assert(
        fc.property(
          fc.constantFrom<QualificationStep>('name'),
          fc.constant(''), // Empty string is invalid for name
          (step: QualificationStep, invalidAnswer: string) => {
            const state: QualificationState = { step };
            const newState = processAnswer(state, invalidAnswer);
            
            // Should stay on same step
            expect(newState.step).toBe(step);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Step Transitions', () => {
    it('should only allow forward transitions by exactly one step', () => {
      fc.assert(
        fc.property(
          qualificationStepArb,
          qualificationStepArb,
          (fromStep, toStep) => {
            const fromIndex = getStepIndex(fromStep);
            const toIndex = getStepIndex(toStep);
            
            const isValid = isValidStepTransition(fromStep, toStep);
            
            // Valid only if moving forward by exactly one
            expect(isValid).toBe(toIndex === fromIndex + 1);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Initial State', () => {
    it('should always start at "name" step', () => {
      fc.assert(
        fc.property(fc.constant(null), () => {
          const initialState = createInitialQualificationState();
          expect(initialState.step).toBe('name');
        }),
        { numRuns: 10 }
      );
    });
  });

  describe('Completion Detection', () => {
    it('should return true for isQualificationComplete only when step is "complete"', () => {
      fc.assert(
        fc.property(qualificationStateArb, (state) => {
          const isComplete = isQualificationComplete(state);
          expect(isComplete).toBe(state.step === 'complete');
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Question Generation', () => {
    it('should return null for complete step and valid question for other steps', () => {
      fc.assert(
        fc.property(qualificationStepArb, (step) => {
          const state: QualificationState = { step };
          const question = getNextQuestion(state);
          
          if (step === 'complete') {
            expect(question).toBeNull();
          } else {
            expect(question).not.toBeNull();
            expect(question?.step).toBe(step);
            expect(question?.question).toBeDefined();
          }
        }),
        { numRuns: 100 }
      );
    });
  });
});


// ============================================
// Unit Tests for Answer Extraction
// Requirements: 2.6, 2.7
// ============================================

describe('Answer Extraction Functions', () => {
  describe('extractName', () => {
    it('should extract name from simple input', () => {
      expect(extractName('João')).toBe('João');
      expect(extractName('Maria Silva')).toBe('Maria Silva');
    });

    it('should handle common prefixes', () => {
      expect(extractName('Meu nome é João')).toBe('João');
      expect(extractName('Me chamo Maria')).toBe('Maria');
      expect(extractName('Sou o Pedro')).toBe('Pedro');
    });

    it('should capitalize names properly', () => {
      expect(extractName('joão silva')).toBe('João Silva');
      expect(extractName('MARIA')).toBe('Maria');
    });

    it('should return null for invalid names', () => {
      expect(extractName('')).toBeNull();
      expect(extractName('a')).toBeNull();
    });
  });

  describe('extractInterestType', () => {
    it('should detect apartment interest', () => {
      expect(extractInterestType('Quero um apartamento')).toBe('apartamento');
      expect(extractInterestType('Busco apto')).toBe('apartamento');
    });

    it('should detect commercial interest', () => {
      expect(extractInterestType('Preciso de sala comercial')).toBe('sala_comercial');
      expect(extractInterestType('Quero um escritório')).toBe('sala_comercial');
    });

    it('should detect office interest', () => {
      expect(extractInterestType('Tenho interesse em office')).toBe('office');
    });

    it('should detect flat interest', () => {
      expect(extractInterestType('Quero um flat')).toBe('flat');
      expect(extractInterestType('Busco um loft')).toBe('flat');
    });

    it('should return null for unrecognized input', () => {
      expect(extractInterestType('não sei')).toBeNull();
    });
  });

  describe('extractObjective', () => {
    it('should detect morar objective', () => {
      expect(extractObjective('Para morar')).toBe('morar');
      expect(extractObjective('Quero residir')).toBe('morar');
    });

    it('should detect investir objective', () => {
      expect(extractObjective('Para investimento')).toBe('investir');
      expect(extractObjective('Quero alugar')).toBe('investir');
    });

    it('should return null for unrecognized input', () => {
      expect(extractObjective('não sei ainda')).toBeNull();
    });
  });

  describe('extractTimeline', () => {
    it('should detect immediate timeline', () => {
      expect(extractTimeline('Preciso agora')).toBe('imediato');
      expect(extractTimeline('É urgente')).toBe('imediato');
    });

    it('should detect short-term timeline', () => {
      expect(extractTimeline('Próximo mês')).toBe('curto_prazo');
      expect(extractTimeline('Em 2 meses')).toBe('curto_prazo');
    });

    it('should detect medium-term timeline', () => {
      expect(extractTimeline('Em 6 meses')).toBe('medio_prazo');
      expect(extractTimeline('Até 1 ano')).toBe('medio_prazo');
    });

    it('should detect long-term timeline', () => {
      expect(extractTimeline('Mais de 1 ano')).toBe('longo_prazo');
      expect(extractTimeline('Sem pressa')).toBe('longo_prazo');
    });
  });

  describe('extractBooleanResponse', () => {
    it('should detect positive responses', () => {
      expect(extractBooleanResponse('Sim')).toBe(true);
      expect(extractBooleanResponse('Já conheço')).toBe(true);
      expect(extractBooleanResponse('Claro')).toBe(true);
    });

    it('should detect negative responses', () => {
      expect(extractBooleanResponse('Não')).toBe(false);
      expect(extractBooleanResponse('Nunca fui')).toBe(false);
      expect(extractBooleanResponse('Ainda não')).toBe(false);
    });

    it('should return null for ambiguous responses', () => {
      expect(extractBooleanResponse('talvez')).toBeNull();
    });
  });

  describe('extractPhone', () => {
    it('should extract valid Brazilian phone numbers', () => {
      expect(extractPhone('11999999999')).toBe('11999999999');
      expect(extractPhone('(11) 99999-9999')).toBe('11999999999');
      expect(extractPhone('11 99999 9999')).toBe('11999999999');
    });

    it('should return null for invalid phone numbers', () => {
      expect(extractPhone('123')).toBeNull();
      expect(extractPhone('abc')).toBeNull();
    });
  });
});
