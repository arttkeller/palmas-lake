import { useState, useEffect } from 'react';

const WINDOW_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

function formatTimeRemaining(ms: number): string {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds]
        .map(n => String(n).padStart(2, '0'))
        .join(':');
}

interface WhatsAppWindowState {
    isOpen: boolean;
    timeRemaining: string | null;
}

export function useWhatsAppWindow(lastInteractionAt?: string | null): WhatsAppWindowState {
    const [state, setState] = useState<WhatsAppWindowState>(() => {
        if (!lastInteractionAt) return { isOpen: false, timeRemaining: null };
        const windowEnd = new Date(lastInteractionAt).getTime() + WINDOW_DURATION_MS;
        const remaining = windowEnd - Date.now();
        if (remaining <= 0) return { isOpen: false, timeRemaining: null };
        return { isOpen: true, timeRemaining: formatTimeRemaining(remaining) };
    });

    useEffect(() => {
        if (!lastInteractionAt) {
            setState({ isOpen: false, timeRemaining: null });
            return;
        }

        const windowEnd = new Date(lastInteractionAt).getTime() + WINDOW_DURATION_MS;

        function tick() {
            const remaining = windowEnd - Date.now();
            if (remaining <= 0) {
                setState({ isOpen: false, timeRemaining: null });
            } else {
                setState({ isOpen: true, timeRemaining: formatTimeRemaining(remaining) });
            }
        }

        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [lastInteractionAt]);

    return state;
}
