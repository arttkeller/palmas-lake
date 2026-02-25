/**
 * Lead Service for Maria Agent (Palmas Lake Towers)
 * Handles CRUD operations for leads in the CRM
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5
 */

import type {
  PalmasLakeLead,
  LeadStatus,
  LeadSource,
  QualificationState,
  LeadClassification,
  LeadClassificationType,
} from '@/types/maria-agent';
import { createClient } from '@/lib/supabase';

// Re-export LeadStatus for use in other services
export type { LeadStatus } from '@/types/maria-agent';

// ============================================
// Constants
// ============================================

const SCHEMA = 'palmaslake-agno';
const LEADS_TABLE = 'leads';

// Contact info for hot lead notifications
export const HOT_LEAD_NOTIFICATION = {
  whatsapp: '27998724593',
  email: 'arthur_keller11@hotmail.com',
};

// ============================================
// Tag Constants (Requirements 12.4)
// ============================================

export const SOURCE_TAGS: LeadSource[] = [
  'instagram',
  'facebook',
  'site',
  'indicacao',
  'whatsapp',
];

export const TYPE_TAGS: LeadClassificationType[] = [
  'cliente_final',
  'corretor',
  'investidor',
];

// ============================================
// Lead Status Transitions
// ============================================

const VALID_STATUS_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  novo_lead: ['qualificado', 'transferido'],
  qualificado: ['visita_agendada', 'transferido'],
  visita_agendada: ['visita_realizada', 'transferido'],
  visita_realizada: ['proposta_enviada', 'transferido'],
  proposta_enviada: ['transferido'],
  transferido: [],
};

/**
 * Status transitions that Maria (AI) can perform automatically
 * - novo_lead → transferido: when all qualification data is collected and AI transfers to human
 */
export const AI_ALLOWED_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  novo_lead: ['transferido'],
  qualificado: ['transferido'],
  visita_agendada: [], // User must mark as realized
  visita_realizada: [], // User must send proposal
  proposta_enviada: [],
  transferido: [],
};

/**
 * Status transitions that only users can perform manually
 * - visita_agendada → visita_realizada: after visit happens
 * - visita_realizada → proposta_enviada: when proposal is sent
 */
export const USER_ONLY_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  novo_lead: [],
  qualificado: ['visita_agendada'],
  visita_agendada: ['visita_realizada'],
  visita_realizada: ['proposta_enviada'],
  proposta_enviada: [],
  transferido: ['visita_agendada'],
};

// ============================================
// Lead Service Functions
// ============================================

/**
 * Validates if a status transition is allowed
 */
export function isValidStatusTransition(
  currentStatus: LeadStatus,
  newStatus: LeadStatus
): boolean {
  if (currentStatus === newStatus) return true;
  return VALID_STATUS_TRANSITIONS[currentStatus]?.includes(newStatus) ?? false;
}

/**
 * Checks if Maria (AI) can perform this status transition
 * AI can only move: novo_lead → transferido
 */
export function canAIPerformTransition(
  currentStatus: LeadStatus,
  newStatus: LeadStatus
): boolean {
  if (currentStatus === newStatus) return true;
  return AI_ALLOWED_TRANSITIONS[currentStatus]?.includes(newStatus) ?? false;
}

/**
 * Checks if this transition requires user action
 * User must move: visita_agendada → visita_realizada, visita_realizada → proposta_enviada
 */
export function isUserOnlyTransition(
  currentStatus: LeadStatus,
  newStatus: LeadStatus
): boolean {
  return USER_ONLY_TRANSITIONS[currentStatus]?.includes(newStatus) ?? false;
}

/**
 * Determines if qualification is complete based on state
 */
export function isQualificationComplete(state: QualificationState): boolean {
  return state.step === 'complete';
}

/**
 * Gets the next status after qualification is complete
 * Requirements: 12.2 - WHEN lead é qualificado THEN Maria SHALL atualizar status para "Qualificado"
 */
export function getStatusAfterQualification(
  currentStatus: LeadStatus,
  qualificationState: QualificationState
): LeadStatus {
  if (currentStatus === 'novo_lead' && isQualificationComplete(qualificationState)) {
    return 'transferido';
  }
  return currentStatus;
}

/**
 * Updates lead status based on qualification completion
 * This is the core function that implements Property 8
 */
