'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-fetch';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { GlassmorphismCard, getGlassmorphismClasses } from "@/components/ui/glassmorphism-card";
import { TrendingUp, TrendingDown, Minus, Instagram, Globe, Search, RefreshCw } from "lucide-react";
import { createClient } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/ui/empty-state';
import { LeadDetailModal, LeadDetailModalSection } from '@/components/ui/lead-detail-modal';
import { LeadConversation } from '@/components/ui/lead-conversation';
import { useLeadConversation } from '@/hooks/useLeadConversation';
import { parseTags } from '@/lib/lead-utils';
import { normalizeStatus, getStatusConfig } from '@/lib/status-config';
import { TemperatureBadge } from '@/components/ui/temperature-badge';
import { normalizeTemperature } from '@/lib/temperature-config';
import { formatInterestType } from '@/lib/interest-type-format';
import type { Lead as LeadType } from '@/types/lead';

// Interface para Lead
interface Lead {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    channel: 'whatsapp' | 'instagram' | 'site';
    status: string;
    sentiment: number; // -100 a 100 (negativo a positivo)
    sentiment_label: string | null;
    temperature: string | null;
    created_at: string;
    notes: string | null;
    interest_type: string | null;
    tags: string[] | string | null;
    adjectives: string[] | string | null;
    profile_picture_url: string | null;
}

function WhatsAppLogo({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
    );
}

// Ícone de canal
function ChannelIcon({ channel }: { channel: string }) {
    switch (channel) {
        case 'whatsapp':
            return (
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                        <WhatsAppLogo className="w-3.5 h-3.5 text-white" />
                    </div>
                    <span className="text-sm text-black font-medium">WhatsApp</span>
                </div>
            );
        case 'instagram':
            return (
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center">
                        <Instagram className="w-3.5 h-3.5 text-white" />
                    </div>
                    <span className="text-sm text-black font-medium">Instagram</span>
                </div>
            );
        case 'site':
            return (
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center">
                        <Globe className="w-3.5 h-3.5 text-white" />
                    </div>
                    <span className="text-sm text-black font-medium">Site</span>
                </div>
            );
        default:
            return <span className="text-sm text-muted-foreground">-</span>;
    }
}

// Badge de Status — uses shared normalizeStatus() for consistency with Pipeline Kanban
// Requirements: 6.2
function StatusBadge({ status }: { status: string }) {
    const config = getStatusConfig(status);

    return (
        <Badge variant="outline" className={`${config.className} font-medium`}>
            {config.label}
        </Badge>
    );
}

// Ícone de Sentimento (Trend)
function SentimentIcon({ sentiment, label, status }: { sentiment: number; label?: string | null; status?: string }) {
    // Determine effective label:
    // 1. Use DB label if available (normalize casing for legacy data)
    // 2. For scheduled/completed visits, force Positivo (safety net)
    // 3. Fallback to numeric score
    let effectiveLabel = label
        ? label.charAt(0).toUpperCase() + label.slice(1).toLowerCase()
        : null;

    if (!effectiveLabel || effectiveLabel === 'Neutro') {
        const normalizedStatus = (status || '').toLowerCase().replace(/\s+/g, '_');
        if (['visita_agendada', 'visita_realizada', 'proposta_enviada', 'qualificado', 'transferido'].includes(normalizedStatus)) {
            effectiveLabel = 'Positivo';
        } else if (sentiment > 20) {
            effectiveLabel = 'Positivo';
        } else if (sentiment < -20) {
            effectiveLabel = 'Negativo';
        } else {
            effectiveLabel = 'Neutro';
        }
    }

    const config = {
        Positivo: { icon: TrendingUp, color: 'text-green-500', textColor: 'text-green-600' },
        Negativo: { icon: TrendingDown, color: 'text-red-500', textColor: 'text-red-600' },
        Neutro: { icon: Minus, color: 'text-muted-foreground/70', textColor: 'text-muted-foreground' },
    };
    const { icon: Icon, color, textColor } = config[effectiveLabel as keyof typeof config] || config.Neutro;

    return (
        <div className="flex items-center gap-2">
            <Icon className={cn("h-5 w-5", color)} />
            <span className={cn("text-sm font-medium", textColor)}>{effectiveLabel}</span>
        </div>
    );
}

