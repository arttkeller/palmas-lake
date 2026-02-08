
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Conversation, Message } from '@/types/chat';
import { Send, Phone, MoreVertical } from 'lucide-react';
import clsx from 'clsx';
import { createClient } from '@/lib/supabase';
import { API_BASE_URL } from '@/lib/api-config';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { RealtimeStatusIndicator } from '@/components/ui/realtime-status';
import { GlassmorphismCard, getGlassmorphismClasses } from '@/components/ui/glassmorphism-card';
import { cn } from '@/lib/utils';

/**
 * Extrai o texto legível de uma mensagem que pode conter JSON bruto
 * Trata mensagens da IA que vêm como JSON do WhatsApp
 */
function parseMessageContent(content: string): string {
    if (!content) return '';

    // Se parece com JSON, tentar parsear
    if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
        try {
            const parsed = JSON.parse(content);

            // Estrutura típica de mensagem WhatsApp: { body: { text: "..." } }
            if (parsed.body?.text) {
                return parsed.body.text;
            }
            // Ou diretamente: { text: "..." }
            if (parsed.text) {
                return parsed.text;
            }
            // Ou: { selectedDisplayText: "..." }
            if (parsed.selectedDisplayText) {
                return parsed.selectedDisplayText;
            }
            // Fallback: retornar o content original se não encontrar texto
            return content;
        } catch {
            // Não é JSON válido, retornar como está
            return content;
        }
    }

    return content;
}

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
    const fetchConversations = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            // Use AbortController for timeout - fail fast if API is not available
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);
            
            const res = await fetch(`${API_BASE_URL}/api/chat/conversations`, {
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
                    lead_name: c.leads?.full_name || c.lead_id, // API Python já faz join ou traz leads
                    last_message: c.last_message,
                    updated_at: c.updated_at,
                    unread_count: 0
                }));
                setConversations(formatted);
                // Atualizar activeConversation se existir na nova lista
                setActiveConversation(prev => {
                    if (!prev) return formatted[0];
                    const updated = formatted.find((c: Conversation) => c.id === prev.id);
                    return updated || prev;
                });
                setLoading(false);
                return;
            }
            // Log detailed error for non-OK status
            const responseBody = await res.text().catch(() => 'Unable to read response body');
            console.error('[ChatPage] API returned non-OK status:', {
                status: res.status,
                statusText: res.statusText,
                body: responseBody,
                url: `${API_BASE_URL}/api/chat/conversations`
            });
        } catch (apiError) {
            // API not available - use Supabase backup
            console.warn('[ChatPage] API fetch failed, falling back to Supabase:', apiError instanceof Error ? apiError.message : apiError);
        }

        // Backup Supabase Direto
        try {
            // Precisamos selecionar leads(full_name) para mostrar o nome
            const { data, error: supaError } = await supabase
                .schema(SCHEMA)
                .from('conversations')
                .select('*, leads(full_name, phone)')
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
                    unread_count: 0
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
            
            const res = await fetch(`${API_BASE_URL}/api/chat/messages/${activeConversation.id}`, {
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
                url: `${API_BASE_URL}/api/chat/messages/${activeConversation.id}`
            });
        } catch (apiError) {
            // API not available - use Supabase backup
            apiErrorDetails = apiError instanceof Error ? apiError.message : String(apiError);
            console.warn('[ChatPage] Messages API fetch failed, falling back to Supabase:', apiErrorDetails);
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
            }, (payload) => {
                console.log('[Realtime] Conversation change:', payload);
                fetchConversations();
            })
            .on('postgres_changes', {
                event: '*',
                schema: SCHEMA,
                table: 'leads'
            }, () => {
                console.log('[Realtime] Lead change detected');
                fetchConversations();
            })
            .subscribe((status) => {
                console.log('[Realtime] Conversations channel status:', status);
            });

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
                console.log('[Realtime] New message received:', newMsg);

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
                console.log('[Realtime] Messages channel status:', status);
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
            <div className="w-72 border-r border-white/20 dark:border-white/10 bg-white/30 dark:bg-white/5 backdrop-blur-xl flex flex-col">
                <div className="p-4 border-b border-white/20 dark:border-white/10">
                    <input 
                        type="text" 
                        placeholder="Buscar conversas..." 
                        className="w-full rounded-xl border border-white/30 dark:border-white/10 bg-white/50 dark:bg-white/5 backdrop-blur-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50" 
                    />
                </div>
                <div className="flex-1 overflow-y-auto">
                    {loading ? (
                        <div className="p-4 text-gray-500 dark:text-gray-400">Carregando...</div>
                    ) : error ? (
                        <div className="p-4 text-red-500 dark:text-red-400 text-sm">{error}</div>
                    ) : conversations.length === 0 ? (
                        <div className="p-4 text-gray-500 dark:text-gray-400 text-sm">Nenhuma conversa encontrada</div>
                    ) : conversations.map((conv) => (
                        <div
                            key={conv.id}
                            onClick={() => setActiveConversation(conv)}
                            className={clsx(
                                activeConversation?.id === conv.id 
                                    ? 'bg-emerald-50/80 dark:bg-emerald-500/10 border-l-4 border-emerald-600' 
                                    : 'hover:bg-white/50 dark:hover:bg-white/5',
                                'cursor-pointer p-4 transition-colors'
                            )}
                        >
                            <div className="flex justify-between">
                                <span className="font-medium text-gray-900 dark:text-white">{conv.lead_name}</span>
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                    {conv.updated_at ? new Date(conv.updated_at).toLocaleTimeString('pt-BR', { hour12: false }) : '--:--:--'}
                                </span>
                            </div>
                            <div className="mt-1 flex justify-between">
                                <p className="text-sm text-gray-600 dark:text-gray-300 truncate">{conv.last_message}</p>
                                {conv.platform === 'whatsapp' ? (
                                    <div className="h-4 w-4 bg-green-500 text-white flex items-center justify-center rounded-full text-[10px]">W</div>
                                ) : (
                                    <div className="h-4 w-4 bg-purple-500 text-white flex items-center justify-center rounded-full text-[10px]">I</div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Chat Area */}
            {activeConversation ? (
                <div className="flex flex-1 flex-col">
                    {/* Header */}
                    <div className="flex h-16 items-center justify-between border-b border-white/20 dark:border-white/10 px-6 bg-white/50 dark:bg-white/5 backdrop-blur-xl">
                        <div className="flex items-center space-x-3">
                            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white font-bold shadow-lg shadow-emerald-500/25">
                                {activeConversation.lead_name?.[0]}
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-gray-900 dark:text-white">{activeConversation.lead_name}</h3>
                                <p className="text-xs text-green-600 dark:text-green-400 flex items-center"><span className="block h-2 w-2 rounded-full bg-green-500 mr-1"></span> Online</p>
                            </div>
                        </div>
                        <div className="flex items-center space-x-4">
                            <RealtimeStatusIndicator />
                            <Phone className="h-5 w-5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer transition-colors" />
                            <MoreVertical className="h-5 w-5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer transition-colors" />
                        </div>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-6 bg-gradient-to-b from-slate-50/50 to-white/30 dark:from-slate-900/50 dark:to-transparent space-y-4">
                        {messagesLoading ? (
                            <div className="flex items-center justify-center h-full">
                                <div className="text-gray-500 dark:text-gray-400">Carregando mensagens...</div>
                            </div>
                        ) : messagesError ? (
                            <div className="flex flex-col items-center justify-center h-full space-y-4">
                                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6 max-w-md text-center">
                                    <div className="text-red-600 dark:text-red-400 font-medium mb-2">Erro ao carregar mensagens</div>
                                    <p className="text-sm text-red-500 dark:text-red-300">{messagesError}</p>
                                    <button 
                                        onClick={fetchMessages}
                                        className="mt-4 px-4 py-2 bg-red-100 dark:bg-red-800/30 hover:bg-red-200 dark:hover:bg-red-800/50 text-red-700 dark:text-red-300 rounded-lg text-sm transition-colors"
                                    >
                                        Tentar novamente
                                    </button>
                                </div>
                            </div>
                        ) : messages.length === 0 ? (
                            <div className="flex items-center justify-center h-full">
                                <div className="text-gray-500 dark:text-gray-400">Nenhuma mensagem ainda</div>
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
                                                    ? "bg-purple-100/80 dark:bg-purple-500/20 text-purple-900 dark:text-purple-100 border border-purple-200/50 dark:border-purple-500/30 rounded-br-md backdrop-blur-sm" 
                                                    : "bg-white/80 dark:bg-white/10 text-gray-900 dark:text-white border border-white/50 dark:border-white/10 rounded-bl-md backdrop-blur-xl shadow-black/5"
                                        )}>
                                            {isAi && <p className="mb-1 text-[10px] uppercase font-bold text-purple-700 dark:text-purple-300">AI Assistant</p>}

                                            {/* Render Logic based on Type */}
                                            {msg.message_type === 'image' || (msg.message_type as string) === 'carousel' ? (
                                                <div className="space-y-2">
                                                    <p className="whitespace-pre-wrap break-words">{parseMessageContent(msg.content).split('[Imagem:')[0].split('[Carrossel')[0]}</p>
                                                    {(msg.content.match(/\[Imagem: (.*?)\]/) || [])[1] && (
                                                        <img
                                                            src={(msg.content.match(/\[Imagem: (.*?)\]/) || [])[1]}
                                                            alt="Imagem enviada"
                                                            className="rounded-lg max-h-48 w-full object-cover mt-2 border border-white/20"
                                                        />
                                                    )}
                                                    {/* Fallback for carousel indication */}
                                                    {(msg.message_type as string) === 'carousel' && (
                                                        <div className="mt-2 p-3 bg-white/80 dark:bg-white/10 rounded-xl border border-white/30 dark:border-white/10 shadow-sm backdrop-blur-sm">
                                                            <div className="flex items-center gap-2 mb-2">
                                                                <div className="bg-purple-100 dark:bg-purple-500/20 p-1.5 rounded-full">
                                                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-600 dark:text-purple-400"><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></svg>
                                                                </div>
                                                                <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Galeria de Imóveis Enviada</span>
                                                            </div>
                                                            <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-tight">
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
                                            <div className="absolute -bottom-2 -right-1 bg-white dark:bg-gray-800 rounded-full px-1 py-0.5 shadow-md border border-white/50 dark:border-white/10 text-sm">
                                                {reaction}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                        )}
                        {/* Elemento de referência para auto-scroll */}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <div className="border-t border-white/20 dark:border-white/10 p-4 bg-white/50 dark:bg-white/5 backdrop-blur-xl">
                        <div className="flex items-center space-x-2">
                            <input
                                type="text"
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                                placeholder="Digite uma mensagem..."
                                className="flex-1 rounded-full border border-white/30 dark:border-white/10 bg-white/70 dark:bg-white/5 backdrop-blur-sm px-4 py-2 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                            />
                            <button
                                onClick={handleSendMessage}
                                className="rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 p-2 text-white hover:from-emerald-600 hover:to-emerald-700 transition-all shadow-lg shadow-emerald-500/25"
                            >
                                <Send className="h-5 w-5" />
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex flex-1 items-center justify-center bg-gradient-to-b from-slate-50/50 to-white/30 dark:from-slate-900/50 dark:to-transparent text-gray-500 dark:text-gray-400">
                    Selecione uma conversa para iniciar o chat
                </div>
            )}
            </GlassmorphismCard>
        </div>
    );
}
