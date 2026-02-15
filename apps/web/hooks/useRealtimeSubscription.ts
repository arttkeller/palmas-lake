'use client';

import { useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

// Schema padrão do projeto Palmas Lake
const SCHEMA = 'palmaslake-agno';

type PostgresChangeEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

interface SubscriptionConfig {
    table: string;
    event?: PostgresChangeEvent;
    filter?: string;
    schema?: string;
}

interface UseRealtimeSubscriptionOptions {
    subscriptions: SubscriptionConfig[];
    onMessage: (payload: RealtimePostgresChangesPayload<any>) => void;
    enabled?: boolean;
    channelName?: string;
}

/**
 * Hook para subscription de Realtime do Supabase
 * 
 * @example
 * useRealtimeSubscription({
 *   subscriptions: [
 *     { table: 'messages', event: 'INSERT' },
 *     { table: 'leads', event: '*' }
 *   ],
 *   onMessage: (payload) => {
 *     console.log('Received:', payload);
 *     refetchData();
 *   }
 * });
 */
export function useRealtimeSubscription({
    subscriptions,
    onMessage,
    enabled = true,
    channelName
}: UseRealtimeSubscriptionOptions) {
    const channelRef = useRef<RealtimeChannel | null>(null);
    const supabase = createClient();

    // Gerar nome único do canal baseado nas tabelas
    const generatedChannelName = channelName ||
        `realtime:${subscriptions.map(s => s.table).join('-')}:${Date.now()}`;

    const handleChange = useCallback((payload: RealtimePostgresChangesPayload<any>) => {
        onMessage(payload);
    }, [onMessage]);

    useEffect(() => {
        if (!enabled) return;

        // Criar canal com todas as subscriptions
        const channel = supabase.channel(generatedChannelName);

        // Adicionar cada subscription ao canal
        subscriptions.forEach(({ table, event = '*', filter, schema = SCHEMA }) => {
            const config: any = {
                event,
                schema,
                table
            };

            if (filter) {
                config.filter = filter;
            }

            channel.on('postgres_changes', config, handleChange);
        });

        channel.subscribe((status) => {
            if (status === 'CHANNEL_ERROR') {
                console.error('[Realtime] Channel error - check RLS and replication settings');
            }
        });

        channelRef.current = channel;

        // Cleanup ao desmontar
        return () => {
            supabase.removeChannel(channel);
            channelRef.current = null;
        };
    }, [enabled, generatedChannelName, subscriptions, handleChange, supabase]);

    return {
        channel: channelRef.current,
        isConnected: channelRef.current?.state === 'joined'
    };
}

/**
 * Hook simplificado para uma única tabela
 */
export function useTableRealtime(
    table: string,
    onMessage: (payload: RealtimePostgresChangesPayload<any>) => void,
    options?: {
        event?: PostgresChangeEvent;
        filter?: string;
        enabled?: boolean;
    }
) {
    return useRealtimeSubscription({
        subscriptions: [{
            table,
            event: options?.event || '*',
            filter: options?.filter
        }],
        onMessage,
        enabled: options?.enabled ?? true
    });
}
