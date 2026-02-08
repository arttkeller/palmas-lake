'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Loader2, Download, RefreshCw, Wifi, WifiOff, Clock } from 'lucide-react';
import AreaChartStats from '@/components/charts/AreaChartStats';
import ConversionFunnel from '@/components/charts/ConversionFunnel';
import ResponseTimeChart from '@/components/charts/ResponseTimeChart';
import PredictabilityCard from '@/components/charts/PredictabilityCard';
import ChannelDonut from '@/components/charts/ChannelDonut';
import AppointmentHeatmap from '@/components/charts/AppointmentHeatmap';
import { API_BASE_URL } from '@/lib/api-config';
import ObjectionBarChart from '@/components/charts/ObjectionBarChart';
import SentimentTrendChart from '@/components/charts/SentimentTrendChart';
import FAQChart from '@/components/charts/FAQChart';
import TransferRateCard from '@/components/charts/TransferRateCard';
import { useAnalyticsCache } from '@/hooks/useAnalyticsCache';
import type { DashboardMetrics } from '@/types/analytics-cache';

/**
 * Maps DashboardMetrics from cache to the format expected by chart components.
 * Preserves all real values from the cache — no hardcoded zeros or empty arrays
 * where real data should be mapped.
 * Requirements: 3.2
 */
export function mapCacheDataToChartFormat(cacheData: DashboardMetrics): any {
    // Compute predictability from history data when available
    const history = cacheData.history || [];
    const last7 = history.slice(-7);
    const prev7 = history.slice(-14, -7);
    const avgLast = last7.length > 0
        ? last7.reduce((acc, h) => acc + h.leads, 0) / last7.length
        : 0;
    const avgPrev = prev7.length > 0
        ? prev7.reduce((acc, h) => acc + h.leads, 0) / prev7.length
        : 0;
    const growth = avgPrev > 0 ? ((avgLast - avgPrev) / avgPrev) * 100 : 0;
    const trend = growth > 5 ? 'up' : growth < -5 ? 'down' : 'stable';
    const forecastNextMonth = Math.round(avgLast * 30);

    return {
        total_leads: cacheData.total_leads || 0,
        active_leads: cacheData.em_atendimento || 0,
        conversion_rate: cacheData.conversion_rate || 0,
        em_atendimento: cacheData.em_atendimento || 0,
        response_rate: 0,
        status_distribution: cacheData.status_distribution || {},
        funnel_data: (cacheData as any).funnel_data || [],
        temperature_distribution: (cacheData as any).temperature_distribution || {},
        source_analysis: (cacheData as any).source_analysis || [],
        channels: cacheData.channels || [],
        history: history,
        sentiment_trend: cacheData.sentiment_trend || [],
        objections: cacheData.objections || [],
        response_times: cacheData.response_times ? {
            ai_avg_seconds: cacheData.response_times.ai_avg_seconds ?? 0,
            lead_avg_minutes: cacheData.response_times.lead_avg_minutes ?? 0,
            history: cacheData.response_times.history ?? []
        } : { ai_avg_seconds: 0, lead_avg_minutes: 0, history: [] },
        faq: cacheData.faq || [],
        transfer_rate: cacheData.transfer_rate || 0,
        transfer_count: cacheData.transfer_count || 0,
        heatmap: cacheData.heatmap || [],
        predictability: {
            score: Math.round(Math.abs(growth)),
            trend,
            forecast_next_month: forecastNextMonth,
        },
    };
}

/**
 * Determines if the analytics page should show a loading/calculating indicator.
 * Returns true when cache has never been populated (lastUpdate is null)
 * and a refresh or calculation is in progress.
 * Requirements: 4.1, 4.2
 */
export function shouldShowCalculatingBanner(lastUpdate: Date | null, isRefreshing: boolean, isCalculating: boolean = false): boolean {
    return lastUpdate === null && (isRefreshing || isCalculating);
}

