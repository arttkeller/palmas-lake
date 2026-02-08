/**
 * Visit Service for Maria Agent (Palmas Lake Towers)
 * Handles visit scheduling, confirmation, and reminders
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 */

import type {
  Visit,
  VisitPeriod,
  VisitStatus,
  PalmasLakeLead,
} from '@/types/maria-agent';
import { createClient } from '@/lib/supabase';

// ============================================
// Constants
// ============================================

const SCHEMA = 'palmaslake-agno';
const VISITS_TABLE = 'visits';

// ============================================
// Visit Configuration
// Requirements 6.2, 6.3
// ============================================

export const VISIT_CONFIG = {
  /** Stand de vendas location */
  location: {
    address: 'AV JK, Orla 14',
    reference: 'Stand de Vendas Palmas Lake Towers',
  },
  /** Available hours for visits (Requirements 6.2) */
  schedule: {
    weekdays: {
      start: 9, // 9h
      end: 19,  // 19h
    },
    /** Morning period ends at 12h */
    morningEnd: 12,
    /** Afternoon period starts at 12h */
    afternoonStart: 12,
  },
  /** Reminder configuration (Requirements 6.6) */
  reminder: {
    /** Send reminder 1 day before */
    daysBefore: 1,
  },
};

// ============================================
// Visit Questions (Requirements 6.4)
// ============================================

export const VISIT_QUESTIONS = {
  preferredDay: 'Qual o melhor dia para você?',
  preferredPeriod: 'Prefere manhã ou tarde?',
};

// ============================================
// Visit Messages
// ============================================

export const VISIT_MESSAGES = {
  /** Initial visit offer */
  offer: 'Claro! Temos disponibilidade para visitas de segunda a sexta, das 9h às 19h. Qual o melhor dia para você? Prefere manhã ou tarde?',
  
  /** Confirmation message template (Requirements 6.5) */
  confirmation: (name: string, day: string, period: string, location: string): string =>
    `Perfeito, ${name}! Sua visita está agendada para ${day} ${period === 'morning' ? 'pela manhã' : 'à tarde'} no ${location}. Vou te enviar um lembrete um dia antes.`,
  
  /** Reminder message template (Requirements 6.6) */
  reminder: (name: string, day: string, period: string, location: string): string =>
    `Olá ${name}! 👋 Lembrando que amanhã você tem uma visita agendada ${period === 'morning' ? 'pela manhã' : 'à tarde'} no ${location}. Estamos te esperando!`,
  
  /** Location info */
  locationInfo: `Nosso stand de vendas fica na ${VISIT_CONFIG.location.address}.`,
};

// ============================================
// Visit State Interface
// ============================================

export interface VisitSchedulingState {
  step: 'initial' | 'collecting_day' | 'collecting_period' | 'confirming' | 'complete';
  preferredDay?: string;
  preferredPeriod?: VisitPeriod;
}

// ============================================
// Visit Scheduling Result
// ============================================

export interface VisitSchedulingResult {
  success: boolean;
  message: string;
  visit?: Visit;
  nextStep?: 'collecting_day' | 'collecting_period' | 'confirming';
}

// ============================================
// Helper Functions
// ============================================

/**
 * Creates initial visit scheduling state
 */
export function createInitialVisitState(): VisitSchedulingState {
  return {
    step: 'initial',
  };
}

/**
 * Parses period from user input
 * Requirements 6.4: Collect morning/afternoon preference
 */
export function parsePeriodFromInput(input: string): VisitPeriod | null {
  const normalized = input.toLowerCase().trim();
  
  const morningKeywords = ['manhã', 'manha', 'morning', 'cedo', 'matutino'];
  const afternoonKeywords = ['tarde', 'afternoon', 'vespertino'];
  
  if (morningKeywords.some(kw => normalized.includes(kw))) {
    return 'morning';
  }
  
  if (afternoonKeywords.some(kw => normalized.includes(kw))) {
    return 'afternoon';
  }
  
  return null;
}

/**
 * Parses day from user input
 * Accepts various formats: "segunda", "segunda-feira", "amanhã", specific dates
 */
