'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import { apiFetch } from '@/lib/api-fetch';
import type { Message } from '@/types/chat';

export interface UseLeadConversationReturn {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  realtimeStatus: 'connecting' | 'connected' | 'error' | 'disconnected';
  retry: () => void;
}

const SCHEMA = 'palmaslake-agno';

/**
 * Hook for fetching and subscribing to a lead's conversation messages.
 * Extracted from LeadModal — provides API-first fetch with Supabase fallback,
 * realtime subscription with polling fallback.
 */
export function useLeadConversation(
  leadId: string | null,
  enabled: boolean
): UseLeadConversationReturn {
  const supabase = createClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<UseLeadConversationReturn['realtimeStatus']>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const retry = useCallback(() => {
    setError(null);
    setConversationId(null);
    setRetryCount(c => c + 1);
  }, []);

  // Fetch conversation and messages
  useEffect(() => {
    if (!enabled || !leadId) {
      setMessages([]);
      setConversationId(null);
      setError(null);
      return;
    }

    let cancelled = false;

    const fetchConversationAndMessages = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Try API first
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);

        try {
          const convRes = await apiFetch(`/api/chat/conversations/by-lead/${leadId}`, {
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (convRes.ok) {
            const convData = await convRes.json();
            if (cancelled) return;
            setConversationId(convData.id);

            const msgRes = await apiFetch(`/api/chat/messages/${convData.id}`);
            if (msgRes.ok) {
              const msgData = await msgRes.json();
              if (!cancelled) {
                setMessages(msgData);
                setIsLoading(false);
              }
              return;
            }
          } else if (convRes.status === 404) {
            // No conversation — not an error
            if (!cancelled) setIsLoading(false);
            return;
          }
        } catch {
          // API not available, fall back to Supabase
        }

        // Fallback: Direct Supabase query
        const { data: convData, error: convError } = await supabase
          .schema(SCHEMA)
          .from('conversations')
          .select('*')
          .eq('lead_id', leadId)
          .single();

        if (convError) {
          if (convError.code !== 'PGRST116') {
            // PGRST116 = no rows — not an error for us
            if (!cancelled) {
              if (convError.message?.toLowerCase().includes('schema')) {
                setError('Erro de configuracao do banco de dados.');
              }
            }
          }
          if (!cancelled) setIsLoading(false);
          return;
        }

        if (!convData) {
          if (!cancelled) setIsLoading(false);
          return;
        }

        if (!cancelled) setConversationId(convData.id);

        const { data: msgData, error: msgError } = await supabase
          .schema(SCHEMA)
          .from('messages')
          .select('*')
          .eq('conversation_id', convData.id)
          .order('created_at', { ascending: true });

        if (!cancelled) {
          if (msgError) {
            setError('Erro ao carregar mensagens. Tente novamente.');
          } else if (msgData) {
            setMessages(msgData);
          }
        }
      } catch {
        if (!cancelled) {
          setError('Erro inesperado ao carregar mensagens.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchConversationAndMessages();

    return () => {
      cancelled = true;
    };
  }, [enabled, leadId, supabase, retryCount]);

  // Realtime subscription
  useEffect(() => {
    if (!enabled || !conversationId) {
      setRealtimeStatus('disconnected');
      return;
    }

    let pollingInterval: ReturnType<typeof setInterval> | null = null;
    let isSubscribed = true;

    const pollForMessages = async () => {
      if (!isSubscribed || !conversationId) return;
      try {
        const { data, error: pollErr } = await supabase
          .schema(SCHEMA)
          .from('messages')
          .select('*')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true });

        if (!pollErr && data && isSubscribed) {
          setMessages(data);
        }
      } catch {
        // ignore polling errors
      }
    };

    const startPollingFallback = () => {
      if (pollingInterval) clearInterval(pollingInterval);
      pollingInterval = setInterval(pollForMessages, 5000);
    };

    setRealtimeStatus('connecting');

    const channel = supabase
      .channel(`realtime:messages:modal:${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: SCHEMA,
        table: 'messages',
      }, (payload) => {
        const newMsg = payload.new as Message;
        if (newMsg.conversation_id === conversationId) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: SCHEMA,
        table: 'messages',
      }, (payload) => {
        const updatedMsg = payload.new as Message;
        if (updatedMsg.conversation_id === conversationId) {
          setMessages((prev) =>
            prev.map((m) => (m.id === updatedMsg.id ? updatedMsg : m))
          );
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setRealtimeStatus('connected');
          if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setRealtimeStatus('error');
          startPollingFallback();
        } else if (status === 'CLOSED') {
          setRealtimeStatus('disconnected');
        }
      });

    return () => {
      isSubscribed = false;
      if (pollingInterval) clearInterval(pollingInterval);
      supabase.removeChannel(channel);
      setRealtimeStatus('disconnected');
    };
  }, [enabled, conversationId, supabase]);

  return { messages, isLoading, error, realtimeStatus, retry };
}
