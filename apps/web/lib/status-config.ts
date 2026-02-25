/**
 * Status Normalization Configuration
 *
 * Shared utility for normalizing lead status values across the CRM.
 * Used by both the Leads table (leads/page.tsx) and the Pipeline Kanban (quadro/page.tsx)
 * to ensure consistent status display.
 *
 * Requirements: 6.1, 6.2
 */

/**
 * Canonical status values used throughout the system.
 */
export type CanonicalStatus =
  | 'novo_lead'
  | 'qualificado'
  | 'transferido'
  | 'visita_agendada'
  | 'visita_realizada'
  | 'proposta_enviada'
  | 'sold'
  | 'lost';

/**
 * All valid canonical status values.
 */
export const VALID_STATUSES: readonly CanonicalStatus[] = [
  'novo_lead',
  'qualificado',
  'transferido',
  'visita_agendada',
  'visita_realizada',
  'proposta_enviada',
  'sold',
  'lost',
] as const;

/**
 * Display configuration for each canonical status.
 */
export interface StatusConfig {
  value: CanonicalStatus;
  label: string;
  className: string;
}

export const STATUS_CONFIG: Record<CanonicalStatus, StatusConfig> = {
  novo_lead: {
    value: 'novo_lead',
    label: 'Novo Lead',
    className: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  qualificado: {
    value: 'qualificado',
    label: 'Qualificado',
    className: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  },
  transferido: {
    value: 'transferido',
    label: 'Transferido',
    className: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  visita_agendada: {
    value: 'visita_agendada',
    label: 'Visita Agendada',
    className: 'bg-purple-100 text-purple-800 border-purple-200',
  },
  visita_realizada: {
    value: 'visita_realizada',
    label: 'Visita Realizada',
    className: 'bg-orange-100 text-orange-800 border-orange-200',
  },
  proposta_enviada: {
    value: 'proposta_enviada',
    label: 'Proposta Enviada',
    className: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  sold: {
    value: 'sold',
    label: 'Vendido',
    className: 'bg-green-100 text-green-800 border-green-200',
  },
  lost: {
    value: 'lost',
    label: 'Perdido',
    className: 'bg-red-100 text-red-800 border-red-200',
  },
};

/**
 * Normalizes any status string to a canonical status value.
 *
 * This single function is the source of truth for status normalization
 * and must be used by both the Leads table and the Pipeline Kanban.
 *
 * Requirements: 6.1, 6.2
 */
export function normalizeStatus(status: string): CanonicalStatus {
  const s = (status ?? '').toLowerCase().trim();

  // Exact canonical matches first
  if (VALID_STATUSES.includes(s as CanonicalStatus)) {
    return s as CanonicalStatus;
  }

  // Alias / substring matching
  if (s.includes('new') || s.includes('novo')) return 'novo_lead';
  if (s.includes('transferido') || s.includes('transfer')) return 'transferido';
  if (s.includes('qualificado') || s.includes('contacted') || s.includes('contata')) return 'qualificado';
  if (s.includes('visita_agendada') || s.includes('visit_scheduled') || s.includes('agenda')) return 'visita_agendada';
  if (s.includes('visita_realizada')) return 'visita_realizada';
  if (s.includes('proposta')) return 'proposta_enviada';
  if (s.includes('sold') || s.includes('vend') || s.includes('fechado')) return 'sold';
  if (s.includes('lost') || s.includes('perdi')) return 'lost';

  // Default fallback
  return 'novo_lead';
}

/**
 * Returns the display configuration for a given status string.
 */
export function getStatusConfig(status: string): StatusConfig {
  const canonical = normalizeStatus(status);
  return STATUS_CONFIG[canonical];
}
