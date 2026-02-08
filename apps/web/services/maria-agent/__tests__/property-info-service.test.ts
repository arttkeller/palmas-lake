/**
 * Property-Based Tests for Property Info Service
 * **Feature: palmas-lake-agent-maria**
 * 
 * Tests for property catalog information correctness
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { PropertyType, PropertyInfo } from '@/types/maria-agent';
import {
  PROPERTY_CATALOG,
  getPropertyInfo,
  getAvailablePropertyTypes,
  getAmenities,
  getDifferentials,
  getLocation,
  formatPropertyInfo,
  isValidPropertyType,
  AMENITIES,
  DIFFERENTIALS,
  LOCATION_INFO,
} from '../property-info-service';

// ============================================
// Expected Catalog Values (from Requirements)
// Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
// ============================================

const EXPECTED_CATALOG: Record<PropertyType, PropertyInfo> = {
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
// Arbitraries (Generators)
// ============================================

// Generator for valid property types
const propertyTypeArb: fc.Arbitrary<PropertyType> = fc.constantFrom(
  'apto_sky',
  'apto_garden',
  'apto_park',
  'sala_comercial',
  'office',
  'flat'
);

// ============================================
// Property Tests
// ============================================

describe('Property Info Service - Property Tests', () => {
  /**
   * **Feature: palmas-lake-agent-maria, Property 4: Informações de Unidades Corretas**
   * **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6**
   * 
   * *For any* consulta sobre tipo de unidade, as informações retornadas (área, preço, vagas)
   * devem corresponder exatamente ao catálogo definido
   */
  describe('Property 4: Informações de Unidades Corretas', () => {
    it('should return correct area for any property type', () => {
      fc.assert(
        fc.property(propertyTypeArb, (type) => {
          const info = getPropertyInfo(type);
          const expected = EXPECTED_CATALOG[type];
          
          expect(info.area).toBe(expected.area);
        }),
        { numRuns: 100 }
      );
    });

    it('should return correct price for any property type', () => {
      fc.assert(
        fc.property(propertyTypeArb, (type) => {
          const info = getPropertyInfo(type);
          const expected = EXPECTED_CATALOG[type];
          
          expect(info.price).toBe(expected.price);
        }),
        { numRuns: 100 }
      );
    });

    it('should return correct parking spots for any property type', () => {
      fc.assert(
        fc.property(propertyTypeArb, (type) => {
          const info = getPropertyInfo(type);
          const expected = EXPECTED_CATALOG[type];
          
          expect(info.parkingSpots).toBe(expected.parkingSpots);
        }),
        { numRuns: 100 }
      );
    });

    it('should return correct suites for any property type', () => {
      fc.assert(
        fc.property(propertyTypeArb, (type) => {
          const info = getPropertyInfo(type);
          const expected = EXPECTED_CATALOG[type];
          
          expect(info.suites).toBe(expected.suites);
        }),
        { numRuns: 100 }
      );
    });

    it('should return correct tower name for apartment types', () => {
      fc.assert(
        fc.property(
          fc.constantFrom<PropertyType>('apto_sky', 'apto_garden', 'apto_park'),
          (type) => {
            const info = getPropertyInfo(type);
            const expected = EXPECTED_CATALOG[type];
            
            expect(info.tower).toBe(expected.tower);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return all expected fields for any property type', () => {
      fc.assert(
        fc.property(propertyTypeArb, (type) => {
          const info = getPropertyInfo(type);
          const expected = EXPECTED_CATALOG[type];
          
          // All fields must match exactly
          expect(info.type).toBe(expected.type);
          expect(info.area).toBe(expected.area);
          expect(info.suites).toBe(expected.suites);
          expect(info.price).toBe(expected.price);
          expect(info.parkingSpots).toBe(expected.parkingSpots);
          expect(info.tower).toBe(expected.tower);
        }),
        { numRuns: 100 }
      );
    });

    it('should have PROPERTY_CATALOG match expected catalog for any type', () => {
      fc.assert(
        fc.property(propertyTypeArb, (type) => {
          const catalogEntry = PROPERTY_CATALOG[type];
          const expected = EXPECTED_CATALOG[type];
          
          expect(catalogEntry).toEqual(expected);
        }),
        { numRuns: 100 }
      );
    });
  });

  // ============================================
  // Additional Property Tests for Catalog Integrity
  // ============================================

  describe('Catalog Integrity', () => {
    it('should validate any valid property type', () => {
      fc.assert(
        fc.property(propertyTypeArb, (type) => {
          expect(isValidPropertyType(type)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });



    it('should return all property types from getAvailablePropertyTypes', () => {
      const availableTypes = getAvailablePropertyTypes();
      
      fc.assert(
        fc.property(propertyTypeArb, (type) => {
          expect(availableTypes).toContain(type);
        }),
        { numRuns: 100 }
      );
    });

    it('should return immutable copies from getAmenities', () => {
      fc.assert(
        fc.property(fc.nat({ max: 100 }), () => {
          const amenities1 = getAmenities();
          const amenities2 = getAmenities();
          
          // Should be equal but not the same reference
          expect(amenities1).toEqual(amenities2);
          expect(amenities1).not.toBe(amenities2);
          expect(amenities1).toEqual(AMENITIES);
        }),
        { numRuns: 100 }
      );
    });

    it('should return immutable copies from getDifferentials', () => {
      fc.assert(
        fc.property(fc.nat({ max: 100 }), () => {
          const differentials1 = getDifferentials();
          const differentials2 = getDifferentials();
          
          // Should be equal but not the same reference
          expect(differentials1).toEqual(differentials2);
          expect(differentials1).not.toBe(differentials2);
          expect(differentials1).toEqual(DIFFERENTIALS);
        }),
        { numRuns: 100 }
      );
    });

    it('should return immutable copy from getLocation', () => {
      fc.assert(
        fc.property(fc.nat({ max: 100 }), () => {
          const location1 = getLocation();
          const location2 = getLocation();
          
          // Should be equal but not the same reference
          expect(location1).toEqual(location2);
          expect(location1).not.toBe(location2);
          expect(location1).toEqual(LOCATION_INFO);
        }),
        { numRuns: 100 }
      );
    });
  });

  // ============================================
  // Format Function Tests
  // ============================================

  describe('Format Functions', () => {
    it('should include area in formatted output for any property type', () => {
      fc.assert(
        fc.property(propertyTypeArb, (type) => {
          const info = getPropertyInfo(type);
          const formatted = formatPropertyInfo(info);
          
          expect(formatted).toContain(info.area);
        }),
        { numRuns: 100 }
      );
    });

    it('should include price in formatted output for any property type', () => {
      fc.assert(
        fc.property(propertyTypeArb, (type) => {
          const info = getPropertyInfo(type);
          const formatted = formatPropertyInfo(info);
          
          expect(formatted).toContain(info.price);
        }),
        { numRuns: 100 }
      );
    });

    it('should include tower name in formatted output for apartment types', () => {
      fc.assert(
        fc.property(
          fc.constantFrom<PropertyType>('apto_sky', 'apto_garden', 'apto_park'),
          (type) => {
            const info = getPropertyInfo(type);
            const formatted = formatPropertyInfo(info);
            
            expect(formatted).toContain(info.tower!);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
