/**
 * Helpers para exibir interest_type em linguagem natural.
 */

const INTEREST_LABELS: Record<string, string> = {
  apartamento: 'Apartamento',
  sala_comercial: 'Sala Comercial',
  office: 'Office',
  flat: 'Flat',
  loft: 'Loft',
};

const INTEREST_EMOJIS: Record<string, string> = {
  apartamento: '🏠',
  sala_comercial: '🏢',
  office: '💼',
  flat: '🏨',
  loft: '🏙️',
};

function toTitleCaseFromSlug(value: string): string {
  return value
    .split(/[_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function formatInterestType(
  interestType?: string | null,
  options?: { withEmoji?: boolean }
): string {
  if (!interestType) {
    return '';
  }

  const normalized = interestType.trim().toLowerCase();
  const label = INTEREST_LABELS[normalized] || toTitleCaseFromSlug(normalized);

  if (!options?.withEmoji) {
    return label;
  }

  const emoji = INTEREST_EMOJIS[normalized] || '🏠';
  return `${emoji} ${label}`;
}
