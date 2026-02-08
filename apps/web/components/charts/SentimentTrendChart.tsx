'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import { EmptyChartState, isChartDataEmpty, MIN_CHART_HEIGHT, MIN_CHART_WIDTH, ClientOnlyChart } from './EmptyChartState';
import { SmilePlus, Frown } from 'lucide-react';

interface SentimentProps {
    data?: any;
}

/**
 * SentimentTrendChart Component
 * 
 * Requirements: 2.1 - Render placeholder visualization without throwing errors for empty/undefined data
 * Requirements: 2.2 - Display chart with appropriate empty state styling for zero values
 * Requirements: 2.3 - Use minimum fallback dimensions for ResponsiveContainer
 */
export default function SentimentTrendChart({ data }: SentimentProps) {
    // Use real data from backend response
    // Expected structure: { date: string, positive: number, neutral: number, negative: number }[]
    const chartData = data?.sentiment_trend || [];
    const isEmpty = isChartDataEmpty(chartData);

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center gap-2">
                    <SmilePlus className="h-5 w-5 text-green-500" />
                    <Frown className="h-5 w-5 text-red-500" />
                    <CardTitle className="text-gray-900">Análise de Sentimento</CardTitle>
                </div>
                <CardDescription className="text-gray-900">Tendência emocional das conversas</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="h-[300px] w-full" style={{ minHeight: MIN_CHART_HEIGHT, minWidth: MIN_CHART_WIDTH }}>
                    {isEmpty ? (
                        <EmptyChartState 
                            height={300} 
                            message="Aguardando dados de análise de sentimento..." 
                        />
                    ) : (
                        <ClientOnlyChart height={300}>
                        <ResponsiveContainer width="100%" height="100%" minWidth={MIN_CHART_WIDTH} minHeight={MIN_CHART_HEIGHT}>
                            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                <XAxis
                                    dataKey="date"
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                    tick={{ fill: '#000000' }}
                                />
                                <YAxis
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                    tick={{ fill: '#000000' }}
                                />
                                <Tooltip
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    cursor={{ fill: '#f3f4f6' }}
                                />
                                <Legend iconType="circle" />
                                <Bar dataKey="positive" name="Positivo" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                                <Bar dataKey="neutral" name="Neutro" stackId="a" fill="#9ca3af" radius={[0, 0, 0, 0]} />
                                <Bar dataKey="negative" name="Negativo" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                        </ClientOnlyChart>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
