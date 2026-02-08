/**
 * Types and interfaces for the Analytics Cache system
 * Requirements: 3.1, 3.3, 3.4, 3.5
 */

// ============================================
// Response Time Metrics
// ============================================

export interface ResponseTimeHistoryEntry {
  date: string;
  ai_avg: number;
  lead_avg: number;
}

export interface ResponseTimeMetrics {
  ai_avg_seconds: number;
  lead_avg_minutes: number;
  history: ResponseTimeHistoryEntry[];
}

// ============================================
// Sentiment Entry
// ============================================

export interface SentimentEntry {
  date: string;
  positive: number;
  neutral: number;
  negative: number;
}

// ============================================
// Dashboard Metrics (Main data structure)
// ============================================

export interface DashboardMetrics {
  total_leads: number;
  conversion_rate: number;
  em_atendimento: number;
  status_distribution: Record<string, number>;
  history: Array<{ date: string; leads: number }>;
  heatmap: Array<{ dow: number; hour: number; value: number }>;
  response_times: ResponseTimeMetrics;
  objections: Array<{ name: string; value: number }>;
  channels: Array<{ name: string; value: number; color: string }>;
  faq: Array<{ name: string; value: number }>;
  transfer_rate: number;
  transfer_count: number;
  sentiment_trend: Array<SentimentEntry>;
}

// ============================================
// Analytics Cache Entry
// ============================================

export type MetricType = 'dashboard' | 'funnel' | 'sentiment' | 'response_times';

export interface AnalyticsCacheEntry {
  id: string;
  metric_type: MetricType;
  data: DashboardMetrics;
  calculated_at: string;           // ISO timestamp
  calculation_duration_ms: number;
  trigger_source: string;
  previous_data: DashboardMetrics | null;
  created_at: string;
  updated_at: string;
}

// ============================================
// Serialization Functions
// ============================================

/**
 * Serializes DashboardMetrics to JSON string for storage in analytics_cache
 * Requirements: 3.4
 */
export function serializeMetrics(metrics: DashboardMetrics): string {
  return JSON.stringify(metrics);
}

/**
 * Deserializes JSON string back to DashboardMetrics
 * Requirements: 3.5
 */
export function deserializeMetrics(json: string): DashboardMetrics {
  return JSON.parse(json) as DashboardMetrics;
}

/**
 * Checks if cache entry is stale (older than specified minutes)
 * Requirements: 4.2
 */
export function isCacheStale(calculatedAt: string, maxAgeMinutes: number = 5): boolean {
  const calculatedDate = new Date(calculatedAt);
  const now = new Date();
  const diffMs = now.getTime() - calculatedDate.getTime();
  const diffMinutes = diffMs / (1000 * 60);
  return diffMinutes > maxAgeMinutes;
}

/**
 * Creates a placeholder metrics object for initial load
 * Requirements: 1.5
 */
export function createPlaceholderMetrics(): DashboardMetrics {
  return {
    total_leads: 0,
    conversion_rate: 0,
    em_atendimento: 0,
    status_distribution: {},
    history: [],
    heatmap: [],
    response_times: {
      ai_avg_seconds: 0,
      lead_avg_minutes: 0,
      history: [],
    },
    objections: [],
    channels: [],
    faq: [],
    transfer_rate: 0,
    transfer_count: 0,
    sentiment_trend: [],
  };
}
