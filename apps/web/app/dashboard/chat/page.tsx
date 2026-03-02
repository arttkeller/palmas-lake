
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Conversation, Message } from '@/types/chat';
import { Send, Phone, MoreVertical, ArrowLeft } from 'lucide-react';
import { WhatsAppWindowBadge } from '@/components/ui/whatsapp-window-badge';
import clsx from 'clsx';
import { createClient } from '@/lib/supabase';
import { apiFetch } from '@/lib/api-fetch';
import { API_BASE_URL } from '@/lib/api-config';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { GlassmorphismCard, getGlassmorphismClasses } from '@/components/ui/glassmorphism-card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { parseMessageContent } from '@/lib/parse-message-content';

export default function ChatPage() {
    const [supabase] = useState(() => createClient());
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputText, setInputText] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [messagesError, setMessagesError] = useState<string | null>(null);
    const [messagesLoading, setMessagesLoading] = useState(false);

    // Ref para auto-scroll
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Schema correto do projeto
    const SCHEMA = 'palmaslake-agno';

    // Fetch Conversations
    const fetchConversations = useCallback(async (isPolling = false) => {
        if (!isPolling) setLoading(true);
        setError(null);
        try {
            // Use AbortController for timeout - fail fast if API is not available
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);
            
            const res = await apiFetch(`/api/chat/conversations`, {
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            
            if (res.ok) {
                const data = await res.json();
                // Assumindo estrutura retornada pela API
                const formatted = data.map((c: any) => ({
                    id: c.id,
                    lead_id: c.lead_id,
                    platform: c.platform,
                    lead_name: c.leads?.full_name || c.lead_id,
                    last_message: c.last_message,
                    updated_at: c.updated_at,
                    unread_count: 0,
                    profile_picture_url: c.leads?.profile_picture_url || null,
                    last_interaction_at: c.leads?.last_interaction || c.leads?.last_interaction_at || null,
                }));
                setConversations(formatted);
                // Atualizar activeConversation se existir na nova lista
                setActiveConversation(prev => {
                    if (!prev) return formatted[0];
                    const updated = formatted.find((c: Conversation) => c.id === prev.id);
                    return updated || prev;
                });
                if (!isPolling) setLoading(false);
                return;
            }
            // Log detailed error for non-OK status
            const responseBody = await res.text().catch(() => 'Unable to read response body');
            console.error('[ChatPage] API returned non-OK status:', {
                status: res.status,
                statusText: res.statusText,
                body: responseBody,
                url: '/api/chat/conversations'
            });
        } catch (apiError) {
            // API not available - use Supabase backup
        }

        // Backup Supabase Direto
        try {
            // Precisamos selecionar leads(full_name) para mostrar o nome
            const { data, error: supaError } = await supabase
                .schema(SCHEMA)
                .from('conversations')
                .select('*, leads(full_name, phone, profile_picture_url, last_interaction)')
                .order('updated_at', { ascending: false });

            if (supaError) {
                console.error('[ChatPage] Supabase fallback query error:', {
                    schema: SCHEMA,
                    table: 'conversations',
                    code: supaError.code,
                    message: supaError.message,
                    details: supaError.details,
                    hint: supaError.hint
                });
                setError('Erro ao carregar conversas. Verifique a conexão.');
            } else if (data) {
                const formatted = data.map((c: any) => ({
                    id: c.id,
                    lead_id: c.lead_id,
                    platform: c.platform,
                    // Supabase retorna leads como objeto ou array dependendo da relação
                    // Ajuste defensivo
                    lead_name: c.leads?.full_name || c.leads?.[0]?.full_name || c.lead_id,
                    last_message: c.last_message,
                    updated_at: c.updated_at,
                    unread_count: 0,
                    profile_picture_url: c.leads?.profile_picture_url || c.leads?.[0]?.profile_picture_url || null,
                    last_interaction_at: c.leads?.last_interaction || c.leads?.last_interaction_at || c.leads?.[0]?.last_interaction || c.leads?.[0]?.last_interaction_at || null,
                }));
                setConversations(formatted);
                // Atualizar activeConversation se existir na nova lista
                setActiveConversation(prev => {
                    if (!prev) return formatted.length > 0 ? formatted[0] : null;
                    const updated = formatted.find((c: Conversation) => c.id === prev.id);
                    return updated || prev;
                });
            }
        } catch (fallbackError) {
            console.error('[ChatPage] Supabase fallback exception:', {
                schema: SCHEMA,
                table: 'conversations',
                error: fallbackError instanceof Error ? fallbackError.message : fallbackError
            });
            setError('Erro ao carregar conversas. Verifique a conexão.');
        }
        setLoading(false);
    }, [supabase]);

    // Fetch Messages
    const fetchMessages = useCallback(async () => {
        if (!activeConversation) return;
        
        setMessagesLoading(true);
        setMessagesError(null);
        
        let apiSuccess = false;
        let apiErrorDetails: string | null = null;
        
        try {
            // Use AbortController for timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);
            
            const res = await apiFetch(`/api/chat/messages/${activeConversation.id}`, {
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            
            if (res.ok) {
                const data = await res.json();
                setMessages(data);
                setMessagesLoading(false);
                apiSuccess = true;
                return;
            }
            // Log detailed error for non-OK status
            const responseBody = await res.text().catch(() => 'Unable to read response body');
            apiErrorDetails = `API returned status ${res.status}: ${responseBody}`;
            console.error('[ChatPage] Messages API returned non-OK status:', {
                status: res.status,
                statusText: res.statusText,
                body: responseBody,
                conversationId: activeConversation.id,
                url: `/api/chat/messages/${activeConversation.id}`
            });
        } catch (apiError) {
            // API not available - use Supabase backup
            apiErrorDetails = apiError instanceof Error ? apiError.message : String(apiError);
        }

        // Backup Supabase
        let supabaseSuccess = false;
        let supabaseErrorDetails: string | null = null;
        
        try {
            const { data, error: supaError } = await supabase
                .schema(SCHEMA)
                .from('messages')
                .select('*')
                .eq('conversation_id', activeConversation.id)
                .order('created_at', { ascending: true });

            if (supaError) {
                supabaseErrorDetails = `${supaError.code}: ${supaError.message}`;
                console.error('[ChatPage] Messages Supabase fallback error:', {
                    schema: SCHEMA,
                    table: 'messages',
                    conversationId: activeConversation.id,
                    code: supaError.code,
                    message: supaError.message,
                    details: supaError.details,
                    hint: supaError.hint
                });
            } else if (data) {
                setMessages(data);
                supabaseSuccess = true;
            }
        } catch (fallbackError) {
            supabaseErrorDetails = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
            console.error('[ChatPage] Messages Supabase fallback exception:', {
                schema: SCHEMA,
                table: 'messages',
                conversationId: activeConversation.id,
                error: supabaseErrorDetails
            });
        }
        
        // If both API and Supabase fallback failed, show error to user
        if (!apiSuccess && !supabaseSuccess) {
            const errorMessage = 'Não foi possível carregar as mensagens. Verifique se a API está rodando ou se as políticas de RLS permitem acesso.';
            setMessagesError(errorMessage);
            console.error('[ChatPage] Both API and Supabase fallback failed:', {
                apiError: apiErrorDetails,
                supabaseError: supabaseErrorDetails,
                conversationId: activeConversation.id
            });
        }
        
        setMessagesLoading(false);
    }, [activeConversation?.id, supabase]);

    // Initial Fetch
    useEffect(() => {
        fetchConversations();
    }, [fetchConversations]);

    // Fetch messages when conversation changes
    useEffect(() => {
        if (activeConversation) {
            fetchMessages();
        }
    }, [activeConversation?.id, fetchMessages]);

    // Auto-scroll para últimas mensagens
    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    // Realtime Subscription: Conversations & Leads
    useEffect(() => {
        const channel = supabase
            .channel('realtime:conversations_and_leads')
            .on('postgres_changes', {
                event: '*',
                schema: SCHEMA,
                table: 'conversations'
            }, () => {
                fetchConversations();
            })
            .on('postgres_changes', {
                event: '*',
                schema: SCHEMA,
                table: 'leads'
            }, () => {
                fetchConversations();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [fetchConversations, supabase]);

    // Broadcast fallback: escuta evento lead_deleted enviado pelo backend
    useEffect(() => {
        const channel = supabase
            .channel('realtime:lead-deletions-chat')
            .on('broadcast', { event: 'lead_deleted' }, () => {
                fetchConversations();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [fetchConversations, supabase]);

    // Realtime Subscription: Messages
    useEffect(() => {
        if (!activeConversation) return;

        const channel = supabase
            .channel(`realtime:messages:${activeConversation.id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: SCHEMA,
                table: 'messages',
                filter: `conversation_id=eq.${activeConversation.id}`
            }, (payload) => {
                const newMsg = payload.new as Message;

                setMessages((prev: Message[]) => {
                    // Evitar duplicatas
                    if (prev.some((m: Message) => m.id === newMsg.id)) return prev;
                    return [...prev, newMsg];
                });
            })
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: SCHEMA,
                table: 'messages',
                filter: `conversation_id=eq.${activeConversation.id}`
            }, (payload) => {
                const updatedMsg = payload.new as Message;
                setMessages((prev: Message[]) =>
                    prev.map(m => m.id === updatedMsg.id ? updatedMsg : m)
                );
            })
            .subscribe((status) => {
                if (status === 'CHANNEL_ERROR') {
                    console.error('[Realtime] Messages channel error - check RLS and replication settings');
                }
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [activeConversation?.id, supabase]);

    const handleSendMessage = async () => {
        if (!inputText.trim() || !activeConversation) return;

        // Optimistic Update
        const tempMsg: Message = {
            id: Date.now().toString(),
            conversation_id: activeConversation.id,
            sender_type: 'user',
            content: inputText,
            message_type: 'text',
            created_at: new Date().toISOString()
        };
        setMessages([...messages, tempMsg]);
        setInputText('');

        // Send to Backend (which sends to UazAPI)
        // Note: Currently we only have a buffer service for INCOMING messages trigger. 
        // We need an endpoint to send OUTGOING messages manually if the human agent types here.
        // For now, let's just assume this is a "Log only" or implement a send endpoint later.
        // But the user asked for sync. 
        // Let's rely on the polling to pick up the AI response.
        // If the HUMAN wants to send, we need a POST /api/chat/send endpoint.
        // I will impl that in next step if needed.
    };

    return (
        <div className="h-full max-w-7xl mx-auto">
            <GlassmorphismCard variant="default" className="flex h-full overflow-hidden">
            {/* Sidebar List */}
            <div className={cn(
                "w-full md:w-72 border-r border-white/20 bg-white/30 backdrop-blur-xl flex flex-col",
                activeConversation ? "hidden md:flex" : "flex"
            )}>
                <div className="p-4 border-b border-white/20">
                    <Input
                        type="text"
                        placeholder="Buscar conversas..."
                        className="rounded-xl border-white/30 bg-white/50 backdrop-blur-sm focus:ring-emerald-500/50"
                    />
                </div>
                <div className="flex-1 overflow-y-auto">
                    {loading ? (
                        <div className="p-4 text-muted-foreground">Carregando...</div>
                    ) : error ? (
                        <div className="p-4 text-red-500 text-sm">{error}</div>
                    ) : conversations.length === 0 ? (
                        <EmptyState icon="message" title="Nenhuma conversa encontrada" description="As conversas aparecerão aqui" />
                    ) : conversations.map((conv) => (
                        <div
                            key={conv.id}
                            onClick={() => setActiveConversation(conv)}
                            className={clsx(
                                activeConversation?.id === conv.id 
                                    ? 'bg-emerald-50/80 border-l-4 border-emerald-600' 
                                    : 'hover:bg-white/50',
                                'cursor-pointer p-4 transition-colors'
                            )}
                        >
                            <div className="flex items-center gap-3">
                                <div className="relative shrink-0">
                                    <Avatar className="h-9 w-9">
                                        {conv.profile_picture_url && (
                                            <AvatarImage src={conv.profile_picture_url} alt={conv.lead_name || ''} />
                                        )}
                                        <AvatarFallback className="bg-gradient-to-br from-emerald-400 to-emerald-600 text-white text-xs font-bold">
                                            {conv.lead_name?.[0]}
                                        </AvatarFallback>
                                    </Avatar>
                                    {/* Badge do canal sobre o avatar */}
                                    {conv.platform === 'whatsapp' ? (
                                        <span className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-green-500 border-2 border-white flex items-center justify-center">
                                            <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                                        </span>
                                    ) : (
                                        <span className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 border-2 border-white flex items-center justify-center">
                                            <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                                        </span>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between">
                                        <span className="font-medium text-foreground truncate">{conv.lead_name}</span>
                                        <span className="text-xs text-muted-foreground shrink-0 ml-2">
                                            {conv.updated_at ? new Date(conv.updated_at).toLocaleTimeString('pt-BR', { hour12: false }) : '--:--:--'}
                                        </span>
                                    </div>
                                    <p className="mt-1 text-sm text-muted-foreground truncate">{conv.last_message}</p>
                                    {conv.platform === 'whatsapp' && (
                                        <div className="mt-1">
                                            <WhatsAppWindowBadge
                                                lastInteractionAt={conv.last_interaction_at}
                                                variant="compact"
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Chat Area */}
            {activeConversation ? (
                <div className={cn(
                    "flex flex-1 flex-col",
                    activeConversation ? "flex" : "hidden md:flex"
                )}>
                    {/* Header */}
                    <div className="flex h-16 items-center justify-between border-b border-white/20 px-6 bg-white/50 backdrop-blur-xl">
                        <div className="flex items-center space-x-3">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="md:hidden mr-1"
                                onClick={() => setActiveConversation(null)}
                            >
                                <ArrowLeft className="h-5 w-5" />
                            </Button>
                            <Avatar className="h-10 w-10 shadow-lg shadow-emerald-500/25">
                                {activeConversation.profile_picture_url && (
                                    <AvatarImage src={activeConversation.profile_picture_url} alt={activeConversation.lead_name || ''} />
                                )}
                                <AvatarFallback className="bg-gradient-to-br from-emerald-400 to-emerald-600 text-white font-bold">
                                    {activeConversation.lead_name?.[0]}
                                </AvatarFallback>
                            </Avatar>
                            <div>
                                <h3 className="text-sm font-bold text-foreground">{activeConversation.lead_name}</h3>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <p className="text-xs text-green-600 flex items-center"><span className="block h-2 w-2 rounded-full bg-green-500 mr-1"></span> Online</p>
                                    {activeConversation.platform === 'whatsapp' && (
                                        <WhatsAppWindowBadge
                                            lastInteractionAt={activeConversation.last_interaction_at}
                                            variant="full"
                                        />
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center space-x-4">
                            <Phone className="h-5 w-5 text-muted-foreground/70 hover:text-muted-foreground cursor-pointer transition-colors" />
                            <MoreVertical className="h-5 w-5 text-muted-foreground/70 hover:text-muted-foreground cursor-pointer transition-colors" />
                        </div>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-6 bg-gradient-to-b from-slate-50/50 to-white/30 space-y-4">
                        {messagesLoading ? (
                            <div className="flex items-center justify-center h-full">
                                <div className="text-muted-foreground">Carregando mensagens...</div>
                            </div>
                        ) : messagesError ? (
                            <div className="flex flex-col items-center justify-center h-full space-y-4">
                                <div className="bg-red-50 border border-red-200 rounded-xl p-6 max-w-md text-center">
                                    <div className="text-red-600 font-medium mb-2">Erro ao carregar mensagens</div>
                                    <p className="text-sm text-red-500">{messagesError}</p>
                                    <button 
                                        onClick={fetchMessages}
                                        className="mt-4 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm transition-colors"
                                    >
                                        Tentar novamente
                                    </button>
                                </div>
                            </div>
                        ) : messages.length === 0 ? (
                            <div className="flex items-center justify-center h-full">
                                <EmptyState icon="inbox" title="Nenhuma mensagem ainda" description="Inicie uma conversa" />
                            </div>
                        ) : (
                            messages.map((msg) => {
                            const isMe = msg.sender_type === 'user' || msg.sender_type === 'ai';
                            const isAi = msg.sender_type === 'ai';
                            const isLead = msg.sender_type === 'lead';
                            // Verificar se há reação na mensagem (metadata.reaction)
                            const msgAny = msg as any;
                            const metadata = typeof msgAny.metadata === 'string' ? JSON.parse(msgAny.metadata || '{}') : (msgAny.metadata || {});
                            const reaction = metadata?.reaction;
                            
                            return (
                                <div key={msg.id} className={clsx("flex w-full", isMe ? "justify-end" : "justify-start")}>
                                    <div className={clsx("relative max-w-[70%]", isMe ? "ml-auto" : "mr-auto")}>
                                        <div className={cn(
                                            "inline-block rounded-2xl px-4 py-2 text-sm shadow-lg",
                                            msg.sender_type === 'user' 
                                                ? "bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-br-md shadow-emerald-500/25" 
                                                : msg.sender_type === 'ai' 
                                                    ? "bg-purple-100/80 text-purple-900 border border-purple-200/50 rounded-br-md backdrop-blur-sm" 
                                                    : "bg-white/80 text-foreground border border-white/50 rounded-bl-md backdrop-blur-xl shadow-black/5"
                                        )}>
                                            {isAi && <p className="mb-1 text-[10px] uppercase font-bold text-purple-700">AI Assistant</p>}

                                            {/* Render Logic based on Type */}
                                            {msg.message_type === 'image' || (msg.message_type as string) === 'carousel' ? (
                                                <div className="space-y-2">
                                                    {/* Imagem do lead via proxy (metadata.wa_media_id) */}
                                                    {metadata?.wa_media_id && (
                                                        <img
                                                            src={`${API_BASE_URL}/api/chat/media/${metadata.wa_media_id}`}
                                                            alt="Imagem enviada"
                                                            className="rounded-lg max-h-64 max-w-full object-contain mt-1 border border-white/20 cursor-pointer"
                                                            loading="lazy"
                                                            onClick={() => window.open(`${API_BASE_URL}/api/chat/media/${metadata.wa_media_id}`, '_blank')}
                                                        />
                                                    )}
                                                    {/* Caption ou descrição da imagem */}
                                                    <p className="whitespace-pre-wrap break-words">{parseMessageContent(
                                                        msg.content.replace(/\[Imagem:.*?\]\s*/g, '').replace(/\[Imagem recebida\]\s*/g, '').trim() || msg.content
                                                    )}</p>
                                                    {/* Fallback for carousel indication */}
                                                    {(msg.message_type as string) === 'carousel' && (
                                                        <div className="mt-2 p-3 bg-white/80 rounded-xl border border-white/30 shadow-sm backdrop-blur-sm">
                                                            <div className="flex items-center gap-2 mb-2">
                                                                <div className="bg-purple-100 p-1.5 rounded-full">
                                                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-600"><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></svg>
                                                                </div>
                                                                <span className="text-xs font-bold text-muted-foreground">Galeria de Imóveis Enviada</span>
                                                            </div>
                                                            <p className="text-[11px] text-muted-foreground leading-tight">
                                                                O cliente recebeu um carrossel interativo com fotos e detalhes no WhatsApp.
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <p className="whitespace-pre-wrap break-words">{parseMessageContent(msg.content)}</p>
                                            )}

                                            <span className={clsx("block text-right text-[10px] mt-1 opacity-70")}>
                                                {msg.created_at ? new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour12: false }) : '--:--:--'}
                                            </span>
                                        </div>
                                        
                                        {/* Mostrar reação se existir */}
                                        {reaction && isLead && (
                                            <div className="absolute -bottom-2 -right-1 bg-white rounded-full px-1 py-0.5 shadow-md border border-white/50 text-sm">
                                                {reaction}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                        )}
                        {/* Typing indicator - shows when last message was from our side */}
                        {messages.length > 0 && (messages[messages.length - 1].sender_type === 'user' || messages[messages.length - 1].sender_type === 'ai') && (
                            <div className="flex items-start space-x-2 justify-start">
                                <div className="bg-white/80 border border-white/50 rounded-2xl rounded-bl-md backdrop-blur-xl px-4 py-3">
                                    <div className="flex space-x-1.5">
                                        <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                        <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                        <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                    </div>
                                </div>
                            </div>
                        )}
                        {/* Elemento de referência para auto-scroll */}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <div className="border-t border-white/20 p-4 bg-white/50 backdrop-blur-xl">
                        <div className="flex items-center space-x-2">
                            <Input
                                type="text"
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                                placeholder="Digite uma mensagem..."
                                className="flex-1 rounded-full border-white/30 bg-white/70 backdrop-blur-sm focus:border-emerald-500 focus:ring-emerald-500/50"
                            />
                            <Button
                                onClick={handleSendMessage}
                                size="icon"
                                className="rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 shadow-lg shadow-emerald-500/25 border-0"
                            >
                                <Send className="h-5 w-5" />
                            </Button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex flex-1 items-center justify-center bg-gradient-to-b from-slate-50/50 to-white/30 text-muted-foreground">
                    Selecione uma conversa para iniciar o chat
                </div>
            )}
            </GlassmorphismCard>
        </div>
    );
}
