/**
 * Agent Service (Core) for Maria Agent (Palmas Lake Towers)
 * Main message processor that orchestrates all services
 * Requirements: 1.1, 1.2, 1.3, 9.1, 9.2, 9.3, 9.4, 9.5, 11.1, 11.2
 */

import type {
  IncomingMessage,
  AgentResponse,
  AgentAction,
  ConversationState,
  ConversationPhase,
  QualificationState,
  PalmasLakeLead,
  PalmasLakeConversation,
  TransferReason,
  LeadClassification,
} from '@/types/maria-agent';

import {
  createInitialQualificationState,
  getNextQuestion,
  processAnswer,
  isQualificationComplete,
} from './qualification-service';

import {
  classifyFromMessage,
  isHotLead,
} from './classification-service';

import {
  shouldTransfer,
  getTransferMessage,
  type TransferContext,
  type TransferDecision,
} from './transfer-service';

import {
  getPropertyInfo,
  getAmenities,
  getDifferentials,
  getLocation,
  formatPropertyInfo,
  formatAmenities,
  formatDifferentials,
  getPropertyInfoByQuery,
} from './property-info-service';

import {
  scheduleFollowUp,
  getFollowUpMessage,
  FOLLOW_UP_CONFIG,
} from './followup-service';

import {
  isAgentAvailable,
  shouldProcessMessage,
  getAvailabilityStatus,
  AVAILABILITY_CONFIG,
  type AvailabilityStatus,
} from './availability-service';

import {
  processVisitScheduling,
  createInitialVisitState,
  VISIT_MESSAGES,
  type VisitSchedulingState,
} from './visit-service';

import {
  canAIPerformTransition,
  type LeadStatus,
} from './lead-service';

// ============================================
// Greeting Messages
// Requirements 1.1, 11.1
// ============================================

export const GREETING_MESSAGE = 
  'Olá! 👋 Sou a Maria, sua assistente virtual do Palmas Lake. ' +
  'É um prazer ter você por aqui! Estou aqui para te ajudar a conhecer ' +
  'nosso empreendimento e encontrar o imóvel ideal para você. Como posso te ajudar?';

export const LGPD_NOTICE = 
  'Seus dados serão utilizados apenas para atendimento e conforme nossa política de privacidade. Pode ficar tranquilo(a)!';

export const NAME_QUESTION = 'Como posso te chamar?';

// ============================================
// Objection Responses
// Requirements 9.1, 9.2, 9.3, 9.4, 9.5
// ============================================

export const OBJECTION_RESPONSES: Record<string, string> = {
  expensive: 'Entendo sua preocupação. Nossos valores são competitivos considerando os nossos diferenciais.',
  thinking: 'Claro! Enquanto isso, posso te enviar mais informações para te ajudar na decisão?',
  unknown_region: 'A região está em franco desenvolvimento! Posso te enviar informações sobre a localização e agendar uma visita para você conhecer?',
  family: 'Claro! Que tal agendarmos uma visita para vocês virem juntos?',
  other_properties: 'Nosso empreendimento tem diferenciais únicos: arquitetura exclusiva, localização privilegiada na Orla 14, vista vitalícia do pôr do sol, marina exclusiva e é o único pé na areia de Palmas!',
};

// ============================================
// Objection Keywords
// ============================================

const OBJECTION_KEYWORDS = {
  expensive: ['muito caro', 'caro demais', 'preço alto', 'valor alto', 'não tenho condições', 'fora do orçamento'],
  thinking: ['vou pensar', 'preciso pensar', 'deixa eu pensar', 'vou analisar'],
  unknown_region: ['não conheço a região', 'nao conheco a regiao', 'nunca fui', 'não sei onde fica'],
  family: ['falar com cônjuge', 'falar com conjuge', 'falar com esposa', 'falar com marido', 'falar com família', 'falar com familia'],
  other_properties: ['vendo outros', 'outros empreendimentos', 'outras opções', 'outras opcoes', 'comparando'],
};

// ============================================
// Information Keywords
// ============================================

