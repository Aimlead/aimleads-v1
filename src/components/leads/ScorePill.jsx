import React from 'react';
import { cn } from '@/lib/utils';

export default function ScorePill({ score }) {
  const getScoreConfig = (value) => {
    if (value === null || value === undefined) {
      return { bg: 'bg-slate-100', text: 'text-slate-500', ring: 'ring-slate-200' };
    }
    if (value > 75) {
      return { bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-200' };
    }
    if (value >= 50) {
      return { bg: 'bg-amber-50', text: 'text-amber-700', ring: 'ring-amber-200' };
    }
    return { bg: 'bg-rose-50', text: 'text-rose-600', ring: 'ring-rose-200' };
  };

  const config = getScoreConfig(score);

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-bold ring-1 ring-inset tabular-nums',
        config.bg,
        config.text,
        config.ring
      )}
    >
      {score !== null && score !== undefined ? score : '-'}
    </span>
  );
}
