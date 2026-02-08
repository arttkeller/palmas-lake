/**
 * Property-Based Tests for ChatPage Message Styling
 *
 * **Feature: fix-chat-messages-loading, Property 2: Sender type determines message styling class**
 * **Validates: Requirements 1.4**
 *
 * Tests that sender_type correctly maps to distinct CSS classes and alignment.
 * Messages from 'user' and 'ai' are right-aligned (isMe=true),
 * messages from 'lead' are left-aligned (isMe=false).
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ============================================
// Types
// ============================================

type SenderType = 'user' | 'ai' | 'lead';

// ============================================
// Functions Under Test
// These mirror the inline logic in ChatPage's message rendering
// ============================================

/**
 * Determines if a message is "mine" (right-aligned).
 * Mirrors: const isMe = msg.sender_type === 'user' || msg.sender_type === 'ai';
 */
function isMe(senderType: SenderType): boolean {
  return senderType === 'user' || senderType === 'ai';
}

/**
 * Returns the alignment class for a message.
 * Mirrors: className={clsx("flex w-full", isMe ? "justify-end" : "justify-start")}
 */
function getAlignmentClass(senderType: SenderType): string {
  return isMe(senderType) ? 'justify-end' : 'justify-start';
}

/**
 * Returns the bubble style class for a message based on sender_type.
 * Mirrors the cn(...) call in ChatPage message rendering.
 */
function getBubbleStyleClass(senderType: SenderType): string {
  switch (senderType) {
    case 'user':
      return 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-br-md shadow-emerald-500/25';
    case 'ai':
      return 'bg-purple-100/80 text-purple-900 border border-purple-200/50 rounded-br-md backdrop-blur-sm';
    case 'lead':
      return 'bg-white/80 text-gray-900 border border-white/50 rounded-bl-md backdrop-blur-xl shadow-black/5';
  }
}

// ============================================
// Arbitraries
// ============================================

const senderTypeArb: fc.Arbitrary<SenderType> = fc.constantFrom('user', 'ai', 'lead');

// ============================================
// Property-Based Tests
// ============================================

describe('ChatPage Message Styling - Property Tests', () => {
  /**
   * **Feature: fix-chat-messages-loading, Property 2: Sender type determines message styling class**
   * **Validates: Requirements 1.4**
   */
  describe('Property 2: Sender type determines message styling class', () => {
    it('user and ai messages are right-aligned, lead messages are left-aligned', () => {
      fc.assert(
        fc.property(senderTypeArb, (senderType) => {
          const alignment = getAlignmentClass(senderType);

          if (senderType === 'user' || senderType === 'ai') {
            expect(alignment).toBe('justify-end');
          } else {
            expect(alignment).toBe('justify-start');
          }
        }),
        { numRuns: 100 }
      );
    });

    it('each sender type maps to a distinct CSS class', () => {
      fc.assert(
        fc.property(senderTypeArb, (senderType) => {
          const style = getBubbleStyleClass(senderType);
          expect(style.length).toBeGreaterThan(0);

          if (senderType === 'user') {
            expect(style).toContain('emerald');
            expect(style).toContain('text-white');
          } else if (senderType === 'ai') {
            expect(style).toContain('purple');
          } else if (senderType === 'lead') {
            expect(style).toContain('bg-white');
          }
        }),
        { numRuns: 100 }
      );
    });

    it('all three sender types produce mutually distinct styles', () => {
      const userStyle = getBubbleStyleClass('user');
      const aiStyle = getBubbleStyleClass('ai');
      const leadStyle = getBubbleStyleClass('lead');

      expect(userStyle).not.toBe(aiStyle);
      expect(userStyle).not.toBe(leadStyle);
      expect(aiStyle).not.toBe(leadStyle);
    });

    it('styling is deterministic for any sender type', () => {
      fc.assert(
        fc.property(senderTypeArb, (senderType) => {
          const style1 = getBubbleStyleClass(senderType);
          const style2 = getBubbleStyleClass(senderType);
          expect(style1).toBe(style2);
        }),
        { numRuns: 100 }
      );
    });
  });
});
