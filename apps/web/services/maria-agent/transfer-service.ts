/**
 * Transfer Service for Maria Agent (Palmas Lake Towers)
 * Handles transfer decisions and notifications to human agents
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7
 */

import type {
  PalmasLakeLead,
  QualificationState,
  TransferReason,
  Priority,
  LeadClassification,
} from '@/types/maria-agent';
import { isHotLead } from './classification-service';

// ============================================
// Transfer Configuration
// Requirements 7.6, 7.7: Contact information for transfers
// ============================================

export const TRANSFER_CONFIG = {
  whatsappNumber: '27998724593',
  email: 'arthur_keller11@hotmail.com',
  defaultMessage: 'Vou te conectar agora com o nosso comercial, especialista em nosso empreendimento, para te ajudar melhor. Um momento!',
};

// ============================================
// Transfer Keywords
// Requirements 7.2, 7.3, 7.4: Keywords that trigger transfer
// ============================================

export const NEGOTIATION_KEYWORDS = [
  'desconto',
  'negociar',
  'negociação',
  'negociacao',
  'valor menor',
  'abaixar o preço',
  'abaixar o preco',
  'condição especial',
  'condicao especial',
  'melhor preço',
  'melhor preco',
  'parcelar',
  'entrada menor',
];

export const CLOSING_KEYWORDS = [
  'fechar negócio',
  'fechar negocio',
  'quero comprar',
  'vou comprar',
  'assinar contrato',
  'reservar',
  'garantir a unidade',
  'como faço para comprar',
  'como faco para comprar',
  'quero essa unidade',
  'fechado',
  'vamos fechar',
];

export const URGENT_VISIT_KEYWORDS = [
  'visita urgente',
  'preciso ver hoje',
  'posso ir agora',
  'visitar agora',
  'hoje mesmo',
  'amanhã cedo',
  'amanha cedo',
  'primeira hora',
  'o mais rápido possível',
  'o mais rapido possivel',
  'urgência',
  'urgencia',
];

// ============================================
// Transfer Context Interface
// ============================================

export interface TransferContext {
  lead: PalmasLakeLead;
  qualificationState: QualificationState;
  lastMessage: string;
  classification?: LeadClassification;
  hasVisited?: boolean;
  unansweredQuestion?: boolean;
}

// ============================================
// Transfer Decision Interface
// ============================================

export interface TransferDecision {
  shouldTransfer: boolean;
  reason?: TransferReason;
  priority: Priority;
}

// ============================================
// Text Normalization
// ============================================

/**
 * Normalizes text for keyword matching (lowercase, trim, remove accents)
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// ============================================
// Keyword Detection Functions
// ============================================

/**
 * Detects negotiation keywords in a message
 * Requirements 7.3: WHEN lead solicita negociação de valores THEN transfer
 */
export function detectNegotiationKeywords(text: string): string[] {
  const normalized = normalizeText(text);
  const matched: string[] = [];

  for (const keyword of NEGOTIATION_KEYWORDS) {
    const normalizedKeyword = normalizeText(keyword);
    if (normalized.includes(normalizedKeyword)) {
      matched.push(keyword);
    }
  }

  return matched;
}

/**
 * Detects closing keywords in a message
 * Requirements 7.2: WHEN lead solicita fechamento de negócio THEN transfer
 */
export function detectClosingKeywords(text: string): string[] {
  const normalized = normalizeText(text);
  const matched: string[] = [];

  for (const keyword of CLOSING_KEYWORDS) {
    const normalizedKeyword = normalizeText(keyword);
    if (normalized.includes(normalizedKeyword)) {
      matched.push(keyword);
    }
  }

  return matched;
}

/**
 * Detects urgent visit keywords in a message
 * Requirements 7.4: WHEN lead solicita visita urgente THEN transfer
 */
export function detectUrgentVisitKeywords(text: string): string[] {
  const normalized = normalizeText(text);
  const matched: string[] = [];

  for (const keyword of URGENT_VISIT_KEYWORDS) {
    const normalizedKeyword = normalizeText(keyword);
    if (normalized.includes(normalizedKeyword)) {
      matched.push(keyword);
    }
  }

  return matched;
}

