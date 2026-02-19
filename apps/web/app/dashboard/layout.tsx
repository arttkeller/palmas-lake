'use client';

import { BottomNavBar } from '@/components/ui/bottom-nav-bar';
import { AISpecialistDock } from '@/components/ui/ai-specialist-dock';
import { DashboardSkeleton } from '@/components/ui/skeleton-loaders';
import { SuspensePageTransition } from '@/components/ui/page-transition';
import { AuthProvider } from '@/lib/auth-context';
import { usePathname } from 'next/navigation';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();

    return (
        <AuthProvider>
            <div className="h-dvh flex flex-col bg-background">
                <main className="flex-1 min-h-0 w-full overflow-y-auto p-4 md:p-8 pb-20 md:pb-24">
                    <SuspensePageTransition
                        key={pathname}
                        fallback={<DashboardSkeleton layout="default" />}
                        animationDuration={250}
                        className="h-full"
                    >
                        {children}
                    </SuspensePageTransition>
                </main>

                {/* AI Specialist Dock - positioned above bottom navigation */}
                <AISpecialistDock bottomOffset={80} />

                {/* Bottom Navigation Bar */}
                <BottomNavBar />
            </div>
        </AuthProvider>
    );
}
