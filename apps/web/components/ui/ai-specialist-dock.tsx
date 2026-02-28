'use client';

/**
 * AI Specialist Dock Component
 * 
 * A contextual AI assistant for each section of the dashboard.
 * Three states: collapsed (emoji button), expanded input bar, and chat panel with message history.
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, X, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useAISpecialist } from '@/hooks/useAISpecialist';
import {
  createMessageContext,
  createMessageRequest,
  sendMessageToAISpecialist,
  type AIMessage,
} from '@/services/ai-specialist/message-service';

export interface AISpecialistDockProps {
  className?: string;
  /** Position offset from bottom to account for bottom nav */
  bottomOffset?: number;
}

const CRM_LEAD_LINK_REGEX = /\[([^[\]]+)\]\((\/dashboard\/quadro\?leadId=[^)]+)\)/g;

function renderLineWithLeadLinks(line: string, lineKey: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let currentIndex = 0;
  let match: RegExpExecArray | null;
  const regex = new RegExp(CRM_LEAD_LINK_REGEX);

  while ((match = regex.exec(line)) !== null) {
    const [fullMatch, label, href] = match;

    if (match.index > currentIndex) {
      parts.push(
        <span key={`${lineKey}-text-${currentIndex}`}>
          {line.slice(currentIndex, match.index)}
        </span>
      );
    }

    parts.push(
      <Link
        key={`${lineKey}-link-${match.index}`}
        href={href}
        className="underline decoration-dotted underline-offset-2 hover:decoration-solid text-blue-700"
      >
        {label}
      </Link>
    );

    currentIndex = match.index + fullMatch.length;
  }

  if (currentIndex < line.length) {
    parts.push(
      <span key={`${lineKey}-tail`}>
        {line.slice(currentIndex)}
      </span>
    );
  }

  if (parts.length === 0) {
    parts.push(<span key={`${lineKey}-plain`}>{line}</span>);
  }

  return parts;
}

function renderAssistantMessageContent(content: string): React.ReactNode {
  const lines = content.split('\n');

  return (
    <div className="whitespace-pre-wrap break-words">
      {lines.map((line, index) => {
        if (line.length === 0) {
          return <div key={`line-${index}`} className="h-2" />;
        }

        return (
          <div key={`line-${index}`}>
            {renderLineWithLeadLinks(line, `line-${index}`)}
          </div>
        );
      })}
    </div>
  );
}

/**
 * AI Specialist Dock - Contextual AI chat for each dashboard section
 */