const INFO_KEYWORDS = {
  location: ['localização', 'localizacao', 'onde fica', 'endereço', 'endereco'],
  financing: ['financiamento', 'financia', 'parcela', 'entrada'],
  delivery: ['prazo de entrega', 'quando fica pronto', 'entrega'],
  visit: ['visita', 'conhecer', 'ver pessoalmente', 'agendar'],
  amenities: ['área de lazer', 'area de lazer', 'lazer', 'piscina', 'academia'],
  differentials: ['diferenciais', 'diferencial', 'vantagens'],
  apartments: ['apartamento', 'apto', 'torre sky', 'torre garden', 'torre park'],
  commercial: ['sala comercial', 'comercial', 'loja'],
  office: ['office', 'offices', 'escritório', 'escritorio'],
  flat: ['flat', 'loft', 'studio'],
};

// ============================================
// Helper Functions
// ============================================

/**
 * Normalizes text for keyword matching
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Checks if text contains any of the keywords
 */
function containsKeywords(text: string, keywords: string[]): boolean {
  const normalized = normalizeText(text);
  return keywords.some(kw => normalized.includes(normalizeText(kw)));
}

/**
 * Detects objection type from message
 */
export function detectObjection(text: string): keyof typeof OBJECTION_RESPONSES | null {
  for (const [type, keywords] of Object.entries(OBJECTION_KEYWORDS)) {
    if (containsKeywords(text, keywords)) {
      return type as keyof typeof OBJECTION_RESPONSES;
    }
  }
  return null;
}

/**
 * Detects information request type from message
 */
export function detectInfoRequest(text: string): keyof typeof INFO_KEYWORDS | null {
  for (const [type, keywords] of Object.entries(INFO_KEYWORDS)) {
    if (containsKeywords(text, keywords)) {
      return type as keyof typeof INFO_KEYWORDS;
    }
  }
  return null;
}

// ============================================
// Information Response Generators
// ============================================

/**
 * Generates response for location inquiry
 * Requirements 4.1
 */
function getLocationResponse(): string {
  const location = getLocation();
  return `Nosso empreendimento fica na ${location.address}, ${location.neighborhood}, ${location.city}-${location.state}. ${location.reference}`;
}

/**
 * Generates response for financing inquiry
 * Requirements 4.2
 */
function getFinancingResponse(): string {
  return 'Sim, aceitamos financiamento! Temos condições especiais para facilitar sua aquisição.';
}

/**
 * Generates response for delivery inquiry
 * Requirements 4.3
 */
function getDeliveryResponse(): string {
  return 'Após o início da obra, o prazo de entrega é de 5 anos.';
}

/**
 * Generates response for visit inquiry
 * Requirements 4.4
 */
function getVisitResponse(): string {
  return 'Claro! Temos disponibilidade para visitas de segunda a sexta, das 9h às 19h. Qual o melhor dia para você? Prefere manhã ou tarde?';
}

/**
 * Generates response for amenities inquiry
 * Requirements 4.5
 */
function getAmenitiesResponse(): string {
  return `Sim, temos uma área de lazer completa: ${formatAmenities()}.`;
}

/**
 * Generates response for differentials inquiry
 * Requirements 4.6
 */
function getDifferentialsResponse(): string {
  return `Nossos diferenciais são únicos: ${formatDifferentials()}.`;
}



// ============================================
// Conversation State Management
// ============================================

/**
 * Creates initial conversation state
 */
export function createInitialConversationState(): ConversationState {
  return {
    phase: 'greeting',
    qualificationState: createInitialQualificationState(),
    transferRequested: false,
  };
}

/**
 * Updates conversation phase
 */
export function updateConversationPhase(
  state: ConversationState,
  phase: ConversationPhase
): ConversationState {
  return {
    ...state,
    phase,
  };
}

/**
 * Updates qualification state within conversation
 */
export function updateQualificationState(
  state: ConversationState,
  qualificationState: QualificationState
): ConversationState {
  return {
    ...state,
    qualificationState,
  };
}

// ============================================
// Response Generators
// ============================================

/**
 * Generates greeting response with LGPD notice
 * Requirements 1.1, 11.1
 */
