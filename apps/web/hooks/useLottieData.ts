import { useState, useEffect } from 'react';

// Module-level cache shared across all components
const lottieCache = new Map<string, object>();
const lottiePending = new Map<string, Promise<object>>();

function fetchLottieData(url: string): Promise<object> {
    if (lottieCache.has(url)) return Promise.resolve(lottieCache.get(url)!);
    if (lottiePending.has(url)) return lottiePending.get(url)!;

    const p = fetch(url)
        .then(r => r.json())
        .then(data => {
            lottieCache.set(url, data);
            lottiePending.delete(url);
            return data;
        });
    lottiePending.set(url, p);
    return p;
}

export function useLottieData(url: string | undefined): object | null {
    const [data, setData] = useState<object | null>(() =>
        url ? (lottieCache.get(url) ?? null) : null
    );

    useEffect(() => {
        if (!url) return;
        if (lottieCache.has(url)) {
            setData(lottieCache.get(url)!);
            return;
        }
        let cancelled = false;
        fetchLottieData(url).then(d => { if (!cancelled) setData(d); });
        return () => { cancelled = true; };
    }, [url]);

    return data;
}
