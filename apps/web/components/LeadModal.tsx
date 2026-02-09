'use client';

import * as React from 'react';
import { X, Phone, Mail, MessageCircle, TrendingUp, TrendingDown, Minus, Instagram, Globe, FileText, Bot, User, Loader2, Image as ImageIcon, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { API_BASE_URL } from '@/lib/api-config';
import { Badge } from '@/components/ui/badge';
import { createClient } from '@/lib/supabase';
import { formatInterestType } from '@/lib/interest-type-format';
import type { Message } from '@/types/chat';

/**
 * Lead interface for the modal
 * Matches the database schema from design.md
 */
export interface LeadModalLead {
  id: string;
  full_name: string;
  phone: string;
  email?: string | null;
  status: string;
  sentiment_score?: number;
  sentiment_label?: string | null;
  notes?: string | null;
  source?: string | null;
  platform?: 'whatsapp' | 'instagram' | null;
  created_at?: string;
  updated_at?: string;
  interest_type?: string | null;
  tags?: string[] | string | null;
  adjectives?: string[] | string | null;
}

/**
 * Props for the LeadModal component
 */
export interface LeadModalProps {
  /** Lead data to display */
  lead: LeadModalLead | null;
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback when modal should close */
  onClose: () => void;
  /** Additional CSS classes */
  className?: string;
  /** Children components for additional content (e.g., messages) */
  children?: React.ReactNode;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Extracts readable text from a message that may contain raw JSON
 * Handles AI messages that come as WhatsApp JSON
 * Requirements: 5.5
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
 * Requirements: 2.4
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
 * Parses tags or adjectives from jsonb column
 * Handles both string (JSON-encoded) and array formats
 * Requirements: 10.1, 10.2
 */
export function parseTags(value: string[] | string | null | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((t) => typeof t === 'string' && t.trim() !== '');
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '' || trimmed === '[]') return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.filter((t: unknown) => typeof t === 'string' && (t as string).trim() !== '');
      // Parsed successfully but not an array — treat as single tag
      return [trimmed];
    } catch {
      // Not valid JSON — treat as single tag
      return [trimmed];
    }
  }
  return [];
}


// ============================================
// Sub-Components
// ============================================

/**
 * Sentiment Icon Component
 * Displays sentiment based on score (-100 to 100)
 * Requirements: 4.3
 */
function SentimentDisplay({ score }: { score: number }) {
  if (score > 20) {
    return (
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
          <TrendingUp className="w-4 h-4 text-green-600" />
        </div>
        <div>
          <span className="text-sm font-medium text-green-600">Positivo</span>
          <span className="text-xs text-gray-500 ml-1">({score})</span>
        </div>
      </div>
    );
  } else if (score < -20) {
    return (
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
          <TrendingDown className="w-4 h-4 text-red-600" />
        </div>
        <div>
          <span className="text-sm font-medium text-red-600">Negativo</span>
          <span className="text-xs text-gray-500 ml-1">({score})</span>
        </div>
      </div>
    );
  } else {
    return (
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
          <Minus className="w-4 h-4 text-gray-500" />
        </div>
        <div>
          <span className="text-sm font-medium text-gray-500">Neutro</span>
          <span className="text-xs text-gray-400 ml-1">({score})</span>
        </div>
      </div>
    );
  }
}

/**
 * Platform Indicator Component
 * Shows WhatsApp or Instagram icon based on conversation platform
 * Requirements: 4.2
 */
function PlatformIndicator({ platform, source }: { platform?: string | null; source?: string | null }) {
  // Determine platform from either platform field or source field
  const detectedPlatform = platform || source?.toLowerCase();
  
  if (detectedPlatform?.includes('instagram')) {
    return (
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center">
          <Instagram className="w-4 h-4 text-white" />
        </div>
        <span className="text-sm font-medium text-gray-700">Instagram</span>
      </div>
    );
  } else if (detectedPlatform?.includes('whatsapp') || detectedPlatform?.includes('phone') || !detectedPlatform) {
    return (
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
          <Phone className="w-4 h-4 text-white" />
        </div>
        <span className="text-sm font-medium text-gray-700">WhatsApp</span>
      </div>
    );
  } else {
    return (
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center">
          <Globe className="w-4 h-4 text-white" />
        </div>
        <span className="text-sm font-medium text-gray-700">{detectedPlatform}</span>
      </div>
    );
  }
}