// ============================================
// Transfer Decision Logic
// Requirements 7.1, 7.2, 7.3, 7.4, 7.5
// ============================================

/**
 * Determines if a transfer should occur based on context
 * Returns TransferDecision with reason and priority
 * 
 * Transfer criteria:
 * - HOT lead (orçamento adequado + prazo curto OR já visitou + interesse)
 * - Negotiation request
 * - Closing request
 * - Urgent visit request
 * - Broker detected
 * - Investor detected
 * - Unknown answer (Maria can't respond)
 */
export function shouldTransfer(context: TransferContext): TransferDecision {
  const { lead, qualificationState, lastMessage, classification, hasVisited, unansweredQuestion } = context;

  // Check for closing request (highest priority)
  // Requirements 7.2
  const closingKeywords = detectClosingKeywords(lastMessage);
  if (closingKeywords.length > 0) {
    return {
      shouldTransfer: true,
      reason: 'closing_request',
      priority: 'urgent',
    };
  }

  // Check for negotiation request
  // Requirements 7.3
  const negotiationKeywords = detectNegotiationKeywords(lastMessage);
  if (negotiationKeywords.length > 0) {
    return {
      shouldTransfer: true,
      reason: 'negotiation_request',
      priority: 'high',
    };
  }

  // Check for urgent visit request
  // Requirements 7.4
  const urgentVisitKeywords = detectUrgentVisitKeywords(lastMessage);
  if (urgentVisitKeywords.length > 0) {
    return {
      shouldTransfer: true,
      reason: 'urgent_visit',
      priority: 'high',
    };
  }

  // Check for HOT lead
  // Requirements 7.5
  const isHot = lead.is_hot || isHotLead(qualificationState, hasVisited);
  if (isHot) {
    return {
      shouldTransfer: true,
      reason: 'hot_lead',
      priority: 'high',
    };
  }

  // Check for broker classification
  if (classification?.type === 'corretor') {
    return {
      shouldTransfer: true,
      reason: 'broker_detected',
      priority: 'medium',
    };
  }

  // Check for investor classification
  if (classification?.type === 'investidor') {
    return {
      shouldTransfer: true,
      reason: 'investor_detected',
      priority: 'medium',
    };
  }

  // Check for unanswered question
  // Requirements 7.1
  if (unansweredQuestion) {
    return {
      shouldTransfer: true,
      reason: 'unknown_answer',
      priority: 'low',
    };
  }

  // No transfer needed
  return {
    shouldTransfer: false,
    priority: 'low',
  };
}

/**
 * Gets the transfer message to send to the lead
 * Requirements 7.6
 */
export function getTransferMessage(): string {
  return TRANSFER_CONFIG.defaultMessage;
}

/**
 * Gets priority level as a numeric value for sorting
 */
export function getPriorityValue(priority: Priority): number {
  const priorityMap: Record<Priority, number> = {
    low: 1,
    medium: 2,
    high: 3,
    urgent: 4,
  };
  return priorityMap[priority];
}

/**
 * Formats transfer reason for display
 */
export function formatTransferReason(reason: TransferReason): string {
  const reasonMap: Record<TransferReason, string> = {
    hot_lead: 'Lead Quente',
    negotiation_request: 'Solicitação de Negociação',
    closing_request: 'Solicitação de Fechamento',
    urgent_visit: 'Visita Urgente',
    unknown_answer: 'Pergunta não respondida',
    broker_detected: 'Corretor Identificado',
    investor_detected: 'Investidor Identificado',
  };
  return reasonMap[reason];
}


// ============================================
// Notification Interfaces
// ============================================

export interface TransferNotification {
  leadId: string;
  leadName?: string;
  leadPhone: string;
  reason: TransferReason;
  priority: Priority;
  message: string;
  timestamp: Date;
}

export interface NotificationResult {
  success: boolean;
  channel: 'whatsapp' | 'email';
  error?: string;
}

// ============================================
// Notification Functions
// Requirements 7.6, 7.7
// ============================================

/**
 * Builds the notification message for the team
 */
