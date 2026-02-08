/**
 * Pure utility functions for ConversionFunnel computation.
 *
 * Extracted so the logic can be tested independently of React rendering.
 */

export interface FunnelInput {
  total_leads: number;
  conversion_rate: number;
  status_distribution?: Record<string, number>;
  history?: { date: string; leads: number }[];
  em_atendimento?: number | null;
}

export interface FunnelValues {
  total: number;
  contacted: number;
  sold: number;
  scheduled: number;
  newLeads: number;
  salesRatio: number;
  scheduleRatio: number;
  contactRatio: number;
}

/**
 * Computes funnel stage counts and ratios from dashboard stats.
 *
 * Key fixes over the original inline logic:
 *  - Uses `??` instead of `||` so that `0` is preserved for
 *    `em_atendimento` and `total_leads`.
 *  - Guards every ratio with `total > 0` to avoid division-by-zero.
 */
export function computeFunnelValues(stats: FunnelInput): FunnelValues {
  const statusDist = stats.status_distribution ?? {};

  const total = stats.total_leads ?? 0;

  const sold =
    (statusDist['vendido'] ?? 0) +
    (statusDist['sold'] ?? 0) +
    (statusDist['proposta_enviada'] ?? 0);

  const scheduled =
    (statusDist['visita_agendada'] ?? 0) +
    (statusDist['visita_realizada'] ?? 0) +
    (statusDist['visit_scheduled'] ?? 0);

  const newLeads =
    (statusDist['novo'] ?? 0) +
    (statusDist['new'] ?? 0) +
    (statusDist['novo_lead'] ?? 0);

  const contacted =
    stats.em_atendimento ?? Math.max(0, total - newLeads);

  const salesRatio = total > 0 ? sold / total : 0;
  const scheduleRatio = total > 0 ? (scheduled + sold) / total : 0;
  const contactRatio = total > 0 ? contacted / total : 0;

  return {
    total,
    contacted,
    sold,
    scheduled,
    newLeads,
    salesRatio,
    scheduleRatio,
    contactRatio,
  };
}
