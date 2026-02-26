'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

const SCHEMA = 'palmaslake-agno';

export interface Notification {
    id: string;
    seller_id: string;
    lead_id: string;
    type: 'transfer' | 'follow_up';
    title: string;
    body: string | null;
    status: 'pending' | 'read' | 'responded';
    read_at: string | null;
    responded_at: string | null;
    metadata: Record<string, any>;
    created_at: string;
}

export function useNotifications() {
    const supabase = createClient();
    const { user } = useAuth();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [pendingCount, setPendingCount] = useState(0);
    const [loading, setLoading] = useState(true);

    const fetchNotifications = useCallback(async () => {
        if (!user?.id) return;
        try {
            const { data } = await supabase
                .from('notifications')
                .select('*')
                .eq('seller_id', user.id)
                .order('created_at', { ascending: false })
                .limit(50);

            if (data) {
                setNotifications(data as Notification[]);
                setPendingCount(data.filter((n: any) => n.status === 'pending').length);
            }
        } catch (err) {
            console.error('[Notifications] Fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, [user?.id, supabase]);

    const markAsRead = useCallback(async (notificationId: string) => {
        try {
            await supabase
                .from('notifications')
                .update({ status: 'read', read_at: new Date().toISOString() })
                .eq('id', notificationId)
                .eq('status', 'pending');

            setNotifications(prev =>
                prev.map(n =>
                    n.id === notificationId && n.status === 'pending'
                        ? { ...n, status: 'read' as const, read_at: new Date().toISOString() }
                        : n
                )
            );
            setPendingCount(prev => Math.max(0, prev - 1));
        } catch (err) {
            console.error('[Notifications] Mark read error:', err);
        }
    }, [supabase]);

    // Fetch inicial
    useEffect(() => {
        fetchNotifications();
    }, [fetchNotifications]);

    // Realtime subscription
    useEffect(() => {
        if (!user?.id) return;

        const channel = supabase
            .channel(`notifications:${user.id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: SCHEMA,
                table: 'notifications',
                filter: `seller_id=eq.${user.id}`
            }, (payload) => {
                const newNotification = payload.new as Notification;
                setNotifications(prev => [newNotification, ...prev]);
                setPendingCount(prev => prev + 1);
            })
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: SCHEMA,
                table: 'notifications',
                filter: `seller_id=eq.${user.id}`
            }, (payload) => {
                const updated = payload.new as Notification;
                setNotifications(prev => {
                    const newList = prev.map(n => n.id === updated.id ? updated : n);
                    setPendingCount(newList.filter(n => n.status === 'pending').length);
                    return newList;
                });
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user?.id, supabase]);

    return {
        notifications,
        pendingCount,
        loading,
        markAsRead,
        refetch: fetchNotifications
    };
}
