
import type { LeadTemperature, LeadTag } from '@/lib/temperature-config';

export type LeadStatus = 'new' | 'contacted' | 'visit_scheduled' | 'sold' | 'lost' | 'novo_lead' | 'qualificado' | 'visita_agendada' | 'visita_realizada' | 'proposta_enviada' | 'transferido';
export type LeadSource = 'instagram' | 'facebook' | 'site' | 'indicacao' | 'whatsapp';
export type LeadClassification = 'cliente_final' | 'corretor' | 'investidor' | 'imobiliaria';
export type InterestType = 'apartamento' | 'sala_comercial' | 'office' | 'flat' | 'loft';
export type Objective = 'morar' | 'investir' | 'morar_investir';
export type PreferredTower = 'sky' | 'garden' | 'park' | 'torre_d';
export type VisitPreference = 'manha' | 'tarde';

// Re-export temperature types for convenience
export type { LeadTemperature, LeadTag } from '@/lib/temperature-config';

export interface Lead {
    id: string;
    full_name: string;
    phone: string;
    email?: string;
    status: LeadStatus;
    notes?: string;
    created_at?: string;
    updated_at?: string;
    
    // Campos de origem e classificação
    source?: LeadSource;
    classification_type?: LeadClassification;
    classification_confidence?: number;
    is_hot?: boolean;
    tags?: string[];
    
    // AI Temperature Classification (Requirements 1.1, 1.2)
    temperature?: LeadTemperature;
    aiTags?: LeadTag[];
    lastAIAnalysis?: string;
    
    // Campos de qualificação do briefing
    interest_type?: InterestType;
    objective?: Objective;
    purchase_timeline?: string;
    knows_region?: boolean;
    city_origin?: string;
    preferred_tower?: PreferredTower;
    budget_range?: string;
    
    // Campos de visita
    visit_preference?: VisitPreference;
    visit_scheduled_date?: string;
    visit_reminder_sent?: boolean;
    
    // Estado de qualificação
    qualification_state?: {
        step: 'name' | 'interest' | 'objective' | 'timeline' | 'region' | 'complete';
    };
    last_interaction_at?: string;
    assigned_to?: string;

    // Foto de perfil
    profile_picture_url?: string;
}
