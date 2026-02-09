'use client';

import * as React from 'react';
import { X, User, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TemperatureBadge } from './temperature-badge';
import { formatInterestType } from '@/lib/interest-type-format';
import type { Lead } from '@/types/lead';

type ModalTab = 'info' | 'chat';

/**
 * Props for the LeadDetailModal component
 */
export interface LeadDetailModalProps {
  /** Lead data to display, null when modal is closed */
  lead: Lead | null;
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback when modal should close */
  onClose: () => void;
  /** Callback to send a message to the lead */
  onSendMessage?: (message: string) => Promise<void>;
  /** Additional CSS classes for the modal */
  className?: string;
  /** Content for the info tab (tags, interests, summary) */
  infoContent?: React.ReactNode;
  /** Content for the chat tab */
  chatContent?: React.ReactNode;
  /** Children components (deprecated, use infoContent/chatContent) */
  children?: React.ReactNode;
}

/**
 * LeadDetailModal Component
 * 
 * A glassmorphism-styled modal for displaying detailed lead information.
 * Implements backdrop blur, close on outside click, and close button.
 * 
 * Requirements: 3.1, 3.5
 * 
 * @example
 * ```tsx
 * <LeadDetailModal
 *   lead={selectedLead}
 *   isOpen={isModalOpen}
 *   onClose={() => setIsModalOpen(false)}
 *   onSendMessage={handleSendMessage}
 * >
 *   <LeadTagsSection tags={lead.aiTags} />
 *   <LeadConversation messages={messages} />
 * </LeadDetailModal>
 * ```
 */
export function LeadDetailModal({
  lead,
  isOpen,
  onClose,
  onSendMessage,
  className,
  infoContent,
  chatContent,
  children,
}: LeadDetailModalProps) {
  const modalRef = React.useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = React.useState<ModalTab>('info');

  // Handle click outside to close modal (Requirements 3.5)
  const handleOverlayClick = React.useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  // Handle escape key to close modal
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open
  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Don't render if not open
  if (!isOpen || !lead) {
    return null;
  }

  return (
    <div
      className={cn(
        // Modal overlay with backdrop blur - account for bottom nav
        'fixed inset-0 z-[60] flex items-center justify-center',
        'bg-black/50 backdrop-blur-sm',
        'animate-in fade-in duration-200',
        'pb-20 md:pb-24' // Space for bottom navigation
      )}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="lead-modal-title"
    >
      {/* Modal content container with glassmorphism */}
      <div
        ref={modalRef}
        className={cn(
          // Size and layout - reduced max height to fit above bottom nav
          'w-full max-w-4xl max-h-[calc(100vh-120px)] overflow-hidden',
          'mx-4 flex flex-col',
          // Glassmorphism styling
          'bg-white/95 backdrop-blur-xl',
          'rounded-2xl',
          'border border-white/20',
          'shadow-2xl',
          // Animation
          'animate-in zoom-in-95 duration-200',
          className
        )}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 border-b border-black/5">
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-emerald-500/25">
              {(lead.full_name || lead.phone || 'L')[0].toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2
                  id="lead-modal-title"
                  className="text-xl font-bold text-foreground"
                >
                  {lead.full_name || lead.phone || 'Lead'}
                </h2>
                {/* Temperature Badge */}
                <TemperatureBadge
                  temperature={lead.temperature || null}
                  size="md"
                  showLabel
                />
              </div>
              <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                {lead.phone && (
                  <span className="flex items-center gap-1">
                    📱 {lead.phone}
                  </span>
                )}
                {lead.email && (
                  <span className="flex items-center gap-1">
                    ✉️ {lead.email}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Close button (Requirements 3.5) */}
          <button
            onClick={onClose}
            className={cn(
              'p-2 rounded-xl',
              'text-muted-foreground hover:text-foreground',
              'bg-white/50 hover:bg-white/80',
              'backdrop-blur-sm',
              'border border-white/20',
              'transition-all duration-200',
              'focus:outline-none focus:ring-2 focus:ring-primary/50'
            )}
            aria-label="Fechar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Lead Info Section */}
        <div className="p-4 border-b border-black/5 bg-white/30">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {lead.interest_type && (
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Interesse</span>
                <p className="text-sm font-medium text-foreground">
                  {formatInterestType(lead.interest_type, { withEmoji: true })}
                </p>
              </div>
            )}
            {lead.objective && (
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Objetivo</span>
                <p className="text-sm font-medium text-foreground">
                  🎯 {lead.objective === 'morar' ? 'Morar' : lead.objective === 'investir' ? 'Investir' : 'Morar + Investir'}
                </p>
              </div>
            )}
            {lead.purchase_timeline && (
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Prazo</span>
                <p className="text-sm font-medium text-foreground">📅 {lead.purchase_timeline}</p>
              </div>
            )}
            {lead.budget_range && (
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Orçamento</span>
                <p className="text-sm font-medium text-emerald-600">💰 {lead.budget_range}</p>
              </div>
            )}
            {lead.city_origin && (
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Cidade</span>
                <p className="text-sm font-medium text-foreground">📍 {lead.city_origin}</p>
              </div>
            )}
            {lead.source && (
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Origem</span>
                <p className="text-sm font-medium text-foreground">
                  {lead.source === 'whatsapp' ? '💬' : lead.source === 'instagram' ? '📸' : '🌐'} {lead.source}
                </p>
              </div>
            )}
            {lead.classification_type && (
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Tipo</span>
                <p className="text-sm font-medium text-foreground">
                  {lead.classification_type === 'corretor' ? '🏠 Corretor' : 
                   lead.classification_type === 'investidor' ? '💰 Investidor' : '👤 Cliente Final'}
                </p>
              </div>
            )}
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Status</span>
              <p className="text-sm font-medium text-foreground">
                {lead.status === 'novo_lead' ? '🆕 Novo Lead' :
                 lead.status === 'qualificado' ? '✅ Qualificado' :
                 lead.status === 'visita_agendada' ? '📅 Visita Agendada' :
                 lead.status === 'visita_realizada' ? '🏠 Visita Realizada' :
                 lead.status === 'proposta_enviada' ? '📄 Proposta Enviada' : lead.status}
              </p>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-black/5 bg-gray-50/50">
          <button
            onClick={() => setActiveTab('info')}
            className={cn(
              'flex items-center gap-2 px-6 py-3 text-sm font-medium transition-all',
              'border-b-2 -mb-px',
              activeTab === 'info'
                ? 'border-emerald-500 text-emerald-600 bg-white/50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-white/30'
            )}
          >
            <User className="w-4 h-4" />
            Informações
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className={cn(
              'flex items-center gap-2 px-6 py-3 text-sm font-medium transition-all',
              'border-b-2 -mb-px',
              activeTab === 'chat'
                ? 'border-emerald-500 text-emerald-600 bg-white/50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-white/30'
            )}
          >
            <MessageCircle className="w-4 h-4" />
            Conversa
          </button>
        </div>

        {/* Modal Body - Tab Content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'info' && (
            <div className="p-6">
              {infoContent || children}
            </div>
          )}
          {activeTab === 'chat' && (
            <div className="h-full flex flex-col">
              {chatContent}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * LeadDetailModalHeader - Reusable header section for modal content
 */
export interface LeadDetailModalSectionProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function LeadDetailModalSection({
  title,
  children,
  className,
}: LeadDetailModalSectionProps) {
  return (
    <div className={cn('space-y-3', className)}>
      <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
        {title}
      </h3>
      {children}
    </div>
  );
}
