'use client';

import { BottomNavBar } from '@/components/ui/bottom-nav-bar';
import { useNotifications } from '@/hooks/useNotifications';

export function NavBarWithBadges() {
    const { pendingCount } = useNotifications();
    return <BottomNavBar badgeCounts={{ notificacoes: pendingCount }} />;
}
