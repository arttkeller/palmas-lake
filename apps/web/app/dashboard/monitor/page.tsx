'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Activity, RefreshCw, Zap, Clock, AlertTriangle,
  DollarSign, Cpu, Database, Wifi, WifiOff, CircleDot,
  TrendingUp, BarChart3, Route, HardDrive,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { GlassmorphismCard } from '@/components/ui/glassmorphism-card';
import { apiFetch } from '@/lib/api-fetch';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';

// ── Types ─────────────────────────────────────────────────────────────

interface ModelMetrics {
  count: number;
  tokens_in: number;
  tokens_out: number;
  cached_tokens: number;
  cost_usd_est: number;
}

interface MetricsSummary {
  ai: {
    calls_total: number;
    calls_success: number;
    avg_latency_ms: number;
    p50_latency_ms: number;
    p95_latency_ms: number;
    tokens_in_total: number;
    tokens_out_total: number;
    cached_tokens_total: number;
    cost_usd_est: number;
    by_model: Record<string, ModelMetrics>;
  };
  http: {
    requests_total: number;
    by_endpoint: Record<string, { count: number; latency_sum_ms: number; avg_latency_ms: number }>;
  };
  business: {
    transfers: number;
    messages_sent: Record<string, number>;
  };
  routing: Record<string, number>;
  cache: {
    hits: number;
    misses: number;
    hit_rate: number;
  };
}

// ── Helpers ────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  const v = n ?? 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toFixed(0);
}

function formatMs(ms: number): string {
  const v = ms ?? 0;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}s`;
  return `${Math.round(v)}ms`;
}

function formatCurrency(usd: number): string {
  return `$${(usd ?? 0).toFixed(2)}`;
}

const COLORS = ['#8b5cf6', '#06b6d4', '#f59e0b', '#ef4444', '#22c55e', '#ec4899'];

// ── Tab definitions ───────────────────────────────────────────────────

type TabId = 'overview' | 'tokens' | 'routing' | 'executions';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <Activity className="w-4 h-4" /> },
  { id: 'tokens', label: 'Tokens & Custos', icon: <DollarSign className="w-4 h-4" /> },
  { id: 'routing', label: 'Roteamento', icon: <Route className="w-4 h-4" /> },
  { id: 'executions', label: 'Execuções', icon: <BarChart3 className="w-4 h-4" /> },
];

// ── Main component ────────────────────────────────────────────────────

export default function MonitorPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<MetricsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>('overview');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Admin guard
  useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.replace('/dashboard/quadro');
    }
  }, [authLoading, isAdmin, router]);

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await apiFetch('/api/metrics/summary');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setLastUpdate(new Date());
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar métricas');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + auto-refresh every 30s
  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchMetrics, 30_000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, fetchMetrics]);

  if (authLoading || (!isAdmin && !authLoading)) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  // ── Derived data ──────────────────────────────────────────────────

  const reqPerHour = data ? Math.round(data.http.requests_total / 24) : 0;

  const modelChartData = data
    ? Object.entries(data.ai.by_model).map(([name, m]) => ({
        name: name.replace('gpt-', ''),
        calls: m.count,
        tokens_in: m.tokens_in,
        tokens_out: m.tokens_out,
        cached: m.cached_tokens,
        cost: m.cost_usd_est,
      }))
    : [];

  const routingChartData = data
    ? Object.entries(data.routing).map(([name, count]) => ({ name, value: count }))
    : [];

  const cacheChartData = data
    ? [
        { name: 'Hits', value: data.cache.hits },
        { name: 'Misses', value: data.cache.misses },
      ]
    : [];

  const channelChartData = data
    ? Object.entries(data.business.messages_sent).map(([name, count]) => ({ name, value: count }))
    : [];

  const endpointData = data
    ? Object.entries(data.http.by_endpoint)
        .map(([path, info]) => ({ path: path.replace('/api/', ''), ...info }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
    : [];

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 p-4 sm:p-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Monitoramento</h1>
          <p className="text-sm text-gray-500">
            Observabilidade em tempo real da API Palmas Lake
            {lastUpdate && (
              <span className="ml-2">
                — atualizado {lastUpdate.toLocaleTimeString('pt-BR')}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              autoRefresh
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-gray-100 text-gray-500'
            }`}
          >
            <CircleDot className={`w-3 h-3 ${autoRefresh ? 'animate-pulse' : ''}`} />
            {autoRefresh ? 'Live' : 'Pausado'}
          </button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setLoading(true); fetchMetrics(); }}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-xl text-sm">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Tab Content */}
      {tab === 'overview' && <OverviewTab data={data} reqPerHour={reqPerHour} />}
      {tab === 'tokens' && <TokensTab data={data} modelChartData={modelChartData} />}
      {tab === 'routing' && <RoutingTab data={data} routingChartData={routingChartData} cacheChartData={cacheChartData} />}
      {tab === 'executions' && <ExecutionsTab data={data} endpointData={endpointData} channelChartData={channelChartData} />}
    </div>
  );
}

