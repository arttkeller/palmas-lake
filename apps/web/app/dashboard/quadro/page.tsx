'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CardContent } from '@/components/ui/card';
import { GlassmorphismCard, getGlassmorphismClasses } from '@/components/ui/glassmorphism-card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { DollarSign, MapPin, MoreVertical, Plus, Loader2, Calendar, Home, Flame, Search, X, Instagram } from 'lucide-react';
import { WhatsAppWindowBadge } from '@/components/ui/whatsapp-window-badge';
import { LottieIcon } from '@/components/ui/lottie-icon';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api-fetch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createClient } from '@/lib/supabase';
import { TemperatureBadge } from '@/components/ui/temperature-badge';
import { TemperatureFilterBar } from '@/components/ui/temperature-filter-bar';
import { LeadDetailModal, LeadDetailModalSection } from '@/components/ui/lead-detail-modal';
import { LeadTagsSection } from '@/components/ui/lead-tags-section';
import { LeadConversation } from '@/components/ui/lead-conversation';
import { NewLeadModal } from '@/components/ui/new-lead-modal';
import { parseTags } from '@/lib/lead-utils';
import { useLeadFilters, calculateLeadCountsByTemperature } from '@/hooks/useLeadFilters';
import { useLeadModal } from '@/hooks/useLeadModal';
import type { LeadTemperature, NonNullLeadTemperature, LeadTag } from '@/lib/temperature-config';
import { normalizeTemperature } from '@/lib/temperature-config';
import { formatInterestType } from '@/lib/interest-type-format';
import { normalizeStatus as normalizeStatusShared } from '@/lib/status-config';
import type { Lead as LeadType } from '@/types/lead';
import type { Message } from '@/types/chat';

// Define the shape of a Lead in the Kanban (Frontend View)
interface Lead {
    id: string;
    name: string;
    phone?: string;
    email?: string;
    interest?: string;
    budget?: string;
    status: 'novo_lead' | 'transferido' | 'visita_agendada' | 'visita_realizada' | 'proposta_enviada';
    priority?: 'low' | 'medium' | 'high';
    lastActivity?: string;
    assignedTo?: {
        name: string;
        avatar?: string;
    };
    tags?: string[];
    interestType?: 'apartamento' | 'sala_comercial' | 'office' | 'flat' | 'loft';
    objective?: 'morar' | 'investir' | 'morar_investir';
    purchaseTimeline?: string;
    knowsRegion?: boolean;
    cityOrigin?: string;
    classificationType?: 'cliente_final' | 'corretor' | 'investidor';
    isHot?: boolean;
    source?: 'instagram' | 'facebook' | 'site' | 'indicacao' | 'whatsapp';
    instagramId?: string;
    temperature?: LeadTemperature;
    lastInteractionAt?: string;
}

interface Column {
    id: 'novo_lead' | 'transferido' | 'visita_agendada' | 'visita_realizada' | 'proposta_enviada';
    title: string;
    leads: Lead[];
    color: string;
    gradient: string;
    count: number;
    lottieUrl: string;
}

const COLUMN_LOTTIE_URLS: Record<string, string> = {
    novo_lead: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f331/lottie.json',
    transferido: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f916/lottie.json',
    visita_agendada: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f514/lottie.json',
    visita_realizada: 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f91d/lottie.json',
    proposta_enviada: 'https://fonts.gstatic.com/s/e/notoemoji/latest/270d_fe0f/lottie.json',
};

const COLUMN_LOTTIE_FALLBACKS: Record<string, string> = {
    novo_lead: '🌱',
    transferido: '🤖',
    visita_agendada: '🔔',
    visita_realizada: '🤝',
    proposta_enviada: '✍️',
};

const initialColumns: Column[] = [
    { id: 'novo_lead', title: 'Novo Lead', color: 'bg-blue-500', gradient: 'from-blue-500/20 to-blue-600/5', count: 0, leads: [], lottieUrl: COLUMN_LOTTIE_URLS.novo_lead },
    { id: 'transferido', title: 'Transferido', color: 'bg-amber-500', gradient: 'from-amber-500/20 to-amber-600/5', count: 0, leads: [], lottieUrl: COLUMN_LOTTIE_URLS.transferido },
    { id: 'visita_agendada', title: 'Visita Agendada', color: 'bg-violet-500', gradient: 'from-violet-500/20 to-violet-600/5', count: 0, leads: [], lottieUrl: COLUMN_LOTTIE_URLS.visita_agendada },
    { id: 'visita_realizada', title: 'Visita Realizada', color: 'bg-orange-500', gradient: 'from-orange-500/20 to-orange-600/5', count: 0, leads: [], lottieUrl: COLUMN_LOTTIE_URLS.visita_realizada },
    { id: 'proposta_enviada', title: 'Proposta Enviada', color: 'bg-emerald-500', gradient: 'from-emerald-500/20 to-emerald-600/5', count: 0, leads: [], lottieUrl: COLUMN_LOTTIE_URLS.proposta_enviada },
];

function WhatsAppLogo({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
    );
}

const INVESTOR_SIGNALS = ['investidor', 'investir', 'investimento', 'investor'] as const;

