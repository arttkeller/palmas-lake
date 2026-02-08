'use client';

import { GlassmorphismCard, GlassmorphismCardContent } from '@/components/ui/glassmorphism-card';
import { Area, AreaChart, ResponsiveContainer, Tooltip } from 'recharts';
import { UsersIcon, ChartIcon, DollarIcon } from '@/components/icons/animated';
import { ClientOnlyChart } from './EmptyChartState';

// Business cards configuration
interface AreaChartStatsProps {
    data?: {
        total_leads: number;
        conversion_rate: number;
        status_distribution?: Record<string, number>;
        history?: { date: string; leads: number }[];
        conversion_rate_history?: { date: string; rate: number }[];
        sales_history?: { date: string; sales: number }[];
    }
}

/**
 * Determines if the AreaChartStats component has real data to display.
 * Returns false when total_leads is 0 and there is no history data.
 * Requirements: 1.4
 */
export function areaChartHasRealData(data?: AreaChartStatsProps['data']): boolean {
    if (!data) return false;
    return data.total_leads > 0 || (Array.isArray(data.history) && data.history.length > 0);
}

export default function AreaChartStats({ data }: AreaChartStatsProps) {
    // Requirements: 1.4 - Show empty state when no real data is available
    const hasRealData = data && (data.total_leads > 0 || (data.history && data.history.length > 0));

    const stats = data || {
        total_leads: 0,
        conversion_rate: 0,
        status_distribution: {},
        history: [],
        conversion_rate_history: [],
        sales_history: [],
    };

    // Map history to sparkline format if available, else show empty
    const leadsHistoryData = stats.history && stats.history.length > 0
        ? stats.history.map((h: any) => ({ value: h.leads }))
        : [];

    // Derive conversion rate sparkline from dedicated history or from leads history
    const conversionRateData = stats.conversion_rate_history && stats.conversion_rate_history.length > 0
        ? stats.conversion_rate_history.map((h: any) => ({ value: Math.round(h.rate * 100) }))
        : [];

    // Derive sales sparkline from dedicated history or from status distribution over time
    const salesData = stats.sales_history && stats.sales_history.length > 0
        ? stats.sales_history.map((h: any) => ({ value: h.sales }))
        : [];

    const sold = (stats.status_distribution?.['vendido'] || 0)
        + (stats.status_distribution?.['sold'] || 0)
        + (stats.status_distribution?.['proposta_enviada'] || 0)
        + (stats.status_distribution?.['venda_realizada'] || 0);

    const businessCards = [
        {
            title: 'Total de Leads',
            period: 'Últimos 30 dias',
            value: stats.total_leads.toString(),
            timestamp: '',
            data: leadsHistoryData,
            color: '#3b82f6', // blue-500
            iconType: 'users',
            gradientId: 'leadsGradient',
        },
        {
            title: 'Taxa de Conversão',
            period: 'Geral',
            value: `${stats.conversion_rate}%`,
            timestamp: '',
            data: conversionRateData,
            color: '#10b981', // emerald-500
            iconType: 'chart',
            gradientId: 'conversionGradient',
        },
        {
            title: 'Vendas Fechadas',
            period: 'Total acumulado',
            value: sold.toString(),
            timestamp: '',
            data: salesData,
            color: '#8b5cf6', // violet-500
            iconType: 'dollar',
            gradientId: 'salesGradient',
        },
    ];

    const renderIcon = (iconType: string) => {
        switch (iconType) {
            case 'users':
                return <UsersIcon size={20} />;
            case 'chart':
                return <ChartIcon size={20} />;
            case 'dollar':
                return <DollarIcon size={20} />;
            default:
                return null;
        }
    };
    // Requirements: 1.4 - If no real data, show empty state message
    if (!hasRealData) {
        return (
            <div className="w-full">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {businessCards.map((card, i) => (
                        <GlassmorphismCard key={i} variant="default" hoverable>
                            <GlassmorphismCardContent className="space-y-5 p-6">
                                <div className="flex items-center gap-2">
                                    {renderIcon(card.iconType)}
                                    <span className="text-base font-semibold text-gray-900">{card.title}</span>
                                </div>
                                <div className="flex items-center justify-center h-16">
                                    <span className="text-sm text-gray-400">Sem dados disponíveis</span>
                                </div>
                            </GlassmorphismCardContent>
                        </GlassmorphismCard>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="w-full">
            <div className="w-full">
                {/* Grid of 3 cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {businessCards.map((card, i) => {
                        return (
                            <GlassmorphismCard key={i} variant="default" hoverable>
                                <GlassmorphismCardContent className="space-y-5 p-6">
                                    {/* Header with icon and title */}
                                    <div className="flex items-center gap-2">
                                        {renderIcon(card.iconType)}
                                        <span className="text-base font-semibold text-gray-900">{card.title}</span>
                                    </div>

                                    <div className="flex items-end gap-2.5 justify-between">
                                        {/* Details */}
                                        <div className="flex flex-col gap-1">
                                            {/* Period */}
                                            <div className="text-sm text-gray-500 whitespace-nowrap">{card.period}</div>

                                            {/* Value */}
                                            <div className="text-3xl font-bold text-gray-900 tracking-tight">{card.value}</div>
                                        </div>

                                        {/* Chart or empty state */}
                                        {card.data.length > 0 ? (
                                        <div className="max-w-40 h-16 w-full relative" style={{ minWidth: 100, minHeight: 64 }}>
                                            <ClientOnlyChart height={64}>
                                            <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={64}>
                                                <AreaChart
                                                    data={card.data}
                                                    margin={{
                                                        top: 5,
                                                        right: 5,
                                                        left: 5,
                                                        bottom: 5,
                                                    }}
                                                >
                                                    <defs>
                                                        <linearGradient id={card.gradientId} x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="0%" stopColor={card.color} stopOpacity={0.3} />
                                                            <stop offset="100%" stopColor={card.color} stopOpacity={0.05} />
                                                        </linearGradient>
                                                        <filter id={`dotShadow${i}`} x="-50%" y="-50%" width="200%" height="200%">
                                                            <feDropShadow dx="2" dy="2" stdDeviation="3" floodColor="rgba(0,0,0,0.5)" />
                                                        </filter>
                                                    </defs>

                                                    <Tooltip
                                                        cursor={{ stroke: card.color, strokeWidth: 1, strokeDasharray: '2 2' }}
                                                        content={({ active, payload }) => {
                                                            if (active && payload && payload.length) {
                                                                const value = payload[0].value as number;
                                                                const formatValue = (val: number) => {
                                                                    // Simplified tooltip
                                                                    return `${val}`;
                                                                };

                                                                return (
                                                                    <div className="bg-white/95 backdrop-blur-sm border border-gray-200 shadow-lg rounded-lg p-2 pointer-events-none">
                                                                        <p className="text-sm font-semibold text-gray-900">{formatValue(value)}</p>
                                                                    </div>
                                                                );
                                                            }
                                                            return null;
                                                        }}
                                                    />

                                                    {/* Area with gradient and enhanced shadow */}
                                                    <Area
                                                        type="monotone"
                                                        dataKey="value"
                                                        stroke={card.color}
                                                        fill={`url(#${card.gradientId})`}
                                                        strokeWidth={2}
                                                        dot={false}
                                                        activeDot={{
                                                            r: 6,
                                                            fill: card.color,
                                                            stroke: 'white',
                                                            strokeWidth: 2,
                                                            filter: `url(#dotShadow${i})`,
                                                        }}
                                                    />
                                                </AreaChart>
                                            </ResponsiveContainer>
                                            </ClientOnlyChart>
                                        </div>
                                        ) : (
                                        <div className="max-w-40 h-16 w-full relative flex items-center justify-center" style={{ minWidth: 100, minHeight: 64 }}>
                                            <span className="text-xs text-gray-300">Sem histórico</span>
                                        </div>
                                        )}
                                    </div>
                                </GlassmorphismCardContent>
                            </GlassmorphismCard>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
