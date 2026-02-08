/**
 * Property-Based Tests for Availability Service - 24/7 Availability
 * **Feature: palmas-lake-agent-maria**
 * 
 * Tests for 24/7 availability requirements
 * Requirements: 13.1, 13.2
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  isAgentAvailable,
  shouldProcessMessage,
  isWithinBusinessHours,
  getAvailabilityStatus,
  validateAvailabilityConfiguration,
  processMessageWithAvailability,
  AVAILABILITY_CONFIG,
} from '../availability-service';

// ============================================
// Arbitraries (Generators)
// ============================================

// Generator for any valid Date (covering all hours, days, months)
const anyDateArb = fc.date({
  min: new Date('2020-01-01T00:00:00Z'),
  max: new Date('2030-12-31T23:59:59Z'),
});

// Generator for specific hours of the day (0-23)
const hourArb = fc.integer({ min: 0, max: 23 });

// Generator for days of the week (0-6, where 0 is Sunday)
const dayOfWeekArb = fc.integer({ min: 0, max: 6 });

// Generator for dates at specific hour and day
const dateAtHourAndDayArb = fc.tuple(
  fc.integer({ min: 2020, max: 2030 }), // year
  fc.integer({ min: 0, max: 11 }),       // month (0-11)
  fc.integer({ min: 1, max: 28 }),       // day (1-28 to avoid month overflow)
  hourArb,                                // hour
  fc.integer({ min: 0, max: 59 }),       // minute
  fc.integer({ min: 0, max: 59 })        // second
).map(([year, month, day, hour, minute, second]) => {
  return new Date(year, month, day, hour, minute, second);
});

// Generator for weekend dates (Saturday or Sunday)
const weekendDateArb = fc.tuple(
  fc.integer({ min: 2020, max: 2030 }),
  fc.integer({ min: 0, max: 11 }),
  fc.integer({ min: 1, max: 28 }),
  hourArb,
  fc.integer({ min: 0, max: 59 })
).chain(([year, month, day, hour, minute]) => {
  // Create a date and adjust to nearest weekend
  const date = new Date(year, month, day, hour, minute);
  const dayOfWeek = date.getDay();
  
  // Adjust to Saturday (6) or Sunday (0)
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return fc.constant(date);
  }
  
  // Move to next Saturday
  const daysUntilSaturday = 6 - dayOfWeek;
  date.setDate(date.getDate() + daysUntilSaturday);
  return fc.constant(date);
});

// Generator for late night hours (outside business hours: before 9h or after 19h)
const lateNightDateArb = fc.tuple(
  fc.integer({ min: 2020, max: 2030 }),
  fc.integer({ min: 0, max: 11 }),
  fc.integer({ min: 1, max: 28 }),
  fc.oneof(
    fc.integer({ min: 0, max: 8 }),   // Before 9h
    fc.integer({ min: 19, max: 23 })  // After 19h
  ),
  fc.integer({ min: 0, max: 59 })
).map(([year, month, day, hour, minute]) => {
  return new Date(year, month, day, hour, minute);
});

// Generator for business hours dates (Mon-Fri, 9h-18h)
const businessHoursDateArb = fc.tuple(
  fc.integer({ min: 2020, max: 2030 }),
  fc.integer({ min: 0, max: 11 }),
  fc.integer({ min: 1, max: 28 }),
  fc.integer({ min: 9, max: 18 }),  // Business hours
  fc.integer({ min: 0, max: 59 })
).chain(([year, month, day, hour, minute]) => {
  const date = new Date(year, month, day, hour, minute);
  const dayOfWeek = date.getDay();
  
  // If weekend, move to Monday
  if (dayOfWeek === 0) {
    date.setDate(date.getDate() + 1);
  } else if (dayOfWeek === 6) {
    date.setDate(date.getDate() + 2);
  }
  
  return fc.constant(date);
});

// ============================================
// Property Tests - 24/7 Availability
// ============================================

describe('Availability Service - Property Tests', () => {
  /**
   * **Feature: palmas-lake-agent-maria, Property 10: Disponibilidade 24/7**
   * **Validates: Requirements 13.1, 13.2**
   * 
   * *For any* message received at any time, the system should process and respond
   */
  describe('Property 10: Disponibilidade 24/7', () => {
    it('should be available for any timestamp', () => {
      fc.assert(
        fc.property(anyDateArb, (timestamp) => {
          const available = isAgentAvailable(timestamp);
          expect(available).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('should process messages at any time of day', () => {
      fc.assert(
        fc.property(dateAtHourAndDayArb, (timestamp) => {
          const shouldProcess = shouldProcessMessage(timestamp);
          expect(shouldProcess).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('should process messages on weekends', () => {
      fc.assert(
        fc.property(weekendDateArb, (timestamp) => {
          const shouldProcess = shouldProcessMessage(timestamp);
          expect(shouldProcess).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('should process messages during late night hours', () => {
      fc.assert(
        fc.property(lateNightDateArb, (timestamp) => {
          const shouldProcess = shouldProcessMessage(timestamp);
          expect(shouldProcess).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('should always return available status regardless of time', () => {
      fc.assert(
        fc.property(anyDateArb, (timestamp) => {
          const status = getAvailabilityStatus(timestamp);
          
          expect(status.isAvailable).toBe(true);
          expect(status.canProcessMessages).toBe(true);
          expect(status.canScheduleVisits).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('should have valid 24/7 configuration', () => {
      fc.assert(
        fc.property(fc.constant(null), () => {
          const validation = validateAvailabilityConfiguration();
          
          expect(validation.isValid).toBe(true);
          expect(validation.configuration.hoursPerDay).toBe(24);
          expect(validation.configuration.daysPerWeek).toBe(7);
          expect(validation.configuration.hasBusinessHoursRestriction).toBe(false);
          expect(validation.configuration.continuousProcessing).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('should process messages with availability wrapper at any time', async () => {
      await fc.assert(
        fc.asyncProperty(anyDateArb, async (timestamp) => {
          const mockProcessor = async () => ({ success: true, data: 'processed' });
          
          const result = await processMessageWithAvailability(timestamp, mockProcessor);
          
          expect(result.result.success).toBe(true);
          expect(result.metadata.availabilityMode).toBe('24/7');
        }),
        { numRuns: 100 }
      );
    });

    it('should correctly identify business hours while still being available', () => {
      fc.assert(
        fc.property(businessHoursDateArb, (timestamp) => {
          const withinBusiness = isWithinBusinessHours(timestamp);
          const available = isAgentAvailable(timestamp);
          
          // Should be within business hours
          expect(withinBusiness).toBe(true);
          // But availability should always be true regardless
          expect(available).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('should be available outside business hours', () => {
      fc.assert(
        fc.property(lateNightDateArb, (timestamp) => {
          const available = isAgentAvailable(timestamp);
          const shouldProcess = shouldProcessMessage(timestamp);
          
          // Even outside business hours, should be available
          expect(available).toBe(true);
          expect(shouldProcess).toBe(true);
        }),
        { numRuns: 100 }
      );
    });
  });
});

// ============================================
// Unit Tests - Availability Configuration
// ============================================

describe('Availability Service - Unit Tests', () => {
  describe('AVAILABILITY_CONFIG', () => {
    it('should be configured for 24 hours per day', () => {
      expect(AVAILABILITY_CONFIG.hoursPerDay).toBe(24);
    });

    it('should be configured for 7 days per week', () => {
      expect(AVAILABILITY_CONFIG.daysPerWeek).toBe(7);
    });

    it('should have no business hours restriction', () => {
      expect(AVAILABILITY_CONFIG.hasBusinessHoursRestriction).toBe(false);
    });

    it('should have continuous processing enabled', () => {
      expect(AVAILABILITY_CONFIG.continuousProcessing).toBe(true);
    });
  });

  describe('isAgentAvailable', () => {
    it('should return true without timestamp', () => {
      expect(isAgentAvailable()).toBe(true);
    });

    it('should return true at midnight', () => {
      const midnight = new Date('2024-01-15T00:00:00');
      expect(isAgentAvailable(midnight)).toBe(true);
    });

    it('should return true at noon', () => {
      const noon = new Date('2024-01-15T12:00:00');
      expect(isAgentAvailable(noon)).toBe(true);
    });

    it('should return true on Sunday', () => {
      const sunday = new Date('2024-01-14T10:00:00'); // Sunday
      expect(isAgentAvailable(sunday)).toBe(true);
    });

    it('should return true on Saturday night', () => {
      const saturdayNight = new Date('2024-01-13T23:59:59'); // Saturday
      expect(isAgentAvailable(saturdayNight)).toBe(true);
    });
  });

  describe('shouldProcessMessage', () => {
    it('should return true for any timestamp', () => {
      const timestamps = [
        new Date('2024-01-01T00:00:00'), // New Year midnight
        new Date('2024-12-25T03:00:00'), // Christmas early morning
        new Date('2024-07-04T23:59:59'), // Late night
        new Date('2024-06-15T12:00:00'), // Noon on Saturday
      ];

      for (const timestamp of timestamps) {
        expect(shouldProcessMessage(timestamp)).toBe(true);
      }
    });
  });

  describe('isWithinBusinessHours', () => {
    it('should return true during business hours on weekday', () => {
      // Monday at 10:00
      const mondayMorning = new Date('2024-01-15T10:00:00');
      expect(isWithinBusinessHours(mondayMorning)).toBe(true);
    });

    it('should return false on weekend', () => {
      // Saturday at 10:00
      const saturday = new Date('2024-01-13T10:00:00');
      expect(isWithinBusinessHours(saturday)).toBe(false);
    });

    it('should return false before 9h', () => {
      // Monday at 8:00
      const earlyMorning = new Date('2024-01-15T08:00:00');
      expect(isWithinBusinessHours(earlyMorning)).toBe(false);
    });

    it('should return false after 19h', () => {
      // Monday at 20:00
      const evening = new Date('2024-01-15T20:00:00');
      expect(isWithinBusinessHours(evening)).toBe(false);
    });
  });

  describe('getAvailabilityStatus', () => {
    it('should always indicate available', () => {
      const status = getAvailabilityStatus();
      expect(status.isAvailable).toBe(true);
      expect(status.canProcessMessages).toBe(true);
    });

    it('should indicate business hours status correctly', () => {
      // During business hours
      const businessHours = new Date('2024-01-15T10:00:00'); // Monday 10:00
      const statusBusiness = getAvailabilityStatus(businessHours);
      expect(statusBusiness.isWithinBusinessHours).toBe(true);
      expect(statusBusiness.message).toContain('horário comercial');

      // Outside business hours
      const afterHours = new Date('2024-01-15T22:00:00'); // Monday 22:00
      const statusAfter = getAvailabilityStatus(afterHours);
      expect(statusAfter.isWithinBusinessHours).toBe(false);
      expect(statusAfter.message).toContain('fora do horário comercial');
    });
  });

  describe('validateAvailabilityConfiguration', () => {
    it('should validate current configuration as valid', () => {
      const validation = validateAvailabilityConfiguration();
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
  });
});
