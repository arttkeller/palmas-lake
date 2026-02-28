'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, Clock, ArrowRight, UserPlus } from 'lucide-react';
import { useNotifications, type Notification } from '@/hooks/useNotifications';
import { GlassmorphismCard } from '@/components/ui/glassmorphism-card';
import { cn } from '@/lib/utils';

function timeAgo(dateStr: string): string {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'agora';
    if (diffMin < 60) return `há ${diffMin}min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `há ${diffH}h`;
    const diffD = Math.floor(diffH / 24);
    return `há ${diffD}d`;
}

export default function NotificacoesPage() {
    const router = useRouter();
    const { notifications, loading, markAsRead } = useNotifications();
    const [filter, setFilter] = useState<'all' | 'pending'>('all');

    const filtered = filter === 'pending'
        ? notifications.filter(n => n.status === 'pending')
        : notifications;

    const handleClick = async (notification: Notification) => {
        if (notification.status === 'pending') {
            await markAsRead(notification.id);
        }
        router.push(`/dashboard/quadro?leadId=${notification.lead_id}`);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Alertas</h1>
                <div className="flex gap-2">
                    <button
                        onClick={() => setFilter('all')}
                        className={cn(
                            'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                            filter === 'all'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        )}
                    >
                        Todos
                    </button>
                    <button
                        onClick={() => setFilter('pending')}
                        className={cn(
                            'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                            filter === 'pending'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        )}
                    >
                        Pendentes
                    </button>
                </div>
            </div>

            {filtered.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                    <Bell className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>{filter === 'pending' ? 'Nenhum alerta pendente' : 'Nenhum alerta ainda'}</p>
                </div>
            ) : (
                <AnimatePresence mode="popLayout">
                    {filtered.map((n) => (
                        <motion.div
                            key={n.id}
                            layout
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                        >
                            <GlassmorphismCard
                                onClick={() => handleClick(n)}
                                className={cn(
                                    'p-4 cursor-pointer transition-all hover:scale-[1.01]',
                                    n.status === 'pending'
                                        ? 'border-l-4 border-l-yellow-500 bg-yellow-500/5'
                                        : n.status === 'read'
                                        ? 'border-l-4 border-l-blue-500/30 opacity-80'
                                        : 'border-l-4 border-l-green-500/30 opacity-60'
                                )}
                            >
                                <div className="flex items-start gap-3">
                                    <div className={cn(
                                        'mt-0.5 p-2 rounded-full',
                                        n.type === 'transfer'
                                            ? 'bg-blue-500/10 text-blue-500'
                                            : 'bg-yellow-500/10 text-yellow-500'
                                    )}>
                                        {n.type === 'transfer'
                                            ? <UserPlus className="h-4 w-4" />
                                            : <Clock className="h-4 w-4" />
                                        }
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className={cn(
                                                'text-sm font-semibold truncate',
                                                n.status === 'pending' ? 'text-foreground' : 'text-muted-foreground'
                                            )}>
                                                {n.title}
                                            </p>
                                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                                                {timeAgo(n.created_at)}
                                            </span>
                                        </div>
                                        {n.body && (
                                            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                                {n.body}
                                            </p>
                                        )}
                                        <div className="flex items-center gap-2 mt-2">
                                            {n.status === 'pending' && (
                                                <span className="text-xs bg-yellow-500/10 text-yellow-600 px-2 py-0.5 rounded-full font-medium">
                                                    Pendente
                                                </span>
                                            )}
                                            {n.status === 'responded' && n.responded_at && (
                                                <span className="text-xs bg-green-500/10 text-green-600 px-2 py-0.5 rounded-full font-medium">
                                                    Respondido
                                                </span>
                                            )}
                                            <span className="text-xs text-muted-foreground flex items-center gap-1 ml-auto">
                                                Abrir conversa <ArrowRight className="h-3 w-3" />
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </GlassmorphismCard>
                        </motion.div>
                    ))}
                </AnimatePresence>
            )}
        </div>
    );
}
