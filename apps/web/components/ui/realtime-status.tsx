'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RealtimeStatusIndicatorProps {
    className?: string;
    showLabel?: boolean;
}

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

/**
 * Componente visual que mostra o status da conexão Realtime
 */
export function RealtimeStatusIndicator({
    className,
    showLabel = true
}: RealtimeStatusIndicatorProps) {
    const [status, setStatus] = useState<ConnectionStatus>('connecting');
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

    useEffect(() => {
        const supabase = createClient();

        // Canal de heartbeat para monitorar conexão
        const channel = supabase.channel('realtime:health-check')
            .on('system', { event: '*' }, () => {
                setStatus('connected');
            })
            .subscribe((subscriptionStatus) => {
                if (subscriptionStatus === 'SUBSCRIBED') {
                    setStatus('connected');
                    setLastUpdate(new Date());
                } else if (subscriptionStatus === 'CHANNEL_ERROR') {
                    setStatus('error');
                } else if (subscriptionStatus === 'CLOSED') {
                    setStatus('disconnected');
                } else {
                    setStatus('connecting');
                }
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const statusConfig = {
        connecting: {
            color: 'bg-yellow-500',
            icon: RefreshCw,
            label: 'Conectando...',
            animate: true
        },
        connected: {
            color: 'bg-emerald-500',
            icon: Wifi,
            label: 'Tempo Real',
            animate: false
        },
        disconnected: {
            color: 'bg-gray-400',
            icon: WifiOff,
            label: 'Desconectado',
            animate: false
        },
        error: {
            color: 'bg-red-500',
            icon: WifiOff,
            label: 'Erro',
            animate: false
        }
    };

    const config = statusConfig[status];
    const Icon = config.icon;

    return (
        <div
            className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium',
                'bg-white/80 dark:bg-neutral-800/80 backdrop-blur-sm',
                'border border-gray-200 dark:border-neutral-700',
                'shadow-sm',
                className
            )}
            title={lastUpdate ? `Última atualização: ${lastUpdate.toLocaleTimeString('pt-BR')}` : 'Aguardando conexão'}
        >
            <span className="relative flex h-2 w-2">
                {config.animate && (
                    <span className={cn(
                        'animate-ping absolute inline-flex h-full w-full rounded-full opacity-75',
                        config.color
                    )} />
                )}
                <span className={cn(
                    'relative inline-flex rounded-full h-2 w-2',
                    config.color
                )} />
            </span>

            <Icon className={cn(
                'w-3.5 h-3.5',
                status === 'connected' ? 'text-emerald-600' : 'text-gray-500',
                config.animate && 'animate-spin'
            )} />

            {showLabel && (
                <span className={cn(
                    status === 'connected' ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-600 dark:text-gray-400'
                )}>
                    {config.label}
                </span>
            )}
        </div>
    );
}
