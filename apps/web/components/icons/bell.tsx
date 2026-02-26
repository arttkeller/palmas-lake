'use client';

import { BellIcon as BellAnimatedIcon } from '@/components/ui/bell';

function BellIcon({ className }: { className?: string }) {
    return <BellAnimatedIcon className={className} size={20} />;
}

export { BellIcon };
export default BellIcon;