// Badge de Interesse (Nova Coluna)
function InterestBadge({ interestType }: { interestType: string | null }) {
    if (!interestType) {
        return <span className="text-muted-foreground/70 text-sm">-</span>;
    }

    return (
        <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-200 font-medium">
            {formatInterestType(interestType, { withEmoji: true })}
        </Badge>
    );
}

export default function LeadsPage() {
    const supabase = createClient();
    const [leads, setLeads] = useState<Lead[]>([]);
    const [loading, setLoading] = useState(true);
    const [isInitialLoad, setIsInitialLoad] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    
    // State for LeadDetailModal - Requirements 2.1, 4.5
    const [selectedLead, setSelectedLead] = useState<LeadType | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Conversation data for the selected lead
    const { messages, isLoading: isLoadingMessages, realtimeStatus } = useLeadConversation(
        selectedLead?.id ?? null,
        isModalOpen
    );

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 20;

    // Schema correto do projeto
    const SCHEMA = 'palmaslake-agno';

    // Função para buscar leads
    // Função para buscar leads
    const fetchLeads = useCallback(async (showLoading = true) => {
        // Só mostra loading no carregamento inicial
        if (showLoading && isInitialLoad) {
            setLoading(true);
        }

        const mapLeadData = (item: any): Lead => ({
            id: item.id,
            name: item.full_name || item.name || item.phone || 'Lead sem nome',
            phone: item.phone,
            email: item.email,
            channel: detectChannel(item),
            status: item.status || 'novo',
            sentiment: calculateSentiment(item),
            sentiment_label: item.sentiment_label || null,
            temperature: item.temperature || null,
            created_at: item.created_at,
            notes: item.notes,
            interest_type: item.interest_type || null,
            tags: item.tags || null,
            adjectives: item.adjectives || null,
            profile_picture_url: item.profile_picture_url || null,
        });

        try {
            // Tentar API Python primeiro (timeout 5s)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            const res = await apiFetch(`/api/leads`, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (res.ok) {
                const data = await res.json();
                setLeads(data.map(mapLeadData));
                setLoading(false);
                setIsInitialLoad(false);
                return; // Sucesso API
            }
        } catch (err) {
            // API error or timeout, falling back to Supabase direct
        }

        // Fallback: Supabase Direto (Executa se API falhar ou der erro de rede)
        const { data, error } = await supabase
            .schema(SCHEMA)
            .from('leads')
            .select('*')
            .order('created_at', { ascending: false });

        if (!error && data) {
            setLeads(data.map(mapLeadData));
        } else if (error) {
            console.error('Supabase fetch error:', error);
        }

        setLoading(false);
        setIsInitialLoad(false);
    }, [supabase, isInitialLoad]);

    // Detectar canal de origem
    function detectChannel(item: any): 'whatsapp' | 'instagram' | 'site' {
        const source = item.source?.toLowerCase() || '';
        const notes = item.notes?.toLowerCase() || '';

        if (source.includes('instagram') || notes.includes('instagram')) return 'instagram';
        if (source.includes('site') || source.includes('web') || notes.includes('site')) return 'site';
        return 'whatsapp'; // Default
    }

    // Calcular sentimento baseado em dados (fallback local)
    // Requirements 3.1, 3.3: Prioritize sentiment_score from DB when non-null
    function calculateSentiment(item: any): number {
        // Priorizar sentiment_score do banco se existir (incluindo 0)
        if (item.sentiment_score !== undefined && item.sentiment_score !== null) {
            return item.sentiment_score;
        }

        let score = 0;
        const status = item.status?.toLowerCase() || '';
        const notes = item.notes?.toLowerCase() || '';

        // 1. Inferência por STATUS (Indicador Forte)
        if (status.includes('interesse') || status.includes('quente') || status.includes('visita') || status.includes('proposta')) {
            score = 80; // Muito positivo
        } else if (status.includes('vendido') || status.includes('fechado')) {
            score = 100; // Máximo
        } else if (status.includes('perdido') || status.includes('arquivado') || status.includes('desistiu')) {
            score = -60; // Negativo
        }

        // 2. Refinamento por NOTAS (se status for genérico)
        if (score === 0) {
            if (notes.includes('interessado') || notes.includes('animado') || notes.includes('comprar') || notes.includes('gostou')) {
                score = 60;
            }
            if (notes.includes('caro') || notes.includes('pensar') || notes.includes('dúvida')) {
                score = -20; // Levemente negativo/cauteloso
            }
            if (notes.includes('não quer') || notes.includes('reclamou') || notes.includes('tirar da lista')) {
                score = -80;
            }
        }

        return score;
    }

    // Fetch inicial
    useEffect(() => {
        fetchLeads();
    }, [fetchLeads]);

    // Realtime subscription para leads
    useEffect(() => {
        const channel = supabase
            .channel('realtime:leads-table')
            .on('postgres_changes', {
                event: '*',
                schema: SCHEMA,
                table: 'leads'
            }, () => {
                // Não mostrar loading em atualizações realtime
                fetchLeads(false);
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
            .channel('realtime:lead-deletions-table')
            .on('broadcast', { event: 'lead_deleted' }, () => {
                fetchLeads(false);
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [fetchLeads, supabase]);

    // Filtrar leads por busca
    const filteredLeads = leads.filter(lead => {
        const search = searchTerm.toLowerCase();
        return (
            lead.name?.toLowerCase().includes(search) ||
            lead.phone?.toLowerCase().includes(search) ||
            lead.email?.toLowerCase().includes(search) ||
            lead.status?.toLowerCase().includes(search)
        );
    });

    // Pagination
    const totalPages = Math.ceil(filteredLeads.length / pageSize);
    const paginatedLeads = filteredLeads.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    /**
     * Handle click on lead row to open modal
     * Requirements: 2.1 - WHEN a user clicks on a lead row in the leads table THEN the system SHALL open a modal displaying the lead's details
     * Requirements: 4.5 - Preserve scroll position and filters when modal closes
     */
    const handleLeadClick = useCallback((lead: Lead) => {
        // Convert local Lead to LeadType for the modal
        const modalLead: LeadType = {
            id: lead.id,
            full_name: lead.name,
            phone: lead.phone || '',
            email: lead.email || undefined,
            status: lead.status as LeadType['status'],
            notes: lead.notes || undefined,
            source: lead.channel as LeadType['source'],
            created_at: lead.created_at,
            interest_type: lead.interest_type as LeadType['interest_type'],
            tags: Array.isArray(lead.tags) ? lead.tags : undefined,
            temperature: lead.temperature as LeadType['temperature'],
            profile_picture_url: lead.profile_picture_url || undefined,
        };
        setSelectedLead(modalLead);
        setIsModalOpen(true);
    }, []);

    /**
     * Handle modal close
     * Requirements: 4.5 - WHEN the user closes the modal THEN the system SHALL return to the leads table without losing the current filter or scroll position
     * Note: Since we're using React state, scroll position and filters are automatically preserved
     */
    const handleModalClose = useCallback(() => {
        setIsModalOpen(false);
        // Keep selectedLead for a moment to allow smooth animation
        setTimeout(() => setSelectedLead(null), 200);
    }, []);

    return (
        <div className="p-6 space-y-6">
            {/* Header with Glassmorphism */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">Leads</h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Acompanhe todos os leads em tempo real
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fetchLeads()}
                        disabled={loading}
                        className={cn(
                            "rounded-xl",
                            getGlassmorphismClasses('subtle', { rounded: 'xl' })
                        )}
                    >
                        <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                        Atualizar
                    </Button>
                </div>
            </div>

            {/* Search with Glassmorphism */}
            <div className="flex items-center gap-4">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground/70" />
                    <Input
                        placeholder="Buscar por nome, telefone ou email..."
                        value={searchTerm}
                        onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                        className="pl-10 rounded-xl bg-white/70 backdrop-blur-xl border-white/20"
                    />
                </div>
                <Badge variant="secondary" className="text-sm rounded-full bg-white/60 backdrop-blur-sm">
                    {filteredLeads.length} leads
                </Badge>
            </div>

            {/* Table with Glassmorphism */}
            <GlassmorphismCard variant="default" className="overflow-hidden">
                <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-white/50 border-b border-white/20">
                            <TableHead className="font-semibold text-foreground">Nome</TableHead>
                            <TableHead className="font-semibold text-foreground hidden md:table-cell">Canal</TableHead>
                            <TableHead className="font-semibold text-foreground">Status</TableHead>
                            <TableHead className="font-semibold text-foreground hidden lg:table-cell">Interesse</TableHead>
                            <TableHead className="font-semibold text-foreground">Temperatura</TableHead>
                            <TableHead className="font-semibold text-foreground hidden md:table-cell">Data</TableHead>
                            <TableHead className="font-semibold text-foreground hidden lg:table-cell">Sentimento</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                    Carregando leads...
                                </TableCell>
                            </TableRow>
                        ) : paginatedLeads.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7}>
                                    <EmptyState icon="search" title="Nenhum lead encontrado" description="Tente uma busca diferente ou adicione um novo lead" />
                                </TableCell>
                            </TableRow>
                        ) : (
                            paginatedLeads.map((lead) => (
                                <TableRow
                                    key={lead.id}
                                    className="hover:bg-white/50 cursor-pointer transition-colors border-b border-white/10"
                                    onClick={() => handleLeadClick(lead)}
                                >
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span className="font-medium text-foreground">{lead.name}</span>
                                            {lead.phone && (
                                                <span className="text-xs text-muted-foreground">{lead.phone}</span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="hidden md:table-cell">
                                        <ChannelIcon channel={lead.channel} />
                                    </TableCell>
                                    <TableCell>
                                        <StatusBadge status={lead.status} />
                                    </TableCell>
                                    <TableCell className="hidden lg:table-cell">
                                        <InterestBadge interestType={lead.interest_type} />
                                    </TableCell>
                                    <TableCell>
                                        <TemperatureBadge
                                            temperature={lead.temperature ? normalizeTemperature(lead.temperature) : null}
                                            size="sm"
                                        />
                                    </TableCell>
                                    <TableCell className="hidden md:table-cell">
                                        <span className="text-sm text-foreground">
                                            {lead.created_at
                                                ? new Date(lead.created_at).toLocaleDateString('pt-BR')
                                                : '-'
                                            }
                                        </span>
                                    </TableCell>
                                    <TableCell className="hidden lg:table-cell">
                                        <SentimentIcon sentiment={lead.sentiment} label={lead.sentiment_label} status={lead.status} />
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
                </div>
            </GlassmorphismCard>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                        Mostrando {((currentPage - 1) * pageSize) + 1}–{Math.min(currentPage * pageSize, filteredLeads.length)} de {filteredLeads.length} leads
                    </p>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="rounded-xl"
                        >
                            Anterior
                        </Button>
                        <span className="text-sm text-muted-foreground">
                            {currentPage} / {totalPages}
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="rounded-xl"
                        >
                            Próximo
                        </Button>
                    </div>
                </div>
            )}

            {/* Footer info */}
            <p className="text-center text-sm text-muted-foreground">
                Sentimento analisado automaticamente por IA - Atualização em tempo real
            </p>

            {/* Lead Detail Modal - Requirements 2.1, 4.5 */}
            <LeadDetailModal
                lead={selectedLead}
                isOpen={isModalOpen}
                onClose={handleModalClose}
                infoContent={
                    selectedLead ? (() => {
                        const lead = leads.find(l => l.id === selectedLead.id);
                        const tagsList = parseTags(lead?.tags);
                        const adjList = parseTags(lead?.adjectives);
                        return (
                            <>
                                <LeadDetailModalSection title="Tags e Classificacao">
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

                                {lead && (
                                    <LeadDetailModalSection title="Sentimento" className="mt-4">
                                        <SentimentIcon
                                            sentiment={lead.sentiment}
                                            label={lead.sentiment_label}
                                            status={lead.status}
                                        />
                                    </LeadDetailModalSection>
                                )}

                                {selectedLead.notes && (
                                    <LeadDetailModalSection title="Notas" className="mt-4">
                                        <p className="text-sm text-foreground/80 leading-relaxed bg-blue-50/50 border border-blue-100 rounded-lg p-3">
                                            {selectedLead.notes}
                                        </p>
                                    </LeadDetailModalSection>
                                )}
                            </>
                        );
                    })() : null
                }
                chatContent={
                    <LeadConversation
                        messages={messages}
                        isLoading={isLoadingMessages}
                    />
                }
            />
        </div>
    );
}
