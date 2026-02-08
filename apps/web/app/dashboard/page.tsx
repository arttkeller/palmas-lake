
'use client';

import { useEffect, useState } from 'react';
import { Lead } from '@/types/lead';
import { API_BASE_URL } from '@/lib/api-config';
import { Loader2 } from 'lucide-react';

const COLUMNS = [
    { id: 'new', label: 'Novo' },
    { id: 'contacted', label: 'Contatado' },
    { id: 'visit_scheduled', label: 'Visita Agendada' },
    { id: 'sold', label: 'Vendido' },
];

export default function DashboardPage() {
    const [leads, setLeads] = useState<Lead[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchLeads() {
            try {
                // In dev, API is on port 8000. In prod, use env var.
                const res = await fetch(`${API_BASE_URL}/api/leads`);
                if (res.ok) {
                    const data = await res.json();
                    setLeads(data);
                }
            } catch (error) {
                console.error('Failed to fetch leads', error);
            } finally {
                setLoading(false);
            }
        }
        fetchLeads();
    }, []);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold tracking-tight text-gray-900">
                    Pipeline de Vendas
                </h2>
                <button className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
                    Adicionar Lead
                </button>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-4 lg:gap-8">
                {COLUMNS.map((col) => {
                    const colLeads = leads.filter((l) => l.status === col.id);

                    return (
                        <div key={col.id} className="flex flex-col rounded-lg bg-gray-100 p-4">
                            <h3 className="mb-4 text-sm font-semibold text-gray-500 uppercase">
                                {col.label} <span className="text-gray-400">({colLeads.length})</span>
                            </h3>
                            <div className="flex-1 space-y-3">
                                {loading ? (
                                    <div className="flex h-20 items-center justify-center rounded-md bg-white p-3 shadow-sm">
                                        <Loader2 className="animate-spin text-gray-400" />
                                    </div>
                                ) : colLeads.length > 0 ? (
                                    colLeads.map((lead) => (
                                        <div key={lead.id} className="rounded-md border border-gray-200 bg-white p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                                            <p className="text-sm font-medium text-gray-900">{lead.full_name}</p>
                                            <p className="mt-1 text-xs text-gray-500">{lead.phone}</p>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-xs text-center text-gray-400 py-4">Nenhum lead</p>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
