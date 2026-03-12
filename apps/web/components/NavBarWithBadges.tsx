'use client';

import { useMemo } from 'react';
import { BottomNavBar } from '@/components/ui/bottom-nav-bar';
import { useNotifications } from '@/hooks/useNotifications';
import { useAuth } from '@/lib/auth-context';
import { navigationItems } from '@/lib/navigation-config';

export function NavBarWithBadges() {
    const { pendingCount } = useNotifications();
    const { isAdmin } = useAuth();

    const filteredItems = useMemo(
        () => navigationItems.filter(item => !item.adminOnly || isAdmin),
        [isAdmin]
    );

    return <BottomNavBar items={filteredItems} badgeCounts={{ notificacoes: pendingCount }} />;
}
