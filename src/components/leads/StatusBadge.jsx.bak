import React from 'react';
import { CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LEAD_STATUS } from '@/constants/leads';

const STATUS_CONFIG = {
  [LEAD_STATUS.TO_ANALYZE]: {
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    ring: 'ring-blue-300',
    icon: Clock,
  },
  [LEAD_STATUS.PROCESSING]: {
    bg: 'bg-amber-100',
    text: 'text-amber-800',
    ring: 'ring-amber-300',
    icon: Loader2,
    animate: true,
  },
  [LEAD_STATUS.QUALIFIED]: {
    bg: 'bg-emerald-100',
    text: 'text-emerald-800',
    ring: 'ring-emerald-300',
    icon: CheckCircle2,
  },
  [LEAD_STATUS.REJECTED]: {
    bg: 'bg-rose-100',
    text: 'text-rose-800',
    ring: 'ring-rose-300',
    icon: XCircle,
  },
  [LEAD_STATUS.ERROR]: {
    bg: 'bg-slate-100',
    text: 'text-slate-800',
    ring: 'ring-slate-300',
    icon: XCircle,
  },
};

export default function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG[LEAD_STATUS.TO_ANALYZE];
  const Icon = config.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ring-1 ring-inset',
        config.bg,
        config.text,
        config.ring
      )}
    >
      <Icon className={cn('w-3.5 h-3.5', config.animate && 'animate-spin')} />
      {status}
    </span>
  );
}
