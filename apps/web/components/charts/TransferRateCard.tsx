'use client';

import React from 'react';
import { 
    GlassmorphismCard, 
    GlassmorphismCardContent, 
    GlassmorphismCardHeader, 
    GlassmorphismCardTitle, 
    GlassmorphismCardDescription 
} from '@/components/ui/glassmorphism-card';
import { UserCheck } from 'lucide-react';
import { ArrowRightLeftIcon } from '@/components/icons/animated';

interface TransferRateCardProps {
    data?: {
        transfer_rate?: number;
        transfer_count?: number;
        total_leads?: number;
    }
}

export default function TransferRateCard({ data }: TransferRateCardProps) {
    const transferRate = data?.transfer_rate || 0;
    const transferCount = data?.transfer_count || 0;
    const totalLeads = data?.total_leads || 0;

    // Determinar cor baseado na taxa (menor é melhor para IA)
    const getColor = (rate: number) => {
        if (rate <= 10) return 'text-green-600 dark:text-green-400';
        if (rate <= 25) return 'text-yellow-600 dark:text-yellow-400';
        return 'text-red-600 dark:text-red-400';
    };

    const getBgColor = (rate: number) => {
        if (rate <= 10) return 'bg-green-50 dark:bg-green-500/10';
        if (rate <= 25) return 'bg-yellow-50 dark:bg-yellow-500/10';
        return 'bg-red-50 dark:bg-red-500/10';
    };

    return (
        <GlassmorphismCard variant="default" hoverable>
            <GlassmorphismCardHeader className="pb-2">
                <GlassmorphismCardTitle className="flex items-center gap-2 text-base">
                    <ArrowRightLeftIcon size={20} />
                    Transferência para Humano
                </GlassmorphismCardTitle>
                <GlassmorphismCardDescription>
                    Leads que precisaram de atendimento humano
                </GlassmorphismCardDescription>
            </GlassmorphismCardHeader>
            <GlassmorphismCardContent>
                <div className="space-y-4">
                    {/* Taxa Principal */}
                    <div className={`rounded-lg p-4 ${getBgColor(transferRate)}`}>
                        <div className="flex items-baseline gap-2">
                            <span className={`text-4xl font-bold ${getColor(transferRate)}`}>
                                {transferRate}%
                            </span>
                            <span className="text-sm text-gray-500 dark:text-gray-400">taxa de transferência</span>
                        </div>
                    </div>

                    {/* Detalhes */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="rounded-lg bg-gray-50 dark:bg-white/5 p-3 text-center">
                            <div className="text-2xl font-semibold text-gray-900 dark:text-white">{transferCount}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">Transferidos</div>
                        </div>
                        <div className="rounded-lg bg-gray-50 dark:bg-white/5 p-3 text-center">
                            <div className="text-2xl font-semibold text-gray-900 dark:text-white">{totalLeads - transferCount}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">Resolvidos pela IA</div>
                        </div>
                    </div>

                    {/* Indicador de Performance */}
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <UserCheck className="h-4 w-4" />
                        {transferRate <= 10 ? (
                            <span className="text-green-600 dark:text-green-400">Excelente! A IA está resolvendo a maioria dos casos.</span>
                        ) : transferRate <= 25 ? (
                            <span className="text-yellow-600 dark:text-yellow-400">Bom desempenho, mas há espaço para melhorias.</span>
                        ) : (
                            <span className="text-red-600 dark:text-red-400">Considere revisar o treinamento da IA.</span>
                        )}
                    </div>
                </div>
            </GlassmorphismCardContent>
        </GlassmorphismCard>
    );
}
