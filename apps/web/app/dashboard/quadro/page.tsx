'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { CardContent } from '@/components/ui/card';
import { GlassmorphismCard, getGlassmorphismClasses } from '@/components/ui/glassmorphism-card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { DollarSign, MapPin, MoreVertical, Phone, Plus, Loader2, Target, Calendar, Home, Flame, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { API_BASE_URL } from '@/lib/api-config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createClient } from '@/lib/supabase';
import { RealtimeStatusIndicator } from '@/components/ui/realtime-status';
import { TemperatureBadge } from '@/components/ui/temperature-badge';
import { TemperatureFilterBar } from '@/components/ui/temperature-filter-bar';
import { LeadDetailModal, LeadDetailModalSection } from '@/components/ui/lead-detail-modal';
import { LeadTagsSection } from '@/components/ui/lead-tags-section';
import { LeadConversation } from '@/components/ui/lead-conversation';
import { parseTags } from '@/components/LeadModal';
import { useLeadFilters, calculateLeadCountsByTemperature } from '@/hooks/useLeadFilters';
import { useLeadModal } from '@/hooks/useLeadModal';
import type { LeadTemperature, NonNullLeadTemperature, LeadTag } from '@/lib/temperature-config';
import { normalizeTemperature } from '@/lib/temperature-config';
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
    status: 'novo_lead' | 'qualificado' | 'visita_agendada' | 'visita_realizada' | 'proposta_enviada';
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
    temperature?: LeadTemperature;
}

interface Column {
    id: 'novo_lead' | 'qualificado' | 'visita_agendada' | 'visita_realizada' | 'proposta_enviada';
    title: string;
    leads: Lead[];
    color: string;
    gradient: string;
    count: number;
}

const initialColumns: Column[] = [
    { id: 'novo_lead', title: 'Novo Lead', color: 'bg-blue-500', gradient: 'from-blue-500/20 to-blue-600/5', count: 0, leads: [] },
    { id: 'qualificado', title: 'Qualificado', color: 'bg-amber-500', gradient: 'from-amber-500/20 to-amber-600/5', count: 0, leads: [] },
    { id: 'visita_agendada', title: 'Visita Agendada', color: 'bg-violet-500', gradient: 'from-violet-500/20 to-violet-600/5', count: 0, leads: [] },
    { id: 'visita_realizada', title: 'Visita Realizada', color: 'bg-orange-500', gradient: 'from-orange-500/20 to-orange-600/5', count: 0, leads: [] },
    { id: 'proposta_enviada', title: 'Proposta Enviada', color: 'bg-emerald-500', gradient: 'from-emerald-500/20 to-emerald-600/5', count: 0, leads: [] },
];

