/**
 * Qualification Service for Maria Agent (Palmas Lake Towers)
 * Implements state machine for lead qualification flow
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7
 */

import type {
  QualificationState,
  QualificationStep,
  InterestType,
  Timeline,
} from '@/types/maria-agent';

// ============================================
// Qualification Step Sequence
// Requirements 2.1: name → interest_type → objective → timeline → region_knowledge
// ============================================

export const QUALIFICATION_SEQUENCE: QualificationStep[] = [
  'name',
  'interest_type',
  'objective',
  'timeline',
  'region_knowledge',
  'contact_info',
  'complete',
];

// ============================================
// Qualification Questions
// ============================================

export interface QualificationQuestion {
  step: QualificationStep;
  question: string;
  options?: string[];
}

export const QUALIFICATION_QUESTIONS: Record<QualificationStep, QualificationQuestion | null> = {
  name: {
    step: 'name',
    question: 'Como posso te chamar?',
  },
  interest_type: {
    step: 'interest_type',
    question: 'Qual tipo de imóvel você está buscando?',
    options: ['Apartamento', 'Salas Comerciais', 'Loft/Flat', 'Salas Shopping'],
  },
  objective: {
    step: 'objective',
    question: 'Qual seu objetivo com este imóvel?',
    options: ['Morar', 'Investir'],
  },
  timeline: {
    step: 'timeline',
    question: 'Para quando você está planejando essa aquisição?',
  },
  region_knowledge: {
    step: 'region_knowledge',
    question: 'Você já conhece a região da Orla 14?',
  },
  contact_info: {
    step: 'contact_info',
    question: 'Qual o melhor telefone para contato?',
  },
  complete: null,
};

// ============================================
// State Machine Functions
// ============================================

/**
 * Creates initial qualification state
 */
export function createInitialQualificationState(): QualificationState {
  return {
    step: 'name',
  };
}

/**
 * Gets the index of a step in the sequence
 */
export function getStepIndex(step: QualificationStep): number {
  return QUALIFICATION_SEQUENCE.indexOf(step);
}

/**
 * Gets the next step in the qualification sequence
 * Requirements 2.1: Follows sequence name → interest_type → objective → timeline → region_knowledge
 */
export function getNextStep(currentStep: QualificationStep): QualificationStep {
  const currentIndex = getStepIndex(currentStep);
  
  if (currentIndex === -1 || currentIndex >= QUALIFICATION_SEQUENCE.length - 1) {
    return 'complete';
  }
  
  return QUALIFICATION_SEQUENCE[currentIndex + 1];
}

/**
 * Gets the next question based on current state
 */
export function getNextQuestion(state: QualificationState): QualificationQuestion | null {
  if (state.step === 'complete') {
    return null;
  }
  
  return QUALIFICATION_QUESTIONS[state.step];
}

/**
 * Checks if qualification is complete
 */
export function isQualificationComplete(state: QualificationState): boolean {
  return state.step === 'complete';
}

/**
 * Validates if a step transition is valid (must follow sequence)
 */
export function isValidStepTransition(
  currentStep: QualificationStep,
  nextStep: QualificationStep
): boolean {
  const currentIndex = getStepIndex(currentStep);
  const nextIndex = getStepIndex(nextStep);
  
  // Can only move forward by exactly one step
  return nextIndex === currentIndex + 1;
}

/**
 * Advances the qualification state to the next step
 */
export function advanceToNextStep(state: QualificationState): QualificationState {
  const nextStep = getNextStep(state.step);
  
  return {
    ...state,
    step: nextStep,
  };
}

/**
 * Gets the qualification progress as a percentage
 */
export function getQualificationProgress(state: QualificationState): number {
  const currentIndex = getStepIndex(state.step);
  const totalSteps = QUALIFICATION_SEQUENCE.length - 1; // Exclude 'complete'
  
  if (state.step === 'complete') {
    return 100;
  }
  
  return Math.round((currentIndex / totalSteps) * 100);
}

/**
 * Calculates a qualification score based on filled fields
 */
