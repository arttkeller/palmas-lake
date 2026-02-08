'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Cell } from 'recharts';
import { EmptyChartState, isChartDataEmpty, MIN_CHART_HEIGHT, MIN_CHART_WIDTH, ClientOnlyChart } from './EmptyChartState';
import { ShieldAlertIcon } from '@/components/icons/animated';

interface ObjectionChartProps {
    data?: {
        objections?: { name: string; value: number }[];
    }
}

const COLORS = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#64748b'];

/**
 * ObjectionBarChart Component
 * 
 * Requirements: 2.1 - Render placeholder visualization without throwing errors for empty/undefined data
 * Requirements: 2.2 - Display chart with appropriate empty state styling for zero values
 * Requirements: 2.3 - Use minimum fallback dimensions for ResponsiveContainer
 */
export default function ObjectionBarChart({ data }: ObjectionChartProps) {
    const chartData = data?.objections || [];
    const isEmpty = isChartDataEmpty(chartData);

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center gap-2">
                    <ShieldAlertIcon size={20} />
                    <CardTitle className="text-gray-900">Principais Objeções</CardTitle>
                </div>
                <CardDescription className="text-gray-900">Motivos de perda ou travamento de leads</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="h-[300px] w-full" style={{ minHeight: MIN_CHART_HEIGHT, minWidth: MIN_CHART_WIDTH }}>
                    {isEmpty ? (
                        <EmptyChartState height={300} message="Nenhuma objeção registrada" />
                    ) : (
                        <ClientOnlyChart height={300}>
                        <ResponsiveContainer width="100%" height="100%" minWidth={MIN_CHART_WIDTH} minHeight={MIN_CHART_HEIGHT}>
                            <BarChart
                                layout="vertical"
                                data={chartData}
                                margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                            >
                                <XAxis type="number" hide />
                                <YAxis
                                    type="category"
                                    dataKey="name"
                                    width={100}
                                    tick={{ fontSize: 12, fill: '#4b5563' }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <Tooltip
                                    cursor={{ fill: 'transparent' }}
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                />
                                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
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
