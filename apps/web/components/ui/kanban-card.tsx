'use client';

import React from 'react';
import { GlassmorphismCard } from '@/components/ui/glassmorphism-card';
import { Badge } from '@/components/ui/badge';
import { TemperatureBadge } from '@/components/ui/temperature-badge';
import { WhatsAppWindowBadge } from '@/components/ui/whatsapp-window-badge';
import { LottieIcon } from '@/components/ui/lottie-icon';
import { DollarSign, MapPin, Calendar, Home, Flame, Instagram } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LeadTemperature } from '@/lib/temperature-config';

export interface KanbanLead {
    id: string;
    name: string;
    phone?: string;
    email?: string;
    interest?: string;
    budget?: string;
    status: string;
    priority?: 'low' | 'medium' | 'high';
    lastActivity?: string;
    assignedTo?: {
        name: string;
        avatar?: string;
    };
    tags?: string[];
    interestType?: string;
    objective?: 'morar' | 'investir' | 'morar_investir';
    purchaseTimeline?: string;
    knowsRegion?: boolean;
    cityOrigin?: string;
    classificationType?: string;
    isHot?: boolean;
    source?: string;
    instagramId?: string;
    temperature?: LeadTemperature;
    lastInteractionAt?: string;
}

interface KanbanCardProps {
    lead: KanbanLead;
    columnId: string;
    isDragging: boolean;
    onDragStart: (e: React.DragEvent, lead: KanbanLead, columnId: string) => void;
    onDragEnd: () => void;
    onClick: (lead: KanbanLead) => void;
}

function WhatsAppLogo({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
    );
}

export const KanbanCard = React.memo(function KanbanCard({
    lead,
    columnId,
    isDragging,
    onDragStart,
    onDragEnd,
    onClick,
}: KanbanCardProps) {
    return (
        <GlassmorphismCard
            variant="default"
            hoverable
            className={cn(
                "group relative cursor-pointer",
                "rounded-xl",
                "hover:scale-[1.02]",
                "transition-all duration-200",
                isDragging && "opacity-50 scale-95"
            )}
            draggable
            onDragStart={(e) => onDragStart(e, lead, columnId)}
            onDragEnd={onDragEnd}
            onClick={() => onClick(lead)}
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
                        <TemperatureBadge
                            temperature={lead.temperature || null}
                            size="sm"
                        />
                        {!lead.temperature && lead.isHot && (
                            <div className="p-1 bg-orange-100 rounded-lg">
                                <Flame className="w-3 h-3 text-orange-500" />
                            </div>
                        )}
                    </div>
                </div>

                {/* Details */}
                <div className="space-y-2">
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
    );
});
