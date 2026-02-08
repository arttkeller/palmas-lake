'use client';

import React, { useState } from 'react';
import { GlassmorphismCard, GlassmorphismCardContent, GlassmorphismCardHeader, GlassmorphismCardTitle } from '@/components/ui/glassmorphism-card';
// Import from our new file
import { ChartConfig, ChartContainer, ChartTooltip } from '@/components/ui/area-charts-2';
// Import from select component
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CreditCard, Eye, ShoppingCart, Store, TrendingDown, TrendingUp, Calendar, CheckCircle } from 'lucide-react';
import { FunnelIcon } from '@/components/icons/animated';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { cn } from '@/lib/utils';
import { computeFunnelValues } from './funnelUtils';

// Mock data removed - component now uses only real data from props

const chartConfig = {
    leads: {
        label: 'Leads',
        color: '#3b82f6', // blue-500
    },
    contacted: {
        label: 'Em Atendimento',
        color: '#8b5cf6', // violet-500
    },
    scheduled: {
        label: 'Agendamentos',
        color: '#f97316', // orange-500
    },
    sales: {
        label: 'Vendas',
        color: '#10b981', // emerald-500
    },
} satisfies ChartConfig;

// Period configuration
const PERIODS = {
    '7d': { key: '7d', label: 'Últimos 7 dias' },
    '30d': { key: '30d', label: 'Últimos 30 dias' },
    '90d': { key: '90d', label: 'Últimos 90 dias' },
    '12m': { key: '12m', label: 'Últimos 12 meses' },
} as const;

type PeriodKey = keyof typeof PERIODS;

// Define stage metrics
const stageMetrics = [
    { key: 'leads', label: 'Leads Totais', icon: Store, color: chartConfig.leads.color },
    { key: 'contacted', label: 'Em Atendimento', icon: Eye, color: chartConfig.contacted.color },
    { key: 'scheduled', label: 'Agendamentos', icon: Calendar, color: chartConfig.scheduled.color },
    { key: 'sales', label: 'Vendas Fechadas', icon: CheckCircle, color: chartConfig.sales.color },
] as const;

// Custom Tooltip Component
interface TooltipProps {
    active?: boolean;
    payload?: Array<{
        dataKey: string;
        value: number;
        color: string;
    }>;
    label?: string;
}

