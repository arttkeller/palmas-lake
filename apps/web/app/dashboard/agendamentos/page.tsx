"use client"

import { useState, useEffect, useCallback } from "react"
import { EventManager, type Event } from "@/components/ui/event-manager"
import { API_BASE_URL } from '@/lib/api-config'
import { createClient } from "@/lib/supabase"
import { RealtimeStatusIndicator } from "@/components/ui/realtime-status"

export default function AgendamentosPage() {
    const supabase = createClient()
    const [events, setEvents] = useState<Event[]>([])
    const [loading, setLoading] = useState(true)

    const SCHEMA = 'palmaslake-agno'

    // Converter evento do banco para formato do componente
    const mapDbEventToEvent = (dbEvent: any): Event => {
        // Normalizar lead_name vindo da API ou do Supabase (join)
        const leadName = dbEvent.lead_name || dbEvent.leads?.full_name || dbEvent.leads?.name || "";

        return {
            id: dbEvent.id,
            title: dbEvent.title || "Evento sem título",
            description: dbEvent.description || "",
            startTime: new Date(dbEvent.start_time),
            endTime: new Date(dbEvent.end_time),
            color: dbEvent.color || "blue",
            category: dbEvent.category || "Visita",
            attendees: leadName ? [leadName] : [],
            tags: dbEvent.status === "confirmado" ? ["Confirmado"] :
                dbEvent.status === "cancelado" ? ["Cancelado"] :
                    dbEvent.status === "realizado" ? ["Realizado"] : ["Pendente"],
        };
    };

    // Buscar eventos do banco
    const fetchEvents = useCallback(async () => {
        setLoading(true);
        try {
            // Use AbortController for timeout - fail fast if API is not available
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);
            
            const res = await fetch(`${API_BASE_URL}/api/events`, {
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (res.ok) {
                const data = await res.json();
                const mapped = data.map(mapDbEventToEvent);
                setEvents(mapped);
                setLoading(false);
                return;
            }
        } catch {
            // API not available - use Supabase backup
        }

        // Backup Supabase - Apontando para o schema correto
        const { data, error } = await supabase
            .schema(SCHEMA)
            .from('events')
            .select('*')
            .order('start_time', { ascending: true });

        if (!error && data) {
            setEvents(data.map(mapDbEventToEvent));
        } else if (error) {
            console.error("Supabase events error:", error);
            setEvents([]);
        }
        setLoading(false);
    }, [supabase]);

    // Criar evento
    const handleEventCreate = async (event: Omit<Event, "id">) => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/events`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: event.title,
                    description: event.description,
                    start_time: event.startTime.toISOString(),
                    end_time: event.endTime.toISOString(),
                    color: event.color,
                    category: event.category,
                }),
            })
            if (res.ok) {
                const newEvent = await res.json()
                setEvents((prev) => [...prev, mapDbEventToEvent(newEvent)])
            }
        } catch (err) {
            console.error("Failed to create event:", err)
        }
    }

    // Atualizar evento
    const handleEventUpdate = async (id: string, updates: Partial<Event>) => {
        try {
            const body: any = {}
            if (updates.title) body.title = updates.title
            if (updates.description) body.description = updates.description
            if (updates.startTime) body.start_time = updates.startTime.toISOString()
            if (updates.endTime) body.end_time = updates.endTime.toISOString()
            if (updates.color) body.color = updates.color
            if (updates.category) body.category = updates.category

            const res = await fetch(`${API_BASE_URL}/api/events/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            })
            if (res.ok) {
                const updatedEvent = await res.json()
                setEvents((prev) =>
                    prev.map((e) => (e.id === id ? mapDbEventToEvent(updatedEvent) : e))
                )
            }
        } catch (err) {
            console.error("Failed to update event:", err)
        }
    }

    // Deletar evento
    const handleEventDelete = async (id: string) => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/events/${id}`, {
                method: "DELETE",
            })
            if (res.ok) {
                setEvents((prev) => prev.filter((e) => e.id !== id))
            }
        } catch (err) {
            console.error("Failed to delete event:", err)
        }
    }

    // Fetch inicial
    useEffect(() => {
        fetchEvents()
    }, [fetchEvents])

    // Realtime subscription para eventos
    useEffect(() => {
        const channel = supabase
            .channel('realtime:events')
            .on('postgres_changes', {
                event: '*',
                schema: SCHEMA,
                table: 'events'
            }, (payload) => {
                console.log('[Realtime] Event change:', payload)
                fetchEvents()
            })
            .subscribe((status) => {
                console.log('[Realtime] Events channel status:', status)
            })

        return () => {
            supabase.removeChannel(channel)
        }
    }, [fetchEvents, supabase])

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="text-gray-500">Carregando agendamentos...</div>
            </div>
        )
    }

    return (
        <div className="h-full flex flex-col px-4 sm:px-6 overflow-hidden">
            {/* Header com indicador de realtime */}
            <div className="flex items-center justify-between py-2 flex-shrink-0">
                <div>
                    <h1 className="text-xl font-bold text-gray-900">Agendamentos</h1>
                    <p className="text-xs text-gray-500">
                        Gerencie as visitas agendadas pela Maria e manualmente
                    </p>
                </div>
                <RealtimeStatusIndicator />
            </div>

            <div className="flex-1 min-h-0 overflow-hidden">
                <EventManager
                    events={events}
                    onEventCreate={handleEventCreate}
                    onEventUpdate={handleEventUpdate}
                    onEventDelete={handleEventDelete}
                    categories={["Visita", "Reunião", "Lembrete", "Pessoal"]}
                    availableTags={["Confirmado", "Pendente", "Cancelado", "Realizado", "Importante"]}
                    defaultView="month"
                />
            </div>
        </div>
    )
}