export function generateGreetingResponse(): AgentResponse {
  return {
    messages: [GREETING_MESSAGE, LGPD_NOTICE, NAME_QUESTION],
    actions: [],
    shouldTransfer: false,
  };
}

/**
 * Generates response for name collection with heart emoji
 * Requirements 1.2
 */
export function generateNameAcknowledgment(name: string): string {
  return `Prazer em te conhecer, ${name}! ❤️`;
}

/**
 * Generates objection handling response
 * Requirements 9.1, 9.2, 9.3, 9.4, 9.5
 */
export function generateObjectionResponse(objectionType: keyof typeof OBJECTION_RESPONSES): AgentResponse {
  return {
    messages: [OBJECTION_RESPONSES[objectionType]],
    actions: [],
    shouldTransfer: false,
  };
}

/**
 * Generates information response based on request type
 */
export function generateInfoResponse(infoType: keyof typeof INFO_KEYWORDS): AgentResponse {
  let message: string;
  let shouldTransitionToScheduling = false;
  
  switch (infoType) {
    case 'location':
      message = getLocationResponse();
      break;
    case 'financing':
      message = getFinancingResponse();
      break;
    case 'delivery':
      message = getDeliveryResponse();
      break;
    case 'visit':
      message = getVisitResponse();
      shouldTransitionToScheduling = true;
      break;
    case 'amenities':
      message = getAmenitiesResponse();
      break;
    case 'differentials':
      message = getDifferentialsResponse();
      break;
    case 'apartments':
    case 'commercial':
    case 'office':
    case 'flat':
      message = generatePropertyResponse(infoType);
      break;
    default:
      message = 'Como posso te ajudar?';
  }
  
  return {
    messages: [message],
    actions: [],
    shouldTransfer: false,
    // Mark if this should transition to scheduling phase
    ...(shouldTransitionToScheduling && { _transitionToScheduling: true }),
  } as AgentResponse;
}

/**
 * Generates property information response
 * Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */
function generatePropertyResponse(type: string): string {
  const typeMap: Record<string, string> = {
    apartments: 'Temos três torres residenciais:\n' +
      `• Torre Sky: ${formatPropertyInfo(getPropertyInfo('apto_sky'))}\n` +
      `• Torre Garden: ${formatPropertyInfo(getPropertyInfo('apto_garden'))}\n` +
      `• Torre Park: ${formatPropertyInfo(getPropertyInfo('apto_park'))}`,
    commercial: `Salas Comerciais: ${formatPropertyInfo(getPropertyInfo('sala_comercial'))}`,
    office: `Offices: ${formatPropertyInfo(getPropertyInfo('office'))}`,
    flat: `Flats: ${formatPropertyInfo(getPropertyInfo('flat'))}`,
  };
  
  return typeMap[type] || 'Temos diversas opções de unidades. Qual tipo te interessa mais?';
}

/**
 * Generates qualification question response
 */
export function generateQualificationResponse(state: QualificationState): AgentResponse {
  const question = getNextQuestion(state);
  
  if (!question) {
    return {
      messages: ['Obrigada pelas informações! Vou te enviar nosso material.'],
      actions: [{ type: 'send_material', materialType: 'folder' }],
      shouldTransfer: false,
    };
  }
  
  return {
    messages: [question.question],
    actions: [],
    shouldTransfer: false,
  };
}

/**
 * Generates transfer response
 * Requirements 7.6
 */
export function generateTransferResponse(reason: TransferReason): AgentResponse {
  return {
    messages: [getTransferMessage()],
    actions: [{ type: 'notify_team', priority: 'high' }],
    shouldTransfer: true,
    transferReason: reason,
  };
}

// ============================================
// Main Message Processor
// Requirements 1.1, 1.2, 1.3
// ============================================

/**
 * Processes an incoming message and generates appropriate response
 * This is the main orchestration function that coordinates all services
 */
