/**
 * AI Specialist Configuration
 * 
 * Defines the configuration for AI specialists in each section of the dashboard.
 * Each section has a unique emoji, placeholder text, and context type.
 */

import { 
  LayoutDashboard, 
  MessageSquare, 
  Users, 
  Calendar, 
  BarChart3,
  type LucideIcon 
} from 'lucide-react';

/**
 * Context types for AI specialists
 */
export type AIContextType = 'crm' | 'chat' | 'leads' | 'agendamentos' | 'analytics';

/**
 * AI Specialist configuration interface
 */
export interface AISpecialistConfig {
  section: string;
  emoji: string;
  icon: LucideIcon;
  placeholder: string;
  contextType: AIContextType;
  backgroundColor: string;
  gradientColors: string;
  online: boolean;
  /** Width of the expanded dock in pixels */
  expandedWidth: number;
}

/**
 * AI Specialist configurations mapped by route path
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
 */
export const aiSpecialistConfigs: Record<string, AISpecialistConfig> = {
  '/dashboard/quadro': {
    section: 'CRM',
    emoji: '📊',
    icon: LayoutDashboard,
    placeholder: 'Pergunte algo sobre seu CRM...',
    contextType: 'crm',
    backgroundColor: 'bg-blue-300',
    gradientColors: '#93c5fd, #dbeafe',
    online: true,
    expandedWidth: 320,
  },
  '/dashboard/chat': {
    section: 'Conversas',
    emoji: '💬',
    icon: MessageSquare,
    placeholder: 'Pergunte algo sobre suas conversas...',
    contextType: 'chat',
    backgroundColor: 'bg-purple-300',
    gradientColors: '#c4b5fd, #ede9fe',
    online: true,
    expandedWidth: 380,
  },
  '/dashboard/leads': {
    section: 'Leads',
    emoji: '👥',
    icon: Users,
    placeholder: 'Pergunte algo sobre seus leads...',
    contextType: 'leads',
    backgroundColor: 'bg-green-300',
    gradientColors: '#86efac, #dcfce7',
    online: true,
    expandedWidth: 340,
  },
  '/dashboard/agendamentos': {
    section: 'Agendamentos',
    emoji: '📅',
    icon: Calendar,
    placeholder: 'Pergunte algo sobre seus agendamentos...',
    contextType: 'agendamentos',
    backgroundColor: 'bg-orange-300',
    gradientColors: '#fdba74, #ffedd5',
    online: true,
    expandedWidth: 400,
  },
  '/dashboard/analytics': {
    section: 'Análises',
    emoji: '📈',
    icon: BarChart3,
    placeholder: 'Pergunte algo sobre suas análises...',
    contextType: 'analytics',
    backgroundColor: 'bg-teal-300',
    gradientColors: '#5eead4, #ccfbf1',
    online: true,
    expandedWidth: 360,
  },
};

/**
 * Get AI specialist config by path
 * Supports exact match and prefix match for sub-routes
 */
export function getAISpecialistByPath(path: string): AISpecialistConfig | undefined {
  // Try exact match first
  if (aiSpecialistConfigs[path]) {
    return aiSpecialistConfigs[path];
  }
  
  // Try prefix match for sub-routes
  for (const [configPath, config] of Object.entries(aiSpecialistConfigs)) {
    if (path.startsWith(configPath + '/') || path === configPath) {
      return config;
    }
  }
  
  return undefined;
}

/**
 * Get AI specialist config by context type
 */
export function getAISpecialistByContextType(contextType: AIContextType): AISpecialistConfig | undefined {
  return Object.values(aiSpecialistConfigs).find(config => config.contextType === contextType);
}

/**
 * Get all AI specialist configs as an array
 */
export function getAllAISpecialists(): AISpecialistConfig[] {
  return Object.values(aiSpecialistConfigs);
}

/**
 * Get all valid dashboard paths that have AI specialists
 */
export function getAISpecialistPaths(): string[] {
  return Object.keys(aiSpecialistConfigs);
}

/**
 * Check if a path has an AI specialist configured
 */
export function hasAISpecialist(path: string): boolean {
  return getAISpecialistByPath(path) !== undefined;
}
