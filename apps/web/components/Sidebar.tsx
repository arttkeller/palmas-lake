
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, MessageSquare, Users, BarChart3, Settings, LogOut, Calendar } from 'lucide-react';
import clsx from 'clsx';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

const navigation = [
    { name: 'Quadro', href: '/dashboard/quadro', icon: LayoutDashboard },
    { name: 'Conversas', href: '/dashboard/chat', icon: MessageSquare },
    { name: 'Leads', href: '/dashboard/leads', icon: Users },
    { name: 'Agendamentos', href: '/dashboard/agendamentos', icon: Calendar },
    { name: 'Análise', href: '/dashboard/analytics', icon: BarChart3 },
    { name: 'Configurações', href: '/dashboard/settings', icon: Settings },
];

export function Sidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const supabase = createClient();

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        router.push('/login');
    };

    return (
        <div className="flex h-full w-64 flex-col bg-slate-900 text-white">
            <div className="flex h-16 items-center px-6">
                <h1 className="text-xl font-bold tracking-wider text-emerald-400">
                    Palmas Lake
                </h1>
            </div>
            <nav className="flex-1 space-y-1 px-4 py-4">
                {navigation.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={clsx(
                                isActive
                                    ? 'bg-slate-800 text-emerald-400'
                                    : 'text-slate-400 hover:bg-slate-800 hover:text-white',
                                'group flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors'
                            )}
                        >
                            <item.icon
                                className={clsx(
                                    isActive ? 'text-emerald-400' : 'text-slate-500 group-hover:text-white',
                                    'mr-3 h-5 w-5 flex-shrink-0'
                                )}
                                aria-hidden="true"
                            />
                            {item.name}
                        </Link>
                    );
                })}
            </nav>
            <div className="border-t border-slate-800 p-4">
                <button
                    onClick={handleSignOut}
                    className="group flex w-full items-center rounded-md px-3 py-2 text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white"
                >
                    <LogOut className="mr-3 h-5 w-5 text-slate-500 group-hover:text-white" />
                    Sair
                </button>
            </div>
        </div>
    );
}