export function processMessage(
  message: IncomingMessage,
  lead: PalmasLakeLead,
  conversation: PalmasLakeConversation
): { response: AgentResponse; updatedState: ConversationState } {
  const state = conversation.state;
  const text = message.text;
  
  // Check for classification (broker/investor)
  const classification = classifyFromMessage(text);
  
  // Build transfer context
  const transferContext: TransferContext = {
    lead,
    qualificationState: state.qualificationState,
    lastMessage: text,
    classification: classification.type !== 'cliente_final' ? classification : undefined,
    hasVisited: lead.status === 'visita_realizada',
    unansweredQuestion: false,
  };
  
  // Check if transfer is needed
  const transferDecision = shouldTransfer(transferContext);
  if (transferDecision.shouldTransfer && transferDecision.reason) {
    return {
      response: generateTransferResponse(transferDecision.reason),
      updatedState: {
        ...state,
        phase: 'transfer',
        transferRequested: true,
      },
    };
  }
  
  // Handle based on conversation phase
  switch (state.phase) {
    case 'greeting':
      return handleGreetingPhase(text, state);
    
    case 'qualification':
      return handleQualificationPhase(text, state, classification);
    
    case 'information':
      return handleInformationPhase(text, state);
    
    case 'objection_handling':
      return handleObjectionPhase(text, state);
    
    case 'scheduling':
      return handleSchedulingPhase(text, state);
    
    default:
      return handleDefaultPhase(text, state);
  }
}

/**
 * Handles greeting phase - initial contact
 */
function handleGreetingPhase(
  text: string,
  state: ConversationState
): { response: AgentResponse; updatedState: ConversationState } {
  // Process name from response
  const updatedQualification = processAnswer(state.qualificationState, text);
  
  if (updatedQualification.name) {
    // Name was extracted, acknowledge and move to next question
    const acknowledgment = generateNameAcknowledgment(updatedQualification.name);
    const nextQuestion = getNextQuestion(updatedQualification);
    
    return {
      response: {
        messages: nextQuestion 
          ? [acknowledgment, nextQuestion.question]
          : [acknowledgment],
        actions: [{ type: 'save_to_crm', data: { full_name: updatedQualification.name } }],
        shouldTransfer: false,
      },
      updatedState: {
        ...state,
        phase: 'qualification',
        qualificationState: updatedQualification,
      },
    };
  }
  
  // Name not extracted, ask again
  return {
    response: {
      messages: [NAME_QUESTION],
      actions: [],
      shouldTransfer: false,
    },
    updatedState: state,
  };
}

/**
 * Handles qualification phase - collecting lead information
 */
function handleQualificationPhase(
  text: string,
  state: ConversationState,
  classification: LeadClassification
): { response: AgentResponse; updatedState: ConversationState } {
  // Check for objections first
  const objection = detectObjection(text);
  if (objection) {
    return {
      response: generateObjectionResponse(objection),
      updatedState: {
        ...state,
        phase: 'objection_handling',
      },
    };
  }
  
  // Check for info requests
  const infoRequest = detectInfoRequest(text);
  if (infoRequest) {
    const response = generateInfoResponse(infoRequest);
    
    // If visit request, transition to scheduling phase
    if (infoRequest === 'visit') {
      return {
        response,
        updatedState: {
          ...state,
          phase: 'scheduling',
        },
      };
    }
    
    return {
      response,
      updatedState: {
        ...state,
        phase: 'information',
      },
    };
  }
  
  // Process qualification answer
  const updatedQualification = processAnswer(state.qualificationState, text);
  
  // Check if qualification is complete
  if (isQualificationComplete(updatedQualification)) {
    // AI can move from novo_lead to qualificado
    const statusAction = getAIStatusUpdateAction('novo_lead', 'qualificado');
    const actions: AgentAction[] = [
      { type: 'send_material', materialType: 'folder' },
    ];
    
    if (statusAction) {
      actions.unshift(statusAction);
    }
    
    return {
      response: {
        messages: ['Obrigada pelas informações! Vou te enviar nosso material com mais detalhes.'],
        actions,
        shouldTransfer: false,
      },
      updatedState: {
        ...state,
        phase: 'information',
        qualificationState: updatedQualification,
      },
    };
  }
  
  // Continue qualification
  return {
    response: generateQualificationResponse(updatedQualification),
    updatedState: {
      ...state,
      qualificationState: updatedQualification,
    },
  };
}

/**
 * Handles information phase - answering questions
 */