// ── KPI Card ────────────────────────────────────────────────────────

function KpiCard({
  icon,
  iconColor,
  value,
  label,
}: {
  icon: React.ReactNode;
  iconColor: string;
  value: string;
  label: string;
}) {
  return (
    <GlassmorphismCard className="p-4 sm:p-5">
      <div className={`mb-2 ${iconColor}`}>{icon}</div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </GlassmorphismCard>
  );
}

// ── Overview Tab ────────────────────────────────────────────────────

function OverviewTab({ data, reqPerHour }: { data: MetricsSummary | null; reqPerHour: number }) {
  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard
          icon={<Zap className="w-5 h-5" />}
          iconColor="text-blue-500"
          value={data ? formatNumber(data.http.requests_total) : '—'}
          label="Requests (24h)"
        />
        <KpiCard
          icon={<Clock className="w-5 h-5" />}
          iconColor="text-cyan-500"
          value={data ? String(reqPerHour) : '—'}
          label="Req/hora"
        />
        <KpiCard
          icon={<AlertTriangle className="w-5 h-5" />}
          iconColor="text-red-500"
          value="0"
          label="Erros (24h)"
        />
        <KpiCard
          icon={<TrendingUp className="w-5 h-5" />}
          iconColor="text-violet-500"
          value={data ? formatNumber((data.ai.tokens_in_total ?? 0) + (data.ai.tokens_out_total ?? 0)) : '—'}
          label="Tokens (24h)"
        />
        <KpiCard
          icon={<DollarSign className="w-5 h-5" />}
          iconColor="text-emerald-500"
          value={data ? formatCurrency(data.ai.cost_usd_est) : '—'}
          label="Custo (24h)"
        />
        <KpiCard
          icon={<Cpu className="w-5 h-5" />}
          iconColor="text-orange-500"
          value={data ? formatMs(data.ai.avg_latency_ms) : '—'}
          label="Latência média"
        />
      </div>

      {/* Service Status */}
      <GlassmorphismCard className="p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Status dos Serviços</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <ServiceStatus name="Supabase" icon={<Database className="w-4 h-4" />} />
          <ServiceStatus name="Redis" icon={<HardDrive className="w-4 h-4" />} />
          <ServiceStatus name="OpenAI" icon={<Cpu className="w-4 h-4" />} />
        </div>
      </GlassmorphismCard>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <GlassmorphismCard className="p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Transferências Hoje</h3>
          <div className="text-3xl font-bold text-violet-600">
            {data?.business.transfers ?? 0}
          </div>
        </GlassmorphismCard>
        <GlassmorphismCard className="p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Cache Semântico</h3>
          <div className="flex items-baseline gap-3">
            <div className="text-3xl font-bold text-emerald-600">
              {data ? `${((data.cache?.hit_rate ?? 0) * 100).toFixed(0)}%` : '—'}
            </div>
            <span className="text-sm text-gray-500">
              hit rate ({data?.cache.hits ?? 0} hits / {data?.cache.misses ?? 0} misses)
            </span>
          </div>
        </GlassmorphismCard>
      </div>
    </div>
  );
}

function ServiceStatus({ name, icon }: { name: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
      <div className="flex items-center gap-2">
        <div className="text-emerald-500">{icon}</div>
        <span className="text-sm font-medium text-gray-700">{name}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
          ok
        </span>
      </div>
    </div>
  );
}

// ── Tokens & Custos Tab ─────────────────────────────────────────────