/**
 * Analytics Dashboard Page
 * 
 * Uses the useAnalyticsCache hook to subscribe to real-time analytics updates
 * via Supabase Realtime. The page never shows a loading spinner after initial
 * load - it always displays cached data and updates seamlessly.
 * 
 * Requirements: 1.1, 1.3, 1.4, 4.1, 4.2, 4.4
 */
export default function AnalyticsPage() {
    const [exporting, setExporting] = useState(false);
    const [highlightUpdate, setHighlightUpdate] = useState(false);
    const previousDataRef = useRef<DashboardMetrics | null>(null);

    // Stable callback for onUpdate to prevent re-subscription loops
    const handleDataUpdate = useCallback((newData: DashboardMetrics) => {
        // Requirements: 4.4 - Briefly highlight updated sections on realtime update
        if (previousDataRef.current && JSON.stringify(previousDataRef.current) !== JSON.stringify(newData)) {
            setHighlightUpdate(true);
            setTimeout(() => setHighlightUpdate(false), 1500);
        }
        previousDataRef.current = newData;
    }, []);

    // Use the analytics cache hook for real-time updates
    // Requirements: 1.1 - Cached metrics within 100ms
    // Requirements: 1.3 - Receive new data via Realtime without user action
    // Requirements: 1.4 - Continue displaying previous cached data during processing
    // Requirements: 4.3 - Non-blocking refresh with isRefreshing state
    const {
        data: cacheData,
        lastUpdate,
        calculationDurationMs,
        isLoading,
        isRefreshing,
        isCalculating,
        isStale,
        refresh,
        isConnected,
    } = useAnalyticsCache({
        metricType: 'dashboard',
        onUpdate: handleDataUpdate,
    });

    // Requirements: 4.1 - Trigger refresh on mount when cache is empty or stale
    const hasTriggeredMountRefresh = useRef(false);
    useEffect(() => {
        if (!isLoading && !hasTriggeredMountRefresh.current) {
            // Auto-refresh when cache is empty (lastUpdate null) OR data is stale
            if (lastUpdate === null || isStale) {
                hasTriggeredMountRefresh.current = true;
                console.log('[AnalyticsPage] Auto-refreshing: lastUpdate=', lastUpdate, 'isStale=', isStale);
                refresh().catch((err) => {
                    console.warn('[AnalyticsPage] Mount auto-refresh failed:', err);
                });
            }
        }
    }, [isLoading, lastUpdate, isStale, refresh]);

    // Map cache data to chart format
    const data = mapCacheDataToChartFormat(cacheData);

    const handleExport = async () => {
        setExporting(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/analytics/export`);
            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `relatorio_analytics_${new Date().toISOString().split('T')[0]}.xlsx`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                a.remove();
            } else {
                console.error('Export failed');
                alert('Erro ao exportar relatório. Verifique se o backend está rodando.');
            }
        } catch (error) {
            console.error('Export error:', error);
            alert('Erro ao exportar relatório. Verifique se o backend está rodando.');
        } finally {
            setExporting(false);
        }
    };

    // Handle manual refresh - Requirements: 4.3
    // The hook now handles preventing multiple simultaneous calls and managing isRefreshing state
    const handleRefresh = async () => {
        try {
            await refresh();
        } catch (err) {
            console.error('Refresh failed:', err);
        }
    };

    // Format last update time for display - Requirements: 4.1
    const formatLastUpdate = (date: Date | null): string => {
        if (!date) return 'Nunca atualizado';
        return date.toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });
    };

    // Format calculation duration
    const formatDuration = (ms: number | null): string => {
        if (!ms) return '';
        if (ms < 1000) return `${ms}ms`;
        return `${(ms / 1000).toFixed(1)}s`;
    };

    // Show minimal loading only on very first load
    if (isLoading) {
        return (
            <div className="flex flex-col h-96 items-center justify-center gap-4">
                <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-emerald-600 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">Carregando análises...</p>
                </div>
            </div>
        );
    }

    return (
        <div className={`space-y-6 p-4 sm:p-6 transition-all duration-500 ${highlightUpdate ? 'ring-2 ring-emerald-400/50 ring-offset-2 rounded-lg' : ''}`}>
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-gray-900">
                        Análise de Desempenho
                    </h2>
                    <div className="flex items-center gap-2">
                        <p className="text-gray-500">
                            Visão estratégica do pipeline e eficiência do agente
                        </p>
                        {/* Connection status indicator */}
                        {isConnected ? (
                            <span title="Conectado ao Realtime">
                                <Wifi className="h-4 w-4 text-emerald-500" />
                            </span>
                        ) : (
                            <span title="Desconectado do Realtime">
                                <WifiOff className="h-4 w-4 text-gray-400" />
                            </span>
                        )}
                    </div>
                    {/* Last update timestamp - Requirements: 4.1 */}
                    <div className="flex items-center gap-2 mt-1">
                        <Clock className="h-3 w-3 text-gray-400" />
                        <p className="text-xs text-gray-400">
                            Última atualização: {formatLastUpdate(lastUpdate)}
                            {calculationDurationMs && (
                                <span className="ml-2 text-gray-300">
                                    ({formatDuration(calculationDurationMs)})
                                </span>
                            )}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleRefresh}
                        disabled={isLoading || isRefreshing}
                        className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                        {isRefreshing ? 'Atualizando...' : 'Atualizar'}
                    </button>
                    <button
                        onClick={handleExport}
                        disabled={exporting}
                        className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {exporting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Download className="h-4 w-4" />
                        )}
                        Exportar Excel
                    </button>
                </div>
            </div>

            {/* 1. High-Level KPIs */}
            <div className={`transition-all duration-300 ${highlightUpdate ? 'scale-[1.01]' : ''}`}>
                {/* Requirements: 4.1, 4.2 - Show calculating indicator when data is loading or being calculated */}
                {!lastUpdate && (isRefreshing || isCalculating) && (
                    <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
                        <p className="text-sm font-medium text-emerald-800">
                            Calculando métricas... Aguarde alguns segundos.
                        </p>
                    </div>
                )}
                {/* Requirements: 3.1 - Show calculating indicator when backend is computing metrics (with existing data) */}
                {lastUpdate && isCalculating && (
                    <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
                        <p className="text-sm font-medium text-emerald-800">
                            Atualizando métricas...
                        </p>
                    </div>
                )}
                <AreaChartStats data={data} />
            </div>

            {/* 2. Critical Path: Funnel */}
            <div className={`transition-all duration-300 ${highlightUpdate ? 'scale-[1.01]' : ''}`}>
                <ConversionFunnel data={data} />
            </div>

            {/* 3. Operational Efficiency */}
            <section className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-800">Eficiência Operacional</h3>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className={`lg:col-span-2 flex flex-col gap-4 transition-all duration-300 ${highlightUpdate ? 'scale-[1.005]' : ''}`}>
                        <ResponseTimeChart data={data} />
                        <SentimentTrendChart data={data} />
                    </div>
                    <div className={`lg:col-span-1 flex flex-col gap-4 transition-all duration-300 ${highlightUpdate ? 'scale-[1.005]' : ''}`}>
                        <TransferRateCard data={data} />
                        <PredictabilityCard data={data} />
                        <ChannelDonut data={data} />
                    </div>
                </div>
            </section>

            {/* 4. Strategic Insights */}
            <section className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-800">Insights Estratégicos</h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className={`transition-all duration-300 ${highlightUpdate ? 'scale-[1.005]' : ''}`}>
                        <AppointmentHeatmap data={data} />
                    </div>
                    <div className={`transition-all duration-300 ${highlightUpdate ? 'scale-[1.005]' : ''}`}>
                        <ObjectionBarChart data={data} />
                    </div>
                </div>
            </section>

            {/* 5. FAQ - Perguntas Frequentes */}
            <section className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-800">Perguntas Mais Frequentes</h3>
                <div className={`transition-all duration-300 ${highlightUpdate ? 'scale-[1.005]' : ''}`}>
                    <FAQChart data={data} />
                </div>
            </section>
        </div>
    );
}