export function parseDayFromInput(input: string): string | null {
  const normalized = input.toLowerCase().trim();
  
  // Day of week mappings
  const dayMappings: Record<string, string> = {
    'segunda': 'Segunda-feira',
    'segunda-feira': 'Segunda-feira',
    'terça': 'Terça-feira',
    'terca': 'Terça-feira',
    'terça-feira': 'Terça-feira',
    'terca-feira': 'Terça-feira',
    'quarta': 'Quarta-feira',
    'quarta-feira': 'Quarta-feira',
    'quinta': 'Quinta-feira',
    'quinta-feira': 'Quinta-feira',
    'sexta': 'Sexta-feira',
    'sexta-feira': 'Sexta-feira',
  };
  
  // Check for day of week
  for (const [key, value] of Object.entries(dayMappings)) {
    if (normalized.includes(key)) {
      return value;
    }
  }
  
  // Check for relative days
  if (normalized.includes('amanhã') || normalized.includes('amanha')) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return formatDateForDisplay(tomorrow);
  }
  
  if (normalized.includes('hoje')) {
    return formatDateForDisplay(new Date());
  }
  
  // Try to parse as date (DD/MM or DD/MM/YYYY)
  const dateMatch = normalized.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (dateMatch) {
    const day = parseInt(dateMatch[1], 10);
    const month = parseInt(dateMatch[2], 10) - 1;
    const year = dateMatch[3] 
      ? (dateMatch[3].length === 2 ? 2000 + parseInt(dateMatch[3], 10) : parseInt(dateMatch[3], 10))
      : new Date().getFullYear();
    
    const date = new Date(year, month, day);
    if (!isNaN(date.getTime())) {
      return formatDateForDisplay(date);
    }
  }
  
  return null;
}

/**
 * Formats a date for display
 */
export function formatDateForDisplay(date: Date): string {
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  };
  return date.toLocaleDateString('pt-BR', options);
}

/**
 * Formats period for display
 */
export function formatPeriodForDisplay(period: VisitPeriod): string {
  return period === 'morning' ? 'manhã' : 'tarde';
}

/**
 * Checks if a day is a weekday (Monday-Friday)
 * Requirements 6.2: Visits available Monday to Friday
 */
export function isWeekday(date: Date): boolean {
  const day = date.getDay();
  return day >= 1 && day <= 5; // Monday = 1, Friday = 5
}

/**
 * Gets the next available weekday
 */
export function getNextAvailableWeekday(fromDate: Date = new Date()): Date {
  const date = new Date(fromDate);
  date.setDate(date.getDate() + 1);
  
  while (!isWeekday(date)) {
    date.setDate(date.getDate() + 1);
  }
  
  return date;
}

// ============================================
// Visit Scheduling Logic
// Requirements 6.1, 6.4
// ============================================

/**
 * Processes visit scheduling step
 * Requirements 6.1: Collect interest and notify team
 * Requirements 6.4: Ask for preferred day and period
 */
export function processVisitScheduling(
  state: VisitSchedulingState,
  input: string,
  leadName: string
): { updatedState: VisitSchedulingState; result: VisitSchedulingResult } {
  switch (state.step) {
    case 'initial':
      return handleInitialStep(state);
    
    case 'collecting_day':
      return handleCollectingDayStep(state, input);
    
    case 'collecting_period':
      return handleCollectingPeriodStep(state, input, leadName);
    
    case 'confirming':
      return handleConfirmingStep(state, input, leadName);
    
    default:
      return {
        updatedState: state,
        result: {
          success: false,
          message: 'Estado de agendamento inválido.',
        },
      };
  }
}

/**
 * Handles initial step - offer visit scheduling
 */
function handleInitialStep(
  state: VisitSchedulingState
): { updatedState: VisitSchedulingState; result: VisitSchedulingResult } {
  return {
    updatedState: {
      ...state,
      step: 'collecting_day',
    },
    result: {
      success: true,
      message: VISIT_MESSAGES.offer,
      nextStep: 'collecting_day',
    },
  };
}

/**
 * Handles collecting day step
 */