export function getQualificationScore(state: QualificationState): number {
  let score = 0;
  const maxScore = 7;
  
  if (state.name) score++;
  if (state.interestType) score++;
  if (state.objective) score++;
  if (state.timeline) score++;
  if (state.knowsRegion !== undefined) score++;
  if (state.phone) score++;
  if (state.email) score++;
  
  return Math.round((score / maxScore) * 100);
}


// ============================================
// Answer Processing and Extraction
// Requirements: 2.6, 2.7
// ============================================

/**
 * Normalizes text for comparison (lowercase, trim, remove accents)
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Extracts name from user response
 */
export function extractName(answer: string): string | null {
  const trimmed = answer.trim();
  
  // Basic validation: name should have at least 2 characters
  if (trimmed.length < 2) {
    return null;
  }
  
  // Remove common prefixes like "meu nome é", "me chamo", etc.
  const normalized = normalizeText(trimmed);
  const prefixes = [
    'meu nome e ',
    'me chamo ',
    'pode me chamar de ',
    'sou o ',
    'sou a ',
    'eu sou ',
    'sou ',
  ];
  
  let name = trimmed;
  for (const prefix of prefixes) {
    if (normalized.startsWith(prefix)) {
      name = trimmed.substring(prefix.length).trim();
      break;
    }
  }
  
  // Capitalize first letter of each word
  return name
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Maps user response to InterestType
 * Requirements 2.2: apartamento, salas comerciais, loft/flat ou salas shopping
 */
export function extractInterestType(answer: string): InterestType | null {
  const normalized = normalizeText(answer);
  
  const mappings: Array<{ keywords: string[]; type: InterestType }> = [
    { keywords: ['apartamento', 'apto', 'residencial', 'morar'], type: 'apartamento' },
    { keywords: ['sala comercial', 'comercial', 'escritorio', 'loja'], type: 'sala_comercial' },
    { keywords: ['office', 'offices'], type: 'office' },
    { keywords: ['flat', 'loft', 'studio'], type: 'flat' },
  ];
  
  for (const mapping of mappings) {
    for (const keyword of mapping.keywords) {
      if (normalized.includes(keyword)) {
        return mapping.type;
      }
    }
  }
  
  return null;
}

/**
 * Extracts objective from user response
 * Requirements 2.3: morar ou investir
 */
export function extractObjective(answer: string): 'morar' | 'investir' | null {
  const normalized = normalizeText(answer);
  
  const morarKeywords = ['morar', 'moradia', 'residir', 'viver', 'casa propria'];
  const investirKeywords = ['investir', 'investimento', 'renda', 'alugar', 'aluguel', 'rentabilidade'];
  
  for (const keyword of morarKeywords) {
    if (normalized.includes(keyword)) {
      return 'morar';
    }
  }
  
  for (const keyword of investirKeywords) {
    if (normalized.includes(keyword)) {
      return 'investir';
    }
  }
  
  return null;
}

/**
 * Extracts timeline from user response
 * Requirements 2.4: prazo de aquisição
 */
export function extractTimeline(answer: string): Timeline | null {
  const normalized = normalizeText(answer);
  
  const imediatoKeywords = ['imediato', 'agora', 'urgente', 'ja', 'hoje', 'essa semana', 'este mes'];
  const curtoPrazoKeywords = ['proximo mes', 'proximos meses', '1 mes', '2 meses', '3 meses', 'curto prazo'];
  const medioPrazoKeywords = ['6 meses', 'meio ano', 'semestre', 'ate 1 ano', 'medio prazo'];
  const longoPrazoKeywords = ['mais de 1 ano', 'longo prazo', 'futuro', 'ainda nao sei', 'sem pressa'];
  
  for (const keyword of imediatoKeywords) {
    if (normalized.includes(keyword)) {
      return 'imediato';
    }
  }
  
  for (const keyword of curtoPrazoKeywords) {
    if (normalized.includes(keyword)) {
      return 'curto_prazo';
    }
  }
  
  for (const keyword of medioPrazoKeywords) {
    if (normalized.includes(keyword)) {
      return 'medio_prazo';
    }
  }
  
  for (const keyword of longoPrazoKeywords) {
    if (normalized.includes(keyword)) {
      return 'longo_prazo';
    }
  }
  
  return null;
}

/**
 * Extracts boolean response (yes/no) for region knowledge
 * Requirements 2.5: conhecimento da região
 */
export function extractBooleanResponse(answer: string): boolean | null {
  const normalized = normalizeText(answer);
  
  const yesKeywords = ['sim', 'conheco', 'ja fui', 'ja visitei', 'conheço', 'claro', 'com certeza'];
  const noKeywords = ['nao', 'nunca', 'ainda nao', 'nao conheco', 'não'];
  
  for (const keyword of yesKeywords) {
    if (normalized.includes(keyword)) {
      return true;
    }
  }
  
  for (const keyword of noKeywords) {
    if (normalized.includes(keyword)) {
      return false;
    }
  }
  
  return null;
}

/**
 * Extracts phone number from user response
 * Requirements 2.6
 */
export function extractPhone(answer: string): string | null {
  // Remove all non-digit characters
  const digits = answer.replace(/\D/g, '');
  
  // Brazilian phone: 10-11 digits (with area code)
  if (digits.length >= 10 && digits.length <= 13) {
    return digits;
  }
  
  return null;
}

/**
 * Extracts email from user response
 * Requirements 2.7
 */
export function extractEmail(answer: string): string | null {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  const match = answer.match(emailRegex);
  
  return match ? match[0].toLowerCase() : null;
}

/**
 * Processes an answer and updates the qualification state
 * Main function that orchestrates answer extraction and state transition
 */
export function processAnswer(
  state: QualificationState,
  answer: string
): QualificationState {
  if (state.step === 'complete') {
    return state;
  }
  
  let updatedState = { ...state };
  let shouldAdvance = false;
  
  switch (state.step) {
    case 'name': {
      const name = extractName(answer);
      if (name) {
        updatedState.name = name;
        shouldAdvance = true;
      }
      break;
    }
    
    case 'interest_type': {
      const interestType = extractInterestType(answer);
      if (interestType) {
        updatedState.interestType = interestType;
        shouldAdvance = true;
      }
      break;
    }
    
    case 'objective': {
      const objective = extractObjective(answer);
      if (objective) {
        updatedState.objective = objective;
        shouldAdvance = true;
      }
      break;
    }
    
    case 'timeline': {
      const timeline = extractTimeline(answer);
      if (timeline) {
        updatedState.timeline = timeline;
        shouldAdvance = true;
      }
      break;
    }
    
    case 'region_knowledge': {
      const knowsRegion = extractBooleanResponse(answer);
      if (knowsRegion !== null) {
        updatedState.knowsRegion = knowsRegion;
        shouldAdvance = true;
      }
      break;
    }
    
    case 'contact_info': {
      const phone = extractPhone(answer);
      const email = extractEmail(answer);
      
      if (phone) {
        updatedState.phone = phone;
      }
      if (email) {
        updatedState.email = email;
      }
      
      // Advance if at least phone is provided
      if (phone) {
        shouldAdvance = true;
      }
      break;
    }
  }
  
  if (shouldAdvance) {
    updatedState = advanceToNextStep(updatedState);
  }
  
  return updatedState;
}

/**
 * Validates if a qualification state has all required fields for completion
 */
export function validateQualificationState(state: QualificationState): {
  isValid: boolean;
  missingFields: string[];
} {
  const missingFields: string[] = [];
  
  if (!state.name) missingFields.push('name');
  if (!state.interestType) missingFields.push('interestType');
  if (!state.objective) missingFields.push('objective');
  if (!state.timeline) missingFields.push('timeline');
  if (state.knowsRegion === undefined) missingFields.push('knowsRegion');
  if (!state.phone) missingFields.push('phone');
  
  return {
    isValid: missingFields.length === 0,
    missingFields,
  };
}
