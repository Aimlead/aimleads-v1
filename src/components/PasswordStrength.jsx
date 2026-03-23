import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';

const RULES = [
  { label: '8+ characters', test: (p) => p.length >= 8 },
  { label: 'Uppercase', test: (p) => /[A-Z]/.test(p) },
  { label: 'Number', test: (p) => /[0-9]/.test(p) },
  { label: 'Special char', test: (p) => /[^a-zA-Z0-9]/.test(p) },
];

const LEVELS = [
  { label: 'Too weak', color: 'bg-rose-400', text: 'text-rose-500' },
  { label: 'Weak', color: 'bg-orange-400', text: 'text-orange-500' },
  { label: 'Fair', color: 'bg-amber-400', text: 'text-amber-500' },
  { label: 'Good', color: 'bg-emerald-400', text: 'text-emerald-600' },
  { label: 'Strong', color: 'bg-emerald-500', text: 'text-emerald-700' },
];

export default function PasswordStrength({ password }) {
  const score = useMemo(() => RULES.filter((r) => r.test(password)).length, [password]);
  const level = LEVELS[score] || LEVELS[0];

  if (!password) return null;

  return (
    <div className="space-y-2 mt-1">
      {/* Bar */}
      <div className="flex gap-1">
        {RULES.map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full transition-all duration-300',
              i < score ? level.color : 'bg-slate-100'
            )}
          />
        ))}
      </div>

      {/* Label + rules */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          {RULES.map((rule) => (
            <span
              key={rule.label}
              className={cn(
                'text-[10px] font-medium transition-colors duration-200',
                rule.test(password) ? 'text-emerald-600' : 'text-slate-300'
              )}
            >
              ✓ {rule.label}
            </span>
          ))}
        </div>
        <span className={cn('text-[10px] font-semibold', level.text)}>{level.label}</span>
      </div>
    </div>
  );
}
