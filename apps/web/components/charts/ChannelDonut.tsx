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
import { InstagramIcon, WhatsAppIcon } from '@/components/icons/animated';

interface ChannelDonutProps {
    data?: {
        channels?: { name: string; value: number; color?: string }[];
    }
}

const DEFAULT_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

/**
 * ChannelDonut Component
 * 
 * Requirements: 2.1 - Render placeholder visualization without throwing errors for empty/undefined data
 * Requirements: 2.2 - Display chart with appropriate empty state styling for zero values
 * Requirements: 2.3 - Use minimum fallback dimensions for ResponsiveContainer
 */
export default function ChannelDonut({ data }: ChannelDonutProps) {
    const chartData = data?.channels || [];
    const isEmpty = isChartDataEmpty(chartData);
    const totalValue = chartData.reduce((acc, curr) => acc + (curr.value || 0), 0);
    const hasOnlyZeroValues = !isEmpty && totalValue === 0;

    return (
        <GlassmorphismCard variant="default" hoverable>
            <GlassmorphismCardHeader>
                <GlassmorphismCardTitle className="flex items-center gap-2">
                    <WhatsAppIcon size={20} />
                    Canais de Aquisição
                    <InstagramIcon size={20} />
                </GlassmorphismCardTitle>
                <GlassmorphismCardDescription>Origem dos leads qualificados</GlassmorphismCardDescription>
            </GlassmorphismCardHeader>
            <GlassmorphismCardContent>
                <div className="h-[300px] w-full relative" style={{ minHeight: MIN_CHART_HEIGHT, minWidth: MIN_CHART_WIDTH }}>
                    {isEmpty || hasOnlyZeroValues ? (
                        <EmptyChartState 
                            height={300} 
                            message={hasOnlyZeroValues ? "Todos os valores são zero" : "Nenhum canal de aquisição registrado"} 
                        />
                    ) : (
                        <ClientOnlyChart height={300}>
                            <ResponsiveContainer width="100%" height="100%" minWidth={MIN_CHART_WIDTH} minHeight={MIN_CHART_HEIGHT}>
                                <PieChart>
                                    <Pie
                                        data={chartData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {chartData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length]} />
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
