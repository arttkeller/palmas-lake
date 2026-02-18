'use client';

import React from 'react';
import {
    GlassmorphismCard,
    GlassmorphismCardContent,
    GlassmorphismCardHeader,
    GlassmorphismCardTitle,
    GlassmorphismCardDescription
} from '@/components/ui/glassmorphism-card';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { EmptyChartState, isChartDataEmpty, MIN_CHART_HEIGHT, MIN_CHART_WIDTH, ClientOnlyChart } from './EmptyChartState';
import { LottieIcon } from '@/components/ui/lottie-icon';

interface TemperatureDonutProps {
    data?: {
        temperature_distribution?: Record<string, number>;
    }
}

const TEMPERATURE_CHART_DATA = [
    { key: 'hot',  name: 'Quente', color: '#f97316', lottieUrl: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f525/lottie.json', fallback: '🔥' },
    { key: 'warm', name: 'Morno',  color: '#f59e0b', lottieUrl: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f31e/lottie.json', fallback: '🌞' },
    { key: 'cold', name: 'Frio',   color: '#60a5fa', lottieUrl: 'https://fonts.gstatic.com/s/e/notoemoji/latest/2744_fe0f/lottie.json', fallback: '❄️' },
];

export default function TemperatureDonut({ data }: TemperatureDonutProps) {
    const dist = data?.temperature_distribution || {};

    const chartData = TEMPERATURE_CHART_DATA
        .map(t => ({ name: t.name, value: dist[t.key] ?? 0, color: t.color }))
        .filter(d => d.value > 0);

    const allData = TEMPERATURE_CHART_DATA.map(t => ({
        name: t.name,
        value: dist[t.key] ?? 0,
        color: t.color,
    }));

    const isEmpty = isChartDataEmpty(allData);
    const totalValue = allData.reduce((acc, curr) => acc + curr.value, 0);
    const hasOnlyZeroValues = !isEmpty && totalValue === 0;

    const displayData = isEmpty || hasOnlyZeroValues ? [] : chartData;

    return (
        <GlassmorphismCard variant="default" hoverable>
            <GlassmorphismCardHeader>
                <GlassmorphismCardTitle className="flex items-center gap-2">
                    <LottieIcon
                        url="https://fonts.gstatic.com/s/e/notoemoji/latest/1f525/lottie.json"
                        size={20}
                        fallback="🔥"
                    />
                    Temperatura dos Leads
                    <LottieIcon
                        url="https://fonts.gstatic.com/s/e/notoemoji/latest/2744_fe0f/lottie.json"
                        size={20}
                        fallback="❄️"
                    />
                </GlassmorphismCardTitle>
                <GlassmorphismCardDescription>Distribuição por classificação de temperatura</GlassmorphismCardDescription>
            </GlassmorphismCardHeader>
            <GlassmorphismCardContent>
                <div className="h-[300px] w-full relative" style={{ minHeight: MIN_CHART_HEIGHT, minWidth: MIN_CHART_WIDTH }}>
                    {isEmpty || hasOnlyZeroValues ? (
                        <EmptyChartState
                            height={300}
                            message={hasOnlyZeroValues ? "Todos os valores são zero" : "Nenhuma classificação de temperatura registrada"}
                        />
                    ) : (
                        <ClientOnlyChart height={300}>
                            <ResponsiveContainer width="100%" height="100%" minWidth={MIN_CHART_WIDTH} minHeight={MIN_CHART_HEIGHT}>
                                <PieChart>
                                    <Pie
                                        data={displayData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {displayData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        position={{ y: 10 }}
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)', background: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(8px)' }}
                                    />
                                    <Legend verticalAlign="bottom" height={36} iconType="circle" />
                                </PieChart>
                            </ResponsiveContainer>

                            {/* Center Text overlay */}
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none pb-8">
                                <div className="text-2xl font-bold text-gray-900">
                                    {totalValue}
                                </div>
                                <div className="text-xs text-gray-500">leads</div>
                            </div>
                        </ClientOnlyChart>
                    )}
                </div>
            </GlassmorphismCardContent>
        </GlassmorphismCard>
    );
}
