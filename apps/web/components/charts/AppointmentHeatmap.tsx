'use client';

import React, { useRef, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { interpolateRgb } from 'd3-interpolate';
import { EmptyChartState, isChartDataEmpty, MIN_CHART_HEIGHT, MIN_CHART_WIDTH } from './EmptyChartState';
import { ClockIcon } from '@/components/icons/animated';

interface HeatmapProps {
    data?: {
        heatmap?: { dow: number; hour: number; value: number }[];
    }
}

const DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

/**
 * AppointmentHeatmap Component
 * 
 * Requirements: 2.1 - Render placeholder visualization without throwing errors for empty/undefined data
 * Requirements: 2.2 - Display chart with appropriate empty state styling for zero values
 * Requirements: 2.3 - Use minimum fallback dimensions for ResponsiveContainer
 */
/**
 * HeatmapCell - Individual cell with smart tooltip positioning
 * Detects if tooltip would overflow the container and repositions accordingly.
 * Requirements: 9.1, 9.2
 */
function HeatmapCell({ value, hour, color, isNearRightEdge }: {
    value: number;
    hour: number;
    color: string;
    isNearRightEdge: boolean;
}) {
    const [showTooltip, setShowTooltip] = useState(false);
    const cellRef = useRef<HTMLDivElement>(null);
    const [tooltipLeft, setTooltipLeft] = useState(false);

    const handleMouseEnter = useCallback(() => {
        if (value <= 0) return;
        // Check if tooltip would clip on the right
        if (isNearRightEdge) {
            setTooltipLeft(true);
        } else if (cellRef.current) {
            const rect = cellRef.current.getBoundingClientRect();
            const spaceRight = window.innerWidth - rect.right;
            // Tooltip is ~120px wide; if less space than that, flip left
            setTooltipLeft(spaceRight < 120);
        }
        setShowTooltip(true);
    }, [value, isNearRightEdge]);

    const handleMouseLeave = useCallback(() => {
        setShowTooltip(false);
    }, []);

    return (
        <div
            ref={cellRef}
            className="flex-1 aspect-square mx-[1px] rounded-sm relative cursor-pointer"
            style={{ backgroundColor: color }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            {value > 0 && showTooltip && (
                <div
                    className={`absolute bottom-full mb-1 z-50 bg-gray-900 text-white text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap pointer-events-none ${
                        tooltipLeft
                            ? 'right-0'
                            : 'left-1/2 -translate-x-1/2'
                    }`}
                >
                    {value} leads às {hour}h
                </div>
            )}
        </div>
    );
}

export default function AppointmentHeatmap({ data }: HeatmapProps) {
    const rawData = data?.heatmap || [];
    const isEmpty = isChartDataEmpty(rawData);

    // Transform raw data into a matrix
    // dow: 0=Mon, 6=Sun
    const matrix = Array.from({ length: 7 }, () => Array(24).fill(0));
    let maxValue = 0;

    rawData.forEach(item => {
        if (item.dow >= 0 && item.dow <= 6 && item.hour >= 0 && item.hour <= 23) {
            matrix[item.dow][item.hour] = item.value || 0;
            if ((item.value || 0) > maxValue) maxValue = item.value || 0;
        }
    });

    // Check if all values are zero
    const hasOnlyZeroValues = !isEmpty && maxValue === 0;

    const getColor = (value: number) => {
        if (value === 0) return '#f3f4f6'; // gray-100
        const intensity = value / (maxValue || 1);
        // Green scale: light green to dark green
        return interpolateRgb('#dcfce7', '#15803d')(intensity); // green-100 to green-700
    };

    return (
        <Card className="col-span-1 lg:col-span-2">
            <CardHeader>
                <div className="flex items-center gap-2">
                    <ClockIcon size={20} />
                    <CardTitle className="text-gray-900">Mapa de Calor de Agendamentos</CardTitle>
                </div>
                <CardDescription className="text-gray-900">Melhores horários de engajamento e conversão</CardDescription>
            </CardHeader>
            <CardContent>
                {isEmpty || hasOnlyZeroValues ? (
                    <EmptyChartState 
                        height={200} 
                        message={hasOnlyZeroValues ? "Todos os valores são zero" : "Nenhum dado de agendamento disponível"} 
                    />
                ) : (
                    <div className="overflow-x-auto" style={{ minHeight: MIN_CHART_HEIGHT, minWidth: MIN_CHART_WIDTH }}>
                        <div className="min-w-[600px]">
                            {/* Header Hours - show every 3 hours with larger readable font */}
                            {/* Requirements: 9.3 */}
                            <div className="flex">
                                <div className="w-10"></div> {/* Spacer for Day labels */}
                                {HOURS.map(hour => (
                                    <div key={hour} className="flex-1 text-center text-gray-500">
                                        {hour % 3 === 0 ? (
                                            <span className="text-xs font-medium">{hour}h</span>
                                        ) : null}
                                    </div>
                                ))}
                            </div>

                            {/* Rows */}
                            {DAYS.map((day, dIndex) => (
                                <div key={day} className="flex items-center mt-1">
                                    <div className="w-10 text-xs font-medium text-gray-500">{day}</div>
                                    {HOURS.map((hour) => {
                                        const value = matrix[dIndex][hour];
                                        return (
                                            <HeatmapCell
                                                key={`${day}-${hour}`}
                                                value={value}
                                                hour={hour}
                                                color={getColor(value)}
                                                isNearRightEdge={hour >= 20}
                                            />
                                        );
                                    })}
                                </div>
                            ))}

                            {/* Legend */}
                            <div className="flex items-center justify-end gap-2 mt-4 text-xs text-gray-500">
                                <span>Menos</span>
                                <div className="w-20 h-2 rounded bg-gradient-to-r from-green-100 to-green-700"></div>
                                <span>Mais</span>
                            </div>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
