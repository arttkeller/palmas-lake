/**
 * Property-Based Tests for AI Specialist Message Service
 * 
 * **Feature: ui-redesign-ai-specialists, Property 1: AI Context Consistency**
 * **Validates: Requirements 1.6**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  createMessageContext,
  createMessageRequest,
  validateMessageRequest,
  createUserMessage,
  createAssistantMessage,
  generateMessageId,
  getContextTypeLabel,
  hasValidContext,
  type AIMessageContext,
  type AIMessageRequest,
} from '../message-service';
import {
  aiSpecialistConfigs,
  getAISpecialistByPath,
  type AIContextType,
  type AISpecialistConfig,
} from '@/lib/ai-specialist-config';

// ============================================
// Arbitraries (Generators)
// ============================================

/**
 * Generator for valid AI specialist paths
 */
const aiSpecialistPathArb = fc.constantFrom(
  '/dashboard/quadro',
  '/dashboard/chat',
  '/dashboard/leads',
  '/dashboard/agendamentos',
  '/dashboard/analytics'
);

/**
 * Generator for valid context types
 */
const contextTypeArb = fc.constantFrom(
  'crm',
  'chat',
  'leads',
  'agendamentos',
  'analytics'
) as fc.Arbitrary<AIContextType>;

/**
 * Generator for non-empty message strings
 */
const messageArb = fc.string({ minLength: 1, maxLength: 500 }).filter(s => s.trim().length > 0);

/**
 * Generator for valid section names
 */
const sectionArb = fc.constantFrom('CRM', 'Conversas', 'Leads', 'Agendamentos', 'Análises');

/**
 * Generator for valid AI message context
 */
const validContextArb = fc.record({
  section: sectionArb,
  contextType: contextTypeArb,
  path: aiSpecialistPathArb,
  metadata: fc.option(fc.dictionary(fc.string(), fc.jsonValue()), { nil: undefined }),
});

/**
 * Generator for invalid context (missing required fields)
 */
const invalidContextArb = fc.oneof(
  // Missing section
  fc.record({
    section: fc.constant(''),
    contextType: contextTypeArb,
    path: aiSpecialistPathArb,
  }),
  // Missing contextType
  fc.record({
    section: sectionArb,
    contextType: fc.constant('invalid' as AIContextType),
    path: aiSpecialistPathArb,
  }),
  // Missing path
  fc.record({
    section: sectionArb,
    contextType: contextTypeArb,
    path: fc.constant(''),
  })
);

/**
 * Generator for empty/whitespace messages
 */
const emptyMessageArb = fc.constantFrom('', '   ', '\t', '\n', '  \n  ');

// ============================================
// Property-Based Tests
// ============================================

