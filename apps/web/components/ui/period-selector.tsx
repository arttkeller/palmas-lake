'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';

const PERIODS = [
  { value: 'today', label: 'Hoje' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: '90d', label: '90 dias' },
  { value: 'all', label: 'Tudo' },
] as const;

type PeriodValue = typeof PERIODS[number]['value'];

interface PeriodSelectorProps {
  className?: string;
}

export function PeriodSelector({ className = '' }: PeriodSelectorProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const current = (searchParams.get('period') || 'today') as PeriodValue;

  function handleChange(value: PeriodValue) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('period', value);
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div className={`inline-flex items-center gap-1 bg-gray-100 rounded-lg p-1 ${className}`}>
      {PERIODS.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => handleChange(value)}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
            current === value
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function usePeriod(): PeriodValue {
  const searchParams = useSearchParams();
  return (searchParams.get('period') || 'today') as PeriodValue;
}