/**
 * Status Badge Component
 * Displays lead status with appropriate styling
 * Requirements: 4.1
 */
function StatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { label: string; className: string }> = {
    'new': { label: 'Novo', className: 'bg-blue-100 text-blue-800 border-blue-200' },
    'novo_lead': { label: 'Novo Lead', className: 'bg-blue-100 text-blue-800 border-blue-200' },
    'contacted': { label: 'Contatado', className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
    'qualificado': { label: 'Qualificado', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
    'visita_agendada': { label: 'Visita Agendada', className: 'bg-purple-100 text-purple-800 border-purple-200' },
    'visita_realizada': { label: 'Visita Realizada', className: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
    'proposta_enviada': { label: 'Proposta Enviada', className: 'bg-orange-100 text-orange-800 border-orange-200' },
    'vendido': { label: 'Vendido', className: 'bg-green-100 text-green-800 border-green-200' },
    'sold': { label: 'Vendido', className: 'bg-green-100 text-green-800 border-green-200' },
    'perdido': { label: 'Perdido', className: 'bg-red-100 text-red-800 border-red-200' },
    'lost': { label: 'Perdido', className: 'bg-red-100 text-red-800 border-red-200' },
    'transferido': { label: 'Transferido', className: 'bg-gray-100 text-gray-800 border-gray-200' },
  };

  const normalizedStatus = status?.toLowerCase() || 'new';
  const config = statusConfig[normalizedStatus] || statusConfig['new'];

  return (
    <Badge variant="outline" className={cn('font-medium', config.className)}>
      {config.label}
    </Badge>
  );
}


/**
 * Message Bubble Component
 * Displays individual messages with different styles based on sender type
 * Requirements: 2.3, 5.1, 5.2, 5.3, 5.4
 */
interface MessageBubbleProps {
  message: Message;
}

function MessageBubble({ message }: MessageBubbleProps) {
  const isOutgoing = message.sender_type === 'user' || message.sender_type === 'ai';
  const isAI = message.sender_type === 'ai';
  const isLead = message.sender_type === 'lead';

  // Parse message content (Requirements 5.5)
  const parsedContent = parseMessageContent(message.content);

  // Check for reaction in metadata (Requirements 5.4)
  const msgAny = message as any;
  const metadata = typeof msgAny.metadata === 'string' 
    ? JSON.parse(msgAny.metadata || '{}') 
    : (msgAny.metadata || {});
  const reaction = metadata?.reaction;

  // Check for image content (Requirements 5.3)
  const isImage = message.message_type === 'image';
  const isCarousel = (message.message_type as string) === 'carousel';
  const imageUrl = (message.content.match(/\[Imagem: (.*?)\]/) || [])[1];

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
        {/* Avatar - Requirements 5.1 */}
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
              // Different visual styles for each sender type (Requirements 5.1)
              isAI
                ? 'bg-violet-100 border border-violet-200 rounded-tl-md'
                : isOutgoing
                ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-tr-md'
                : 'bg-white/80 backdrop-blur-sm border border-white/30 rounded-tl-md'
            )}
          >
            {/* AI Assistant Label - Requirements 5.2 */}
            {isAI && (
              <p className="text-[10px] uppercase font-bold text-violet-600 mb-1">
                AI Assistant
              </p>
            )}

            {/* Image rendering - Requirements 5.3 */}
            {(isImage || isCarousel) && imageUrl ? (
              <div className="space-y-2">
                <p
                  className={cn(
                    'text-sm whitespace-pre-wrap break-words',
                    isOutgoing && !isAI ? 'text-white' : 'text-foreground'
                  )}
                >
                  {parsedContent.split('[Imagem:')[0].split('[Carrossel')[0]}
                </p>
                <img
                  src={imageUrl}
                  alt="Imagem enviada"
                  className="rounded-lg max-h-48 w-full object-cover border border-white/20"
                  onError={(e) => {
                    // Hide broken images
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
                {isCarousel && (
                  <div className="mt-2 p-2 bg-white/50 rounded-lg border border-white/30 text-xs text-gray-600 flex items-center gap-1">
                    <ImageIcon className="w-3 h-3" />
                    Galeria de imagens
                  </div>
                )}
              </div>
            ) : (
              <p
                className={cn(
                  'text-sm whitespace-pre-wrap break-words',
                  isOutgoing && !isAI ? 'text-white' : 'text-foreground'
                )}
              >
                {parsedContent}
              </p>
            )}

            {/* Timestamp - Requirements 2.4 */}
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

          {/* Reaction badge - Requirements 5.4 */}
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
 * Message List Component
 * Displays all messages in a conversation
 * Requirements: 2.2
 */
interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
  errorMessage?: string | null;
  onRetry?: () => void;
}

function MessageList({ messages, isLoading, errorMessage, onRetry }: MessageListProps) {
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll to latest messages
  React.useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-gray-400">
        <Loader2 className="w-8 h-8 animate-spin mb-3" />
        <p className="text-sm">Carregando mensagens...</p>
      </div>
    );
  }

  // Display error message with retry button (Requirements 3.4)
  if (errorMessage) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-gray-400">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-3">
          <X className="w-6 h-6 text-red-500" />
        </div>
        <p className="text-sm text-red-500 mb-3 text-center px-4">{errorMessage}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-4 py-2 text-sm bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors"
          >
            Tentar novamente
          </button>
        )}
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-gray-400">
        <MessageCircle className="w-12 h-12 mb-3 opacity-50" />
        <p className="text-sm">Nenhuma mensagem para exibir</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
}

