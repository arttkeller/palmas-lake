/**
 * Types and interfaces for the Maria Agent (Palmas Lake Towers)
 * Requirements: 1.1, 2.1, 3.1
 */

// ============================================
// Lead Status and Source Types
// ============================================

export type LeadStatus =
  | 'novo_lead'
  | 'qualificado'
  | 'visita_agendada'
  | 'visita_realizada'
  | 'proposta_enviada'
  | 'transferido';

export type LeadSource =
  | 'instagram'
  | 'facebook'
  | 'site'
  | 'indicacao'
  | 'whatsapp';

export type LeadClassificationType = 'cliente_final' | 'corretor' | 'investidor';

// ============================================
// Property Types
// ============================================

export type PropertyType =
  | 'apto_sky'
  | 'apto_garden'
  | 'apto_park'
  | 'sala_comercial'
  | 'office'
  | 'flat';

export type InterestType =
  | 'apartamento'
  | 'sala_comercial'
  | 'office'
  | 'flat';

// ============================================
// Qualification Types
// ============================================

export type QualificationStep =
  | 'name'
  | 'interest_type'
  | 'objective'
  | 'timeline'
  | 'region_knowledge'
  | 'contact_info'
  | 'complete';

export type Timeline = 'imediato' | 'curto_prazo' | 'medio_prazo' | 'longo_prazo';

export interface QualificationState {
  step: QualificationStep;
  name?: string;
  interestType?: InterestType;
  objective?: 'morar' | 'investir';
  timeline?: Timeline;
  knowsRegion?: boolean;
  isFromPalmas?: boolean;
  phone?: string;
  email?: string;
}

// ============================================
// Message Interfaces
// ============================================

export interface IncomingMessage {
  leadId: string;
  phone: string;
  text: string;
  timestamp: Date;
  source: LeadSource;
}

export interface MessageMetadata {
  intent?: string;
  entities?: Record<string, string>;
  sentiment?: 'positive' | 'neutral' | 'negative';
}

// ============================================
// Agent Action Types
// ============================================

export type MaterialType = 'folder' | 'localizacao' | 'tabela_precos' | 'video';
export type Priority = 'low' | 'medium' | 'high' | 'urgent';

export type AgentAction =
  | { type: 'save_to_crm'; data: Partial<PalmasLakeLead> }
  | { type: 'update_status'; status: LeadStatus }
  | { type: 'schedule_followup'; delay: number }
  | { type: 'send_material'; materialType: MaterialType }
  | { type: 'notify_team'; priority: Priority };

export type TransferReason =
  | 'hot_lead'
  | 'negotiation_request'
  | 'closing_request'
  | 'urgent_visit'
  | 'unknown_answer'
  | 'broker_detected'
  | 'investor_detected';

export interface AgentResponse {
  messages: string[];
  actions: AgentAction[];
  shouldTransfer: boolean;
  transferReason?: TransferReason;
}

// ============================================
// Lead Classification
// ============================================

export interface LeadClassification {
  type: LeadClassificationType;
  confidence: number;
  indicators: string[];
}

// ============================================
// Conversation Types
// ============================================

export type ConversationPhase =
  | 'greeting'
  | 'qualification'
  | 'information'
  | 'scheduling'
  | 'objection_handling'
  | 'transfer'
  | 'follow_up'
  | 'closed';

export interface ConversationState {
  phase: ConversationPhase;
  qualificationState: QualificationState;
  pendingAction?: AgentAction;
  transferRequested: boolean;
}

// ============================================
// Lead Model (Palmas Lake specific)
// Uses existing leads table with added qualification fields
// ============================================

export interface PalmasLakeLead {
  id: string;
  full_name: string;
  phone: string;
  email?: string;
  status: LeadStatus | 'new' | 'contacted' | 'visit_scheduled' | 'sold' | 'lost';
  notes?: string;
  temperature?: 'quente' | 'morno' | 'frio';
  sentiment_score?: number;
  sentiment_label?: string;
  // Qualification fields (added by migration)
  source?: LeadSource;
  classification_type?: LeadClassificationType;
  classification_confidence?: number;
  qualification_state?: QualificationState;
  is_hot: boolean;
  tags: string[];
  created_at: string;
  updated_at: string;
  last_interaction_at?: string;
}

// ============================================
// Conversation Model (Palmas Lake specific)
// ============================================

export interface PalmasLakeMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  metadata?: MessageMetadata;
}

export interface PalmasLakeConversation {
  id: string;
  lead_id: string;
  messages: PalmasLakeMessage[];
  state: ConversationState;
  follow_up_attempts: number;
  last_follow_up_at?: string;
  created_at: string;
  updated_at: string;
}

// ============================================
// Visit Model
// ============================================

export type VisitPeriod = 'morning' | 'afternoon';
export type VisitStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled';

export interface Visit {
  id: string;
  lead_id: string;
  preferred_day: string;
  preferred_period: VisitPeriod;
  status: VisitStatus;
  reminder_sent: boolean;
  created_at: string;
  scheduled_at?: string;
}

// ============================================
// Property Info
// ============================================

export interface PropertyInfo {
  type: PropertyType;
  area: string;
  suites: string;
  price: string;
  parkingSpots: number;
  tower?: string;
}

export interface LocationInfo {
  address: string;
  neighborhood: string;
  city: string;
  state: string;
  reference: string;
}
