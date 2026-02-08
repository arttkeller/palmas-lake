'use client';

import React from 'react';

export default function AgendamentosLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="fixed inset-0 pt-12 md:pt-14 pb-20 md:pb-24 overflow-hidden">
            {children}
        </div>
    );
}
