'use client';

import { useState, useCallback } from 'react';
import type { Lead } from '@/types/lead';

/**
 * Return type for the useLeadModal hook
 */
export interface UseLeadModalReturn {
  /** Whether the modal is currently open */
  isOpen: boolean;
  /** The currently selected lead (null when modal is closed) */
  selectedLead: Lead | null;
  /** Open the modal with a specific lead */
  openModal: (lead: Lead) => void;
  /** Close the modal */
  closeModal: () => void;
  /** Toggle modal state for a lead */
  toggleModal: (lead: Lead) => void;
}

/**
 * Hook for managing lead detail modal state
 * 
 * Provides state management for opening and closing the lead detail modal,
 * including tracking the currently selected lead.
 * 
 * Requirements: 3.1, 3.5
 * 
 * @example
 * ```tsx
 * const { isOpen, selectedLead, openModal, closeModal } = useLeadModal();
 * 
 * // Open modal when clicking a lead card
 * <LeadCard onClick={() => openModal(lead)} />
 * 
 * // Render modal
 * <LeadDetailModal
 *   lead={selectedLead}
 *   isOpen={isOpen}
 *   onClose={closeModal}
 * />
 * ```
 */
export function useLeadModal(): UseLeadModalReturn {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  /**
   * Open the modal with a specific lead
   * Requirements: 3.1
   */
  const openModal = useCallback((lead: Lead) => {
    setSelectedLead(lead);
    setIsOpen(true);
  }, []);

  /**
   * Close the modal
   * Requirements: 3.5
   */
  const closeModal = useCallback(() => {
    setIsOpen(false);
    // Delay clearing the lead to allow for close animation
    setTimeout(() => {
      setSelectedLead(null);
    }, 200);
  }, []);

  /**
   * Toggle modal state for a lead
   * If modal is open with the same lead, close it
   * If modal is closed or open with different lead, open with new lead
   */
  const toggleModal = useCallback((lead: Lead) => {
    if (isOpen && selectedLead?.id === lead.id) {
      closeModal();
    } else {
      openModal(lead);
    }
  }, [isOpen, selectedLead?.id, openModal, closeModal]);

  return {
    isOpen,
    selectedLead,
    openModal,
    closeModal,
    toggleModal,
  };
}

/**
 * Pure function to check if modal should be open
 * Useful for testing modal state logic
 */
export function shouldModalBeOpen(
  currentState: { isOpen: boolean; selectedLead: Lead | null },
  action: { type: 'open'; lead: Lead } | { type: 'close' } | { type: 'toggle'; lead: Lead }
): { isOpen: boolean; selectedLead: Lead | null } {
  switch (action.type) {
    case 'open':
      return { isOpen: true, selectedLead: action.lead };
    case 'close':
      return { isOpen: false, selectedLead: null };
    case 'toggle':
      if (currentState.isOpen && currentState.selectedLead?.id === action.lead.id) {
        return { isOpen: false, selectedLead: null };
      }
      return { isOpen: true, selectedLead: action.lead };
    default:
      return currentState;
  }
}
