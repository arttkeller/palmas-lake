'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, Cell } from 'recharts';
import { Clock, MessageSquare, Zap } from 'lucide-react';
import { EmptyChartState, isChartDataEmpty, MIN_CHART_HEIGHT, MIN_CHART_WIDTH } from './EmptyChartState';

interface EngagementChartsProps {
    data: any;
}

const DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

/**
 * EngagementCharts Component
 * 
 * Requirements: 2.1 - Render placeholder visualization without throwing errors for empty/undefined data
 * Requirements: 2.2 - Display chart with appropriate empty state styling for zero values
 * Requirements: 2.3 - Use minimum fallback dimensions for ResponsiveContainer
 */
export default function EngagementCharts({ data }: EngagementChartsProps) {
    // Check for empty data early - Requirements: 2.1
    const hasHeatmapData = data?.heatmap && Array.isArray(data.heatmap) && data.heatmap.length > 0;
    
    if (!hasHeatmapData) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                {/* Efficiency Stats - show with default values */}
                <Card className="md:col-span-2">
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <Zap className="h-5 w-5 text-yellow-500" />
                            <CardTitle>Eficiência Operacional</CardTitle>
                        </div>
                        <CardDescription>Velocidade de resposta da IA vs Comportamento do Lead</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="rounded-xl border bg-card text-card-foreground p-6 shadow-sm">
                                <div className="text-sm font-medium text-muted-foreground flex items-center gap-2 mb-2">
                                    <Zap className="h-4 w-4" /> Tempo Resposta IA
                                </div>
                                <div className="text-3xl font-bold">--</div>
                                <p className="text-xs text-muted-foreground mt-1">Aguardando dados</p>
                            </div>
                            <div className="rounded-xl border bg-card text-card-foreground p-6 shadow-sm">
                                <div className="text-sm font-medium text-muted-foreground flex items-center gap-2 mb-2">
                                    <MessageSquare className="h-4 w-4" /> Tempo Resposta Lead
                                </div>
                                <div className="text-3xl font-bold">--</div>
                                <p className="text-xs text-muted-foreground mt-1">Aguardando dados</p>
                            </div>
                            <div className="rounded-xl border bg-card text-card-foreground p-6 shadow-sm">
                                <div className="text-sm font-medium text-muted-foreground flex items-center gap-2 mb-2">
                                    <Clock className="h-4 w-4" /> Retenção no WhatsApp
                                </div>
                                <div className="text-3xl font-bold">--</div>
                                <p className="text-xs text-muted-foreground mt-1">Aguardando dados</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Empty chart states */}
                <Card>
                    <CardHeader>
                        <CardTitle>Agendamentos por Dia da Semana</CardTitle>
                        <CardDescription>Dias com maior volume de atendimentos</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <EmptyChartState height={250} message="Nenhum dado de agendamento disponível" />
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Horários de Pico</CardTitle>
                        <CardDescription>Volume de interação por hora do dia</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <EmptyChartState height={250} message="Nenhum dado de horário disponível" />
                    </CardContent>
                </Card>
            </div>
        );
    }

    // Process Heatmap Data for Charts
    // 1. By Day of Week
    const daysData = Array(7).fill(0).map((_, i) => ({ day: DAYS[i], value: 0 }));
    // 2. By Hour of Day
    const hoursData = Array(24).fill(0).map((_, i) => ({ hour: `${i}h`, value: 0 }));

    data.heatmap.forEach((item: any) => {
        if (item.dow !== undefined && daysData[item.dow]) daysData[item.dow].value += item.value || 0;
        if (item.hour !== undefined && hoursData[item.hour]) hoursData[item.hour].value += item.value || 0;
    });

    const responseTimes = data.response_times || { ai_avg_seconds: 0, lead_avg_minutes: 0 };
    
    // Check if all values are zero - Requirements: 2.2
    const daysHasData = daysData.some(d => d.value > 0);
    const hoursHasData = hoursData.some(h => h.value > 0);

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
            {/* Efficiency Stats */}
            <Card className="md:col-span-2">
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <Zap className="h-5 w-5 text-yellow-500" />
                        <CardTitle>Eficiência Operacional</CardTitle>
                    </div>
                    <CardDescription>Velocidade de resposta da IA vs Comportamento do Lead</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="rounded-xl border bg-card text-card-foreground p-6 shadow-sm">
                            <div className="text-sm font-medium text-muted-foreground flex items-center gap-2 mb-2">
                                <Zap className="h-4 w-4" /> Tempo Resposta IA
                            </div>
                            <div className="text-3xl font-bold">{responseTimes.ai_avg_seconds}s</div>
                            <p className="text-xs text-muted-foreground mt-1">Média instantânea</p>
                        </div>
                        <div className="rounded-xl border bg-card text-card-foreground p-6 shadow-sm">
                            <div className="text-sm font-medium text-muted-foreground flex items-center gap-2 mb-2">
                                <MessageSquare className="h-4 w-4" /> Tempo Resposta Lead
                            </div>
                            <div className="text-3xl font-bold">{responseTimes.lead_avg_minutes}m</div>
                            <p className="text-xs text-muted-foreground mt-1">Média de engajamento</p>
                        </div>
                        <div className="rounded-xl border bg-card text-card-foreground p-6 shadow-sm">
                            <div className="text-sm font-medium text-muted-foreground flex items-center gap-2 mb-2">
                                <Clock className="h-4 w-4" /> Retenção no WhatsApp
                            </div>
                            <div className="text-3xl font-bold">4.2d</div>
                            <p className="text-xs text-muted-foreground mt-1">Duração média da conversa</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Best Days Chart */}
            <Card>
                <CardHeader>
                    <CardTitle>Agendamentos por Dia da Semana</CardTitle>
                    <CardDescription>Dias com maior volume de atendimentos</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="h-[250px]" style={{ minHeight: MIN_CHART_HEIGHT, minWidth: MIN_CHART_WIDTH }}>
                        {!daysHasData ? (
                            <EmptyChartState height={250} message="Todos os valores são zero" />
                        ) : (
                            <ResponsiveContainer width="100%" height="100%" minWidth={MIN_CHART_WIDTH} minHeight={MIN_CHART_HEIGHT}>
                                <BarChart data={daysData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="day" axisLine={false} tickLine={false} tickMargin={10} />
                                    <Tooltip
                                        cursor={{ fill: 'transparent' }}
                                        contentStyle={{ borderRadius: '8px' }}
                                    />
                                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                        {daysData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.value > 0 ? '#3b82f6' : '#e5e7eb'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Best Hours Chart */}
            <Card>
                <CardHeader>
                    <CardTitle>Horários de Pico</CardTitle>
                    <CardDescription>Volume de interação por hora do dia</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="h-[250px]" style={{ minHeight: MIN_CHART_HEIGHT, minWidth: MIN_CHART_WIDTH }}>
                        {!hoursHasData ? (
                            <EmptyChartState height={250} message="Todos os valores são zero" />
                        ) : (
                            <ResponsiveContainer width="100%" height="100%" minWidth={MIN_CHART_WIDTH} minHeight={MIN_CHART_HEIGHT}>
                                <AreaChart data={hoursData}>
                                    <defs>
                                        <linearGradient id="colorHour" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8} />
                                            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis
                                        dataKey="hour"
                                        axisLine={false}
                                        tickLine={false}
                                        minTickGap={30}
                                    />
                                    <Tooltip contentStyle={{ borderRadius: '8px' }} />
                                    <Area
                                        type="monotone"
                                        dataKey="value"
                                        stroke="#8b5cf6"
                                        fillOpacity={1}
                                        fill="url(#colorHour)"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
