'use client';

import { Suspense } from 'react';
import { BottomNavBar } from '@/components/ui/bottom-nav-bar';
import { AISpecialistDock } from '@/components/ui/ai-specialist-dock';
import { DashboardSkeleton } from '@/components/ui/skeleton-loaders';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-background">
            <main className="w-full overflow-y-auto p-4 md:p-8 pb-32 md:pb-36">
                <Suspense fallback={<DashboardSkeleton layout="default" />}>
                    <div className="animate-in fade-in duration-300">
                        {children}
                    </div>
                </Suspense>
            </main>
            
            {/* AI Specialist Dock - positioned above bottom navigation */}
            <AISpecialistDock bottomOffset={80} />
            
            {/* Bottom Navigation Bar */}
            <BottomNavBar />
        </div>
    );
}
