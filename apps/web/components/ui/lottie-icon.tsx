'use client';

import Lottie from 'lottie-react';
import { useLottieData } from '@/hooks/useLottieData';

interface LottieIconProps {
    url: string;
    size?: number;
    /** Fallback content shown while the animation is loading */
    fallback?: React.ReactNode;
    className?: string;
}

export function LottieIcon({ url, size = 20, fallback, className }: LottieIconProps) {
    const animationData = useLottieData(url);

    if (animationData) {
        return (
            <Lottie
                animationData={animationData}
                loop
                autoplay
                style={{ width: size, height: size }}
                className={className}
            />
        );
    }

    if (fallback) return <>{fallback}</>;
    return null;
}
