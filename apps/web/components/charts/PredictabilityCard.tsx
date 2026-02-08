'use client';

import React from 'react';
import { 
    GlassmorphismCard, 
    GlassmorphismCardContent, 
    GlassmorphismCardHeader, 
    GlassmorphismCardTitle, 
    GlassmorphismCardDescription 
} from '@/components/ui/glassmorphism-card';
import { TrendingUp, TrendingDown, Target } from 'lucide-react';
import { TelescopeIcon } from '@/components/icons/animated';

interface PredictabilityProps {
    data?: {
        history?: { date: string; leads: number }[];
    }
}

export default function PredictabilityCard({ data }: PredictabilityProps) {
    const history = data?.history || [];

    // Simple logic: Compare last 7 days avg vs previous 7 days avg
    const last7 = history.slice(-7);
    const prev7 = history.slice(-14, -7);

    const avgLast = last7.reduce((acc, curr) => acc + curr.leads, 0) / (last7.length || 1);
    const avgPrev = prev7.reduce((acc, curr) => acc + curr.leads, 0) / (prev7.length || 1);

    const trend = avgLast - avgPrev;
    const growth = avgPrev > 0 ? (trend / avgPrev) * 100 : 0;

    // Forecast for next week
    const forecast = Math.round(avgLast * 7 * (1 + (growth > 0 ? 0.05 : 0))); // Conservative 5% extra growth if growing

    const isPositive = growth >= 0;

    return (
        <GlassmorphismCard variant="default" className="bg-gradient-to-br from-indigo-50/50 to-white/50 dark:from-indigo-950/30 dark:to-transparent">
            <GlassmorphismCardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <TelescopeIcon size={20} />
                        <GlassmorphismCardTitle className="text-indigo-900 dark:text-indigo-300">Previsibilidade</GlassmorphismCardTitle>
                    </div>
                    <Target className="h-4 w-4 text-indigo-500" />
                </div>
                <GlassmorphismCardDescription>Projeção para próxima semana</GlassmorphismCardDescription>
            </GlassmorphismCardHeader>
            <GlassmorphismCardContent>
                <div className="flex items-end gap-2">
                    <div className="text-4xl font-bold text-indigo-600 dark:text-indigo-400">
                        {forecast > 0 ? forecast : '—'}
                    </div>
                    <div className="text-sm font-medium text-indigo-400 dark:text-indigo-500 mb-1">leads esperados</div>
                </div>

                <div className="mt-4 flex items-center gap-2 p-2 bg-white/60 dark:bg-white/5 rounded-lg border border-indigo-100 dark:border-indigo-500/20">
                    <div className={`p-1 rounded-full ${isPositive ? 'bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400' : 'bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400'}`}>
                        {isPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                    </div>
                    <div className="text-sm">
                        <span className={isPositive ? 'text-green-600 dark:text-green-400 font-bold' : 'text-red-600 dark:text-red-400 font-bold'}>
                            {growth > 0 ? '+' : ''}{growth.toFixed(1)}%
                        </span>
                        <span className="text-gray-500 dark:text-gray-400 ml-1">vs semana anterior</span>
                    </div>
                </div>
            </GlassmorphismCardContent>
        </GlassmorphismCard>
    );
}
