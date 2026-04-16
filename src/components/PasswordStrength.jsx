import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export default function PasswordStrength({ password }) {
  const { t } = useTranslation();
  const rules = useMemo(() => ([
    { label: t('passwordStrength.rules.length', { defaultValue: '8+ characters' }), test: (p) => p.length >= 8 },
    { label: t('passwordStrength.rules.uppercase', { defaultValue: 'Uppercase' }), test: (p) => /[A-Z]/.test(p) },
    { label: t('passwordStrength.rules.number', { defaultValue: 'Number' }), test: (p) => /[0-9]/.test(p) },
    { label: t('passwordStrength.rules.special', { defaultValue: 'Special char' }), test: (p) => /[^a-zA-Z0-9]/.test(p) },
  ]), [t]);
  const levels = useMemo(() => ([
    { label: t('passwordStrength.levels.tooWeak', { defaultValue: 'Too weak' }), color: 'bg-rose-400', text: 'text-rose-500' },
    { label: t('passwordStrength.levels.weak', { defaultValue: 'Weak' }), color: 'bg-orange-400', text: 'text-orange-500' },
    { label: t('passwordStrength.levels.fair', { defaultValue: 'Fair' }), color: 'bg-amber-400', text: 'text-amber-500' },
    { label: t('passwordStrength.levels.good', { defaultValue: 'Good' }), color: 'bg-emerald-400', text: 'text-emerald-600' },
    { label: t('passwordStrength.levels.strong', { defaultValue: 'Strong' }), color: 'bg-emerald-500', text: 'text-emerald-700' },
  ]), [t]);
  const score = useMemo(() => rules.filter((r) => r.test(password)).length, [password, rules]);
  const level = levels[score] || levels[0];

  if (!password) return null;

  return (
    <div className="space-y-2 mt-1">
      {/* Bar */}
      <div className="flex gap-1">
        {rules.map((_, i) => (
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
          {rules.map((rule) => (
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