function TokensTab({
  data,
  modelChartData,
}: {
  data: MetricsSummary | null;
  modelChartData: any[];
}) {
  return (
    <div className="space-y-6">
      {/* Token breakdown by model */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <GlassmorphismCard className="p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Tokens por Modelo</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={modelChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" fontSize={12} />
                <YAxis fontSize={12} tickFormatter={formatNumber} />
                <Tooltip formatter={(v) => formatNumber(Number(v ?? 0))} />
                <Legend />
                <Bar dataKey="tokens_in" name="Input" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="tokens_out" name="Output" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                <Bar dataKey="cached" name="Cached" fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassmorphismCard>

        <GlassmorphismCard className="p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Custo por Modelo</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={modelChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" fontSize={12} />
                <YAxis fontSize={12} tickFormatter={(v) => `$${(Number(v) || 0).toFixed(2)}`} />
                <Tooltip formatter={(v) => formatCurrency(Number(v ?? 0))} />
                <Bar dataKey="cost" name="Custo USD" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassmorphismCard>
      </div>

      {/* Model table */}
      <GlassmorphismCard className="p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Detalhamento por Modelo</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-100">
                <th className="pb-2 font-medium">Modelo</th>
                <th className="pb-2 font-medium text-right">Chamadas</th>
                <th className="pb-2 font-medium text-right">Tokens In</th>
                <th className="pb-2 font-medium text-right">Tokens Out</th>
                <th className="pb-2 font-medium text-right">Cached</th>
                <th className="pb-2 font-medium text-right">Custo</th>
              </tr>
            </thead>
            <tbody>
              {data && Object.entries(data.ai.by_model).map(([name, m]) => (
                <tr key={name} className="border-b border-gray-50">
                  <td className="py-2.5 font-mono text-xs">{name}</td>
                  <td className="py-2.5 text-right">{formatNumber(m.count)}</td>
                  <td className="py-2.5 text-right">{formatNumber(m.tokens_in)}</td>
                  <td className="py-2.5 text-right">{formatNumber(m.tokens_out)}</td>
                  <td className="py-2.5 text-right text-emerald-600">{formatNumber(m.cached_tokens)}</td>
                  <td className="py-2.5 text-right font-medium">{formatCurrency(m.cost_usd_est)}</td>
                </tr>
              ))}
            </tbody>
            {data && (
              <tfoot>
                <tr className="font-semibold border-t border-gray-200">
                  <td className="pt-2">Total</td>
                  <td className="pt-2 text-right">{formatNumber(data.ai.calls_total)}</td>
                  <td className="pt-2 text-right">{formatNumber((data.ai.tokens_in_total ?? 0) + (data.ai.tokens_out_total ?? 0))}</td>
                  <td className="pt-2 text-right">—</td>
                  <td className="pt-2 text-right">—</td>
                  <td className="pt-2 text-right">{formatCurrency(data.ai.cost_usd_est)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </GlassmorphismCard>
    </div>
  );
}

// ── Routing Tab ─────────────────────────────────────────────────────

function RoutingTab({
  data,
  routingChartData,
  cacheChartData,
}: {
  data: MetricsSummary | null;
  routingChartData: any[];
  cacheChartData: any[];
}) {
  const totalRouted = routingChartData.reduce((a, b) => a + b.value, 0);
  const lightPct = totalRouted > 0
    ? ((data?.routing.light || 0) / totalRouted * 100).toFixed(0)
    : '0';

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard
          icon={<Route className="w-5 h-5" />}
          iconColor="text-violet-500"
          value={`${lightPct}%`}
          label="Roteado para gpt-5-mini"
        />
        <KpiCard
          icon={<Zap className="w-5 h-5" />}
          iconColor="text-emerald-500"
          value={data ? `${((data.cache?.hit_rate ?? 0) * 100).toFixed(1)}%` : '—'}
          label="Cache hit rate"
        />
        <KpiCard
          icon={<DollarSign className="w-5 h-5" />}
          iconColor="text-amber-500"
          value={data ? formatCurrency(data.ai.cost_usd_est) : '—'}
          label="Custo total (24h)"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <GlassmorphismCard className="p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Distribuição de Roteamento</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={routingChartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                >
                  {routingChartData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </GlassmorphismCard>

        <GlassmorphismCard className="p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Cache Semântico</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={cacheChartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                >
                  <Cell fill="#22c55e" />
                  <Cell fill="#e5e7eb" />
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </GlassmorphismCard>
      </div>
    </div>
  );
}

// ── Executions Tab ──────────────────────────────────────────────────

function ExecutionsTab({
  data,
  endpointData,
  channelChartData,
}: {
  data: MetricsSummary | null;
  endpointData: any[];
  channelChartData: any[];
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <GlassmorphismCard className="p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Mensagens por Canal</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={channelChartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {channelChartData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </GlassmorphismCard>

        <GlassmorphismCard className="p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Top 10 Endpoints</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={endpointData} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" fontSize={12} />
                <YAxis type="category" dataKey="path" fontSize={10} width={75} />
                <Tooltip />
                <Bar dataKey="count" name="Requests" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassmorphismCard>
      </div>

      {/* Endpoint latency table */}
      <GlassmorphismCard className="p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Latência por Endpoint</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-100">
                <th className="pb-2 font-medium">Endpoint</th>
                <th className="pb-2 font-medium text-right">Requests</th>
                <th className="pb-2 font-medium text-right">Latência média</th>
              </tr>
            </thead>
            <tbody>
              {endpointData.map(ep => (
                <tr key={ep.path} className="border-b border-gray-50">
                  <td className="py-2 font-mono text-xs">/api/{ep.path}</td>
                  <td className="py-2 text-right">{formatNumber(ep.count)}</td>
                  <td className="py-2 text-right">{formatMs(ep.avg_latency_ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassmorphismCard>
    </div>
  );
}
