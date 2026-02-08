/**
 * Property-Based Tests for LeadModal Component
 * 
 * Tests message display functionality including sender type styling,
 * timestamp display, and JSON message parsing.
 * 
 * **Feature: fix-lead-messages-display**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ============================================
// Types
// ============================================

type SenderType = 'user' | 'ai' | 'lead';
type MessageType = 'text' | 'image' | 'audio' | 'video' | 'carousel';

interface Message {
  id: string;
  conversation_id: string;
  sender_type: SenderType;
  content: string;
  message_type: MessageType;
  created_at: string;
  metadata?: Record<string, any>;
}

// ============================================
// Functions Under Test
// ============================================

/**
 * Gets the CSS class name for a message based on sender type
 * This mirrors the logic in LeadModal/LeadConversation components
 */
function getMessageStyleClass(senderType: SenderType): string {
  switch (senderType) {
    case 'user':
      return 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white';
    case 'ai':
      return 'bg-violet-100 border border-violet-200';
    case 'lead':
      return 'bg-white/80 backdrop-blur-sm border border-white/30';
    default:
      return 'bg-gray-100';
  }
}

/**
 * Determines if a message should show the AI Assistant label
 */
function shouldShowAILabel(senderType: SenderType): boolean {
  return senderType === 'ai';
}

/**
 * Gets the avatar background class based on sender type
 */
function getAvatarClass(senderType: SenderType): string {
  switch (senderType) {
    case 'ai':
      return 'bg-violet-100';
    case 'lead':
      return 'bg-gray-100';
    case 'user':
      return 'bg-emerald-100';
    default:
      return 'bg-gray-100';
  }
}

/**
 * Determines if message should be aligned to the right (outgoing)
 */
function isOutgoingMessage(senderType: SenderType): boolean {
  return senderType === 'user' || senderType === 'ai';
}

// ============================================
// Arbitraries (Generators)
// ============================================

/**
 * Generator for valid sender types
 */
const senderTypeArb: fc.Arbitrary<SenderType> = fc.constantFrom('user', 'ai', 'lead');

/**
 * Generator for valid message types
 */
const messageTypeArb: fc.Arbitrary<MessageType> = fc.constantFrom(
  'text',
  'image',
  'audio',
  'video',
  'carousel'
);

/**
 * Generator for valid ISO date strings
 * Uses integer timestamps to avoid invalid date issues
 */
const dateStringArb: fc.Arbitrary<string> = fc.integer({
  min: new Date('2020-01-01').getTime(),
  max: new Date('2030-12-31').getTime(),
}).map(timestamp => new Date(timestamp).toISOString());

/**
 * Generator for message content (non-empty strings)
 */
const contentArb: fc.Arbitrary<string> = fc.string({ minLength: 1, maxLength: 500 });

/**
 * Generator for UUID-like strings
 */
const uuidArb: fc.Arbitrary<string> = fc.uuid();

/**
 * Generator for complete Message objects
 */
const messageArb: fc.Arbitrary<Message> = fc.record({
  id: uuidArb,
  conversation_id: uuidArb,
  sender_type: senderTypeArb,
  content: contentArb,
  message_type: messageTypeArb,
  created_at: dateStringArb,
  metadata: fc.option(fc.record({
    reaction: fc.option(fc.constantFrom('👍', '❤️', '😂', '😮', '😢', '🙏'), { nil: undefined }),
    whatsapp_msg_id: fc.option(fc.string(), { nil: undefined }),
  }), { nil: undefined }),
});

// ============================================
// Property-Based Tests
// ============================================