function handleCollectingDayStep(
  state: VisitSchedulingState,
  input: string
): { updatedState: VisitSchedulingState; result: VisitSchedulingResult } {
  // Try to parse both day and period from input
  const day = parseDayFromInput(input);
  const period = parsePeriodFromInput(input);
  
  if (day && period) {
    // Both provided, move to confirming
    return {
      updatedState: {
        ...state,
        step: 'confirming',
        preferredDay: day,
        preferredPeriod: period,
      },
      result: {
        success: true,
        message: '', // Will be filled with confirmation message
        nextStep: 'confirming',
      },
    };
  }
  
  if (day) {
    // Only day provided, ask for period
    return {
      updatedState: {
        ...state,
        step: 'collecting_period',
        preferredDay: day,
      },
      result: {
        success: true,
        message: VISIT_QUESTIONS.preferredPeriod,
        nextStep: 'collecting_period',
      },
    };
  }
  
  // Day not understood, ask again
  return {
    updatedState: state,
    result: {
      success: false,
      message: `Desculpe, não entendi o dia. ${VISIT_QUESTIONS.preferredDay} Temos disponibilidade de segunda a sexta.`,
    },
  };
}

/**
 * Handles collecting period step
 */
function handleCollectingPeriodStep(
  state: VisitSchedulingState,
  input: string,
  leadName: string
): { updatedState: VisitSchedulingState; result: VisitSchedulingResult } {
  const period = parsePeriodFromInput(input);
  
  if (period) {
    // Period provided, generate confirmation
    const confirmationMessage = VISIT_MESSAGES.confirmation(
      leadName,
      state.preferredDay!,
      period,
      VISIT_CONFIG.location.address
    );
    
    return {
      updatedState: {
        ...state,
        step: 'complete',
        preferredPeriod: period,
      },
      result: {
        success: true,
        message: confirmationMessage,
      },
    };
  }
  
  // Period not understood, ask again
  return {
    updatedState: state,
    result: {
      success: false,
      message: `Desculpe, não entendi. ${VISIT_QUESTIONS.preferredPeriod}`,
    },
  };
}

/**
 * Handles confirming step
 */
function handleConfirmingStep(
  state: VisitSchedulingState,
  _input: string,
  leadName: string
): { updatedState: VisitSchedulingState; result: VisitSchedulingResult } {
  // Generate confirmation message
  const confirmationMessage = VISIT_MESSAGES.confirmation(
    leadName,
    state.preferredDay!,
    state.preferredPeriod!,
    VISIT_CONFIG.location.address
  );
  
  return {
    updatedState: {
      ...state,
      step: 'complete',
    },
    result: {
      success: true,
      message: confirmationMessage,
    },
  };
}

// ============================================
// Visit CRUD Operations
// ============================================

/**
 * Creates a new visit in the database
 * Requirements 6.1: Collect interest and notify team
 */
export async function createVisitAsync(
  leadId: string,
  preferredDay: string,
  preferredPeriod: VisitPeriod
): Promise<Visit | null> {
  const supabase = createClient();
  const now = new Date().toISOString();
  
  const visitData = {
    lead_id: leadId,
    preferred_day: preferredDay,
    preferred_period: preferredPeriod,
    status: 'pending' as VisitStatus,
    reminder_sent: false,
    created_at: now,
  };

  const { data, error } = await supabase
    .schema(SCHEMA)
    .from(VISITS_TABLE)
    .insert(visitData)
    .select()
    .single();

  if (error) {
    console.error('Error creating visit:', error);
    return null;
  }

  return data as Visit;
}

/**
 * Gets a visit by ID
 */
export async function getVisitById(visitId: string): Promise<Visit | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .schema(SCHEMA)
    .from(VISITS_TABLE)
    .select('*')
    .eq('id', visitId)
    .single();

  if (error) {
    console.error('Error getting visit:', error);
    return null;
  }

  return data as Visit;
}

/**
 * Gets visits by lead ID
 */
export async function getVisitsByLeadId(leadId: string): Promise<Visit[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .schema(SCHEMA)
    .from(VISITS_TABLE)
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error getting visits:', error);
    return [];
  }

  return data as Visit[];
}

