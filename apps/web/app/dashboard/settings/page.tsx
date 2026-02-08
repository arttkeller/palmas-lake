
'use client';

import { Save } from 'lucide-react';

export default function SettingsPage() {
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold tracking-tight text-gray-900">
                    Configurações
                </h2>
                <button className="flex items-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
                    <Save className="mr-2 h-4 w-4" />
                    Salvar Alterações
                </button>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* Profile Settings */}
                <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-200">
                    <h3 className="text-lg font-medium leading-6 text-gray-900 mb-4">Perfil</h3>
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="name" className="block text-sm font-medium text-gray-700">Nome</label>
                            <input type="text" id="name" defaultValue="Admin User" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 sm:text-sm p-2 border" />
                        </div>
                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email</label>
                            <input type="email" id="email" defaultValue="admin@palmaslake.com" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 sm:text-sm p-2 border" />
                        </div>
                    </div>
                </div>

                {/* System Settings */}
                <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-200">
                    <h3 className="text-lg font-medium leading-6 text-gray-900 mb-4">Sistema</h3>
                    <div className="space-y-4">
                        <div className="flex items-start">
                            <div className="flex h-5 items-center">
                                <input id="notifications" name="notifications" type="checkbox" defaultChecked className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                            </div>
                            <div className="ml-3 text-sm">
                                <label htmlFor="notifications" className="font-medium text-gray-700">Notificações por Email</label>
                                <p className="text-gray-500">Receba alertas quando um novo lead for cadastrado.</p>
                            </div>
                        </div>
                        <div className="flex items-start">
                            <div className="flex h-5 items-center">
                                <input id="ai_response" name="ai_response" type="checkbox" defaultChecked className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                            </div>
                            <div className="ml-3 text-sm">
                                <label htmlFor="ai_response" className="font-medium text-gray-700">Resposta Automática da IA</label>
                                <p className="text-gray-500">Permitir que o agente responda automaticamente aos leads.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
