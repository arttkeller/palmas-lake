'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase';
import { API_BASE_URL } from '@/lib/api-config';
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

    // IMPORTANT: Uses fetch() directly instead of apiFetch() to avoid deadlock.
    // apiFetch calls getSession() which awaits initializePromise internally.
    // When called from onAuthStateChange (during Supabase auth initialization),
    // initializePromise hasn't resolved yet → circular await → infinite hang.
    const fetchCrmUser = useCallback(async (authUser: User, accessToken?: string) => {
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
            const headers: Record<string, string> = {
                'x-user-id': authUser.id,
            };
            if (accessToken) {
                headers['Authorization'] = `Bearer ${accessToken}`;
            }
            const res = await fetch(`${API_BASE_URL}/api/users/me`, {
                signal: controller.signal,
                headers,
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
            // refreshUser is called outside of auth init, so getSession() is safe here
            const { data: { session } } = await supabase.auth.getSession();
            await fetchCrmUser(user, session?.access_token);
        }
    }, [user, fetchCrmUser, supabase]);

    useEffect(() => {
        initializedRef.current = false;

        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (_event, session) => {
                const authUser = session?.user ?? null;
                setUser(authUser);
                if (authUser && !initializedRef.current) {
                    initializedRef.current = true;
                    // Pass token directly — avoids getSession() deadlock during init
                    await fetchCrmUser(authUser, session?.access_token);
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
                    // After getUser(), initializePromise is resolved so getSession() is safe
                    const { data: { session } } = await supabase.auth.getSession();
                    await fetchCrmUser(authUser, session?.access_token);
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
