'use client';

import * as React from 'react';
import { Send, Loader2, MessageSquare, Bot, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Message } from '@/types/chat';

/**
 * Props for the LeadConversation component
 */
export interface LeadConversationProps {
  /** Array of messages in the conversation */
  messages: Message[];
  /** Whether messages are loading */
  isLoading?: boolean;
  /** Callback to send a message */
  onSendMessage?: (message: string) => Promise<void>;
  /** Whether sending is in progress */
  isSending?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Extracts readable text from a message that may contain raw JSON
 * Handles AI messages that come as WhatsApp JSON
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

/**
 * Formats a timestamp for display
 */
function formatTime(dateString: string): string {
  try {
    return new Date(dateString).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '--:--';
  }
}

/**
 * LeadConversation Component
 * 
 * Displays chat history with a lead and provides message input.
 * Implements glassmorphism styling consistent with the design system.
 * 
 * Requirements: 3.3, 3.4
 * 
 * @example
 * ```tsx
 * <LeadConversation
 *   messages={conversationMessages}
 *   onSendMessage={handleSendMessage}
 *   isLoading={isLoadingMessages}
 * />
 * ```
 */
export function LeadConversation({
  messages,
  isLoading = false,
  onSendMessage,
  isSending = false,
  className,
}: LeadConversationProps) {
  const [inputValue, setInputValue] = React.useState('');
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Auto-scroll to latest messages
  React.useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Handle send message (Requirements 3.4)
  const handleSend = React.useCallback(async () => {
    const trimmedMessage = inputValue.trim();
    if (!trimmedMessage || !onSendMessage || isSending) return;

    setInputValue('');
    try {
      await onSendMessage(trimmedMessage);
    } catch (error) {
      // Restore input on error
      setInputValue(trimmedMessage);
      console.error('Failed to send message:', error);
    }
  }, [inputValue, onSendMessage, isSending]);

  // Handle enter key
  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Messages Area (Requirements 3.3) */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin mb-2" />
            <span className="text-sm">Carregando mensagens...</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <MessageSquare className="w-8 h-8 mb-2 opacity-50" />
            <span className="text-sm">Nenhuma mensagem ainda</span>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Message Input (Requirements 3.4) */}
      {onSendMessage && (
        <div className="p-4 border-t border-black/5">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Digite uma mensagem..."
              disabled={isSending}
              className={cn(
                'flex-1 px-4 py-2.5 rounded-xl',
                'bg-white/60 backdrop-blur-sm',
                'border border-white/30',
                'text-sm text-foreground placeholder:text-muted-foreground',
                'focus:outline-none focus:ring-2 focus:ring-primary/50',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'transition-all duration-200'
              )}
            />
            <button
              onClick={handleSend}
              disabled={!inputValue.trim() || isSending}
              className={cn(
                'p-2.5 rounded-xl',
                'bg-gradient-to-r from-emerald-500 to-emerald-600',
                'text-white',
                'shadow-lg shadow-emerald-500/25',
                'hover:from-emerald-600 hover:to-emerald-700',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'transition-all duration-200',
                'focus:outline-none focus:ring-2 focus:ring-emerald-500/50'
              )}
              aria-label="Enviar mensagem"
            >
              {isSending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Props for MessageBubble component
 */
interface MessageBubbleProps {
  message: Message;
}

/**
 * Individual message bubble component
 */
function MessageBubble({ message }: MessageBubbleProps) {
  const isOutgoing = message.sender_type === 'user' || message.sender_type === 'ai';
  const isAI = message.sender_type === 'ai';
  const isLead = message.sender_type === 'lead';

  const parsedContent = parseMessageContent(message.content);

  // Check for reaction in metadata
  const msgAny = message as any;
  const metadata = typeof msgAny.metadata === 'string' 
    ? JSON.parse(msgAny.metadata || '{}') 
    : (msgAny.metadata || {});
  const reaction = metadata?.reaction;

  return (
    <div
      className={cn(
        'flex w-full',
        isOutgoing ? 'justify-end' : 'justify-start'
      )}
    >
      <div
        className={cn(
          'max-w-[80%] flex gap-2',
          isOutgoing ? 'flex-row-reverse' : 'flex-row'
        )}
      >
        {/* Avatar */}
        <div
          className={cn(
            'flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center',
            isAI
              ? 'bg-violet-100'
              : isLead
              ? 'bg-gray-100'
              : 'bg-emerald-100'
          )}
        >
          {isAI ? (
            <Bot className="w-4 h-4 text-violet-600" />
          ) : (
            <User className="w-4 h-4 text-gray-600" />
          )}
        </div>

        {/* Message Content */}
        <div className="relative">
          <div
            className={cn(
              'px-4 py-2.5 rounded-2xl',
              'shadow-sm',
              isAI
                ? 'bg-violet-100 border border-violet-200 rounded-tl-md'
                : isOutgoing
                ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-tr-md'
                : 'bg-white/80 backdrop-blur-sm border border-white/30 rounded-tl-md'
            )}
          >
            {/* AI Label */}
            {isAI && (
              <p className="text-[10px] uppercase font-bold text-violet-600 mb-1">
                AI Assistant
              </p>
            )}

            {/* Message Text */}
            <p
              className={cn(
                'text-sm whitespace-pre-wrap break-words',
                isOutgoing && !isAI ? 'text-white' : 'text-foreground'
              )}
            >
              {parsedContent}
            </p>

            {/* Timestamp */}
            <span
              className={cn(
                'block text-right text-[10px] mt-1',
                isOutgoing && !isAI
                  ? 'text-white/70'
                  : 'text-muted-foreground'
              )}
            >
              {formatTime(message.created_at)}
            </span>
          </div>

          {/* Reaction badge */}
          {reaction && (
            <div className="absolute -bottom-2 -right-1 bg-white rounded-full px-1.5 py-0.5 shadow-md border border-gray-100 text-sm">
              {reaction}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Compact version of LeadConversation for smaller spaces
 * Shows only the last few messages
 */
export interface LeadConversationPreviewProps {
  messages: Message[];
  maxMessages?: number;
  className?: string;
}

export function LeadConversationPreview({
  messages,
  maxMessages = 3,
  className,
}: LeadConversationPreviewProps) {
  const recentMessages = messages.slice(-maxMessages);

  if (recentMessages.length === 0) {
    return (
      <div className={cn('text-sm text-muted-foreground text-center py-4', className)}>
        Nenhuma mensagem recente
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      {recentMessages.map((message) => (
        <div
          key={message.id}
          className={cn(
            'text-xs p-2 rounded-lg',
            message.sender_type === 'lead'
              ? 'bg-gray-100'
              : 'bg-emerald-50 ml-4'
          )}
        >
          <span className="font-medium">
            {message.sender_type === 'lead' ? 'Lead' : message.sender_type === 'ai' ? 'IA' : 'Você'}:
          </span>{' '}
          <span className="text-muted-foreground">
            {parseMessageContent(message.content).substring(0, 100)}
            {parseMessageContent(message.content).length > 100 ? '...' : ''}
          </span>
        </div>
      ))}
    </div>
  );
}