export default function LeadsKanban() {
    const [columns, setColumns] = useState<Column[]>(initialColumns);
    const [loading, setLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [allLeadsData, setAllLeadsData] = useState<any[]>([]);
    // Stable Supabase client — avoids re-creating on every render
    const supabase = useMemo(() => createClient(), []);
    // Ref to track whether the very first load has completed (not state, so
    // it won't cause fetchLeads to be recreated on change)
    const isInitialLoadRef = useRef(true);
    // Ref to hold the latest searchTerm so fetchLeads doesn't recreate when it changes
    const searchTermRef = useRef(searchTerm);
    searchTermRef.current = searchTerm;

    // Lead filters hook (Requirements 2.1, 2.2, 2.3, 2.4)
    const { activeFilter, activeFilters, toggleFilter, filterLeads } = useLeadFilters();
    
    // Lead modal hook (Requirements 3.1, 3.5)
    const { isOpen: isModalOpen, selectedLead, openModal, closeModal: closeModalBase } = useLeadModal();
    
    // Conversation state for modal
    const [conversationMessages, setConversationMessages] = useState<Message[]>([]);
    const [isLoadingMessages, setIsLoadingMessages] = useState(false);
    const [isSendingMessage, setIsSendingMessage] = useState(false);
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

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
        // Subsequent (realtime / background) fetches — show subtle indicator
        if (isBackgroundRefresh) {
            setIsRefreshing(true);
        }
        setError('');

        try {
            const res = await fetch(`${API_BASE_URL}/api/leads`);
            if (res.ok) {
                const apiData = await res.json();
                setAllLeadsData(apiData);
                setLoading(false);
                setIsRefreshing(false);
                isInitialLoadRef.current = false;
                return;
            }
        } catch (err) {
            console.warn('API error, falling back to Supabase...', err);
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
        setIsRefreshing(false);
        isInitialLoadRef.current = false;
    }, [supabase]); // stable — supabase is memoized, no other changing deps

    // Initial fetch — runs once
    useEffect(() => {
        fetchLeads();
    }, [fetchLeads]);

    // Re-process columns whenever leads data, search, or filter changes
    useEffect(() => {
        if (allLeadsData.length > 0) {
            processLeads(allLeadsData, searchTerm);
        }
    }, [searchTerm, allLeadsData, activeFilter]);

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

    // Sync selectedLead with allLeadsData on realtime updates (Requirements 3.2, 3.3)
    // When allLeadsData refreshes via realtime, update the modal's selectedLead so
    // temperature badge, tags, sentiment etc. reflect the latest data.
    useEffect(() => {
        if (!isModalOpen || !selectedLead) return;
        const rawLead = allLeadsData.find(item => item.id === selectedLead.id);
        if (!rawLead) return;

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
    }, [allLeadsData, isModalOpen, selectedLead, openModal]);

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
                console.log('[Realtime Modal] New message received:', newMsg);

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
            .subscribe((status) => {
                console.log('[Realtime Modal] Messages channel status:', status);
            });

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
            { id: 'novo_lead', title: 'Novo Lead', color: 'bg-blue-500', gradient: 'from-blue-500/20 to-blue-600/5', count: 0, leads: [] },
            { id: 'qualificado', title: 'Qualificado', color: 'bg-amber-500', gradient: 'from-amber-500/20 to-amber-600/5', count: 0, leads: [] },
            { id: 'visita_agendada', title: 'Visita Agendada', color: 'bg-violet-500', gradient: 'from-violet-500/20 to-violet-600/5', count: 0, leads: [] },
            { id: 'visita_realizada', title: 'Visita Realizada', color: 'bg-orange-500', gradient: 'from-orange-500/20 to-orange-600/5', count: 0, leads: [] },
            { id: 'proposta_enviada', title: 'Proposta Enviada', color: 'bg-emerald-500', gradient: 'from-emerald-500/20 to-emerald-600/5', count: 0, leads: [] },
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
            if (item.email) tags.push('Email');
            if (item.source) tags.push(item.source.charAt(0).toUpperCase() + item.source.slice(1));
            if (item.classification_type === 'corretor') tags.push('🏠 Corretor');
            if (item.classification_type === 'investidor') tags.push('💰 Investidor');
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
                assignedTo: { name: 'Arthur' },
                interestType: item.interest_type,
                objective: item.objective,
                purchaseTimeline: item.purchase_timeline,
                knowsRegion: item.knows_region,
                cityOrigin: item.city_origin,
                classificationType: item.classification_type,
                isHot: item.is_hot,
                source: item.source,
                temperature: (item.temperature ? normalizeTemperature(item.temperature) : null) as LeadTemperature
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
    const mapStatus = (status: string): 'novo_lead' | 'qualificado' | 'visita_agendada' | 'visita_realizada' | 'proposta_enviada' => {
        const canonical = normalizeStatusShared(status);
        // Map canonical statuses to Kanban column IDs
        switch (canonical) {
            case 'novo_lead': return 'novo_lead';
            case 'qualificado': return 'qualificado';
            case 'visita_agendada': return 'visita_agendada';
            case 'visita_realizada': return 'visita_realizada';
            case 'proposta_enviada': return 'proposta_enviada';
            case 'sold': return 'proposta_enviada'; // Closed deals go to last pipeline stage
            case 'lost': return 'novo_lead'; // Lost leads fall back to first column
            default: return 'novo_lead';
        }
    };

    // Handle card click to open modal (Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7)
    const handleCardClick = async (lead: Lead) => {
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
        };
        
        openModal(leadForModal);
        
        // Load conversation messages - try API first, fallback to Supabase direct
        setIsLoadingMessages(true);
        setActiveConversationId(null);

        // 1. Try API backend first (Requirements 2.1)
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 2000);

            const convRes = await fetch(
                `${API_BASE_URL}/api/chat/conversations/by-lead/${lead.id}`,
                { signal: controller.signal }
            );
            clearTimeout(timeout);

            if (convRes.ok) {
                const convData = await convRes.json();
                const conversationId = convData.id;
                setActiveConversationId(conversationId);

                // Fetch messages via API (Requirements 2.2)
                const msgsRes = await fetch(
                    `${API_BASE_URL}/api/chat/messages/${conversationId}`
                );
                if (msgsRes.ok) {
                    const msgs = await msgsRes.json();
                    setConversationMessages(msgs || []);
                    setIsLoadingMessages(false);
                    return;
                }
                console.warn('[KanbanPage] API messages fetch failed:', msgsRes.status, await msgsRes.text().catch(() => ''));
            } else if (convRes.status !== 404) {
                console.warn('[KanbanPage] API conversation fetch failed:', convRes.status, await convRes.text().catch(() => ''));
            }
        } catch (err) {
            console.warn('[KanbanPage] API unavailable, falling back to Supabase direct:', err);
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
    };

    // Handle send message from modal (Requirements 3.4)
    const handleSendMessage = async (message: string) => {
        if (!selectedLead) return;
        
        setIsSendingMessage(true);
        try {
            // TODO: Implement actual message sending via WhatsApp API
            console.log('Sending message to lead:', selectedLead.id, message);
            // For now, just add to local state as optimistic update
            const newMessage: Message = {
                id: Date.now().toString(),
                conversation_id: '',
                sender_type: 'user',
                content: message,
                message_type: 'text',
                created_at: new Date().toISOString(),
            };
            setConversationMessages(prev => [...prev, newMessage]);
        } finally {
            setIsSendingMessage(false);
        }
    };

    const handleDragStart = (e: React.DragEvent, lead: Lead, columnId: string) => {
        e.dataTransfer.setData('text/plain', JSON.stringify({ lead, sourceColumnId: columnId }));
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const handleDrop = async (e: React.DragEvent, targetColumnId: string) => {
        e.preventDefault();
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
            const res = await fetch(`${API_BASE_URL}/api/leads/${lead.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: dbStatus })
            });

            if (!res.ok) {
                console.warn(`API update failed (${res.status}), trying Supabase directly...`);
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
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-black/5:bg-white/10 rounded-lg transition-colors"
                            >
                                <X className="w-3 h-3 text-muted-foreground" />
                            </button>
                        )}
                    </div>
                    <RealtimeStatusIndicator />
                    <Button className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white rounded-xl shadow-lg shadow-emerald-500/25 border-0">
                        <Plus className="w-4 h-4 mr-2" />
                        Novo Lead
                    </Button>
                </div>
            </div>

            {/* Subtle refresh indicator — never blocks content */}
            {isRefreshing && !loading && (
                <div className="w-full overflow-hidden rounded-full h-0.5 bg-emerald-100">
                    <div className="h-full bg-emerald-500 animate-pulse rounded-full" style={{ width: '60%' }} />
                </div>
            )}

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
                                    "flex-1 min-w-[280px] flex flex-col rounded-2xl",
                                    "bg-gradient-to-b",
                                    column.gradient,
                                    getGlassmorphismClasses('subtle', { rounded: '2xl' })
                                )}
                                onDragOver={handleDragOver}
                                onDrop={(e) => handleDrop(e, column.id)}
                            >
                                {/* Column Header */}
                                <div className="p-4 flex items-center justify-between">
                                    <div className="flex items-center gap-2.5">
                                        <div className={cn(
                                            "w-3 h-3 rounded-full",
                                            column.color,
                                            "ring-4 ring-white/50"
                                        )} />
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
                                                "hover:scale-[1.02]"
                                            )}
                                            draggable
                                            onDragStart={(e) => handleDragStart(e, lead, column.id)}
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
                                                    {lead.phone && (
                                                        <div className="flex items-center gap-2 text-xs font-medium text-white bg-gradient-to-r from-gray-800 to-gray-900 p-2.5 rounded-xl">
                                                            <Phone className="w-3.5 h-3.5" />
                                                            <span>{lead.phone}</span>
                                                        </div>
                                                    )}
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
                                                            <div className="p-1.5 bg-violet-100 rounded-lg">
                                                                <Target className="w-3 h-3 text-violet-600" />
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
                                                            <div className="p-1.5 bg-gray-100 rounded-lg">
                                                                <MapPin className="w-3 h-3 text-gray-600" />
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
                                                            <>💰 Investidor — Atendimento Prioritário</>
                                                        ) : lead.objective === 'morar' ? (
                                                            <>🏠 Morador</>
                                                        ) : (
                                                            <>🏠💰 Morar + Investir</>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Footer */}
                                                <div className="flex items-center justify-between pt-3 border-t border-black/5">
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
                                {/* Tags & Adjectives Section - Requirements 2.4, 2.5 */}
                                <LeadDetailModalSection title="Tags e Classificação">
                                    {tagsList.length > 0 || adjList.length > 0 ? (
                                        <div className="space-y-3">
                                            {tagsList.length > 0 && (
                                                <div className="flex flex-wrap gap-1.5">
                                                    {tagsList.map((tag, i) => (
                                                        <Badge key={`tag-${i}`} variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs font-medium">
                                                            {tag}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            )}
                                            {adjList.length > 0 && (
                                                <div className="flex flex-wrap gap-1.5">
                                                    {adjList.map((adj, i) => (
                                                        <span key={`adj-${i}`} className="inline-flex items-center px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200 text-xs font-medium">
                                                            {adj}
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
                                            // Prioritize label from DB
                                            const label = sentimentLabel || (
                                                (sentimentScore ?? 0) > 20 ? 'Positivo' :
                                                (sentimentScore ?? 0) < -20 ? 'Negativo' : 'Neutro'
                                            );
                                            const emoji = label === 'Positivo' ? '😊' : label === 'Negativo' ? '😟' : '😐';
                                            const color = label === 'Positivo' ? 'text-green-600' : label === 'Negativo' ? 'text-red-600' : 'text-gray-500';
                                            return (
                                                <>
                                                    <span className={cn("text-sm font-medium", color)}>
                                                        {emoji} {label}
                                                    </span>
                                                    {sentimentScore !== undefined && sentimentScore !== null && (
                                                        <span className="text-xs text-gray-400">({sentimentScore})</span>
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
                                            {({'apartamento': '🏠 Apartamento', 'sala_comercial': '🏢 Sala Comercial', 'office': '💼 Office', 'flat': '🏨 Flat'} as Record<string, string>)[interestType.toLowerCase()] || interestType}
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
                        isSending={isSendingMessage}
                    />
                }
            />
        </div>
    );
}
