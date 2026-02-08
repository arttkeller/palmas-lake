'use client';

export default function ChatLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="fixed inset-0 pt-16 md:pt-20 pb-20 md:pb-24 px-4 md:px-8">
            {children}
        </div>
    );
}
