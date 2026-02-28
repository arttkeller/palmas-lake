import { createClient } from '@/lib/supabase';
import { API_BASE_URL } from '@/lib/api-config';

/**
 * Authenticated fetch wrapper that injects the Supabase JWT
 * as `Authorization: Bearer <token>` automatically.
 *
 * Usage:
 *   const res = await apiFetch('/api/leads');
 *   const data = await res.json();
 *
 * Accepts full URLs or paths starting with '/'.
 * Paths are prefixed with API_BASE_URL.
 */
export async function apiFetch(
    path: string,
    init?: RequestInit,
): Promise<Response> {
    const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;

    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    const headers = new Headers(init?.headers);
    if (token) {
        headers.set('Authorization', `Bearer ${token}`);
    }

    return fetch(url, { ...init, headers });
}
