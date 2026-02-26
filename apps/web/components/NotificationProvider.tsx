'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Toaster, toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import { createClient } from '@/lib/supabase';
import type { Notification } from '@/hooks/useNotifications';

const SCHEMA = 'palmaslake-agno';

export function NotificationProvider({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const { user } = useAuth();
    const supabase = createClient();

    // Listener separado apenas para toasts (INSERT)
    useEffect(() => {
        if (!user?.id) return;

        const channel = supabase
            .channel(`notification-toasts:${user.id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: SCHEMA,
                table: 'notifications',
                filter: `seller_id=eq.${user.id}`
            }, (payload) => {
                const n = payload.new as Notification;
                const icon = n.type === 'transfer' ? '🔔' : '⏰';

                toast(n.title, {
                    description: n.body ? n.body.slice(0, 100) + (n.body.length > 100 ? '...' : '') : undefined,
                    icon,
                    duration: 10000,
                    action: {
                        label: 'Abrir',
                        onClick: () => router.push(`/dashboard/quadro?leadId=${n.lead_id}`)
                    }
                });
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user?.id, supabase, router]);

    return (
        <>
            <Toaster
                position="top-center"
                richColors
                closeButton
                toastOptions={{
                    style: {
                        background: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        color: 'hsl(var(--foreground))'
                    }
                }}
            />
            {children}
        </>
    );
}