export function buildTeamNotificationMessage(
  lead: PalmasLakeLead,
  reason: TransferReason,
  priority: Priority
): string {
  const priorityEmoji = {
    low: '🟢',
    medium: '🟡',
    high: '🟠',
    urgent: '🔴',
  };

  const lines = [
    `${priorityEmoji[priority]} *TRANSFERÊNCIA DE LEAD*`,
    '',
    `*Motivo:* ${formatTransferReason(reason)}`,
    `*Prioridade:* ${priority.toUpperCase()}`,
    '',
    `*Lead:* ${lead.full_name || 'Não informado'}`,
    `*Telefone:* ${lead.phone}`,
    `*Email:* ${lead.email || 'Não informado'}`,
  ];

  if (lead.qualification_state) {
    lines.push('');
    lines.push('*Qualificação:*');
    if (lead.qualification_state.interestType) {
      lines.push(`- Interesse: ${lead.qualification_state.interestType}`);
    }
    if (lead.qualification_state.objective) {
      lines.push(`- Objetivo: ${lead.qualification_state.objective}`);
    }
    if (lead.qualification_state.timeline) {
      lines.push(`- Prazo: ${lead.qualification_state.timeline}`);
    }
  }

  if (lead.is_hot) {
    lines.push('');
    lines.push('🔥 *LEAD QUENTE*');
  }

  return lines.join('\n');
}

/**
 * Creates a transfer notification object
 */
export function createTransferNotification(
  lead: PalmasLakeLead,
  reason: TransferReason,
  priority: Priority
): TransferNotification {
  return {
    leadId: lead.id,
    leadName: lead.full_name,
    leadPhone: lead.phone,
    reason,
    priority,
    message: buildTeamNotificationMessage(lead, reason, priority),
    timestamp: new Date(),
  };
}

/**
 * Sends WhatsApp notification to the team
 * Requirements 7.7: Notify WhatsApp 27998724593
 * 
 * Note: This is a placeholder that returns the notification data.
 * Actual sending should be done via UAZAPI integration.
 */
export async function sendWhatsAppNotification(
  notification: TransferNotification
): Promise<NotificationResult> {
  // This would integrate with UAZAPI to send the message
  // For now, we return success with the notification data
  try {
    // In production, this would call UAZAPI:
    // await uazapiService.sendMessage(TRANSFER_CONFIG.whatsappNumber, notification.message);
    
    return {
      success: true,
      channel: 'whatsapp',
    };
  } catch (error) {
    return {
      success: false,
      channel: 'whatsapp',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Sends email notification to the team
 * Requirements 7.7: Notify email arthur_keller11@hotmail.com
 * 
 * Note: This is a placeholder that returns the notification data.
 * Actual sending should be done via email service integration.
 */
export async function sendEmailNotification(
  notification: TransferNotification
): Promise<NotificationResult> {
  try {
    // In production, this would call an email service:
    // await emailService.send({
    //   to: TRANSFER_CONFIG.email,
    //   subject: `[${notification.priority.toUpperCase()}] Transferência de Lead - ${notification.leadName}`,
    //   body: notification.message,
    // });
    
    return {
      success: true,
      channel: 'email',
    };
  } catch (error) {
    return {
      success: false,
      channel: 'email',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Notifies the team about a transfer via all channels
 * Requirements 7.6, 7.7
 */
export async function notifyTeam(
  lead: PalmasLakeLead,
  reason: TransferReason,
  priority: Priority
): Promise<{ whatsapp: NotificationResult; email: NotificationResult }> {
  const notification = createTransferNotification(lead, reason, priority);

  const [whatsappResult, emailResult] = await Promise.all([
    sendWhatsAppNotification(notification),
    sendEmailNotification(notification),
  ]);

  return {
    whatsapp: whatsappResult,
    email: emailResult,
  };
}

/**
 * Executes a complete transfer: sends message to lead and notifies team
 */
export async function executeTransfer(
  lead: PalmasLakeLead,
  reason: TransferReason,
  priority: Priority
): Promise<{
  transferMessage: string;
  notifications: { whatsapp: NotificationResult; email: NotificationResult };
}> {
  const transferMessage = getTransferMessage();
  const notifications = await notifyTeam(lead, reason, priority);

  return {
    transferMessage,
    notifications,
  };
}