/**
 * Updates a visit
 */
export async function updateVisitAsync(
  visitId: string,
  updates: Partial<Visit>
): Promise<Visit | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .schema(SCHEMA)
    .from(VISITS_TABLE)
    .update(updates)
    .eq('id', visitId)
    .select()
    .single();

  if (error) {
    console.error('Error updating visit:', error);
    return null;
  }

  return data as Visit;
}

/**
 * Confirms a visit
 * Requirements 6.5: Send confirmation message
 */
export async function confirmVisitAsync(visitId: string): Promise<Visit | null> {
  return updateVisitAsync(visitId, { status: 'confirmed' });
}

/**
 * Cancels a visit
 */
export async function cancelVisitAsync(visitId: string): Promise<Visit | null> {
  return updateVisitAsync(visitId, { status: 'cancelled' });
}

/**
 * Marks a visit as completed
 */
export async function completeVisitAsync(visitId: string): Promise<Visit | null> {
  return updateVisitAsync(visitId, { status: 'completed' });
}

// ============================================
// Reminder Logic
// Requirements 6.6
// ============================================

/**
 * Gets visits that need reminders
 * Requirements 6.6: Send reminder 1 day before
 */
export async function getVisitsNeedingReminder(): Promise<Visit[]> {
  const supabase = createClient();
  
  // Get visits that are confirmed and haven't had reminders sent
  const { data, error } = await supabase
    .schema(SCHEMA)
    .from(VISITS_TABLE)
    .select('*')
    .eq('status', 'confirmed')
    .eq('reminder_sent', false);

  if (error) {
    console.error('Error getting visits needing reminder:', error);
    return [];
  }

  return data as Visit[];
}

/**
 * Marks a visit reminder as sent
 */
export async function markReminderSentAsync(visitId: string): Promise<Visit | null> {
  return updateVisitAsync(visitId, { reminder_sent: true });
}

/**
 * Generates reminder message for a visit
 * Requirements 6.6: Reminder 1 day before
 */
export function generateReminderMessage(
  leadName: string,
  visit: Visit
): string {
  return VISIT_MESSAGES.reminder(
    leadName,
    visit.preferred_day,
    visit.preferred_period,
    VISIT_CONFIG.location.address
  );
}

/**
 * Checks if a visit needs a reminder based on scheduled date
 * Requirements 6.6: 1 day before
 */
export function needsReminder(visit: Visit, now: Date = new Date()): boolean {
  if (visit.reminder_sent || visit.status !== 'confirmed') {
    return false;
  }
  
  // If we have a scheduled_at date, check if it's tomorrow
  if (visit.scheduled_at) {
    const scheduledDate = new Date(visit.scheduled_at);
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Check if scheduled date is tomorrow
    return (
      scheduledDate.getFullYear() === tomorrow.getFullYear() &&
      scheduledDate.getMonth() === tomorrow.getMonth() &&
      scheduledDate.getDate() === tomorrow.getDate()
    );
  }
  
  return false;
}

// ============================================
// Visit Scheduling Complete Flow
// ============================================

/**
 * Schedules a complete visit with lead status update
 * Requirements 6.1, 6.3, 6.5
 */
export async function scheduleVisitComplete(
  lead: PalmasLakeLead,
  preferredDay: string,
  preferredPeriod: VisitPeriod
): Promise<{ visit: Visit | null; confirmationMessage: string }> {
  // Create the visit
  const visit = await createVisitAsync(lead.id, preferredDay, preferredPeriod);
  
  if (!visit) {
    return {
      visit: null,
      confirmationMessage: 'Desculpe, houve um erro ao agendar sua visita. Por favor, tente novamente.',
    };
  }
  
  // Generate confirmation message
  const confirmationMessage = VISIT_MESSAGES.confirmation(
    lead.full_name || 'Olá',
    preferredDay,
    preferredPeriod,
    VISIT_CONFIG.location.address
  );
  
  return {
    visit,
    confirmationMessage,
  };
}

/**
 * Gets the visit location info
 * Requirements 6.3: Inform location AV JK, Orla 14
 */