function handleInformationPhase(
  text: string,
  state: ConversationState
): { response: AgentResponse; updatedState: ConversationState } {
  // Check for objections
  const objection = detectObjection(text);
  if (objection) {
    return {
      response: generateObjectionResponse(objection),
      updatedState: {
        ...state,
        phase: 'objection_handling',
      },
    };
  }
  
  // Check for info requests
  const infoRequest = detectInfoRequest(text);
  if (infoRequest) {
    const response = generateInfoResponse(infoRequest);
    
    // If visit request, transition to scheduling phase
    if (infoRequest === 'visit') {
      return {
        response,
        updatedState: {
          ...state,
          phase: 'scheduling',
        },
      };
    }
    
    return {
      response,
      updatedState: state,
    };
  }
  
  // Default response
  return {
    response: {
      messages: ['Posso te ajudar com mais alguma informação sobre o empreendimento?'],
      actions: [],
      shouldTransfer: false,
    },
    updatedState: state,
  };
}

/**
 * Handles objection phase - after handling an objection
 */
function handleObjectionPhase(
  text: string,
  state: ConversationState
): { response: AgentResponse; updatedState: ConversationState } {
  // Check for more objections
  const objection = detectObjection(text);
  if (objection) {
    return {
      response: generateObjectionResponse(objection),
      updatedState: state,
    };
  }
  
  // Return to previous phase (qualification or information)
  const previousPhase = isQualificationComplete(state.qualificationState) 
    ? 'information' 
    : 'qualification';
  
  if (previousPhase === 'qualification') {
    return {
      response: generateQualificationResponse(state.qualificationState),
      updatedState: {
        ...state,
        phase: previousPhase,
      },
    };
  }
  
  return {
    response: {
      messages: ['Posso te ajudar com mais alguma informação?'],
      actions: [],
      shouldTransfer: false,
    },
    updatedState: {
      ...state,
      phase: previousPhase,
    },
  };
}

/**
 * Handles scheduling phase - visit scheduling
 * Requirements 6.1, 6.2, 6.3, 6.4, 6.5
 */
function handleSchedulingPhase(
  text: string,
  state: ConversationState
): { response: AgentResponse; updatedState: ConversationState } {
  // Get or create visit scheduling state
  const visitState: VisitSchedulingState = (state as ConversationState & { visitSchedulingState?: VisitSchedulingState }).visitSchedulingState 
    || createInitialVisitState();
  
  const leadName = state.qualificationState.name || 'Olá';
  
  // Process visit scheduling
  const { updatedState: newVisitState, result } = processVisitScheduling(
    visitState,
    text,
    leadName
  );
  
  // If scheduling is complete
  if (newVisitState.step === 'complete') {
    // AI can move from qualificado to visita_agendada
    const statusAction = getAIStatusUpdateAction('qualificado', 'visita_agendada');
    const actions: AgentAction[] = [
      { type: 'notify_team', priority: 'medium' },
    ];
    
    if (statusAction) {
      actions.unshift(statusAction);
    }
    
    return {
      response: {
        messages: [result.message],
        actions,
        shouldTransfer: false,
      },
      updatedState: {
        ...state,
        phase: 'information',
      },
    };
  }
  
  // Continue scheduling flow
  return {
    response: {
      messages: [result.message],
      actions: [],
      shouldTransfer: false,
    },
    updatedState: {
      ...state,
      phase: 'scheduling',
    } as ConversationState & { visitSchedulingState: VisitSchedulingState },
  };
}

/**
 * Handles default/unknown phase
 */
function handleDefaultPhase(
  text: string,
  state: ConversationState
): { response: AgentResponse; updatedState: ConversationState } {
  // Check for info requests
  const infoRequest = detectInfoRequest(text);
  if (infoRequest) {
    return {
      response: generateInfoResponse(infoRequest),
      updatedState: {
        ...state,
        phase: 'information',
      },
    };
  }
  
  // Check for objections
  const objection = detectObjection(text);
  if (objection) {
    return {
      response: generateObjectionResponse(objection),
      updatedState: {
        ...state,
        phase: 'objection_handling',
      },
    };
  }
  
  return {
    response: {
      messages: ['Como posso te ajudar?'],
      actions: [],
      shouldTransfer: false,
    },
    updatedState: state,
  };
}