// ============================================
// Main Component
// ============================================

/**
 * LeadModal Component
 * 
 * A glassmorphism-styled modal for displaying lead details and messages.
 * Implements backdrop blur, close on outside click, escape key handling,
 * and displays lead information including name, phone, email, status,
 * sentiment, platform, and notes.
 * 
 * Now includes message fetching, display, and realtime subscription functionality.
 * 
 * Realtime Features (Requirements 2.5):
 * - Subscribes to messages table changes for the conversation
 * - Updates message list when new messages arrive
 * - Unsubscribes when modal closes
 * - Handles subscription errors gracefully with polling fallback
 * - Shows visual indicator for realtime connection status
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4, 5.5
 * 
 * @example
 * ```tsx
 * <LeadModal
 *   lead={selectedLead}
 *   isOpen={isModalOpen}
 *   onClose={() => setIsModalOpen(false)}
 * />
 * ```
 */
export function LeadModal({
  lead,
  isOpen,
  onClose,
  className,
  children,
}: LeadModalProps) {
  const modalRef = React.useRef<HTMLDivElement>(null);
  const supabase = createClient();
  
  // State for messages
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = React.useState(false);
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = React.useState<'connecting' | 'connected' | 'error' | 'disconnected'>('disconnected');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  // Schema for Supabase queries
  const SCHEMA = 'palmaslake-agno';

  // Fetch conversation and messages when modal opens (Requirements 2.2)
  React.useEffect(() => {
    if (!isOpen || !lead?.id) {
      setMessages([]);
      setConversationId(null);
      setErrorMessage(null);
      return;
    }

    const fetchConversationAndMessages = async () => {
      setIsLoadingMessages(true);
      setErrorMessage(null);
      
      try {
        // Try API first
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        
        try {
          const convRes = await fetch(`${API_BASE_URL}/api/chat/conversations/by-lead/${lead.id}`, {
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          
          if (convRes.ok) {
            const convData = await convRes.json();
            setConversationId(convData.id);
            
            // Fetch messages for this conversation
            const msgRes = await fetch(`${API_BASE_URL}/api/chat/messages/${convData.id}`);
            if (msgRes.ok) {
              const msgData = await msgRes.json();
              setMessages(msgData);
              setIsLoadingMessages(false);
              return;
            } else {
              console.error('[LeadModal] Failed to fetch messages from API:', msgRes.status);
            }
          } else if (convRes.status === 404) {
            // No conversation found - this is not an error, just no messages yet
            console.log('[LeadModal] No conversation found for lead:', lead.id);
            setIsLoadingMessages(false);
            return;
          }
        } catch (apiError) {
          // API not available, fall back to Supabase
          console.log('[LeadModal] API not available, falling back to Supabase');
        }

        // Fallback: Direct Supabase query
        const { data: convData, error: convError } = await supabase
          .schema(SCHEMA)
          .from('conversations')
          .select('*')
          .eq('lead_id', lead.id)
          .single();

        if (convError) {
          // Check for schema-related errors (Requirements 7.4)
          if (convError.message?.toLowerCase().includes('schema') || 
              convError.code === 'PGRST116') {
            console.error('[LeadModal] Schema error:', convError);
            setErrorMessage('Erro de configuração do banco de dados. Verifique o schema.');
          } else if (convError.code !== 'PGRST116') {
            // PGRST116 is "no rows returned" - not an error for us
            console.error('[LeadModal] Error fetching conversation:', convError);
          }
          setIsLoadingMessages(false);
          return;
        }

        if (!convData) {
          console.log('[LeadModal] No conversation found for lead:', lead.id);
          setIsLoadingMessages(false);
          return;
        }

        setConversationId(convData.id);

        // Fetch messages
        const { data: msgData, error: msgError } = await supabase
          .schema(SCHEMA)
          .from('messages')
          .select('*')
          .eq('conversation_id', convData.id)
          .order('created_at', { ascending: true });

        if (msgError) {
          console.error('[LeadModal] Error fetching messages:', msgError);
          // Check for schema-related errors (Requirements 7.4)
          if (msgError.message?.toLowerCase().includes('schema')) {
            setErrorMessage('Erro ao carregar mensagens. Verifique a configuração do banco.');
          } else {
            setErrorMessage('Erro ao carregar mensagens. Tente novamente.');
          }
        } else if (msgData) {
          setMessages(msgData);
        }
      } catch (error) {
        console.error('[LeadModal] Unexpected error fetching messages:', error);
        setErrorMessage('Erro inesperado ao carregar mensagens.');
      } finally {
        setIsLoadingMessages(false);
      }
    };

    fetchConversationAndMessages();
  }, [isOpen, lead?.id, supabase]);


  // Realtime subscription for new messages (Requirements 2.5)
  React.useEffect(() => {
    if (!isOpen || !conversationId) {
      setRealtimeStatus('disconnected');
      return;
    }

    let pollingInterval: NodeJS.Timeout | null = null;
    let isSubscribed = true;

    // Polling fallback function - used when realtime fails
    const pollForMessages = async () => {
      if (!isSubscribed || !conversationId) return;
      
      try {
        const { data: msgData, error } = await supabase
          .schema(SCHEMA)
          .from('messages')
          .select('*')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true });

        if (!error && msgData && isSubscribed) {
          setMessages(msgData);
        }
      } catch (err) {
        console.error('[LeadModal] Polling error:', err);
      }
    };

    // Start polling fallback (will be cleared if realtime connects successfully)
    const startPollingFallback = () => {
      if (pollingInterval) clearInterval(pollingInterval);
      pollingInterval = setInterval(pollForMessages, 5000); // Poll every 5 seconds
      console.log('[LeadModal] Started polling fallback for messages');
    };

    setRealtimeStatus('connecting');

    const channel = supabase
      .channel(`realtime:messages:modal:${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: SCHEMA,
        table: 'messages'
      }, (payload) => {
        const newMsg = payload.new as Message;
        console.log('[LeadModal] New message received:', newMsg);

        // Only add messages for this conversation
        if (newMsg.conversation_id === conversationId) {
          setMessages((prev) => {
            // Avoid duplicates
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: SCHEMA,
        table: 'messages'
      }, (payload) => {
        const updatedMsg = payload.new as Message;
        if (updatedMsg.conversation_id === conversationId) {
          setMessages((prev) =>
            prev.map(m => m.id === updatedMsg.id ? updatedMsg : m)
          );
        }
      })
      .subscribe((status, err) => {
        console.log('[LeadModal] Realtime subscription status:', status, err);
        
        if (status === 'SUBSCRIBED') {
          setRealtimeStatus('connected');
          // Clear polling if realtime is working
          if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
            console.log('[LeadModal] Realtime connected, stopped polling fallback');
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[LeadModal] Realtime subscription error:', err);
          setRealtimeStatus('error');
          // Start polling fallback on error
          startPollingFallback();
        } else if (status === 'CLOSED') {
          setRealtimeStatus('disconnected');
        }
      });

    return () => {
      isSubscribed = false;
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
      supabase.removeChannel(channel);
      setRealtimeStatus('disconnected');
    };
  }, [isOpen, conversationId, supabase]);

  // Handle click outside to close modal (Requirements 4.5)
  const handleOverlayClick = React.useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  // Handle escape key to close modal
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open
  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Don't render if not open or no lead
  if (!isOpen || !lead) {
    return null;
  }

  return (
    <div
      className={cn(
        // Modal overlay with backdrop blur
        'fixed inset-0 z-[60] flex items-center justify-center',
        'bg-black/50 backdrop-blur-sm',
        'animate-in fade-in duration-200',
        'pb-20 md:pb-24' // Space for bottom navigation
      )}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="lead-modal-title"
    >
      {/* Modal content container with glassmorphism */}
      <div
        ref={modalRef}
        className={cn(
          // Size and layout
          'w-full max-w-2xl max-h-[calc(100vh-120px)] overflow-hidden',
          'mx-4 flex flex-col',
          // Glassmorphism styling
          'bg-white/95 backdrop-blur-xl',
          'rounded-2xl',
          'border border-white/20',
          'shadow-2xl',
          // Animation
          'animate-in zoom-in-95 duration-200',
          className
        )}
      >
        {/* Modal Header - Lead Details Section */}
        <div className="flex items-start justify-between p-5 border-b border-black/5">
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-emerald-500/25">
              {(lead.full_name || lead.phone || 'L')[0].toUpperCase()}
            </div>
            <div className="space-y-1">
              {/* Name - Requirements 4.1 */}
              <h2
                id="lead-modal-title"
                className="text-xl font-bold text-gray-900"
              >
                {lead.full_name || lead.phone || 'Lead'}
              </h2>
              {/* Contact Info - Requirements 4.1 */}
              <div className="flex items-center gap-3 text-sm text-gray-500">
                {lead.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5" />
                    {lead.phone}
                  </span>
                )}
                {lead.email && (
                  <span className="flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5" />
                    {lead.email}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className={cn(
              'p-2 rounded-xl',
              'text-gray-400 hover:text-gray-600',
              'bg-white/50 hover:bg-white/80',
              'backdrop-blur-sm',
              'border border-white/20',
              'transition-all duration-200',
              'focus:outline-none focus:ring-2 focus:ring-emerald-500/50'
            )}
            aria-label="Fechar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>


        {/* Lead Info Grid - Requirements 4.1, 4.2, 4.3 */}
        <div className="p-5 border-b border-black/5 bg-gray-50/50">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {/* Status - Requirements 4.1 */}
            <div className="space-y-1.5">
              <span className="text-xs text-gray-500 uppercase tracking-wide font-medium">Status</span>
              <StatusBadge status={lead.status} />
            </div>

            {/* Interesse - Requirements 5.3, 10.3 */}
            <div className="space-y-1.5">
              <span className="text-xs text-gray-500 uppercase tracking-wide font-medium">Interesse</span>
              {lead.interest_type ? (
                <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-200 font-medium">
                  {formatInterestType(lead.interest_type, { withEmoji: true })}
                </Badge>
              ) : (
                <span className="text-sm text-gray-400">-</span>
              )}
            </div>

            {/* Sentiment - Requirements 4.3 */}
            <div className="space-y-1.5">
              <span className="text-xs text-gray-500 uppercase tracking-wide font-medium">Sentimento</span>
              <SentimentDisplay score={lead.sentiment_score ?? 0} />
            </div>

            {/* Platform - Requirements 4.2 */}
            <div className="space-y-1.5">
              <span className="text-xs text-gray-500 uppercase tracking-wide font-medium">Plataforma</span>
              <PlatformIndicator platform={lead.platform} source={lead.source} />
            </div>

            {/* Created Date */}
            <div className="space-y-1.5">
              <span className="text-xs text-gray-500 uppercase tracking-wide font-medium">Criado em</span>
              <span className="text-sm font-medium text-gray-700">
                {lead.created_at
                  ? new Date(lead.created_at).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                    })
                  : '-'}
              </span>
            </div>
          </div>
        </div>

        {/* Tags e Classificação Section - Requirements 10.1, 10.2, 10.3, 2.4, 2.5 */}
        {(() => {
          const tagsList = parseTags(lead.tags);
          const adjList = parseTags(lead.adjectives);
          return (
            <div className="p-5 border-b border-black/5">
              <div className="flex items-center gap-2 mb-3">
                <Tag className="w-4 h-4 text-gray-500" />
                <span className="text-xs text-gray-500 uppercase tracking-wide font-medium">Tags e Classificação</span>
              </div>
              {tagsList.length === 0 && adjList.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-4 text-gray-400">
                  <p className="text-sm">Nenhuma tag gerada pela IA ainda</p>
                </div>
              ) : (
                <>
                  {tagsList.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {tagsList.map((tag, i) => (
                        <Badge key={`tag-${i}`} variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs font-medium">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {adjList.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {adjList.map((adj, i) => (
                        <span key={`adj-${i}`} className="inline-flex items-center px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200 text-xs font-medium">
                          {adj}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })()}

        {/* Notes Section - Requirements 4.4 */}
        {lead.notes && (
          <div className="p-5 border-b border-black/5">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-gray-500" />
              <span className="text-xs text-gray-500 uppercase tracking-wide font-medium">Notas</span>
            </div>
            <div className="p-3 rounded-xl bg-white/70 border border-gray-100">
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{lead.notes}</p>
            </div>
          </div>
        )}

        {/* Messages Section - Requirements 2.2, 2.5 */}
        <div className="flex-1 overflow-y-auto">
          {/* Realtime Status Indicator - Requirements 2.5 */}
          {conversationId && (
            <div className="px-4 pt-2 flex items-center justify-between">
              <span className="text-xs text-gray-500 uppercase tracking-wide font-medium flex items-center gap-2">
                <MessageCircle className="w-3.5 h-3.5" />
                Mensagens
              </span>
              <div className="flex items-center gap-1.5">
                <div
                  className={cn(
                    'w-2 h-2 rounded-full',
                    realtimeStatus === 'connected' && 'bg-green-500',
                    realtimeStatus === 'connecting' && 'bg-yellow-500 animate-pulse',
                    realtimeStatus === 'error' && 'bg-red-500',
                    realtimeStatus === 'disconnected' && 'bg-gray-400'
                  )}
                />
                <span className="text-[10px] text-gray-400">
                  {realtimeStatus === 'connected' && 'Ao vivo'}
                  {realtimeStatus === 'connecting' && 'Conectando...'}
                  {realtimeStatus === 'error' && 'Modo offline'}
                  {realtimeStatus === 'disconnected' && 'Desconectado'}
                </span>
              </div>
            </div>
          )}
          {children ? (
            children
          ) : (
            <MessageList 
              messages={messages} 
              isLoading={isLoadingMessages} 
              errorMessage={errorMessage}
              onRetry={() => {
                // Trigger re-fetch by toggling a state
                setErrorMessage(null);
                setIsLoadingMessages(true);
                // The useEffect will re-run when isLoadingMessages changes
                setTimeout(() => {
                  // Force re-fetch
                  setConversationId(null);
                }, 100);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default LeadModal;