export function getVisitLocation(): { address: string; reference: string } {
  return VISIT_CONFIG.location;
}

/**
 * Gets available schedule info
 * Requirements 6.2: Monday to Friday, 9h to 19h
 */
export function getAvailableSchedule(): string {
  return `Segunda a sexta, das ${VISIT_CONFIG.schedule.weekdays.start}h às ${VISIT_CONFIG.schedule.weekdays.end}h`;
}


// ============================================
// Reminder Processing
// Requirements 6.6
// ============================================

/**
 * Result of processing a visit reminder
 */
export interface ReminderResult {
  visitId: string;
  leadId: string;
  sent: boolean;
  message?: string;
  error?: string;
}

/**
 * Processes reminders for all visits that need them
 * Requirements 6.6: Send reminder 1 day before
 */
export async function processVisitReminders(
  sendReminderFn: (leadId: string, message: string) => Promise<boolean>
): Promise<ReminderResult[]> {
  const results: ReminderResult[] = [];
  
  // Get all visits needing reminders
  const visits = await getVisitsNeedingReminder();
  
  for (const visit of visits) {
    // Check if this visit needs a reminder based on date
    if (!needsReminder(visit)) {
      continue;
    }
    
    try {
      // Generate reminder message (we'll need to get lead name separately)
      const message = VISIT_MESSAGES.reminder(
        'Olá', // Default name, should be fetched from lead
        visit.preferred_day,
        visit.preferred_period,
        VISIT_CONFIG.location.address
      );
      
      // Send the reminder
      const sent = await sendReminderFn(visit.lead_id, message);
      
      if (sent) {
        // Mark reminder as sent
        await markReminderSentAsync(visit.id);
      }
      
      results.push({
        visitId: visit.id,
        leadId: visit.lead_id,
        sent,
        message: sent ? message : undefined,
      });
    } catch (error) {
      results.push({
        visitId: visit.id,
        leadId: visit.lead_id,
        sent: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
  
  return results;
}

/**
 * Generates confirmation message with all visit details
 * Requirements 6.5: Confirmation with visit data
 */
export function generateConfirmationMessage(
  leadName: string,
  preferredDay: string,
  preferredPeriod: VisitPeriod
): string {
  return VISIT_MESSAGES.confirmation(
    leadName,
    preferredDay,
    preferredPeriod,
    VISIT_CONFIG.location.address
  );
}

/**
 * Calculates the reminder date for a visit
 * Requirements 6.6: 1 day before
 */
export function calculateReminderDate(visitDate: Date): Date {
  const reminderDate = new Date(visitDate);
  reminderDate.setDate(reminderDate.getDate() - VISIT_CONFIG.reminder.daysBefore);
  return reminderDate;
}

/**
 * Checks if today is the reminder day for a visit
 * Requirements 6.6: 1 day before
 */
export function isReminderDay(visitDate: Date, today: Date = new Date()): boolean {
  const reminderDate = calculateReminderDate(visitDate);
  
  return (
    reminderDate.getFullYear() === today.getFullYear() &&
    reminderDate.getMonth() === today.getMonth() &&
    reminderDate.getDate() === today.getDate()
  );
}

/**
 * Gets pending visits for a specific lead
 */
export async function getPendingVisitsForLead(leadId: string): Promise<Visit[]> {
  const visits = await getVisitsByLeadId(leadId);
  return visits.filter(v => v.status === 'pending' || v.status === 'confirmed');
}

/**
 * Checks if a lead has any upcoming visits
 */
export async function hasUpcomingVisit(leadId: string): Promise<boolean> {
  const pendingVisits = await getPendingVisitsForLead(leadId);
  return pendingVisits.length > 0;
}

/**
 * Gets the next scheduled visit for a lead
 */
export async function getNextVisitForLead(leadId: string): Promise<Visit | null> {
  const pendingVisits = await getPendingVisitsForLead(leadId);
  
  if (pendingVisits.length === 0) {
    return null;
  }
  
  // Return the most recent pending/confirmed visit
  return pendingVisits[0];
}
