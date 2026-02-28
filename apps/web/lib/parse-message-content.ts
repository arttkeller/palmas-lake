/**
 * Extracts readable text from a message that may contain raw JSON.
 * Handles AI messages that come as WhatsApp / Evolution API JSON.
 *
 * Supported paths (7):
 *  1. { message: { conversation: "..." } }
 *  2. { message: { extendedTextMessage: { text: "..." } } }
 *  3. { conversation: "..." }
 *  4. { extendedTextMessage: { text: "..." } }
 *  5. { body: { text: "..." } }
 *  6. { text: "..." }
 *  7. { selectedDisplayText: "..." }
 */
export function parseMessageContent(content: string): string {
  if (!content) return '';

  if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(content);

      if (parsed.message?.conversation) return parsed.message.conversation;
      if (parsed.message?.extendedTextMessage?.text) return parsed.message.extendedTextMessage.text;
      if (parsed.conversation) return parsed.conversation;
      if (parsed.extendedTextMessage?.text) return parsed.extendedTextMessage.text;
      if (parsed.body?.text) return parsed.body.text;
      if (parsed.text) return parsed.text;
      if (parsed.selectedDisplayText) return parsed.selectedDisplayText;

      return content;
    } catch {
      return content;
    }
  }

  return content;
}
