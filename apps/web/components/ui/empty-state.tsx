import { cn } from '@/lib/utils';
import { Inbox, Search, MessageCircle } from 'lucide-react';

interface EmptyStateProps {
    icon?: 'inbox' | 'search' | 'message';
    title: string;
    description?: string;
    className?: string;
}

const iconMap = {
    inbox: Inbox,
    search: Search,
    message: MessageCircle,
};

export function EmptyState({ icon = 'inbox', title, description, className }: EmptyStateProps) {
    const Icon = iconMap[icon];

    return (
        <div className={cn("flex flex-col items-center justify-center py-12 px-4", className)}>
            <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
                <Icon className="w-8 h-8 text-muted-foreground/50" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            {description && (
                <p className="text-xs text-muted-foreground/70 mt-1">{description}</p>
            )}
        </div>
    );
}