describe('AI Specialist Message Service - Property Tests', () => {
  describe('Property 1: AI Context Consistency', () => {
    /**
     * **Feature: ui-redesign-ai-specialists, Property 1: AI Context Consistency**
     * **Validates: Requirements 1.6**
     *
     * For any message sent to the AI specialist, the context of the current
     * section SHALL be included in the request, ensuring that the AI receives
     * information about which area of the system the user is querying.
     */
    it('should include section context in every message request', () => {
      fc.assert(
        fc.property(
          aiSpecialistPathArb,
          messageArb,
          (path, message) => {
            // Arrange: Get the config for this path
            const config = getAISpecialistByPath(path);
            expect(config).toBeDefined();

            // Act: Create message context and request
            const context = createMessageContext(config!, path);
            const request = createMessageRequest(message, context);

            // Assert: Request should have context with section info
            expect(request.context).toBeDefined();
            expect(request.context.section).toBe(config!.section);
            expect(request.context.contextType).toBe(config!.contextType);
            expect(request.context.path).toBe(path);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve context type when creating message requests', () => {
      fc.assert(
        fc.property(
          aiSpecialistPathArb,
          messageArb,
          (path, message) => {
            // Arrange
            const config = getAISpecialistByPath(path);
            const context = createMessageContext(config!, path);

            // Act
            const request = createMessageRequest(message, context);

            // Assert: Context type should match the section's context type
            expect(request.context.contextType).toBe(config!.contextType);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should include path in context for all messages', () => {
      fc.assert(
        fc.property(
          aiSpecialistPathArb,
          messageArb,
          (path, message) => {
            // Arrange
            const config = getAISpecialistByPath(path);
            const context = createMessageContext(config!, path);

            // Act
            const request = createMessageRequest(message, context);

            // Assert: Path should be included
            expect(request.context.path).toBe(path);
            expect(request.context.path.startsWith('/dashboard/')).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should validate that all message requests have required context fields', () => {
      fc.assert(
        fc.property(
          validContextArb,
          messageArb,
          (context, message) => {
            // Act: Create request with valid context
            const request = createMessageRequest(message, context as AIMessageContext);

            // Assert: Request should be valid
            expect(validateMessageRequest(request)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject message requests without proper context', () => {
      fc.assert(
        fc.property(
          invalidContextArb,
          messageArb,
          (context, message) => {
            // Act: Create request with invalid context
            const request = createMessageRequest(message, context as AIMessageContext);

            // Assert: Request should be invalid
            expect(validateMessageRequest(request)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject empty messages even with valid context', () => {
      fc.assert(
        fc.property(
          validContextArb,
          emptyMessageArb,
          (context, message) => {
            // Act: Create request with empty message
            const request = createMessageRequest(message, context as AIMessageContext);

            // Assert: Request should be invalid
            expect(validateMessageRequest(request)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Message Context Creation', () => {
    it('should create context with all required fields from config', () => {
      fc.assert(
        fc.property(
          aiSpecialistPathArb,
          (path) => {
            // Arrange
            const config = getAISpecialistByPath(path);

            // Act
            const context = createMessageContext(config!, path);

            // Assert: All required fields should be present
            expect(context.section).toBeDefined();
            expect(context.contextType).toBeDefined();
            expect(context.path).toBeDefined();
            expect(typeof context.section).toBe('string');
            expect(typeof context.contextType).toBe('string');
            expect(typeof context.path).toBe('string');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should include optional metadata when provided', () => {
      fc.assert(
        fc.property(
          aiSpecialistPathArb,
          fc.dictionary(fc.string({ minLength: 1, maxLength: 20 }), fc.string()),
          (path, metadata) => {
            // Arrange
            const config = getAISpecialistByPath(path);

            // Act
            const context = createMessageContext(config!, path, metadata);

            // Assert: Metadata should be included
            expect(context.metadata).toEqual(metadata);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Message Creation', () => {
    it('should create user messages with correct role', () => {
      fc.assert(
        fc.property(
          messageArb,
          validContextArb,
          (content, context) => {
            // Act
            const message = createUserMessage(content, context as AIMessageContext);

            // Assert
            expect(message.role).toBe('user');
            expect(message.content).toBe(content);
            expect(message.context).toEqual(context);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should create assistant messages with correct role', () => {
      fc.assert(
        fc.property(
          messageArb,
          validContextArb,
          (content, context) => {
            // Act
            const message = createAssistantMessage(content, context as AIMessageContext);

            // Assert
            expect(message.role).toBe('assistant');
            expect(message.content).toBe(content);
            expect(message.context).toEqual(context);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should generate unique message IDs', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 2, max: 100 }),
          (count) => {
            // Act: Generate multiple IDs
            const ids = Array.from({ length: count }, () => generateMessageId());

            // Assert: All IDs should be unique
            const uniqueIds = new Set(ids);
            expect(uniqueIds.size).toBe(count);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should include timestamp in created messages', () => {
      fc.assert(
        fc.property(
          messageArb,
          validContextArb,
          (content, context) => {
            // Arrange
            const before = new Date();

            // Act
            const message = createUserMessage(content, context as AIMessageContext);

            // Assert
            const after = new Date();
            expect(message.timestamp).toBeInstanceOf(Date);
            expect(message.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
            expect(message.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Context Type Labels', () => {
    it('should return Portuguese labels for all context types', () => {
      fc.assert(
        fc.property(
          contextTypeArb,
          (contextType) => {
            // Act
            const label = getContextTypeLabel(contextType);

            // Assert: Label should be non-empty string
            expect(typeof label).toBe('string');
            expect(label.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return correct labels for each context type', () => {
      const expectedLabels: Record<AIContextType, string> = {
        crm: 'CRM',
        chat: 'Conversas',
        leads: 'Leads',
        agendamentos: 'Agendamentos',
        analytics: 'Análises',
      };

      for (const [contextType, expectedLabel] of Object.entries(expectedLabels)) {
        const label = getContextTypeLabel(contextType as AIContextType);
        expect(label).toBe(expectedLabel);
      }
    });
  });

  describe('Context Validation', () => {
    it('should validate valid contexts as true', () => {
      fc.assert(
        fc.property(
          validContextArb,
          (context) => {
            // Act
            const isValid = hasValidContext(context as AIMessageContext);

            // Assert
            expect(isValid).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should validate undefined context as false', () => {
      expect(hasValidContext(undefined)).toBe(false);
    });

    it('should validate context with empty section as false', () => {
      const context: AIMessageContext = {
        section: '',
        contextType: 'crm',
        path: '/dashboard/quadro',
      };
      expect(hasValidContext(context)).toBe(false);
    });

    it('should validate context with empty path as false', () => {
      const context: AIMessageContext = {
        section: 'CRM',
        contextType: 'crm',
        path: '',
      };
      expect(hasValidContext(context)).toBe(false);
    });
  });

  describe('Request Validation Completeness', () => {
    it('should validate complete requests as valid', () => {
      fc.assert(
        fc.property(
          aiSpecialistPathArb,
          messageArb,
          (path, message) => {
            // Arrange
            const config = getAISpecialistByPath(path);
            const context = createMessageContext(config!, path);
            const request = createMessageRequest(message, context);

            // Assert
            expect(validateMessageRequest(request)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should ensure context type is one of the valid types', () => {
      fc.assert(
        fc.property(
          aiSpecialistPathArb,
          messageArb,
          (path, message) => {
            // Arrange
            const config = getAISpecialistByPath(path);
            const context = createMessageContext(config!, path);
            const request = createMessageRequest(message, context);

            // Assert: Context type should be valid
            const validTypes: AIContextType[] = ['crm', 'chat', 'leads', 'agendamentos', 'analytics'];
            expect(validTypes).toContain(request.context.contextType);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
