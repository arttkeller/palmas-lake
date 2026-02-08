'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend, CartesianGrid } from 'recharts';
import { EmptyChartState, MIN_CHART_HEIGHT, MIN_CHART_WIDTH, ClientOnlyChart } from './EmptyChartState';
import { AlarmClockIcon } from '@/components/icons/animated';

interface ResponseTimeChartProps {
    data?: {
        response_times?: {
            ai_avg_seconds: number;
            lead_avg_minutes: number;
            history?: { date: string; ai_avg: number; lead_avg: number }[];
        }
    }
}

/**
 * ResponseTimeChart Component
 * 
 * Requirements: 2.1 - Render placeholder visualization without throwing errors for empty/undefined data
 * Requirements: 2.2 - Display chart with appropriate empty state styling for zero values
 * Requirements: 2.3 - Use minimum fallback dimensions for ResponsiveContainer
 */
export default function ResponseTimeChart({ data }: ResponseTimeChartProps) {
    // Mocking historical data for the chart lines using the dates provided or generating some
    const history = data?.response_times?.history || [];

    // Generate synthetic data points for the trend lines based on averages
    // In a real scenario, the backend would provide daily averages
    const aiAvg = data?.response_times?.ai_avg_seconds || 0;
    const leadAvg = data?.response_times?.lead_avg_minutes || 0;
    
    // Limitar valores para exibição razoável
    const aiAvgCapped = Math.min(aiAvg, 120); // Max 2 minutos em segundos
    const leadAvgCapped = Math.min(leadAvg, 60); // Max 60 minutos
    
    // Check if we have meaningful data — show chart when either average is non-zero
    const hasNoData = aiAvg === 0 && leadAvg === 0;
    
    const chartData = history.length > 0 ? history.map((h) => ({
        date: h.date,
        aiSpeed: h.ai_avg ?? aiAvgCapped,
        leadSpeed: h.lead_avg ?? leadAvgCapped,
    })) : (
        // Generate a single data point from current date when history is empty but averages exist
        !hasNoData ? [{ date: new Date().toISOString().split('T')[0], aiSpeed: aiAvgCapped, leadSpeed: leadAvgCapped }] : []
    );

    return (
        <Card className="col-span-1">
            <CardHeader>
                <div className="flex items-center gap-2">
                    <AlarmClockIcon size={20} />
                    <CardTitle>Tempo de Resposta</CardTitle>
                </div>
                <CardDescription>Velocidade da IA (segundos) vs Lead (minutos)</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="h-[300px] w-full" style={{ minHeight: MIN_CHART_HEIGHT, minWidth: MIN_CHART_WIDTH }}>
                    {hasNoData ? (
                        <EmptyChartState 
                            height={300} 
                            message="Nenhum dado de tempo de resposta disponível" 
                        />
                    ) : (
                        <ClientOnlyChart height={300}>
                        <ResponsiveContainer width="100%" height="100%" minWidth={MIN_CHART_WIDTH} minHeight={MIN_CHART_HEIGHT}>
                            <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                <XAxis
                                    dataKey="date"
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(value) => value ? value.split('-').slice(1).join('/') : ''} // mm/dd
                                />
                                {/* Two Y axes for different scales */}
                                <YAxis
                                    yAxisId="left"
                                    orientation="left"
                                    stroke="#10b981"
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                    label={{ value: 'IA (seg)', angle: -90, position: 'insideLeft', fill: '#10b981' }}
                                />
                                <YAxis
                                    yAxisId="right"
                                    orientation="right"
                                    stroke="#3b82f6"
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                    label={{ value: 'User (min)', angle: 90, position: 'insideRight', fill: '#3b82f6' }}
                                />
                                <Tooltip
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    labelStyle={{ color: '#374151', fontWeight: 600, marginBottom: '4px' }}
                                />
                                <Legend />
                                <Line
                                    yAxisId="left"
                                    type="monotone"
                                    dataKey="aiSpeed"
                                    name="IA (seg)"
                                    stroke="#10b981"
                                    strokeWidth={2}
                                    dot={false}
                                    activeDot={{ r: 6 }}
                                />
                                <Line
                                    yAxisId="right"
                                    type="monotone"
                                    dataKey="leadSpeed"
                                    name="Lead (min)"
                                    stroke="#3b82f6"
                                    strokeWidth={2}
                                    strokeDasharray="4 4"
                                    dot={false}
                                    activeDot={{ r: 6 }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                        </ClientOnlyChart>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
