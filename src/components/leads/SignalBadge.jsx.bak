import React from 'react';
import { cn } from '@/lib/utils';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react';

export default function SignalBadge({ signal }) {
  const isPositive = signal.type === 'positive';
  const isNeutral = signal.type === 'neutral';
  const hasPoints = Number.isFinite(signal.points);
  const pointsText = hasPoints ? `${signal.points > 0 ? '+' : ''}${signal.points}` : null;
  const sourceText = signal.source ? String(signal.source).toUpperCase() : null;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 hover:scale-105',
        isPositive
          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
          : isNeutral
            ? 'bg-slate-100 text-slate-700 border border-slate-200'
            : 'bg-rose-100 text-rose-800 border border-rose-200'
      )}
      title={signal.evidence ? `Evidence: ${signal.evidence}` : undefined}
    >
      {isPositive ? <TrendingUp className="w-3.5 h-3.5" /> : isNeutral ? <Minus className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
      <span>{signal.label}</span>
      {hasPoints && <span className="text-xs opacity-80">({pointsText})</span>}
      {sourceText && <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/10">{sourceText}</span>}
    </span>
  );
}