/**
 * Generates initial greeting for new conversations
 * Requirements 1.1, 11.1
 */
export function generateInitialGreeting(): AgentResponse {
  return generateGreetingResponse();
}

/**
 * Checks if a response contains unauthorized discount promises
 * Requirements 11.2 - Compliance check
 */
export function containsUnauthorizedDiscount(text: string): boolean {
  const discountKeywords = [
    'desconto de',
    'desconto especial',
    'vou dar desconto',
    'posso dar desconto',
    'desconto garantido',
    '% de desconto',
    'por cento de desconto',
  ];
  
  const normalized = normalizeText(text);
  return discountKeywords.some(kw => normalized.includes(normalizeText(kw)));
}

/**
 * Validates if Maria (AI) can perform a status transition
 * AI can only move:
 * - novo_lead → qualificado (when qualification is complete)
 * - qualificado → visita_agendada (when visit is scheduled)
 * 
 * User must manually move:
 * - visita_agendada → visita_realizada (after visit happens)
 * - visita_realizada → proposta_enviada (when proposal is sent)
 */
export function canAIUpdateStatus(
  currentStatus: string,
  newStatus: string
): boolean {
  return canAIPerformTransition(currentStatus as LeadStatus, newStatus as LeadStatus);
}

/**
 * Gets the appropriate status update action for AI
 * Returns null if AI cannot perform this transition
 */
export function getAIStatusUpdateAction(
  currentStatus: string,
  targetStatus: string
): AgentAction | null {
  if (!canAIUpdateStatus(currentStatus, targetStatus)) {
    console.warn(`AI cannot transition from ${currentStatus} to ${targetStatus}`);
    return null;
  }
  
  return {
    type: 'update_status',
    status: targetStatus as LeadStatus,
  };
}

// ============================================
// 24/7 Availability Functions
// Requirements 13.1, 13.2
// ============================================

/**
 * Validates that a message can be processed at any time
 * Ensures 24/7 availability as per requirements
 * 
 * Requirements: 13.1, 13.2
 * 
 * @param message - The incoming message with timestamp
 * @returns true if message should be processed (always true for 24/7)
 */
export function canProcessMessageAtTime(message: IncomingMessage): boolean {
  // Use the availability service to check if message should be processed
  // This always returns true for 24/7 operation
  return shouldProcessMessage(message.timestamp);
}

/**
 * Gets the current availability status of the agent
 * Always indicates available for 24/7 operation
 * 
 * Requirements: 13.1, 13.2
 * 
 * @returns Availability status object
 */
export function getAgentAvailabilityStatus(): AvailabilityStatus {
  return getAvailabilityStatus();
}

/**
 * Checks if the agent is configured for 24/7 operation
 * 
 * Requirements: 13.1, 13.2
 * 
 * @returns true if agent operates 24/7
 */
export function is24x7Enabled(): boolean {
  return AVAILABILITY_CONFIG.hoursPerDay === 24 && 
         AVAILABILITY_CONFIG.daysPerWeek === 7 &&
         AVAILABILITY_CONFIG.continuousProcessing === true;
}

/**
 * Processes a message with 24/7 availability guarantee
 * This is the main entry point that ensures messages are processed regardless of time
 * 
 * Requirements: 13.1, 13.2
 * 
 * @param message - The incoming message
 * @param lead - The lead data
 * @param conversation - The conversation data
 * @returns The response and updated state
 */
export function processMessageWith24x7Availability(
  message: IncomingMessage,
  lead: PalmasLakeLead,
  conversation: PalmasLakeConversation
): { response: AgentResponse; updatedState: ConversationState; processedAt: Date } {
  // Validate 24/7 availability
  if (!canProcessMessageAtTime(message)) {
    // This should never happen with 24/7 configuration
    // But included for safety
    throw new Error('Message processing blocked - 24/7 availability not configured correctly');
  }
  
  // Process the message using the standard processor
  const result = processMessage(message, lead, conversation);
  
  return {
    ...result,
    processedAt: new Date(),
  };
}