function normalizeLeadSignal(value: string): string {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

function hasInvestorSignal(values: Array<string | null | undefined>): boolean {
    return values.some((value) => {
        if (!value) return false;
        const normalized = normalizeLeadSignal(value);
        return INVESTOR_SIGNALS.some(signal => normalized.includes(signal));
    });
}

function normalizeObjectiveValue(rawObjective: unknown): Lead['objective'] | undefined {
    if (typeof rawObjective !== 'string') return undefined;
    const normalized = normalizeLeadSignal(rawObjective);
    if (!normalized) return undefined;
    if (normalized.includes('morar') && normalized.includes('invest')) return 'morar_investir';
    if (normalized.includes('invest')) return 'investir';
    if (normalized.includes('morar')) return 'morar';
    return undefined;
}

function inferLeadObjective(item: any): Lead['objective'] | undefined {
    const objective = normalizeObjectiveValue(item?.objective);
    if (objective) return objective;

    const signals = [
        ...parseTags(item?.tags),
        ...parseTags(item?.adjectives),
        typeof item?.notes === 'string' ? item.notes : null,
        typeof item?.conversation_summary === 'string' ? item.conversation_summary : null,
    ];

    return hasInvestorSignal(signals) ? 'investir' : undefined;
}

function inferLeadClassification(
    item: any,
    objective?: Lead['objective']
): Lead['classificationType'] | undefined {
    const rawClassification = typeof item?.classification_type === 'string'
        ? normalizeLeadSignal(item.classification_type)
        : '';

    if (rawClassification === 'cliente_final' || rawClassification === 'corretor' || rawClassification === 'investidor') {
        return rawClassification as Lead['classificationType'];
    }

    if (objective === 'investir' || objective === 'morar_investir') {
        return 'investidor';
    }

    const signals = [
        ...parseTags(item?.tags),
        ...parseTags(item?.adjectives),
    ];
    return hasInvestorSignal(signals) ? 'investidor' : undefined;
}

export default function LeadsKanban() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [columns, setColumns] = useState<Column[]>(initialColumns);
    const [loading, setLoading] = useState(true);

    const [error, setError] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);
    const [draggingLeadId, setDraggingLeadId] = useState<string | null>(null);
    const [allLeadsData, setAllLeadsData] = useState<any[]>([]);
    const [sellersMap, setSellersMap] = useState<Record<string, string>>({});
    const [isNewLeadOpen, setIsNewLeadOpen] = useState(false);
    // Stable Supabase client — avoids re-creating on every render
    const supabase = useMemo(() => createClient(), []);
    // Ref to track whether the very first load has completed (not state, so
    // it won't cause fetchLeads to be recreated on change)
    const isInitialLoadRef = useRef(true);
    // Ref to hold the latest searchTerm so fetchLeads doesn't recreate when it changes
    const searchTermRef = useRef(searchTerm);
    searchTermRef.current = searchTerm;
    const openedLeadFromQueryRef = useRef<string | null>(null);

    // Lead filters hook (Requirements 2.1, 2.2, 2.3, 2.4)
    const { activeFilter, activeFilters, toggleFilter, filterLeads } = useLeadFilters();
    
    // Lead modal hook (Requirements 3.1, 3.5)
    const { isOpen: isModalOpen, selectedLead, openModal, closeModal: closeModalBase } = useLeadModal();
    
    // Conversation state for modal
    const [conversationMessages, setConversationMessages] = useState<Message[]>([]);
    const [isLoadingMessages, setIsLoadingMessages] = useState(false);
    const [isSendingMessage, setIsSendingMessage] = useState(false);
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
    const [isAiPaused, setIsAiPaused] = useState(false);

    // Wrapper to clean up conversation state when modal closes
    const closeModal = useCallback(() => {
        closeModalBase();
        setActiveConversationId(null);
        setConversationMessages([]);
    }, [closeModalBase]);

    const SCHEMA = 'palmaslake-agno';

    const fetchLeads = useCallback(async (isBackgroundRefresh = false) => {
        // First ever load — show full-page skeleton
        if (isInitialLoadRef.current && !isBackgroundRefresh) {
            setLoading(true);
        }

        setError('');

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            const res = await apiFetch(`/api/leads`, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (res.ok) {
                const apiData = await res.json();
                setAllLeadsData(apiData);
                setLoading(false);
                isInitialLoadRef.current = false;
                return;
            }
        } catch (err) {
            // API error or timeout, falling back to Supabase
        }

        const { data, error: sbError } = await supabase
            .schema(SCHEMA)
            .from('leads')
            .select('*')
            .order('created_at', { ascending: false });

        if (sbError) {
            setError('Falha ao carregar leads. Verifique sua conexão.');
        } else {
            setAllLeadsData(data || []);
        }
        setLoading(false);
        isInitialLoadRef.current = false;
    }, [supabase]); // stable — supabase is memoized, no other changing deps

    // Fetch sellers map (UUID → name) for assigned_to display
    const fetchSellers = useCallback(async () => {
        try {
            const res = await apiFetch(`/api/sellers`);
            if (res.ok) {
                const sellers = await res.json();
                const map: Record<string, string> = {};
                for (const s of sellers) {
                    map[s.id] = s.full_name || s.whatsapp_number || 'Vendedor';
                }
                setSellersMap(map);
            }
        } catch {
            // Sellers endpoint may not exist yet — ignore
        }
    }, []);

    // Initial fetch — runs once
    useEffect(() => {
        fetchLeads();
        fetchSellers();
    }, [fetchLeads, fetchSellers]);

    // Re-process columns whenever leads data, search, or filter changes
    useEffect(() => {
        if (allLeadsData.length > 0) {
            processLeads(allLeadsData, searchTerm);
        }
    }, [searchTerm, allLeadsData, activeFilter, sellersMap]);

    useEffect(() => {
        const channel = supabase
            .channel('realtime:leads-kanban')
            .on('postgres_changes', {
                event: '*',
                schema: SCHEMA,
                table: 'leads'
            }, () => {
                fetchLeads(true); // background refresh — no full-page loading
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [fetchLeads, supabase]);

    // Broadcast fallback: escuta evento lead_deleted enviado pelo backend
    // Garante atualização mesmo se postgres_changes não emitir DELETE
    useEffect(() => {
        const channel = supabase
            .channel('realtime:lead-deletions')
            .on('broadcast', { event: 'lead_deleted' }, () => {
                fetchLeads(true);
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [fetchLeads, supabase]);

    // Sync selectedLead with allLeadsData on realtime updates (Requirements 3.2, 3.3)
    // When allLeadsData refreshes via realtime, update the modal's selectedLead so
    // temperature badge, tags, sentiment etc. reflect the latest data.
    // Also closes modal if the lead was deleted (#apagar command).
    useEffect(() => {
        if (!isModalOpen || !selectedLead) return;
        const rawLead = allLeadsData.find(item => item.id === selectedLead.id);
        if (!rawLead) {
            closeModal();
            return;
        }

        const updatedTemp = rawLead.temperature
            ? normalizeTemperature(rawLead.temperature)
            : null;

        // Only update if something actually changed to avoid infinite re-renders
        if (
            selectedLead.temperature !== updatedTemp ||
            selectedLead.status !== normalizeStatusShared(rawLead.status)
        ) {
            openModal({
                ...selectedLead,
                temperature: updatedTemp as LeadTemperature,
                status: normalizeStatusShared(rawLead.status) as any,
                tags: rawLead.tags,
                interest_type: rawLead.interest_type,
            });
        }
    }, [allLeadsData, isModalOpen, selectedLead, openModal, closeModal]);

    // Realtime subscription for modal messages
    useEffect(() => {
        if (!activeConversationId || !isModalOpen) return;

        const channel = supabase
            .channel(`realtime:modal-messages:${activeConversationId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: SCHEMA,
                table: 'messages'
            }, (payload) => {
                const newMsg = payload.new as Message;

                // Filter only messages from this conversation
                if (newMsg.conversation_id === activeConversationId) {
                    setConversationMessages((prev: Message[]) => {
                        // Avoid duplicates
                        if (prev.some((m: Message) => m.id === newMsg.id)) return prev;
                        return [...prev, newMsg];
                    });
                }
            })
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: SCHEMA,
                table: 'messages'
            }, (payload) => {
                const updatedMsg = payload.new as Message;
                if (updatedMsg.conversation_id === activeConversationId) {
                    setConversationMessages((prev: Message[]) =>
                        prev.map(m => m.id === updatedMsg.id ? updatedMsg : m)
                    );
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [activeConversationId, isModalOpen, supabase]);

    // Calculate lead counts by temperature for filter bar badges (Requirements 2.5)
    const leadCounts = useMemo(() => {
        // Convert allLeadsData to Lead format for counting, normalizing temperature first
        const leadsForCounting = allLeadsData.map(item => ({
            id: item.id,
            temperature: item.temperature ? normalizeTemperature(item.temperature) : null,
        })) as LeadType[];
        return calculateLeadCountsByTemperature(leadsForCounting);
    }, [allLeadsData]);

    const processLeads = (data: any[], filter: string = '') => {
        if (!data) return;

        const normalizedFilter = filter.toLowerCase().trim();
        let filteredData = normalizedFilter 
            ? data.filter(item => {
                const name = (item.full_name || item.name || '').toLowerCase();
                const phone = (item.phone || '').toLowerCase().replace(/\D/g, '');
                const searchPhone = normalizedFilter.replace(/\D/g, '');
                return name.includes(normalizedFilter) || 
                       phone.includes(searchPhone) ||
                       (item.email || '').toLowerCase().includes(normalizedFilter);
            })
            : data;

        // Apply temperature filter (Requirements 2.1, 2.3)
        if (activeFilter) {
            filteredData = filteredData.filter(item => {
                const temp = item.temperature;
                if (!temp) return false;
                // Normalize before comparing — DB may store Portuguese ("morno") while filter uses English ("warm")
                const normalizedTemp = normalizeTemperature(temp);
                return normalizedTemp === activeFilter;
            });
        }

        const newColumns: Column[] = [
            { id: 'novo_lead', title: 'Novo Lead', color: 'bg-blue-500', gradient: 'from-blue-500/20 to-blue-600/5', count: 0, leads: [], lottieUrl: COLUMN_LOTTIE_URLS.novo_lead },
            { id: 'transferido', title: 'Transferido', color: 'bg-amber-500', gradient: 'from-amber-500/20 to-amber-600/5', count: 0, leads: [], lottieUrl: COLUMN_LOTTIE_URLS.transferido },
            { id: 'visita_agendada', title: 'Visita Agendada', color: 'bg-violet-500', gradient: 'from-violet-500/20 to-violet-600/5', count: 0, leads: [], lottieUrl: COLUMN_LOTTIE_URLS.visita_agendada },
            { id: 'visita_realizada', title: 'Visita Realizada', color: 'bg-orange-500', gradient: 'from-orange-500/20 to-orange-600/5', count: 0, leads: [], lottieUrl: COLUMN_LOTTIE_URLS.visita_realizada },
            { id: 'proposta_enviada', title: 'Proposta Enviada', color: 'bg-emerald-500', gradient: 'from-emerald-500/20 to-emerald-600/5', count: 0, leads: [], lottieUrl: COLUMN_LOTTIE_URLS.proposta_enviada },
        ];

        const interestTypeMap: Record<string, string> = {
            'apartamento': 'Apartamento',
            'sala_comercial': 'Sala Comercial',
            'office': 'Office',
            'flat': 'Flat',
            'loft': 'Loft'
        };

        filteredData.forEach((item) => {
            const statusKey = mapStatus(item.status);
            const tags: string[] = [];
            const objective = inferLeadObjective(item);
            const classificationType = inferLeadClassification(item, objective);
            if (item.email) tags.push('Email');
            // Source (instagram/whatsapp) is already shown as an icon in the card footer,
            // so we skip adding it as a tag to avoid duplication.
            if (classificationType === 'corretor') tags.push('🏠 Corretor');
            if (classificationType === 'investidor') tags.push('💰 Investidor');
            if (item.is_hot) tags.push('🔥 HOT');
            
            const lead: Lead = {
                id: item.id,
                name: item.full_name || item.name || item.phone || 'Sem nome',
                phone: item.phone,
                email: item.email,
                interest: item.interest_type ? interestTypeMap[item.interest_type] : (item.notes || 'Interesse geral'),
                budget: item.budget_range || '',
                status: statusKey,
                priority: item.is_hot ? 'high' : 'medium',
                lastActivity: item.created_at ? new Date(item.created_at).toLocaleDateString('pt-BR') : 'Hoje',
                tags: tags,
                assignedTo: item.assigned_to && sellersMap[item.assigned_to]
                    ? { name: sellersMap[item.assigned_to] }
                    : undefined,
                interestType: item.interest_type,
                objective,
                purchaseTimeline: item.purchase_timeline,
                knowsRegion: item.knows_region,
                cityOrigin: item.city_origin,
                classificationType,
                isHot: item.is_hot,
                source: item.source,
                instagramId: item.instagram_id,
                temperature: (item.temperature ? normalizeTemperature(item.temperature) : null) as LeadTemperature,
                lastInteractionAt: item.last_interaction ?? item.last_interaction_at,
            };

            const colIndex = newColumns.findIndex(c => c.id === statusKey);
            if (colIndex !== -1) {
                newColumns[colIndex].leads.push(lead);
                newColumns[colIndex].count++;
            } else {
                newColumns[0].leads.push(lead);
                newColumns[0].count++;
            }
        });

        setColumns(newColumns);
    };

    // Use shared normalizeStatus and map to Kanban column IDs
    // Requirements: 6.1
    const mapStatus = (status: string): 'novo_lead' | 'transferido' | 'visita_agendada' | 'visita_realizada' | 'proposta_enviada' => {
        const canonical = normalizeStatusShared(status);
        // Map canonical statuses to Kanban column IDs
        switch (canonical) {
            case 'novo_lead': return 'novo_lead';
            case 'qualificado': return 'transferido'; // Backward compat: qualificado → transferido
            case 'transferido': return 'transferido';
            case 'visita_agendada': return 'visita_agendada';
            case 'visita_realizada': return 'visita_realizada';
            case 'proposta_enviada': return 'proposta_enviada';
            case 'sold': return 'proposta_enviada'; // Closed deals go to last pipeline stage
            case 'lost': return 'novo_lead'; // Lost leads fall back to first column
            default: return 'novo_lead';
        }
    };

    // Handle card click to open modal (Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7)
    const handleCardClick = useCallback(async (lead: Lead) => {
        // Look up raw lead data from allLeadsData to get all fields including tags, adjectives, sentiment_score, etc.
        const rawLead = allLeadsData.find(item => item.id === lead.id);

        // Convert to LeadType format for modal
        const leadForModal: LeadType = {
            id: lead.id,
            full_name: lead.name,
            phone: lead.phone || '',
            email: lead.email,
            status: lead.status,
            temperature: lead.temperature || null,
            aiTags: [],
            interest_type: rawLead?.interest_type || lead.interestType,
            objective: lead.objective,
            purchase_timeline: lead.purchaseTimeline,
            knows_region: lead.knowsRegion,
            city_origin: lead.cityOrigin,
            classification_type: lead.classificationType,
            is_hot: lead.isHot,
            source: lead.source,
            budget_range: lead.budget,
            tags: rawLead?.tags,
            notes: rawLead?.notes,
            created_at: rawLead?.created_at || '',
            updated_at: rawLead?.updated_at || '',
            profile_picture_url: rawLead?.profile_picture_url,
        };

        openModal(leadForModal);
        
        // Load conversation messages - try API first, fallback to Supabase direct
        setIsLoadingMessages(true);
        setActiveConversationId(null);
        setIsAiPaused(false);

        // Load AI pause status
        apiFetch(`/api/chat/ai-status/${lead.id}`)
            .then(r => r.ok ? r.json() : null)
            .then(data => { if (data) setIsAiPaused(data.ai_paused); })
            .catch(() => {});

        // 1. Try API backend first (Requirements 2.1)
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 2000);

            // Fetch ALL messages across ALL conversations (WhatsApp + Instagram)
            const msgsRes = await apiFetch(
                `/api/chat/messages/by-lead/${lead.id}`,
                { signal: controller.signal }
            );
            clearTimeout(timeout);

            if (msgsRes.ok) {
                const msgs = await msgsRes.json();
                setConversationMessages(msgs || []);
                // Also fetch conversations to set active ID
                try {
                    const convRes = await apiFetch(
                        `/api/chat/conversations/by-lead/${lead.id}`
                    );
                    if (convRes.ok) {
                        const convData = await convRes.json();
                        setActiveConversationId(convData.id);
                    }
                } catch { /* non-critical */ }
                setIsLoadingMessages(false);
                return;
            }
        } catch (err) {
            // API unavailable, falling back to Supabase direct
        }

        // 2. Fallback to Supabase direct (Requirements 2.1, 2.3)
        try {
            const { data: convData, error: convError } = await supabase
                .schema(SCHEMA)
                .from('conversations')
                .select('id')
                .eq('lead_id', lead.id)
                .single();

            if (convError) {
                console.error('[KanbanPage] Supabase conversation fallback error:', {
                    schema: SCHEMA,
                    table: 'conversations',
                    code: convError.code,
                    message: convError.message,
                    details: convError.details,
                    hint: convError.hint,
                });
            }
            
            if (convData) {
                setActiveConversationId(convData.id);
                const { data: messages, error: msgsError } = await supabase
                    .schema(SCHEMA)
                    .from('messages')
                    .select('*')
                    .eq('conversation_id', convData.id)
                    .order('created_at', { ascending: true });

                if (msgsError) {
                    console.error('[KanbanPage] Supabase messages fallback error:', {
                        schema: SCHEMA,
                        table: 'messages',
                        code: msgsError.code,
                        message: msgsError.message,
                        details: msgsError.details,
                        hint: msgsError.hint,
                    });
                }
                
                setConversationMessages(messages || []);
            } else {
                setConversationMessages([]);
            }
        } catch (err) {
            console.error('[KanbanPage] Both API and Supabase fallback failed for lead:', lead.id, err);
            setConversationMessages([]);
        } finally {
            setIsLoadingMessages(false);
        }
    }, [allLeadsData, openModal, supabase]);

    // Open lead card from query param: /dashboard/quadro?leadId=<id>
    useEffect(() => {
        const leadId = searchParams.get('leadId');

        if (!leadId) {
            openedLeadFromQueryRef.current = null;
            return;
        }

        if (loading || openedLeadFromQueryRef.current === leadId) {
            return;
        }

        const leadFromColumns = columns
            .flatMap((column) => column.leads)
            .find((item) => item.id === leadId);

        if (!leadFromColumns) {
            return;
        }

        openedLeadFromQueryRef.current = leadId;
        void handleCardClick(leadFromColumns);

        // Remove the query param after opening, so links can be clicked again later
        const params = new URLSearchParams(searchParams.toString());
        params.delete('leadId');
        const nextQuery = params.toString();
        router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    }, [columns, handleCardClick, loading, pathname, router, searchParams]);

    // Handle send message from modal (Requirements 3.4)
    const handleSendMessage = async (message: string) => {
        if (!selectedLead) return;

        setIsSendingMessage(true);
        try {
            const res = await apiFetch(`/api/chat/messages/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lead_id: selectedLead.id, content: message }),
            });
            if (!res.ok) throw new Error('Failed to send message');
            const data = await res.json();
            // Auto-pause IA when human sends message
            if (data.ai_paused) setIsAiPaused(true);
        } finally {
            setIsSendingMessage(false);
        }
    };

    // Handle toggle AI pause
    const handleToggleAi = async () => {
        if (!selectedLead) return;
        try {
            const res = await apiFetch(`/api/chat/toggle-ai/${selectedLead.id}`, { method: 'POST' });
            if (res.ok) {
                const data = await res.json();
                setIsAiPaused(data.ai_paused);
            }
        } catch (err) {
            console.error('Failed to toggle AI:', err);
        }
    };

    const handleDragStart = (e: React.DragEvent, lead: Lead, columnId: string) => {
        e.dataTransfer.setData('text/plain', JSON.stringify({ lead, sourceColumnId: columnId }));
        setDraggingLeadId(lead.id);
    };

    const handleDragOver = (e: React.DragEvent, columnId?: string) => {
        e.preventDefault();
        if (columnId) setDragOverColumnId(columnId);
    };

    const handleDragEnd = () => {
        setDraggingLeadId(null);
        setDragOverColumnId(null);
    };

    const handleDrop = async (e: React.DragEvent, targetColumnId: string) => {
        e.preventDefault();
        setDraggingLeadId(null);
        setDragOverColumnId(null);
        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
        const { lead, sourceColumnId } = data;

        if (sourceColumnId === targetColumnId) return;

        const dbStatusMap: Record<string, string> = {
            'novo_lead': 'novo_lead',
            'qualificado': 'qualificado',
            'visita_agendada': 'visita_agendada',
            'visita_realizada': 'visita_realizada',
            'proposta_enviada': 'proposta_enviada'
        };
        const dbStatus = dbStatusMap[targetColumnId] || 'novo_lead';

        // Optimistic UI update
        setColumns((prev) =>
            prev.map((col) => {
                if (col.id === sourceColumnId) {
                    return { ...col, count: col.leads.length - 1, leads: col.leads.filter((l) => l.id !== lead.id) };
                }
                if (col.id === targetColumnId) {
                    const updatedLead = { ...lead, status: targetColumnId };
                    return { ...col, count: col.leads.length + 1, leads: [...col.leads, updatedLead] };
                }
                return col;
            }),
        );

        // Rollback function in case of failure
        const rollback = () => {
            setColumns((prev) =>
                prev.map((col) => {
                    if (col.id === targetColumnId) {
                        return { ...col, count: col.leads.length - 1, leads: col.leads.filter((l) => l.id !== lead.id) };
                    }
                    if (col.id === sourceColumnId) {
                        return { ...col, count: col.leads.length + 1, leads: [...col.leads, lead] };
                    }
                    return col;
                }),
            );
        };

        try {
            // Primary: update via API (handles schema + sentiment)
            const res = await apiFetch(`/api/leads/${lead.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: dbStatus })
            });

            if (!res.ok) {
                // Fallback: direct Supabase update
                const { error } = await supabase
                    .schema(SCHEMA)
                    .from('leads')
                    .update({ status: dbStatus })
                    .eq('id', lead.id);

                if (error) {
                    console.error('Supabase update also failed:', error);
                    rollback();
                }
            }
        } catch (err) {
            console.error('All update attempts failed, rolling back:', err);
            // Fallback: try Supabase directly
            try {
                const { error } = await supabase
                    .schema(SCHEMA)
                    .from('leads')
                    .update({ status: dbStatus })
                    .eq('id', lead.id);

                if (error) {
                    console.error('Supabase fallback also failed:', error);
                    rollback();
                }
            } catch (sbErr) {
                console.error('All update attempts failed:', sbErr);
                rollback();
            }
        }
    };

    return (
        <div className="h-full flex flex-col p-4 md:p-6">
            {/* Header com Glassmorphism */}
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
                        Pipeline de Vendas
                    </h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Gerencie seus leads desde o primeiro contato até o fechamento.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {/* Temperature Filter Bar (Requirements 2.1, 2.5) */}
                    <TemperatureFilterBar
                        activeFilter={activeFilter}
                        onFilterChange={toggleFilter}
                        leadCounts={leadCounts}
                        className="hidden md:flex"
                    />
                    {/* Search com Glassmorphism */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            type="text"
                            placeholder="Buscar por nome ou telefone..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9 pr-8 w-64 h-10 text-sm rounded-xl bg-white/70 backdrop-blur-xl border-white/20 shadow-lg shadow-black/5"
                        />
                        {searchTerm && (
                            <button
                                onClick={() => setSearchTerm('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-black/5 rounded-lg transition-colors"
                            >
                                <X className="w-3 h-3 text-muted-foreground" />
                            </button>
                        )}
                    </div>
                    <Button
                        onClick={() => setIsNewLeadOpen(true)}
                        className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white rounded-xl shadow-lg shadow-emerald-500/25 border-0"
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Novo Lead
                    </Button>
                </div>
            </div>

            {/* Subtle refresh indicator — never blocks content */}

            {loading && allLeadsData.length === 0 ? (
                <div className="flex-1 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-3">
                        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
                        <span className="text-sm text-muted-foreground">Carregando leads...</span>
                    </div>
                </div>
            ) : error ? (
                <div className="flex-1 flex flex-col items-center justify-center">
                    <div className="bg-red-50 rounded-2xl p-6 text-center">
                        <p className="text-red-600 mb-4">{error}</p>
                        <Button variant="outline" onClick={() => fetchLeads()} className="rounded-xl">
                            Tentar Novamente
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="flex-1 overflow-x-auto overflow-y-hidden -mx-4 px-4">
                    <div className="flex h-full gap-4 min-w-[1000px] pb-4">
                        {columns.map((column) => (
                            <div
                                key={column.id}
                                className={cn(
                                    "flex-1 min-w-[280px] flex flex-col rounded-2xl transition-all duration-200",
                                    "bg-gradient-to-b",
                                    column.gradient,
                                    getGlassmorphismClasses('subtle', { rounded: '2xl' }),
                                    dragOverColumnId === column.id && "ring-2 ring-primary/30 bg-primary/5 scale-[1.01]"
                                )}
                                onDragOver={(e) => handleDragOver(e, column.id)}
                                onDragLeave={() => setDragOverColumnId(null)}
                                onDrop={(e) => handleDrop(e, column.id)}
                            >
                                {/* Column Header */}
                                <div className="p-4 flex items-center justify-between">
                                    <div className="flex items-center gap-2.5">
                                        <LottieIcon
                                            url={column.lottieUrl}
                                            size={22}
                                            fallback={<span>{COLUMN_LOTTIE_FALLBACKS[column.id]}</span>}
                                        />
                                        <h3 className="font-semibold text-sm text-foreground">
                                            {column.title}
                                        </h3>
                                        <Badge 
                                            variant="secondary" 
                                            className="px-2 py-0.5 h-5 text-[10px] font-semibold rounded-full bg-white/60 backdrop-blur-sm border-0"
                                        >
                                            {column.leads.length}
                                        </Badge>
                                    </div>
                                </div>

                                {/* Cards Container */}
                                <div className="flex-1 overflow-y-auto p-3 pt-0 space-y-3">
                                    {column.leads.length > 0 ? column.leads.map((lead) => (
                                        <GlassmorphismCard
                                            key={lead.id}
                                            variant="default"
                                            hoverable
                                            className={cn(
                                                "group relative cursor-pointer",
                                                "rounded-xl",
                                                "hover:scale-[1.02]",
                                                "transition-all duration-200",
                                                draggingLeadId === lead.id && "opacity-50 scale-95"
                                            )}
                                            draggable
                                            onDragStart={(e) => handleDragStart(e, lead, column.id)}
                                            onDragEnd={handleDragEnd}
                                            onClick={() => handleCardClick(lead)}
                                        >
                                            <div className="p-4 space-y-3">
                                                {/* Header */}
                                                <div className="flex justify-between items-start">
                                                    <div className="space-y-1">
                                                        <h4 className="font-bold text-sm text-foreground leading-tight">
                                                            {lead.name || lead.phone || 'Lead sem nome'}
                                                        </h4>
                                                        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                                                            <span className={cn(
                                                                "w-1.5 h-1.5 rounded-full",
                                                                lead.priority === 'high' ? 'bg-red-500' :
                                                                lead.priority === 'medium' ? 'bg-amber-500' : 'bg-slate-300'
                                                            )} />
                                                            {lead.lastActivity}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        {/* Temperature Badge - AI classification */}
                                                        <TemperatureBadge 
                                                            temperature={lead.temperature || null} 
                                                            size="sm"
                                                        />
                                                        {/* Legacy isHot indicator - shown only if no temperature classification */}
                                                        {!lead.temperature && lead.isHot && (
                                                            <div className="p-1 bg-orange-100 rounded-lg">
                                                                <Flame className="w-3 h-3 text-orange-500" />
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Details */}
                                                <div className="space-y-2">
                                                    {/* Phone number is shown inside the detail modal only */}
                                                    {lead.interestType && (
                                                        <div className="flex items-center gap-2 text-xs text-foreground/80">
                                                            <div className="p-1.5 bg-blue-100 rounded-lg">
                                                                <Home className="w-3 h-3 text-blue-600" />
                                                            </div>
                                                            <span>{lead.interest}</span>
                                                        </div>
                                                    )}
                                                    {lead.objective && (
                                                        <div className="flex items-center gap-2 text-xs text-foreground/80">
                                                            <div className="p-1 bg-violet-100 rounded-lg flex items-center justify-center">
                                                                <LottieIcon
                                                                    url="https://fonts.gstatic.com/s/e/notoemoji/latest/1f3af/lottie.json"
                                                                    size={18}
                                                                    fallback={<span>🎯</span>}
                                                                />
                                                            </div>
                                                            <span>{lead.objective === 'morar' ? 'Morar' : lead.objective === 'investir' ? 'Investir' : 'Morar + Investir'}</span>
                                                        </div>
                                                    )}
                                                    {lead.purchaseTimeline && (
                                                        <div className="flex items-center gap-2 text-xs text-foreground/80">
                                                            <div className="p-1.5 bg-green-100 rounded-lg">
                                                                <Calendar className="w-3 h-3 text-green-600" />
                                                            </div>
                                                            <span>{lead.purchaseTimeline}</span>
                                                        </div>
                                                    )}
                                                    {lead.cityOrigin && (
                                                        <div className="flex items-center gap-2 text-xs text-foreground/80">
                                                            <div className="p-1.5 bg-muted rounded-lg">
                                                                <MapPin className="w-3 h-3 text-muted-foreground" />
                                                            </div>
                                                            <span>{lead.cityOrigin}</span>
                                                        </div>
                                                    )}
                                                    {lead.budget && (
                                                        <div className="flex items-center gap-2 text-xs">
                                                            <div className="p-1.5 bg-emerald-100 rounded-lg">
                                                                <DollarSign className="w-3 h-3 text-emerald-600" />
                                                            </div>
                                                            <span className="font-bold text-emerald-600">{lead.budget}</span>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Investor/Morador Badge */}
                                                {lead.objective && (
                                                    <div className={cn(
                                                        "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold",
                                                        lead.objective === 'investir'
                                                            ? "bg-gradient-to-r from-amber-100 to-yellow-100 text-amber-800 border border-amber-300/50"
                                                            : "bg-blue-50 text-blue-700 border border-blue-200/50"
                                                    )}>
                                                        {lead.objective === 'investir' ? (
                                                            <><LottieIcon url="https://fonts.gstatic.com/s/e/notoemoji/latest/1f911/lottie.json" size={16} fallback={<span>🤑</span>} /> Investidor — Atendimento Prioritário</>
                                                        ) : lead.objective === 'morar' ? (
                                                            <>🏠 Morador</>
                                                        ) : (
                                                            <><LottieIcon url="https://fonts.gstatic.com/s/e/notoemoji/latest/1f911/lottie.json" size={16} fallback={<span>🤑</span>} />🏠 Morar + Investir</>
                                                        )}
                                                    </div>
                                                )}

                                                {/* WhatsApp Conversation Window Badge */}
                                                {lead.source !== 'instagram' && (
                                                    <WhatsAppWindowBadge
                                                        lastInteractionAt={lead.lastInteractionAt}
                                                        variant="compact"
                                                    />
                                                )}

                                                {/* Footer */}
                                                <div className="flex items-center justify-between pt-3 border-t border-black/5">
                                                    <div className="flex items-center gap-2">
                                                        {/* Channel Icon */}
                                                        {/* Multi-channel: show both icons when lead has instagram_id + phone */}
                                                        {lead.instagramId && lead.phone ? (
                                                            <div className="flex items-center gap-1 text-xs font-medium text-foreground/80">
                                                                <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0" title="WhatsApp">
                                                                    <WhatsAppLogo className="w-3 h-3 text-white" />
                                                                </div>
                                                                <div className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center flex-shrink-0" title="Instagram">
                                                                    <Instagram className="w-3 h-3 text-white" />
                                                                </div>
                                                                <span>Multi-canal</span>
                                                            </div>
                                                        ) : lead.source === 'instagram' ? (
                                                            <div className="flex items-center gap-1.5 text-xs font-medium text-foreground/80">
                                                                <div className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center flex-shrink-0" title="Instagram">
                                                                    <Instagram className="w-3 h-3 text-white" />
                                                                </div>
                                                                <span>Instagram</span>
                                                            </div>
                                                        ) : (
                                                            <div className="flex items-center gap-1.5 text-xs font-medium text-foreground/80">
                                                                <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0" title="WhatsApp">
                                                                    <WhatsAppLogo className="w-3 h-3 text-white" />
                                                                </div>
                                                                <span>WhatsApp</span>
                                                            </div>
                                                        )}
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {lead.tags?.slice(0, 2).map(tag => (
                                                                <Badge 
                                                                    key={tag} 
                                                                    variant="outline" 
                                                                    className="text-[10px] h-5 px-2 rounded-full bg-white/50 backdrop-blur-sm border-black/10 font-medium"
                                                                >
                                                                    {tag}
                                                                </Badge>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    {/* Seller Avatar */}
                                                    {lead.assignedTo && (
                                                        <div
                                                            className="w-6 h-6 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center flex-shrink-0 shadow-sm"
                                                            title={`Vendedor: ${lead.assignedTo.name}`}
                                                        >
                                                            <span className="text-[10px] font-bold text-white leading-none">
                                                                {lead.assignedTo.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </GlassmorphismCard>
                                    )) : (
                                        <div className="h-32 flex flex-col items-center justify-center border-2 border-dashed border-black/10 rounded-xl text-muted-foreground/50 bg-white/30 backdrop-blur-sm">
                                            <span className="text-xs">Nenhum lead nesta etapa</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Lead Detail Modal (Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 2.4, 2.5, 2.6, 2.7) */}
            <LeadDetailModal
                lead={selectedLead}
                isOpen={isModalOpen}
                onClose={closeModal}
                infoContent={
                    selectedLead ? (() => {
                        const rawLead = allLeadsData.find(item => item.id === selectedLead.id);
                        const tagsList = parseTags(rawLead?.tags);
                        const adjList = parseTags(rawLead?.adjectives);
                        const sentimentScore = rawLead?.sentiment_score as number | undefined;
                        const sentimentLabel = rawLead?.sentiment_label as string | undefined;
                        const interestType = rawLead?.interest_type as string | undefined;
                        const conversationSummary = (rawLead?.conversation_summary || rawLead?.last_analysis?.conversation_summary) as string | undefined;

                        return (
                            <>
                                {/* Seller Assignment Section */}
                                {rawLead?.assigned_to && sellersMap[rawLead.assigned_to] && (
                                    <LeadDetailModalSection title="Vendedor Responsável" className="mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-sm font-bold shadow-md shadow-emerald-500/25">
                                                {sellersMap[rawLead.assigned_to].split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-foreground">{sellersMap[rawLead.assigned_to]}</p>
                                                <p className="text-xs text-muted-foreground">Atribuido automaticamente pelo sistema</p>
                                            </div>
                                        </div>
                                    </LeadDetailModalSection>
                                )}

                                {/* Tags & Adjectives Section - Requirements 2.4, 2.5 */}
                                <LeadDetailModalSection title="Tags e Classificação">
                                    {tagsList.length > 0 || adjList.length > 0 ? (
                                        <div className="space-y-3">
                                            {tagsList.length > 0 && (
                                                <div className="flex flex-wrap gap-1.5">
                                                    {tagsList.map((tag, i) => (
                                                        <Badge key={`tag-${i}`} variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs font-medium">
                                                            {tag.replaceAll('_', ' ')}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            )}
                                            {adjList.length > 0 && (
                                                <div className="flex flex-wrap gap-1.5">
                                                    {adjList.map((adj, i) => (
                                                        <span key={`adj-${i}`} className="inline-flex items-center px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200 text-xs font-medium">
                                                            {adj.replaceAll('_', ' ')}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
                                            <p className="text-sm">Nenhuma tag gerada pela IA ainda</p>
                                        </div>
                                    )}
                                </LeadDetailModalSection>

                                {/* Sentiment Score - Uses sentiment_label from DB first, falls back to numeric score */}
                                <LeadDetailModalSection title="Sentimento" className="mt-4">
                                    <div className="flex items-center gap-2">
                                        {(() => {
                                            // Prioritize label from DB (normalize casing for legacy data)
                                            const rawLabel = sentimentLabel
                                                ? sentimentLabel.charAt(0).toUpperCase() + sentimentLabel.slice(1).toLowerCase()
                                                : null;
                                            const label = rawLabel || (
                                                (sentimentScore ?? 0) > 20 ? 'Positivo' :
                                                (sentimentScore ?? 0) < -20 ? 'Negativo' : 'Neutro'
                                            );
                                            const emoji = label === 'Positivo' ? '😊' : label === 'Negativo' ? '😟' : '😐';
                                            const color = label === 'Positivo' ? 'text-green-600' : label === 'Negativo' ? 'text-red-600' : 'text-muted-foreground';
                                            return (
                                                <>
                                                    <span className={cn("text-sm font-medium", color)}>
                                                        {emoji} {label}
                                                    </span>
                                                    {sentimentScore !== undefined && sentimentScore !== null && (
                                                        <span className="text-xs text-muted-foreground/70">({sentimentScore})</span>
                                                    )}
                                                </>
                                            );
                                        })()}
                                    </div>
                                </LeadDetailModalSection>

                                {/* Interest Type - Requirements 2.6 */}
                                {interestType && (
                                    <LeadDetailModalSection title="Tipo de Interesse" className="mt-4">
                                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 font-medium">
                                            {formatInterestType(interestType, { withEmoji: true })}
                                        </Badge>
                                    </LeadDetailModalSection>
                                )}

                                {/* Conversation Summary */}
                                {conversationSummary && (
                                    <LeadDetailModalSection title="Resumo da Conversa" className="mt-4">
                                        <p className="text-sm text-foreground/80 leading-relaxed bg-blue-50/50 border border-blue-100 rounded-lg p-3">
                                            {conversationSummary}
                                        </p>
                                    </LeadDetailModalSection>
                                )}

                                {/* AI Tags Section (structured LeadTag objects) */}
                                {selectedLead.aiTags && selectedLead.aiTags.length > 0 && (
                                    <LeadDetailModalSection title="Tags IA Estruturadas" className="mt-4">
                                        <LeadTagsSection 
                                            tags={selectedLead.aiTags}
                                        />
                                    </LeadDetailModalSection>
                                )}
                            </>
                        );
                    })() : null
                }
                chatContent={
                    <LeadConversation
                        messages={conversationMessages}
                        onSendMessage={handleSendMessage}
                        isLoading={isLoadingMessages}
                        isAiPaused={isAiPaused}
                        onToggleAi={handleToggleAi}
                        isSending={isSendingMessage}
                    />
                }
            />

            <NewLeadModal
                open={isNewLeadOpen}
                onOpenChange={setIsNewLeadOpen}
                onLeadCreated={() => fetchLeads()}
            />
        </div>
    );
}
