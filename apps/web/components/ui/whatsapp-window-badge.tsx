'use client';

import { Clock, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWhatsAppWindow } from '@/hooks/useWhatsAppWindow';

interface WhatsAppWindowBadgeProps {
    lastInteractionAt?: string | null;
    variant?: 'compact' | 'full';
    className?: string;
}

export function WhatsAppWindowBadge({
    lastInteractionAt,
    variant = 'compact',
    className,
}: WhatsAppWindowBadgeProps) {
    const { isOpen, timeRemaining } = useWhatsAppWindow(lastInteractionAt);

    if (!lastInteractionAt) return null;

    if (isOpen && timeRemaining) {
        return (
            <div
                className={cn(
                    'inline-flex items-center gap-1 rounded-full font-mono font-medium',
                    variant === 'compact'
                        ? 'px-2 py-0.5 text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'px-3 py-1 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200',
                    className
                )}
                title="Janela de 24h aberta — você pode enviar mensagens livremente"
            >
                <Clock className={cn('shrink-0', variant === 'compact' ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5')} />
                {variant === 'compact' ? (
                    <span>{timeRemaining}</span>
                ) : (
                    <span>Janela aberta: {timeRemaining}</span>
                )}
            </div>
        );
    }

    return (
        <div
            className={cn(
                'inline-flex items-center gap-1 rounded-full font-medium',
                variant === 'compact'
                    ? 'px-2 py-0.5 text-[10px] bg-red-50 text-red-600 border border-red-200'
                    : 'px-3 py-1 text-xs bg-red-50 text-red-600 border border-red-200',
                className
            )}
            title="Janela de 24h encerrada — use um template aprovado pela Meta para retomar a conversa"
        >
            <Lock className={cn('shrink-0', variant === 'compact' ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5')} />
            {variant === 'compact' ? (
                <span>Janela Fechada</span>
            ) : (
                <span>Janela Fechada — use template</span>
            )}
        </div>
    );
}