export function AISpecialistDock({
  className,
  bottomOffset = 80,
}: AISpecialistDockProps): React.JSX.Element | null {
  const { config, hasSpecialist, currentPath, emoji, placeholder } = useAISpecialist();
  const [mounted, setMounted] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // Store messages per context type to keep conversations separate
  const [messagesByContext, setMessagesByContext] = useState<Record<string, AIMessage[]>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const previousContextRef = useRef<string | null>(null);

  // Get messages for current context
  const currentContextType = config?.contextType || '';
  const messages = messagesByContext[currentContextType] || [];

  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset expanded state when context changes
  useEffect(() => {
    if (previousContextRef.current && previousContextRef.current !== currentContextType) {
      // Context changed - collapse the dock
      setIsExpanded(false);
      setMessage('');
    }
    previousContextRef.current = currentContextType;
  }, [currentContextType]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleToggle = useCallback(() => {
    setIsExpanded(prev => !prev);
    if (isExpanded) {
      setMessage('');
    }
  }, [isExpanded]);

  const handleClose = useCallback(() => {
    // Close the panel but preserve messages in state (session persistence)
    setIsExpanded(false);
    setMessage('');
  }, []);

  const handleSendMessage = useCallback(async () => {
    if (!message.trim() || !config || isLoading) return;

    const trimmedMessage = message.trim();
    const contextType = config.contextType;
    setMessage('');
    setIsLoading(true);

    try {
      const context = createMessageContext(config, currentPath);
      const request = createMessageRequest(trimmedMessage, context);

      const userMessage: AIMessage = {
        id: `user_${Date.now()}`,
        content: trimmedMessage,
        role: 'user',
        timestamp: new Date(),
        context,
      };
      
      // Add message to the correct context
      setMessagesByContext(prev => ({
        ...prev,
        [contextType]: [...(prev[contextType] || []), userMessage],
      }));

      const response = await sendMessageToAISpecialist(request);

      if (response.success && response.content) {
        const assistantMessage: AIMessage = {
          id: response.id,
          content: response.content,
          role: 'assistant',
          timestamp: response.timestamp,
          context,
        };
        
        // Add response to the correct context
        setMessagesByContext(prev => ({
          ...prev,
          [contextType]: [...(prev[contextType] || []), assistantMessage],
        }));
      }
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setIsLoading(false);
    }
  }, [message, config, currentPath, isLoading]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
    if (e.key === 'Escape') {
      handleClose();
    }
  }, [handleSendMessage, handleClose]);

  if (!mounted || !hasSpecialist || !config) {
    return null;
  }

  const hasMessages = messages.length > 0;
  const showChatPanel = isExpanded && hasMessages;
  const showInputBar = isExpanded && !hasMessages;

  return (
    <div
      className={cn('fixed right-4 md:right-6 z-40', className)}
      style={{ bottom: `${bottomOffset}px` }}
      data-testid="ai-specialist-dock"
    >
      <AnimatePresence mode="wait">
        {!isExpanded ? (
          /* Collapsed state - emoji button */
          <motion.button
            key="collapsed"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleToggle}
            className={cn(
              'w-14 h-14 rounded-full flex items-center justify-center',
              'shadow-lg border border-border/50',
              'bg-card/90 backdrop-blur-sm',
              'cursor-pointer transition-colors',
              'hover:bg-card'
            )}
            style={{
              background: `linear-gradient(135deg, ${config.gradientColors})`,
            }}
            aria-label={`Abrir chat com especialista em ${config.section}`}
            data-testid="ai-dock-button"
          >
            <span className="text-2xl" role="img" aria-label={config.section}>
              {emoji}
            </span>
            {config.online && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-white rounded-full"
              />
            )}
            {/* Badge when messages exist but panel is closed */}
            {hasMessages && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-1 -right-1 w-5 h-5 bg-blue-500 border-2 border-white rounded-full flex items-center justify-center"
              >
                <span className="text-[10px] text-white font-bold">
                  {messages.length > 9 ? '9+' : messages.length}
                </span>
              </motion.div>
            )}
          </motion.button>
        ) : showChatPanel ? (
          /* Chat panel state - full conversation window */
          <motion.div
            key="chat-panel"
            initial={{ scale: 0.8, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className={cn(
              'w-[340px] max-w-[95vw] rounded-2xl overflow-hidden',
              'shadow-2xl border border-border/50',
              'backdrop-blur-sm flex flex-col'
            )}
            style={{ maxHeight: 'min(480px, 70vh)' }}
            data-testid="ai-dock-chat-panel"
          >
            {/* Header */}
            <div
              className="flex items-center gap-2 px-4 py-3 shrink-0"
              style={{
                background: `linear-gradient(135deg, ${config.gradientColors})`,
              }}
            >
              <span className="text-xl" role="img" aria-label={config.section}>
                {emoji}
              </span>
              <span className="text-sm font-semibold text-gray-700 flex-1">
                {config.section}
              </span>
              <button
                onClick={handleClose}
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center',
                  'bg-white/60 hover:bg-white/90 transition-colors cursor-pointer'
                )}
                aria-label="Minimizar chat"
                data-testid="ai-dock-close"
              >
                <ChevronDown className="w-4 h-4 text-gray-600" />
              </button>
            </div>

            {/* Messages area */}
            <div
              className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-white/95"
              data-testid="ai-dock-messages"
            >
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    'flex',
                    msg.role === 'user' ? 'justify-end' : 'justify-start'
                  )}
                >
                  <div
                    className={cn(
                      'max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed',
                      msg.role === 'user'
                        ? 'bg-blue-500 text-white rounded-br-md'
                        : 'bg-gray-100 text-gray-800 rounded-bl-md'
                    )}
                  >
                    {msg.role === 'assistant' ? (
                      renderAssistantMessageContent(msg.content)
                    ) : (
                      <span className="whitespace-pre-wrap break-words">{msg.content}</span>
                    )}
                  </div>
                </div>
              ))}

              {/* Loading indicator */}
              {isLoading && (
                <div className="flex justify-start" data-testid="ai-dock-loading">
                  <div className="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-3">
                    <div className="flex gap-1">
                      <motion.div
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 1, repeat: Infinity, delay: 0 }}
                        className="w-2 h-2 bg-gray-400 rounded-full"
                      />
                      <motion.div
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
                        className="w-2 h-2 bg-gray-400 rounded-full"
                      />
                      <motion.div
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
                        className="w-2 h-2 bg-gray-400 rounded-full"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
            <div
              className="shrink-0 px-3 py-2 border-t border-gray-100 bg-white"
            >
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={placeholder}
                  disabled={isLoading}
                  autoFocus
                  className={cn(
                    'flex-1 bg-gray-50 rounded-full px-4 py-2',
                    'text-sm text-gray-700 placeholder-gray-400',
                    'border border-gray-200 outline-none',
                    'focus:border-blue-300 focus:ring-1 focus:ring-blue-200',
                    'disabled:opacity-50'
                  )}
                  data-testid="ai-dock-input"
                />
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={handleSendMessage}
                  disabled={!message.trim() || isLoading}
                  className={cn(
                    'w-9 h-9 rounded-full flex items-center justify-center shrink-0',
                    'bg-blue-500 hover:bg-blue-600 transition-colors cursor-pointer',
                    'disabled:opacity-40 disabled:cursor-not-allowed'
                  )}
                  aria-label="Enviar mensagem"
                >
                  {isLoading ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                    />
                  ) : (
                    <Send className="w-4 h-4 text-white" />
                  )}
                </motion.button>
              </div>
            </div>
          </motion.div>
        ) : (
          /* Expanded input bar state - no messages yet */
          <motion.div
            key="expanded"
            initial={{ width: 56, opacity: 0 }}
            animate={{ width: config.expandedWidth, opacity: 1 }}
            exit={{ width: 56, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className={cn(
              'rounded-full px-3 py-2',
              'shadow-xl border border-border/50',
              'backdrop-blur-sm',
              'max-w-[95vw]'
            )}
            style={{
              background: `linear-gradient(135deg, ${config.gradientColors})`,
            }}
          >
            <div className="flex items-center gap-2">
              <button
                onClick={handleToggle}
                className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0',
                  'bg-white/90 hover:bg-white transition-colors cursor-pointer'
                )}
                aria-label="Fechar chat"
              >
                <span className="text-xl">{emoji}</span>
              </button>

              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={isLoading}
                autoFocus
                className={cn(
                  'flex-1 bg-transparent border-none outline-none',
                  'text-sm font-medium text-gray-700 placeholder-gray-500',
                  'disabled:opacity-50'
                )}
                data-testid="ai-dock-input"
              />

              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={message.trim() ? handleSendMessage : handleToggle}
                disabled={isLoading}
                className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0',
                  'bg-white/90 hover:bg-white transition-colors cursor-pointer',
                  'disabled:opacity-50'
                )}
                aria-label={message.trim() ? 'Enviar mensagem' : 'Fechar'}
              >
                {isLoading ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full"
                  />
                ) : message.trim() ? (
                  <Send className="w-4 h-4 text-gray-600" />
                ) : (
                  <X className="w-4 h-4 text-gray-600" />
                )}
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default AISpecialistDock;
