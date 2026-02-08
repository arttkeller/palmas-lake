'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Cell } from 'recharts';
import { EmptyChartState, isChartDataEmpty, MIN_CHART_HEIGHT, MIN_CHART_WIDTH, ClientOnlyChart } from './EmptyChartState';
import { QuestionMarkIcon } from '@/components/icons/animated';

interface FAQChartProps {
    data?: {
        faq?: { name: string; value: number }[];
    }
}

const COLORS = ['#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#c084fc', '#d8b4fe', '#e9d5ff', '#f3e8ff'];

/**
 * FAQChart Component
 * 
 * Requirements: 2.1 - Render placeholder visualization without throwing errors for empty/undefined data
 * Requirements: 2.2 - Display chart with appropriate empty state styling for zero values
 * Requirements: 2.3 - Use minimum fallback dimensions for ResponsiveContainer
 */
export default function FAQChart({ data }: FAQChartProps) {
    const chartData = data?.faq || [];
    const isEmpty = isChartDataEmpty(chartData);

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-gray-900">
                    <QuestionMarkIcon size={20} />
                    Perguntas Frequentes
                </CardTitle>
                <CardDescription className="text-gray-600">Tópicos mais perguntados pelos leads</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="h-[280px] w-full" style={{ minHeight: MIN_CHART_HEIGHT, minWidth: MIN_CHART_WIDTH }}>
                    {isEmpty ? (
                        <EmptyChartState height={280} message="Sem dados suficientes de perguntas frequentes" />
                    ) : (
                        <ClientOnlyChart height={280}>
                        <ResponsiveContainer width="100%" height="100%" minWidth={MIN_CHART_WIDTH} minHeight={MIN_CHART_HEIGHT}>
                            <BarChart
                                layout="vertical"
                                data={chartData}
                                margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
                            >
                                <XAxis type="number" hide />
                                <YAxis
                                    type="category"
                                    dataKey="name"
                                    width={75}
                                    tick={{ fontSize: 11, fill: '#4b5563' }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <Tooltip
                                    cursor={{ fill: 'transparent' }}
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    formatter={(value: number | undefined) => [`${value ?? 0} perguntas`, 'Frequência']}
                                />
                                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={18}>
                                    {chartData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                        </ClientOnlyChart>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
