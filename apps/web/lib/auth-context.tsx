'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase';
import { apiFetch } from '@/lib/api-fetch';
import type { User } from '@supabase/supabase-js';

interface CrmUser {
    id: string;
    email: string;
    full_name: string;
    role: 'admin' | 'user';
    created_at: string | null;
    updated_at: string | null;
}

interface AuthContextType {
    /** Supabase auth user */
    user: User | null;
    /** CRM user profile with role */
    crmUser: CrmUser | null;
    /** Shorthand: true if role === 'admin' */
    isAdmin: boolean;
    /** True while loading auth state */
    loading: boolean;
    /** Refresh the CRM user data */
    refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    crmUser: null,
    isAdmin: false,
    loading: true,
    refreshUser: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [crmUser, setCrmUser] = useState<CrmUser | null>(null);
    const [loading, setLoading] = useState(true);
    const [supabase] = useState(() => createClient());
    const initializedRef = useRef(false);

    const fetchCrmUser = useCallback(async (authUser: User) => {
        const fallback: CrmUser = {
            id: authUser.id,
            email: authUser.email || '',
            full_name: '',
            role: 'user',
            created_at: null,
            updated_at: null,
        };
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            const res = await apiFetch(`/api/users/me`, {
                signal: controller.signal,
                headers: {
                    'x-user-id': authUser.id,
                },
            });
            clearTimeout(timeoutId);
            if (res.ok) {
                const data = await res.json();
                setCrmUser(data);
            } else {
                setCrmUser(fallback);
            }
        } catch (err) {
            console.error('[AuthContext] Error fetching CRM user:', err);
            setCrmUser(fallback);
        }
    }, []);

    const refreshUser = useCallback(async () => {
        if (user) {
            await fetchCrmUser(user);
        }
    }, [user, fetchCrmUser]);

    useEffect(() => {
        initializedRef.current = false;

        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (_event, session) => {
                const authUser = session?.user ?? null;
                setUser(authUser);
                if (authUser && !initializedRef.current) {
                    initializedRef.current = true;
                    await fetchCrmUser(authUser);
                } else if (!authUser) {
                    setCrmUser(null);
                }
                setLoading(false);
            }
        );

        const init = async () => {
            try {
                const { data: { user: authUser } } = await supabase.auth.getUser();
                setUser(authUser);
                if (authUser && !initializedRef.current) {
                    initializedRef.current = true;
                    await fetchCrmUser(authUser);
                }
            } catch (err) {
                console.error('[AuthContext] init error:', err);
            } finally {
                setLoading(false);
            }
        };
        init();

        return () => subscription.unsubscribe();
    }, [supabase, fetchCrmUser]);

    return (
        <AuthContext.Provider
            value={{
                user,
                crmUser,
                isAdmin: crmUser?.role === 'admin',
                loading,
                refreshUser,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
