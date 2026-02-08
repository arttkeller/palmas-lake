/**
 * Property Info Service for Maria Agent (Palmas Lake Towers)
 * Provides property catalog, amenities, and differentials information
 * Requirements: 4.5, 4.6, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */

import type { PropertyType, PropertyInfo, LocationInfo } from '@/types/maria-agent';

// ============================================
// Property Catalog
// Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
// ============================================

export const PROPERTY_CATALOG: Record<PropertyType, PropertyInfo> = {
  apto_sky: {
    type: 'apto_sky',
    area: '331,29m²',
    suites: '4 suítes + dependência',
    price: 'R$ 7.583.228,10',
    parkingSpots: 4,
    tower: 'Torre Sky',
  },
  apto_garden: {
    type: 'apto_garden',
    area: '222,7m²',
    suites: '4 suítes + dependência',
    price: 'R$ 5.237.904,00',
    parkingSpots: 3,
    tower: 'Torre Garden',
  },
  apto_park: {
    type: 'apto_park',
    area: '189,25m²',
    suites: '3 suítes',
    price: 'R$ 4.368.556,50',
    parkingSpots: 2,
    tower: 'Torre Park',
  },
  sala_comercial: {
    type: 'sala_comercial',
    area: 'a partir de 42,49m²',
    suites: '-',
    price: 'R$ 1.274.700,00',
    parkingSpots: 0,
  },
  office: {
    type: 'office',
    area: 'a partir de 52,04m²',
    suites: '-',
    price: 'R$ 1.053.029,40',
    parkingSpots: 0,
  },
  flat: {
    type: 'flat',
    area: 'a partir de 44,51m²',
    suites: '1 suíte',
    price: 'R$ 900.659,85',
    parkingSpots: 1,
  },
};

// ============================================
// Amenities List
// Requirements 4.5: área de lazer
// ============================================

export const AMENITIES: string[] = [
  'piscinas',
  'academia',
  'salão de festas',
  'churrasqueira',
  'playground',
  'quadra',
  'espaço pet',
  'beach club',
  'brinquedoteca',
];

// ============================================
// Differentials List
// Requirements 4.6: diferenciais do empreendimento
// ============================================

export const DIFFERENTIALS: string[] = [
  'vista para lago',
  'praia privativa',
  'marina exclusiva',
  'único pé na areia de Palmas',
  'pôr do sol exclusivo',
];

// ============================================
// Location Info
// Requirements 4.1: localização
// ============================================

export const LOCATION_INFO: LocationInfo = {
  address: 'AV JK, LT 09K',
  neighborhood: 'Orla 14',
  city: 'Palmas',
  state: 'TO',
  reference: 'Stand de Vendas na Orla 14',
};

// ============================================
// Service Functions
// ============================================

/**
 * Gets property information by type
 * Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */
export function getPropertyInfo(type: PropertyType): PropertyInfo {
  return PROPERTY_CATALOG[type];
}

/**
 * Gets all available property types
 */
export function getAvailablePropertyTypes(): PropertyType[] {
  return Object.keys(PROPERTY_CATALOG) as PropertyType[];
}

/**
 * Gets list of amenities
 * Requirements 4.5
 */
export function getAmenities(): string[] {
  return [...AMENITIES];
}

/**
 * Gets list of differentials
 * Requirements 4.6
 */
export function getDifferentials(): string[] {
  return [...DIFFERENTIALS];
}

/**
 * Gets location information
 * Requirements 4.1
 */
export function getLocation(): LocationInfo {
  return { ...LOCATION_INFO };
}

/**
 * Formats property info as a readable string for chat responses
 */
export function formatPropertyInfo(info: PropertyInfo): string {
  const parts = [
    info.tower ? `${info.tower}:` : `${info.type}:`,
    `Área: ${info.area}`,
    info.suites !== '-' ? `${info.suites}` : null,
    `A partir de ${info.price}`,
    info.parkingSpots > 0 ? `${info.parkingSpots} vaga${info.parkingSpots > 1 ? 's' : ''}` : null,
  ].filter(Boolean);

  return parts.join(' | ');
}

/**
 * Formats amenities as a readable string
 */
export function formatAmenities(): string {
  return AMENITIES.join(', ');
}

/**
 * Formats differentials as a readable string
 */
export function formatDifferentials(): string {
  return DIFFERENTIALS.join(', ');
}

/**
 * Gets property info by user query (maps common terms to property types)
 */
export function getPropertyInfoByQuery(query: string): PropertyInfo | null {
  const normalized = query.toLowerCase().trim();

  // Map common queries to property types
  const queryMappings: Array<{ keywords: string[]; type: PropertyType }> = [
    { keywords: ['sky', 'torre sky', '331', '4 suites sky'], type: 'apto_sky' },
    { keywords: ['garden', 'torre garden', '222', '4 suites garden'], type: 'apto_garden' },
    { keywords: ['park', 'torre park', '189', '3 suites'], type: 'apto_park' },
    { keywords: ['sala comercial', 'comercial', 'loja'], type: 'sala_comercial' },
    { keywords: ['office', 'offices', 'escritorio'], type: 'office' },
    { keywords: ['flat', 'loft', 'studio', '44'], type: 'flat' },
  ];

  for (const mapping of queryMappings) {
    for (const keyword of mapping.keywords) {
      if (normalized.includes(keyword)) {
        return PROPERTY_CATALOG[mapping.type];
      }
    }
  }

  return null;
}

/**
 * Checks if a property type is valid
 */
export function isValidPropertyType(type: string): type is PropertyType {
  return type in PROPERTY_CATALOG;
}
