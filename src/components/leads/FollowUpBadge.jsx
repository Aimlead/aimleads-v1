import React from 'react';
import { CheckCircle2, Clock, MessageCircle, Phone, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FOLLOW_UP_STATUS } from '@/constants/leads';

const STATUS_CONFIG = {
  [FOLLOW_UP_STATUS.TO_CONTACT]: {
    bg: 'bg-sky-50',
    text: 'text-sky-600',
    ring: 'ring-sky-200',
    icon: Phone,
  },
  [FOLLOW_UP_STATUS.CONTACTED]: {
    bg: 'bg-indigo-50',
    text: 'text-indigo-600',
    ring: 'ring-indigo-200',
    icon: MessageCircle,
  },
  [FOLLOW_UP_STATUS.REPLY_PENDING]: {
    bg: 'bg-amber-50',
    text: 'text-amber-600',
    ring: 'ring-amber-200',
    icon: Clock,
  },
  [FOLLOW_UP_STATUS.CLOSED_WON]: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    ring: 'ring-emerald-200',
    icon: CheckCircle2,
  },
  [FOLLOW_UP_STATUS.CLOSED_LOST]: {
    bg: 'bg-slate-50',
    text: 'text-slate-600',
    ring: 'ring-slate-200',
    icon: XCircle,
  },
};

export default function FollowUpBadge({ status }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG[FOLLOW_UP_STATUS.TO_CONTACT];
  const Icon = config.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ring-1 ring-inset',
        config.bg,
        config.text,
        config.ring
      )}
    >
      <Icon className="w-3 h-3" />
      {status}
    </span>
  );
}