export function updateLeadStatusOnQualification(
  lead: PalmasLakeLead,
  newQualificationState: QualificationState
): PalmasLakeLead {
  // Cast to LeadStatus since we only work with new status values
  const currentStatus = lead.status as LeadStatus;
  const newStatus = getStatusAfterQualification(currentStatus, newQualificationState);
  
  return {
    ...lead,
    status: newStatus,
    qualification_state: newQualificationState,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Creates a new lead with default values
 */
export function createLead(
  phone: string,
  source: LeadSource,
  name?: string
): Omit<PalmasLakeLead, 'id'> {
  const now = new Date().toISOString();
  
  return {
    full_name: name || 'Lead sem nome',
    phone,
    status: 'novo_lead',
    source,
    is_hot: false,
    tags: [],
    qualification_state: {
      step: 'name',
      name,
    },
    created_at: now,
    updated_at: now,
    last_interaction_at: now,
  };
}

/**
 * Checks if a lead should be marked as HOT
 */
export function shouldMarkAsHot(
  qualificationState: QualificationState,
  hasVisited: boolean = false
): boolean {
  // HOT criteria: orçamento adequado + prazo curto OU já visitou + interesse
  const hasShortTimeline = qualificationState.timeline === 'imediato' || 
                           qualificationState.timeline === 'curto_prazo';
  const hasInterest = qualificationState.objective !== undefined;
  
  return (hasShortTimeline && hasInterest) || (hasVisited && hasInterest);
}

/**
 * Updates lead with classification
 */
export function updateLeadClassification(
  lead: PalmasLakeLead,
  classification: LeadClassification
): PalmasLakeLead {
  return {
    ...lead,
    classification_type: classification.type,
    classification_confidence: classification.confidence,
    updated_at: new Date().toISOString(),
  };
}

// ============================================
// Async CRUD Functions (Supabase Integration)
// Requirements: 12.1, 12.2, 12.3
// ============================================

/**
 * Creates a new lead in the database
 * Requirements: 12.1 - WHEN novo lead entra THEN Maria SHALL criar registro com status "Novo Lead"
 */
export async function createLeadAsync(
  phone: string,
  source: LeadSource,
  name?: string
): Promise<PalmasLakeLead | null> {
  const supabase = createClient();
  const now = new Date().toISOString();
  
  const leadData = {
    full_name: name || 'Lead sem nome',
    phone,
    status: 'novo_lead',
    source,
    is_hot: false,
    tags: [source], // Add source as initial tag
    qualification_state: { step: 'name', name },
    created_at: now,
    updated_at: now,
    last_interaction_at: now,
  };

  const { data, error } = await supabase
    .schema(SCHEMA)
    .from(LEADS_TABLE)
    .insert(leadData)
    .select()
    .single();

  if (error) {
    console.error('Error creating lead:', error);
    return null;
  }

  return data as PalmasLakeLead;
}

/**
 * Gets a lead by ID
 */
export async function getLeadById(leadId: string): Promise<PalmasLakeLead | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .schema(SCHEMA)
    .from(LEADS_TABLE)
    .select('*')
    .eq('id', leadId)
    .single();

  if (error) {
    console.error('Error getting lead:', error);
    return null;
  }

  return data as PalmasLakeLead;
}

/**
 * Gets a lead by phone number
 */
export async function getLeadByPhone(phone: string): Promise<PalmasLakeLead | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .schema(SCHEMA)
    .from(LEADS_TABLE)
    .select('*')
    .eq('phone', phone)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
    console.error('Error getting lead by phone:', error);
    return null;
  }

  return data as PalmasLakeLead | null;
}

/**
 * Updates a lead in the database
 * Requirements: 12.2, 12.3 - Status updates based on qualification and visit scheduling
 */
