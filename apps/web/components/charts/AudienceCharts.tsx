'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as ReTooltip, Legend } from 'recharts';
import { Share2, AlertCircle } from 'lucide-react';
import { EmptyChartState, isChartDataEmpty, MIN_CHART_HEIGHT, MIN_CHART_WIDTH } from './EmptyChartState';

interface AudienceChartsProps {
    data: any;
}

const COLORS = ['#25D366', '#3b82f6', '#E1306C', '#FFBB28'];

/**
 * AudienceCharts Component
 * 
 * Requirements: 2.1 - Render placeholder visualization without throwing errors for empty/undefined data
 * Requirements: 2.2 - Display chart with appropriate empty state styling for zero values
 * Requirements: 2.3 - Use minimum fallback dimensions for ResponsiveContainer
 */
export default function AudienceCharts({ data }: AudienceChartsProps) {
    const hasChannels = data?.channels && Array.isArray(data.channels) && data.channels.length > 0;
    const hasObjections = data?.objections && Array.isArray(data.objections) && data.objections.length > 0;
    
    // If no data at all, show empty states for both
    if (!hasChannels && !hasObjections) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                <Card>
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <Share2 className="h-5 w-5 text-blue-500" />
                            <CardTitle>Canais de Aquisição</CardTitle>
                        </div>
                        <CardDescription>Origem dos leads gerados</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <EmptyChartState height={300} message="Nenhum dado de canal disponível" />
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <AlertCircle className="h-5 w-5 text-red-500" />
                            <CardTitle>Principais Objeções</CardTitle>
                        </div>
                        <CardDescription>Motivos de perda ou não agendamento</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <EmptyChartState height={300} message="Nenhuma objeção registrada" />
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
            {/* Channel Distribution */}
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <Share2 className="h-5 w-5 text-blue-500" />
                        <CardTitle>Canais de Aquisição</CardTitle>
                    </div>
                    <CardDescription>Origem dos leads gerados</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="h-[300px] w-full flex items-center justify-center" style={{ minHeight: MIN_CHART_HEIGHT, minWidth: MIN_CHART_WIDTH }}>
                        {!hasChannels ? (
                            <EmptyChartState height={300} message="Nenhum dado de canal disponível" />
                        ) : (
                            <ResponsiveContainer width="100%" height="100%" minWidth={MIN_CHART_WIDTH} minHeight={MIN_CHART_HEIGHT}>
                                <PieChart>
                                    <Pie
                                        data={data.channels}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {data.channels.map((entry: any, index: number) => (
                                            <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <ReTooltip contentStyle={{ borderRadius: '8px' }} />
                                    <Legend verticalAlign="bottom" height={36} />
                                </PieChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Objections Analysis */}
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <AlertCircle className="h-5 w-5 text-red-500" />
                        <CardTitle>Principais Objeções</CardTitle>
                    </div>
                    <CardDescription>Motivos de perda ou não agendamento</CardDescription>
                </CardHeader>
                <CardContent>
                    {!hasObjections ? (
                        <EmptyChartState height={200} message="Nenhuma objeção registrada" />
                    ) : (
                        <div className="space-y-6">
                            {data.objections.map((obj: any, i: number) => (
                                <div key={i} className="space-y-2">
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="font-medium text-gray-700">{obj.name}</span>
                                        <span className="text-gray-500">{obj.value || 0}%</span>
                                    </div>
                                    <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-red-400 rounded-full transition-all duration-500"
                                            style={{ width: `${obj.value || 0}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                            <div className="pt-4 border-t border-gray-100">
                                <p className="text-xs text-gray-400">
                                    * Análise baseada em conversas encerradas sem conversão.
                                </p>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