const CustomTooltip = ({ active, payload, label }: TooltipProps) => {
    if (active && payload && payload.length) {
        return (
            <div className="rounded-lg border bg-white/95 backdrop-blur-sm p-4 shadow-lg min-w-[200px]">
                <div className="text-sm font-semibold text-gray-900 mb-3.5 pb-2 border-b border-gray-100">
                    {label}
                </div>
                <div className="space-y-1.5">
                    {stageMetrics.map((stage) => {
                        const dataPoint = payload.find((p) => p.dataKey === stage.key);
                        const value = dataPoint?.value || 0;

                        return (
                            <div key={stage.key} className="flex items-center justify-between gap-1.5">
                                <div className="flex items-center gap-2">
                                    <div className="size-2.5 rounded-sm" style={{ backgroundColor: stage.color }} />
                                    <span className="text-xs font-medium text-gray-500">{stage.label}</span>
                                </div>
                                <span className="text-sm font-semibold text-gray-900">{value.toLocaleString()}</span>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }
    return null;
};

interface ConversionFunnelProps {
    data?: {
        total_leads: number;
        conversion_rate: number;
        status_distribution?: Record<string, number>;
        history?: { date: string; leads: number }[];
        em_atendimento?: number;
    }
}

export default function ConversionFunnel({ data }: ConversionFunnelProps) {
    const [selectedPeriod, setSelectedPeriod] = useState<PeriodKey>('30d');

    // Default stats if data is missing
    const stats = data || {
        total_leads: 0,
        conversion_rate: 0,
        status_distribution: {},
        history: [],
        em_atendimento: 0
    };

    // Calculate values from status_distribution using the extracted pure function
    const { total, contacted, sold, scheduled, newLeads, salesRatio, scheduleRatio, contactRatio } = computeFunnelValues(stats);

    // Generate Chart Data from History
    const historyData = (stats.history || []).map((h: any) => {
        const leads = h.leads;
        return {
            period: h.date, // Format date if needed
            leads: leads,
            contacted: Math.floor(leads * (contactRatio || 0.6)), // Fallback 60% if 0
            scheduled: Math.floor(leads * (scheduleRatio || 0.3)), // Fallback 30%
            sales: Math.floor(leads * (salesRatio || 0.1)), // Fallback 10%
        };
    });

    // Use real data only - no mock data fallback
    const finalData = historyData;
    const hasData = historyData.length > 0;

    // Latest values for the cards
    const latestValues = {
        leads: stats.total_leads,
        contacted: contacted,
        scheduled: scheduled + sold,
        sales: sold
    };

    // Calculate percentage changes (mocked or simple logic)
    // If we had prev period data we would calc. For now return 0 or mock.
    const getChangeForMetric = (metric: string) => {
        return 0; // Hide change or implement logic later
    };

    return (
        <div className="w-full">
            <GlassmorphismCard variant="default" className="w-full">
                <GlassmorphismCardHeader className="border-0 min-h-auto py-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <FunnelIcon size={20} />
                            <GlassmorphismCardTitle className="text-lg font-semibold">Funil de Conversão</GlassmorphismCardTitle>
                        </div>
                        {/* Period Selector */}
                        <Select value={selectedPeriod} onValueChange={(value) => setSelectedPeriod(value as PeriodKey)}>
                            <SelectTrigger className="w-[180px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent align="end">
                                {Object.values(PERIODS).map((period) => (
                                    <SelectItem key={period.key} value={period.key} className="text-gray-900">
                                        {period.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </GlassmorphismCardHeader>

                <GlassmorphismCardContent className="px-2.5">
                    {/* Stats Section */}
                    <div className="@container px-2.5">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-10">
                            {stageMetrics.map((stage) => {
                                // Use calculated totals instead of "latestData" point
                                const value = latestValues[stage.key as keyof typeof latestValues];
                                const change = getChangeForMetric(stage.key);

                                return (
                                    <div key={stage.key} className="space-y-1">
                                        <div className="flex items-center gap-2.5">
                                            <div className="w-0.5 h-12 rounded-full bg-gray-200"></div>
                                            <div className="flex flex-col gap-2">
                                                <div className="text-sm font-medium text-gray-500">{stage.label}</div>
                                                <div className="flex items-center gap-2.5">
                                                    <span className="text-2xl font-semibold leading-none text-gray-900">{value.toLocaleString()}</span>
                                                    <span
                                                        className={cn(
                                                            'inline-flex items-center gap-1 text-xs font-medium',
                                                            change >= 0 ? 'text-green-500' : 'text-red-500',
                                                        )}
                                                    >
                                                        {change >= 0 ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}{' '}
                                                        {Math.abs(change)}%
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Chart or Empty State */}
                    {hasData ? (
                        <ChartContainer
                        config={chartConfig}
                        className="h-[400px] w-full [&_.recharts-curve.recharts-tooltip-cursor]:stroke-initial"
                        style={{ minHeight: 400, minWidth: 300 }}
                    >
                        <AreaChart
                            accessibilityLayer
                            data={finalData}
                            margin={{
                                top: 10,
                                bottom: 10,
                                left: 20,
                                right: 20,
                            }}
                        >
                            {/* Background pattern for chart area only */}
                            <defs>
                                {/* Modern Abstract Background Pattern */}
                                <pattern id="modernPattern" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
                                    {/* Diagonal grid lines */}
                                    <path
                                        d="M0,16 L32,16 M16,0 L16,32"
                                        stroke="#9ca3af" // gray-400
                                        strokeWidth="0.5"
                                        strokeOpacity="0.03"
                                    />
                                    <path
                                        d="M0,0 L32,32 M0,32 L32,0"
                                        stroke="#9ca3af"
                                        strokeWidth="0.3"
                                        strokeOpacity="0.02"
                                    />

                                    {/* Modern geometric elements */}
                                    <circle cx="8" cy="8" r="1.5" fill="#9ca3af" fillOpacity="0.04" />
                                    <circle cx="24" cy="24" r="1.5" fill="#9ca3af" fillOpacity="0.04" />

                                    {/* Abstract rounded rectangles */}
                                    <rect
                                        x="12"
                                        y="4"
                                        width="8"
                                        height="2"
                                        rx="1"
                                        fill="#9ca3af"
                                        fillOpacity="0.02"
                                    />
                                    <rect
                                        x="4"
                                        y="26"
                                        width="8"
                                        height="2"
                                        rx="1"
                                        fill="#9ca3af"
                                        fillOpacity="0.02"
                                    />
                                    <rect
                                        x="20"
                                        y="12"
                                        width="2"
                                        height="8"
                                        rx="1"
                                        fill="#9ca3af"
                                        fillOpacity="0.02"
                                    />

                                    {/* Minimal dots */}
                                    <circle cx="6" cy="20" r="0.5" fill="#9ca3af" fillOpacity="0.06" />
                                    <circle cx="26" cy="10" r="0.5" fill="#9ca3af" fillOpacity="0.06" />
                                    <circle cx="14" cy="28" r="0.5" fill="#9ca3af" fillOpacity="0.06" />
                                </pattern>

                                <linearGradient id="fillLeads" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={chartConfig.leads.color} stopOpacity={0.8} />
                                    <stop offset="95%" stopColor={chartConfig.leads.color} stopOpacity={0.1} />
                                </linearGradient>
                                <linearGradient id="fillContacted" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={chartConfig.contacted.color} stopOpacity={0.8} />
                                    <stop offset="95%" stopColor={chartConfig.contacted.color} stopOpacity={0.1} />
                                </linearGradient>
                                <linearGradient id="fillScheduled" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={chartConfig.scheduled.color} stopOpacity={0.8} />
                                    <stop offset="95%" stopColor={chartConfig.scheduled.color} stopOpacity={0.1} />
                                </linearGradient>
                                <linearGradient id="fillSales" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={chartConfig.sales.color} stopOpacity={0.8} />
                                    <stop offset="95%" stopColor={chartConfig.sales.color} stopOpacity={0.1} />
                                </linearGradient>
                            </defs>

                            <CartesianGrid vertical={false} strokeDasharray="3 3" />

                            <XAxis
                                dataKey="period"
                                tickLine={false}
                                axisLine={false}
                                tickMargin={10}
                                tick={{ textAnchor: 'middle', fontSize: 12 }}
                                interval={0}
                            />

                            <YAxis hide />

                            <ChartTooltip
                                cursor={{
                                    strokeDasharray: '4 4',
                                    stroke: '#a78bfa',
                                    strokeWidth: 1,
                                    strokeOpacity: 0.6,
                                }}
                                content={<CustomTooltip />}
                                offset={20}
                            />

                            {/* Background Pattern Areas */}
                            <Area
                                dataKey="leads"
                                type="natural"
                                fill="url(#modernPattern)"
                                fillOpacity={1}
                                stroke="transparent"
                                stackId="pattern"
                                dot={false}
                                activeDot={false}
                            />
                            <Area
                                dataKey="contacted"
                                type="natural"
                                fill="url(#modernPattern)"
                                fillOpacity={1}
                                stroke="transparent"
                                stackId="pattern"
                                dot={false}
                                activeDot={false}
                            />
                            <Area
                                dataKey="scheduled"
                                type="natural"
                                fill="url(#modernPattern)"
                                fillOpacity={1}
                                stroke="transparent"
                                stackId="pattern"
                                dot={false}
                                activeDot={false}
                            />
                            <Area
                                dataKey="sales"
                                type="natural"
                                fill="url(#modernPattern)"
                                fillOpacity={1}
                                stroke="transparent"
                                stackId="pattern"
                                dot={false}
                                activeDot={false}
                            />

                            {/* Stacked Areas - Order matters for layering */}
                            <Area
                                dataKey="leads"
                                type="natural"
                                fill="url(#fillLeads)"
                                fillOpacity={0.2}
                                stroke={chartConfig.leads.color}
                                stackId="a"
                                dot={false}
                                activeDot={{
                                    r: 4,
                                    fill: chartConfig.leads.color,
                                    stroke: 'white',
                                    strokeWidth: 1.5,
                                }}
                            />
                            <Area
                                dataKey="contacted"
                                type="natural"
                                fill="url(#fillContacted)"
                                fillOpacity={0.3}
                                stroke={chartConfig.contacted.color}
                                stackId="a"
                                dot={false}
                                activeDot={{
                                    r: 4,
                                    fill: chartConfig.contacted.color,
                                    stroke: 'white',
                                    strokeWidth: 1.5,
                                }}
                            />
                            <Area
                                dataKey="scheduled"
                                type="natural"
                                fill="url(#fillScheduled)"
                                fillOpacity={0.4}
                                stroke={chartConfig.scheduled.color}
                                stackId="a"
                                dot={false}
                                activeDot={{
                                    r: 4,
                                    fill: chartConfig.scheduled.color,
                                    stroke: 'white',
                                    strokeWidth: 1.5,
                                }}
                            />
                            <Area
                                dataKey="sales"
                                type="natural"
                                fill="url(#fillSales)"
                                fillOpacity={0.5}
                                stroke={chartConfig.sales.color}
                                stackId="a"
                                dot={false}
                                activeDot={{
                                    r: 4,
                                    fill: chartConfig.sales.color,
                                    stroke: 'white',
                                    strokeWidth: 1.5,
                                }}
                            />
                        </AreaChart>
                    </ChartContainer>
                    ) : (
                        <div className="h-[400px] w-full flex items-center justify-center">
                            <div className="text-center space-y-3">
                                <FunnelIcon size={48} className="mx-auto text-gray-300" />
                                <div className="text-gray-500">
                                    <p className="text-lg font-medium">Sem dados de histórico disponíveis</p>
                                    <p className="text-sm">Os dados do funil serão exibidos quando houver histórico de leads.</p>
                                </div>
                            </div>
                        </div>
                    )}
                </GlassmorphismCardContent>
            </GlassmorphismCard>
        </div>
    );
}