export async function updateLeadAsync(
  leadId: string,
  updates: Partial<PalmasLakeLead>
): Promise<PalmasLakeLead | null> {
  const supabase = createClient();
  
  const updateData = {
    ...updates,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .schema(SCHEMA)
    .from(LEADS_TABLE)
    .update(updateData)
    .eq('id', leadId)
    .select()
    .single();

  if (error) {
    console.error('Error updating lead:', error);
    return null;
  }

  return data as PalmasLakeLead;
}

/**
 * Updates lead status with automatic transition validation
 * Requirements: 12.2 - WHEN lead é qualificado THEN Maria SHALL atualizar status para "Qualificado"
 * Requirements: 12.3 - WHEN visita é agendada THEN Maria SHALL atualizar status para "Visita Agendada"
 */
export async function updateLeadStatusAsync(
  leadId: string,
  newStatus: LeadStatus
): Promise<PalmasLakeLead | null> {
  const lead = await getLeadById(leadId);
  
  if (!lead) {
    console.error('Lead not found:', leadId);
    return null;
  }

  const currentStatus = lead.status as LeadStatus;
  
  if (!isValidStatusTransition(currentStatus, newStatus)) {
    console.error(`Invalid status transition: ${currentStatus} -> ${newStatus}`);
    return null;
  }

  return updateLeadAsync(leadId, { status: newStatus });
}

/**
 * Updates lead qualification state and automatically updates status if complete
 * Requirements: 12.2 - Automatic status update on qualification completion
 */
export async function updateLeadQualificationAsync(
  leadId: string,
  qualificationState: QualificationState
): Promise<PalmasLakeLead | null> {
  const lead = await getLeadById(leadId);
  
  if (!lead) {
    console.error('Lead not found:', leadId);
    return null;
  }

  const updates: Partial<PalmasLakeLead> = {
    qualification_state: qualificationState,
    last_interaction_at: new Date().toISOString(),
  };

  // Auto-update status if qualification is complete
  if (isQualificationComplete(qualificationState) && lead.status === 'novo_lead') {
    updates.status = 'transferido';
  }

  // Update name if provided in qualification
  if (qualificationState.name) {
    updates.full_name = qualificationState.name;
  }

  // Update email if provided
  if (qualificationState.email) {
    updates.email = qualificationState.email;
  }

  return updateLeadAsync(leadId, updates);
}

// ============================================
// Tag Management (Requirements 12.4)
// ============================================

/**
 * Adds tags to a lead
 * Requirements: 12.4 - Tags de origem e tipo
 */
export async function addTagsToLead(
  leadId: string,
  newTags: string[]
): Promise<PalmasLakeLead | null> {
  const lead = await getLeadById(leadId);
  
  if (!lead) {
    console.error('Lead not found:', leadId);
    return null;
  }

  const currentTags = lead.tags || [];
  const uniqueTags = [...new Set([...currentTags, ...newTags])];

  return updateLeadAsync(leadId, { tags: uniqueTags });
}

/**
 * Removes tags from a lead
 */
export async function removeTagsFromLead(
  leadId: string,
  tagsToRemove: string[]
): Promise<PalmasLakeLead | null> {
  const lead = await getLeadById(leadId);
  
  if (!lead) {
    console.error('Lead not found:', leadId);
    return null;
  }

  const currentTags = lead.tags || [];
  const filteredTags = currentTags.filter(tag => !tagsToRemove.includes(tag));

  return updateLeadAsync(leadId, { tags: filteredTags });
}

/**
 * Sets classification tags based on lead type
 * Requirements: 12.4 - Tags de tipo: cliente_final, corretor, investidor
 */
export async function setClassificationTags(
  leadId: string,
  classification: LeadClassification
): Promise<PalmasLakeLead | null> {
  const lead = await getLeadById(leadId);
  
  if (!lead) {
    console.error('Lead not found:', leadId);
    return null;
  }

  // Remove existing type tags
  const currentTags = (lead.tags || []).filter(tag => !TYPE_TAGS.includes(tag as LeadClassificationType));
  
  // Add new classification tag
  const newTags = [...currentTags, classification.type];

  return updateLeadAsync(leadId, {
    tags: newTags,
    classification_type: classification.type,
    classification_confidence: classification.confidence,
  });
}

// ============================================
// Hot Lead Management (Requirements 12.5)
// ============================================

/**
 * Marks a lead as HOT and triggers notification
 * Requirements: 12.5 - WHEN Maria identifica lead quente THEN Maria SHALL notificar equipe
 */
export async function markLeadAsHot(leadId: string): Promise<PalmasLakeLead | null> {
  const lead = await getLeadById(leadId);
  
  if (!lead) {
    console.error('Lead not found:', leadId);
    return null;
  }

  // Update lead as hot
  const updatedLead = await updateLeadAsync(leadId, { is_hot: true });
  
  if (updatedLead) {
    // Trigger notification (will be handled by notification service)
    await notifyHotLead(updatedLead);
  }

  return updatedLead;
}

/**
 * Notifies team about a hot lead
 * Requirements: 12.5 - Notificar via WhatsApp e email
 */
export async function notifyHotLead(lead: PalmasLakeLead): Promise<boolean> {
  // Import notification service dynamically to avoid circular dependencies
  const { notifyHotLeadComplete } = await import('./notification-service');
  
  try {
    const results = await notifyHotLeadComplete(lead);
    
    // Log results
    console.log('Hot lead notification results:', {
      leadId: lead.id,
      whatsapp: results.whatsapp.success,
      email: results.email.success,
    });
    
    // Return true if at least one notification was successful
    return results.whatsapp.success || results.email.success;
  } catch (error) {
    console.error('Error notifying hot lead:', error);
    return false;
  }
}

/**
 * Gets all hot leads
 */
export async function getHotLeads(): Promise<PalmasLakeLead[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .schema(SCHEMA)
    .from(LEADS_TABLE)
    .select('*')
    .eq('is_hot', true)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Error getting hot leads:', error);
    return [];
  }

  return data as PalmasLakeLead[];
}

/**
 * Gets leads by status
 */
export async function getLeadsByStatus(status: LeadStatus): Promise<PalmasLakeLead[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .schema(SCHEMA)
    .from(LEADS_TABLE)
    .select('*')
    .eq('status', status)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Error getting leads by status:', error);
    return [];
  }

  return data as PalmasLakeLead[];
}

/**
 * Gets leads by source
 */
export async function getLeadsBySource(source: LeadSource): Promise<PalmasLakeLead[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .schema(SCHEMA)
    .from(LEADS_TABLE)
    .select('*')
    .eq('source', source)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error getting leads by source:', error);
    return [];
  }

  return data as PalmasLakeLead[];
}

/**
 * Gets or creates a lead by phone number
 * Useful for incoming messages where lead may or may not exist
 */
export async function getOrCreateLead(
  phone: string,
  source: LeadSource,
  name?: string
): Promise<PalmasLakeLead | null> {
  // Try to find existing lead
  const existingLead = await getLeadByPhone(phone);
  
  if (existingLead) {
    // Update last interaction
    return updateLeadAsync(existingLead.id, {
      last_interaction_at: new Date().toISOString(),
    });
  }

  // Create new lead
  return createLeadAsync(phone, source, name);
}
