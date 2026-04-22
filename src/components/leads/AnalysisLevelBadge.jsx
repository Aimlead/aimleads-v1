import React from 'react';
import { BrainCircuit, Loader2, Radar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getLeadAnalysisLevelMeta } from '@/lib/leadPresentation';

const ICON_BY_LEVEL = {
  pending: Loader2,
  standard: Radar,
  deep: BrainCircuit,
  full: BrainCircuit,
};

export default function AnalysisLevelBadge({ lead, t, className = '' }) {
  const meta = getLeadAnalysisLevelMeta(lead, t);
  const Icon = ICON_BY_LEVEL[meta.level] || Radar;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold',
        meta.className,
        className
      )}
      title={meta.description}
    >
      <Icon className={cn('h-3.5 w-3.5', meta.level === 'pending' ? 'animate-spin' : '')} />
      {meta.label}
    </span>
  );
}