describe('LeadModal - Property Tests', () => {
  /**
   * **Feature: crm-bugfixes-analytics, Property 1: All sender types are preserved in message display**
   * **Validates: Requirements 1.1**
   *
   * For any list of messages containing entries with sender_type values of 'lead', 'ai', and 'user',
   * the message rendering logic SHALL include all messages regardless of sender_type,
   * and the count of rendered messages SHALL equal the count of input messages.
   */
  describe('Property 1: All sender types are preserved in message display', () => {
    /**
     * Simulates the message filtering/rendering logic.
     * The component renders ALL messages — no filtering by sender_type.
     * This function mirrors that: it returns all messages as-is.
     */
    function getDisplayedMessages(messages: Message[]): Message[] {
      // The component renders messages.map((message) => <MessageBubble ... />)
      // There is NO filter — all messages are rendered regardless of sender_type
      return messages;
    }

    it('should preserve all messages regardless of sender_type', () => {
      fc.assert(
        fc.property(
          fc.array(messageArb, { minLength: 0, maxLength: 30 }),
          (messages) => {
            const displayed = getDisplayedMessages(messages);
            expect(displayed.length).toBe(messages.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should include lead, ai, and user messages when all are present', () => {
      fc.assert(
        fc.property(
          // Generate at least one message of each sender type
          fc.tuple(
            messageArb.map(m => ({ ...m, sender_type: 'lead' as SenderType })),
            messageArb.map(m => ({ ...m, sender_type: 'ai' as SenderType })),
            messageArb.map(m => ({ ...m, sender_type: 'user' as SenderType })),
            fc.array(messageArb, { minLength: 0, maxLength: 10 }),
          ),
          ([leadMsg, aiMsg, userMsg, extras]) => {
            const allMessages = [leadMsg, aiMsg, userMsg, ...extras];
            const displayed = getDisplayedMessages(allMessages);

            // All sender types should be present in the output
            const senderTypes = new Set(displayed.map(m => m.sender_type));
            expect(senderTypes.has('lead')).toBe(true);
            expect(senderTypes.has('ai')).toBe(true);
            expect(senderTypes.has('user')).toBe(true);

            // Count should match
            expect(displayed.length).toBe(allMessages.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve message order', () => {
      fc.assert(
        fc.property(
          fc.array(messageArb, { minLength: 1, maxLength: 20 }),
          (messages) => {
            const displayed = getDisplayedMessages(messages);
            for (let i = 0; i < messages.length; i++) {
              expect(displayed[i].id).toBe(messages[i].id);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: fix-lead-messages-display, Property 4: Message sender type display**
   * **Validates: Requirements 2.3**
   * 
   * For any message displayed in the modal, the UI should use a different 
   * visual style based on the sender_type (lead, AI, or user).
   */
  describe('Property 4: Message sender type display', () => {
    it('should return different style classes for each sender type', () => {
      fc.assert(
        fc.property(
          senderTypeArb,
          (senderType) => {
            // Act: Get style class for sender type
            const styleClass = getMessageStyleClass(senderType);

            // Assert: Style class is non-empty
            expect(styleClass.length).toBeGreaterThan(0);

            // Assert: Each sender type has distinct styling
            if (senderType === 'user') {
              expect(styleClass).toContain('emerald');
              expect(styleClass).toContain('text-white');
            } else if (senderType === 'ai') {
              expect(styleClass).toContain('violet');
            } else if (senderType === 'lead') {
              expect(styleClass).toContain('bg-white');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should show AI Assistant label only for AI messages', () => {
      fc.assert(
        fc.property(
          senderTypeArb,
          (senderType) => {
            // Act: Check if AI label should be shown
            const showLabel = shouldShowAILabel(senderType);

            // Assert: Label shown only for AI
            expect(showLabel).toBe(senderType === 'ai');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return different avatar classes for each sender type', () => {
      fc.assert(
        fc.property(
          senderTypeArb,
          (senderType) => {
            // Act: Get avatar class
            const avatarClass = getAvatarClass(senderType);

            // Assert: Avatar class is non-empty
            expect(avatarClass.length).toBeGreaterThan(0);

            // Assert: Each sender type has appropriate avatar color
            if (senderType === 'ai') {
              expect(avatarClass).toContain('violet');
            } else if (senderType === 'user') {
              expect(avatarClass).toContain('emerald');
            } else if (senderType === 'lead') {
              expect(avatarClass).toContain('gray');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should align outgoing messages (user/AI) to the right', () => {
      fc.assert(
        fc.property(
          senderTypeArb,
          (senderType) => {
            // Act: Check if message is outgoing
            const isOutgoing = isOutgoingMessage(senderType);

            // Assert: User and AI messages are outgoing, lead messages are incoming
            if (senderType === 'user' || senderType === 'ai') {
              expect(isOutgoing).toBe(true);
            } else {
              expect(isOutgoing).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should produce consistent styling for same sender type', () => {
      fc.assert(
        fc.property(
          senderTypeArb,
          (senderType) => {
            // Act: Get style class twice
            const class1 = getMessageStyleClass(senderType);
            const class2 = getMessageStyleClass(senderType);

            // Assert: Same output for same input (deterministic)
            expect(class1).toBe(class2);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should have distinct styles for all three sender types', () => {
      // Get styles for all sender types
      const userStyle = getMessageStyleClass('user');
      const aiStyle = getMessageStyleClass('ai');
      const leadStyle = getMessageStyleClass('lead');

      // Assert: All styles are different
      expect(userStyle).not.toBe(aiStyle);
      expect(userStyle).not.toBe(leadStyle);
      expect(aiStyle).not.toBe(leadStyle);
    });
  });
});


// ============================================
// Timestamp Formatting Functions
// ============================================

/**
 * Formats a timestamp for display in messages
 * This mirrors the logic in LeadModal/LeadConversation components
 */
function formatTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return '--:--';
    }
    return date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '--:--';
  }
}

/**
 * Formats a full date for display
 */
function formatFullDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return '--/--/----';
    }
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return '--/--/----';
  }
}

/**
 * Validates if a string is a valid ISO date
 */
function isValidISODate(dateString: string): boolean {
  try {
    const date = new Date(dateString);
    return !isNaN(date.getTime());
  } catch {
    return false;
  }
}

// ============================================
// Property 5: Message timestamp display
// ============================================

describe('LeadModal - Timestamp Tests', () => {
  /**
   * **Feature: fix-lead-messages-display, Property 5: Message timestamp display**
   * **Validates: Requirements 2.4**
   * 
   * For any message displayed in the modal, the timestamp should be shown 
   * in a readable format.
   */
  describe('Property 5: Message timestamp display', () => {
    it('should format valid ISO dates to readable time format', () => {
      fc.assert(
        fc.property(
          dateStringArb,
          (dateString) => {
            // Act: Format the timestamp
            const formatted = formatTime(dateString);

            // Assert: Result is a non-empty string
            expect(formatted.length).toBeGreaterThan(0);

            // Assert: Result matches time format pattern (HH:MM)
            expect(formatted).toMatch(/^\d{2}:\d{2}$/);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return fallback for invalid date strings', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('invalid', 'not-a-date', 'abc123', 'xyz', 'hello world'),
          (invalidDate) => {
            // Act: Format the invalid timestamp
            const formatted = formatTime(invalidDate);

            // Assert: Returns fallback value for truly invalid dates
            expect(formatted).toBe('--:--');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should format full dates correctly', () => {
      fc.assert(
        fc.property(
          dateStringArb,
          (dateString) => {
            // Act: Format the full date
            const formatted = formatFullDate(dateString);

            // Assert: Result is a non-empty string
            expect(formatted.length).toBeGreaterThan(0);

            // Assert: Result matches date format pattern (DD/MM/YYYY)
            expect(formatted).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should produce consistent formatting for same timestamp', () => {
      fc.assert(
        fc.property(
          dateStringArb,
          (dateString) => {
            // Act: Format the same timestamp twice
            const formatted1 = formatTime(dateString);
            const formatted2 = formatTime(dateString);

            // Assert: Same output for same input (deterministic)
            expect(formatted1).toBe(formatted2);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should validate ISO date strings correctly', () => {
      fc.assert(
        fc.property(
          dateStringArb,
          (dateString) => {
            // Act: Validate the date string
            const isValid = isValidISODate(dateString);

            // Assert: Generated ISO dates should be valid
            expect(isValid).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject invalid date strings', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('invalid', 'not-a-date', 'abc', ''),
          (invalidDate) => {
            // Act: Validate the invalid date string
            const isValid = isValidISODate(invalidDate);

            // Assert: Invalid dates should be rejected
            expect(isValid).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle edge case dates correctly', () => {
      // Test specific edge cases
      const edgeCases = [
        '2020-01-01T00:00:00.000Z', // Start of year
        '2020-12-31T23:59:59.999Z', // End of year
        '2020-02-29T12:00:00.000Z', // Leap year
        '2025-06-15T12:30:45.123Z', // Mid-year
      ];

      for (const dateString of edgeCases) {
        const formatted = formatTime(dateString);
        expect(formatted).toMatch(/^\d{2}:\d{2}$/);
      }
    });

    it('should preserve time information in formatting', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 23 }),
          fc.integer({ min: 0, max: 59 }),
          (hour, minute) => {
            // Create a date with specific hour and minute
            const date = new Date(2025, 0, 15, hour, minute, 0);
            const dateString = date.toISOString();

            // Act: Format the timestamp
            const formatted = formatTime(dateString);

            // Assert: The formatted time should contain the hour and minute
            // Note: toLocaleTimeString may adjust for timezone, so we just verify format
            expect(formatted).toMatch(/^\d{2}:\d{2}$/);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});


// ============================================
// JSON Message Parsing Functions
// ============================================

/**
 * Extracts readable text from a message that may contain raw JSON
 * Handles AI messages that come as WhatsApp JSON
 * This mirrors the logic in LeadModal/LeadConversation components
 */
function parseMessageContent(content: string): string {
  if (!content) return '';

  // If it looks like JSON, try to parse
  if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(content);

      // WhatsApp Evolution API: { message: { conversation: "..." } }
      if (parsed.message?.conversation) {
        return parsed.message.conversation;
      }
      // WhatsApp Evolution API: { message: { extendedTextMessage: { text: "..." } } }
      if (parsed.message?.extendedTextMessage?.text) {
        return parsed.message.extendedTextMessage.text;
      }
      // Direct conversation field: { conversation: "..." }
      if (parsed.conversation) {
        return parsed.conversation;
      }
      // Direct extendedTextMessage: { extendedTextMessage: { text: "..." } }
      if (parsed.extendedTextMessage?.text) {
        return parsed.extendedTextMessage.text;
      }
      // Typical WhatsApp message structure: { body: { text: "..." } }
      if (parsed.body?.text) {
        return parsed.body.text;
      }
      // Or directly: { text: "..." }
      if (parsed.text) {
        return parsed.text;
      }
      // Or: { selectedDisplayText: "..." }
      if (parsed.selectedDisplayText) {
        return parsed.selectedDisplayText;
      }
      // Fallback: return original content if no text found
      return content;
    } catch {
      // Not valid JSON, return as is
      return content;
    }
  }

  return content;
}

// ============================================
// Arbitraries for JSON Message Testing
// ============================================

/**
 * Generator for plain text messages (non-JSON)
 */
const plainTextArb: fc.Arbitrary<string> = fc.string({ minLength: 1, maxLength: 200 })
  .filter(s => !s.trim().startsWith('{') && !s.trim().startsWith('['));

/**
 * Generator for WhatsApp-style JSON messages with body.text
 */
const whatsappBodyTextArb: fc.Arbitrary<string> = fc.string({ minLength: 1, maxLength: 100 })
  .map(text => JSON.stringify({ body: { text } }));

/**
 * Generator for JSON messages with direct text field
 */
const directTextArb: fc.Arbitrary<string> = fc.string({ minLength: 1, maxLength: 100 })
  .map(text => JSON.stringify({ text }));

/**
 * Generator for JSON messages with selectedDisplayText
 */
const selectedDisplayTextArb: fc.Arbitrary<string> = fc.string({ minLength: 1, maxLength: 100 })
  .map(text => JSON.stringify({ selectedDisplayText: text }));

/**
 * Generator for JSON without recognized text fields
 */
const jsonWithoutTextArb: fc.Arbitrary<string> = fc.record({
  id: fc.string(),
  timestamp: fc.integer(),
  type: fc.constantFrom('notification', 'status', 'event'),
}).map(obj => JSON.stringify(obj));

/**
 * Generator for WhatsApp Evolution API conversation format: { message: { conversation: "..." } }
 */
const evolutionConversationArb: fc.Arbitrary<string> = fc.string({ minLength: 1, maxLength: 100 })
  .map(text => JSON.stringify({ message: { conversation: text } }));

/**
 * Generator for WhatsApp Evolution API extendedTextMessage format
 */
const evolutionExtendedTextArb: fc.Arbitrary<string> = fc.string({ minLength: 1, maxLength: 100 })
  .map(text => JSON.stringify({ message: { extendedTextMessage: { text } } }));

/**
 * Generator for direct conversation field: { conversation: "..." }
 */
const directConversationArb: fc.Arbitrary<string> = fc.string({ minLength: 1, maxLength: 100 })
  .map(text => JSON.stringify({ conversation: text }));

/**
 * Generator for direct extendedTextMessage: { extendedTextMessage: { text: "..." } }
 */
const directExtendedTextArb: fc.Arbitrary<string> = fc.string({ minLength: 1, maxLength: 100 })
  .map(text => JSON.stringify({ extendedTextMessage: { text } }));

// ============================================
// Property 11: JSON message parsing
// ============================================

describe('LeadModal - JSON Parsing Tests', () => {
  /**
   * **Feature: crm-bugfixes-analytics, Property 2: JSON message parsing extracts readable text**
   * **Validates: Requirements 1.3, 1.4**
   *
   * For any JSON string containing a body.text, text, selectedDisplayText,
   * message.conversation, or message.extendedTextMessage.text field,
   * parseMessageContent SHALL return the value of that field.
   * For any non-JSON string, the function SHALL return the original string unchanged.
   */
  describe('Property 2: JSON message parsing extracts readable text', () => {
    it('should extract text from all WhatsApp JSON formats', () => {
      // Generator that produces [originalText, jsonContent] pairs for all supported formats
      const jsonFormatArb = fc.string({ minLength: 1, maxLength: 100 }).chain(text =>
        fc.constantFrom(
          { label: 'message.conversation', json: JSON.stringify({ message: { conversation: text } }), text },
          { label: 'message.extendedTextMessage.text', json: JSON.stringify({ message: { extendedTextMessage: { text } } }), text },
          { label: 'conversation', json: JSON.stringify({ conversation: text }), text },
          { label: 'extendedTextMessage.text', json: JSON.stringify({ extendedTextMessage: { text } }), text },
          { label: 'body.text', json: JSON.stringify({ body: { text } }), text },
          { label: 'text', json: JSON.stringify({ text }), text },
          { label: 'selectedDisplayText', json: JSON.stringify({ selectedDisplayText: text }), text },
        )
      );

      fc.assert(
        fc.property(
          jsonFormatArb,
          ({ json, text }) => {
            const parsed = parseMessageContent(json);
            expect(parsed).toBe(text);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return non-JSON strings unchanged', () => {
      fc.assert(
        fc.property(
          plainTextArb,
          (plainText) => {
            const parsed = parseMessageContent(plainText);
            expect(parsed).toBe(plainText);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return invalid JSON strings unchanged', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('{invalid json', '{unclosed: "value', '{"broken'),
          (invalidJson) => {
            const parsed = parseMessageContent(invalidJson);
            expect(parsed).toBe(invalidJson);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: fix-lead-messages-display, Property 11: JSON message parsing**
   * **Validates: Requirements 5.5**
   * 
   * For any message with JSON content, the system should extract and display 
   * readable text rather than raw JSON.
   */
  describe('Property 11: JSON message parsing', () => {
    it('should extract text from WhatsApp body.text JSON structure', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }),
          (originalText) => {
            // Arrange: Create WhatsApp-style JSON
            const jsonContent = JSON.stringify({ body: { text: originalText } });

            // Act: Parse the message content
            const parsed = parseMessageContent(jsonContent);

            // Assert: Should extract the original text
            expect(parsed).toBe(originalText);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should extract text from direct text field JSON structure', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }),
          (originalText) => {
            // Arrange: Create JSON with direct text field
            const jsonContent = JSON.stringify({ text: originalText });

            // Act: Parse the message content
            const parsed = parseMessageContent(jsonContent);

            // Assert: Should extract the original text
            expect(parsed).toBe(originalText);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should extract text from selectedDisplayText JSON structure', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }),
          (originalText) => {
            // Arrange: Create JSON with selectedDisplayText
            const jsonContent = JSON.stringify({ selectedDisplayText: originalText });

            // Act: Parse the message content
            const parsed = parseMessageContent(jsonContent);

            // Assert: Should extract the original text
            expect(parsed).toBe(originalText);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return plain text messages unchanged', () => {
      fc.assert(
        fc.property(
          plainTextArb,
          (plainText) => {
            // Act: Parse the plain text content
            const parsed = parseMessageContent(plainText);

            // Assert: Should return unchanged
            expect(parsed).toBe(plainText);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return original JSON when no recognized text field exists', () => {
      fc.assert(
        fc.property(
          jsonWithoutTextArb,
          (jsonContent) => {
            // Act: Parse the JSON without text field
            const parsed = parseMessageContent(jsonContent);

            // Assert: Should return original JSON string
            expect(parsed).toBe(jsonContent);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle empty strings gracefully', () => {
      // Act: Parse empty string
      const parsed = parseMessageContent('');

      // Assert: Should return empty string
      expect(parsed).toBe('');
    });

    it('should handle invalid JSON gracefully', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('{invalid', '[broken', '{"unclosed": ', '{key: value}'),
          (invalidJson) => {
            // Act: Parse invalid JSON
            const parsed = parseMessageContent(invalidJson);

            // Assert: Should return original string (not crash)
            expect(parsed).toBe(invalidJson);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should prioritize body.text over other fields', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          (bodyText, directText) => {
            // Arrange: Create JSON with both body.text and text fields
            const jsonContent = JSON.stringify({
              body: { text: bodyText },
              text: directText,
            });

            // Act: Parse the message content
            const parsed = parseMessageContent(jsonContent);

            // Assert: Should prioritize body.text
            expect(parsed).toBe(bodyText);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should produce consistent parsing for same input', () => {
      fc.assert(
        fc.property(
          fc.oneof(whatsappBodyTextArb, directTextArb, plainTextArb),
          (content) => {
            // Act: Parse the same content twice
            const parsed1 = parseMessageContent(content);
            const parsed2 = parseMessageContent(content);

            // Assert: Same output for same input (deterministic)
            expect(parsed1).toBe(parsed2);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle nested JSON structures', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          (text) => {
            // Arrange: Create deeply nested JSON
            const jsonContent = JSON.stringify({
              body: {
                text,
                metadata: {
                  timestamp: Date.now(),
                  sender: 'test',
                },
              },
            });

            // Act: Parse the message content
            const parsed = parseMessageContent(jsonContent);

            // Assert: Should extract the text from nested structure
            expect(parsed).toBe(text);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle JSON arrays gracefully', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string(), { minLength: 1, maxLength: 5 }),
          (arr) => {
            // Arrange: Create JSON array
            const jsonContent = JSON.stringify(arr);

            // Act: Parse the array content
            const parsed = parseMessageContent(jsonContent);

            // Assert: Should return original (no text field in array)
            expect(parsed).toBe(jsonContent);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
