'use client';

import { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '@/lib/api-config';
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
import { TrendingUp, TrendingDown, Minus, Phone, Instagram, Globe, Search, RefreshCw } from "lucide-react";
import { createClient } from '@/lib/supabase';
import { RealtimeStatusIndicator } from '@/components/ui/realtime-status';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { LeadModal, type LeadModalLead } from '@/components/LeadModal';
import { normalizeStatus, getStatusConfig } from '@/lib/status-config';
import { TemperatureBadge } from '@/components/ui/temperature-badge';
import { normalizeTemperature } from '@/lib/temperature-config';
import { formatInterestType } from '@/lib/interest-type-format';

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
}

// Ícone de canal
function ChannelIcon({ channel }: { channel: string }) {
    switch (channel) {
        case 'whatsapp':
            return (
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                        <Phone className="w-3.5 h-3.5 text-white" />
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
            return <span className="text-sm text-gray-500">-</span>;
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
    // 1. Use DB label if available
    // 2. For scheduled/completed visits, force Positivo (safety net)
    // 3. Fallback to numeric score
    let effectiveLabel = label;
    
    if (!effectiveLabel || effectiveLabel === 'Neutro') {
        const normalizedStatus = (status || '').toLowerCase().replace(/\s+/g, '_');
        if (['visita_agendada', 'visita_realizada', 'proposta_enviada', 'qualificado'].includes(normalizedStatus)) {
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
        Neutro: { icon: Minus, color: 'text-gray-400', textColor: 'text-gray-500' },
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
        return <span className="text-gray-400 text-sm">-</span>;
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
    
    // State for LeadModal - Requirements 2.1, 4.5
    const [selectedLead, setSelectedLead] = useState<LeadModalLead | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

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
        });

        try {
            // Tentar API Python primeiro
            const res = await fetch(`${API_BASE_URL}/api/leads`);

            if (res.ok) {
                const data = await res.json();
                setLeads(data.map(mapLeadData));
                setLoading(false);
                setIsInitialLoad(false);
                return; // Sucesso API
            }
            console.warn(`API returned ${res.status}, trying Supabase direct...`);
        } catch (err) {
            console.warn('API fetch failed (network error), trying Supabase direct...', err);
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
            }, (payload) => {
                console.log('[Realtime] Lead change:', payload);
                // Não mostrar loading em atualizações realtime
                fetchLeads(false);
            })
            .subscribe((status) => {
                console.log('[Realtime] Leads table channel status:', status);
            });

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
                console.log('[Realtime] Broadcast lead_deleted recebido');
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

    /**
     * Handle click on lead row to open modal
     * Requirements: 2.1 - WHEN a user clicks on a lead row in the leads table THEN the system SHALL open a modal displaying the lead's details
     * Requirements: 4.5 - Preserve scroll position and filters when modal closes
     */
    const handleLeadClick = useCallback((lead: Lead) => {
        // Convert Lead to LeadModalLead format
        const modalLead: LeadModalLead = {
            id: lead.id,
            full_name: lead.name,
            phone: lead.phone || '',
            email: lead.email,
            status: lead.status,
            sentiment_score: lead.sentiment,
            sentiment_label: lead.sentiment_label,
            notes: lead.notes,
            source: lead.channel,
            platform: lead.channel === 'instagram' ? 'instagram' : 'whatsapp',
            created_at: lead.created_at,
            interest_type: lead.interest_type,
            tags: lead.tags,
            adjectives: lead.adjectives,
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
                    <p className="text-gray-500 text-sm mt-1">
                        Acompanhe todos os leads em tempo real
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <RealtimeStatusIndicator />
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
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                        placeholder="Buscar por nome, telefone ou email..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 rounded-xl bg-white/70 backdrop-blur-xl border-white/20"
                    />
                </div>
                <Badge variant="secondary" className="text-sm rounded-full bg-white/60 backdrop-blur-sm">
                    {filteredLeads.length} leads
                </Badge>
            </div>

            {/* Table with Glassmorphism */}
            <GlassmorphismCard variant="default" className="overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-white/50 border-b border-white/20">
                            <TableHead className="font-semibold text-gray-900">Nome</TableHead>
                            <TableHead className="font-semibold text-gray-900">Canal</TableHead>
                            <TableHead className="font-semibold text-gray-900">Status</TableHead>
                            <TableHead className="font-semibold text-gray-900">Interesse</TableHead>
                            <TableHead className="font-semibold text-gray-900">Temperatura</TableHead>
                            <TableHead className="font-semibold text-gray-900">Data</TableHead>
                            <TableHead className="font-semibold text-gray-900">Sentimento</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                                    Carregando leads...
                                </TableCell>
                            </TableRow>
                        ) : filteredLeads.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                                    Nenhum lead encontrado
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredLeads.map((lead) => (
                                <TableRow
                                    key={lead.id}
                                    className="hover:bg-white/50:bg-white/5 cursor-pointer transition-colors border-b border-white/10"
                                    onClick={() => handleLeadClick(lead)}
                                >
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span className="font-medium text-gray-900">{lead.name}</span>
                                            {lead.phone && (
                                                <span className="text-xs text-gray-500">{lead.phone}</span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <ChannelIcon channel={lead.channel} />
                                    </TableCell>
                                    <TableCell>
                                        <StatusBadge status={lead.status} />
                                    </TableCell>
                                    <TableCell>
                                        <InterestBadge interestType={lead.interest_type} />
                                    </TableCell>
                                    <TableCell>
                                        <TemperatureBadge 
                                            temperature={lead.temperature ? normalizeTemperature(lead.temperature) : null} 
                                            size="sm" 
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <span className="text-sm text-gray-900">
                                            {lead.created_at
                                                ? new Date(lead.created_at).toLocaleDateString('pt-BR')
                                                : '-'
                                            }
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        <SentimentIcon sentiment={lead.sentiment} label={lead.sentiment_label} status={lead.status} />
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </GlassmorphismCard>

            {/* Footer info */}
            <p className="text-center text-sm text-gray-500">
                ✨ Sentimento analisado automaticamente por IA • Atualização em tempo real
            </p>

            {/* Lead Modal - Requirements 2.1, 4.5 */}
            <LeadModal
                lead={selectedLead}
                isOpen={isModalOpen}
                onClose={handleModalClose}
            />
        </div>
    );
}
