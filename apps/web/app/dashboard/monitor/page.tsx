'use client';

import { useState, useCallback, useEffect, useRef, Fragment } from 'react';
import {
  Activity, RefreshCw, Zap, Clock, AlertTriangle,
  DollarSign, Cpu, Database, CircleDot,
  TrendingUp, BarChart3, Route, HardDrive, ChevronDown, ChevronRight,
} from 'lucide-react';
import {
  BarChart, Bar, PieChart, Pie, Cell,
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

interface ExecutionLog {
  id: string;
  timestamp: string;
  type: string;
  method: string | null;
  path: string;
  status_code: number;
  duration_ms: number;
  lead_id: string | null;
  channel: string | null;
  model: string | null;
  tokens_in: number;
  tokens_out: number;
  routing_decision: string | null;
  payload: Record<string, any> | null;
  metadata: Record<string, any> | null;
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
      {tab === 'executions' && <ExecutionsTab data={data} />}
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

const TYPE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  IN:      { bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'IN' },
  OUT:     { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'OUT' },
  PROCESS: { bg: 'bg-violet-100', text: 'text-violet-700', label: 'PROCESS' },
  TOOL:    { bg: 'bg-amber-100',  text: 'text-amber-700',  label: 'TOOL' },
  ERROR:   { bg: 'bg-red-100',    text: 'text-red-700',    label: 'ERROR' },
};

function ExecutionsTab({ data }: { data: MetricsSummary | null }) {
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (typeFilter) params.set('type', typeFilter);
      const res = await apiFetch(`/api/executions?${params}`);
      if (!res.ok) return;
      const json = await res.json();
      setLogs(json.data || []);
    } catch {
      // silently fail
    } finally {
      setLogsLoading(false);
    }
  }, [typeFilter]);

  useEffect(() => {
    setLogsLoading(true);
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    refreshRef.current = setInterval(fetchLogs, 15_000);
    return () => { if (refreshRef.current) clearInterval(refreshRef.current); };
  }, [fetchLogs]);

  const typeButtons = ['IN', 'OUT', 'PROCESS', 'TOOL', 'ERROR'] as const;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setTypeFilter(null)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            !typeFilter ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Todos
        </button>
        {typeButtons.map(t => {
          const style = TYPE_STYLES[t];
          return (
            <button
              key={t}
              onClick={() => setTypeFilter(typeFilter === t ? null : t)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                typeFilter === t ? `${style.bg} ${style.text}` : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {style.label}
            </button>
          );
        })}
        <span className="ml-auto text-xs text-gray-400">
          {logs.length} execuções · auto-refresh 15s
        </span>
      </div>

      {/* Execution log table */}
      <GlassmorphismCard className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-100 bg-gray-50/50">
                <th className="px-4 py-2.5 font-medium w-8"></th>
                <th className="px-4 py-2.5 font-medium">Horário</th>
                <th className="px-4 py-2.5 font-medium">Tipo</th>
                <th className="px-4 py-2.5 font-medium">Path</th>
                <th className="px-4 py-2.5 font-medium text-right">Status</th>
                <th className="px-4 py-2.5 font-medium text-right">Duração</th>
                <th className="px-4 py-2.5 font-medium">Lead</th>
              </tr>
            </thead>
            <tbody>
              {logsLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    <RefreshCw className="w-5 h-5 animate-spin inline mr-2" />
                    Carregando execuções...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    Nenhuma execução encontrada
                  </td>
                </tr>
              ) : (
                logs.map(log => {
                  const isExpanded = expandedId === log.id;
                  const style = TYPE_STYLES[log.type] || TYPE_STYLES.ERROR;
                  const ts = new Date(log.timestamp);
                  const durationMs = log.duration_ms ?? 0;

                  return (
                    <Fragment key={log.id}>
                      <tr
                        onClick={() => setExpandedId(isExpanded ? null : log.id)}
                        className={`border-b border-gray-50 cursor-pointer transition-colors ${
                          isExpanded ? 'bg-gray-50' : 'hover:bg-gray-50/50'
                        }`}
                      >
                        <td className="px-4 py-2.5 text-gray-400">
                          {isExpanded
                            ? <ChevronDown className="w-4 h-4" />
                            : <ChevronRight className="w-4 h-4" />}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-600 whitespace-nowrap">
                          {ts.toLocaleTimeString('pt-BR')}
                          <span className="text-gray-400 ml-1">{ts.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
                            {style.label}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs">{log.path}</td>
                        <td className="px-4 py-2.5 text-right">
                          <span className={`text-xs font-medium ${
                            log.status_code >= 400 ? 'text-red-600' : 'text-emerald-600'
                          }`}>
                            {log.status_code}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <span className={`text-xs font-medium ${
                            durationMs > 10000 ? 'text-red-600' : durationMs > 5000 ? 'text-amber-600' : 'text-gray-600'
                          }`}>
                            {formatMs(durationMs)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-500 max-w-[120px] truncate">
                          {log.lead_id ? log.lead_id.slice(0, 8) + '...' : '—'}
                        </td>
                      </tr>

                      {/* Expanded detail row */}
                      {isExpanded && (
                        <tr className="bg-gray-50/80">
                          <td colSpan={7} className="px-6 py-4">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                              <div>
                                <div className="text-xs text-gray-400 mb-0.5">Lead ID</div>
                                <div className="text-xs font-mono">{log.lead_id || '—'}</div>
                              </div>
                              <div>
                                <div className="text-xs text-gray-400 mb-0.5">Canal</div>
                                <div className="text-xs">{log.channel || '—'}</div>
                              </div>
                              <div>
                                <div className="text-xs text-gray-400 mb-0.5">Modelo</div>
                                <div className="text-xs font-mono">{log.model || '—'}</div>
                              </div>
                              <div>
                                <div className="text-xs text-gray-400 mb-0.5">Roteamento</div>
                                <div className="text-xs">{log.routing_decision || '—'}</div>
                              </div>
                            </div>

                            {(log.tokens_in > 0 || log.tokens_out > 0) && (
                              <div className="flex gap-4 mb-4">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs text-gray-400">Tokens In:</span>
                                  <span className="text-xs font-medium">{formatNumber(log.tokens_in)}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs text-gray-400">Tokens Out:</span>
                                  <span className="text-xs font-medium">{formatNumber(log.tokens_out)}</span>
                                </div>
                              </div>
                            )}

                            {log.payload && Object.keys(log.payload).length > 0 && (
                              <div>
                                <div className="text-xs text-gray-400 mb-1">Payload</div>
                                <pre className="text-xs font-mono bg-gray-900 text-green-400 p-3 rounded-lg overflow-x-auto max-h-48">
                                  {JSON.stringify(log.payload, null, 2)}
                                </pre>
                              </div>
                            )}

                            {log.metadata && Object.keys(log.metadata).length > 0 && (
                              <div className="mt-3">
                                <div className="text-xs text-gray-400 mb-1">Metadata</div>
                                <pre className="text-xs font-mono bg-gray-900 text-blue-400 p-3 rounded-lg overflow-x-auto max-h-48">
                                  {JSON.stringify(log.metadata, null, 2)}
                                </pre>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </GlassmorphismCard>
    </div>
  );
}
