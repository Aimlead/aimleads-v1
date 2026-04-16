import React from 'react';
import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const OPTIONS = [
  { value: 'fr', label: 'FR' },
  { value: 'en', label: 'EN' },
];

export default function LanguageSwitcher({ className = '', compact = false }) {
  const { i18n, t } = useTranslation();
  const currentLanguage = String(i18n.resolvedLanguage || i18n.language || 'fr').slice(0, 2).toLowerCase();

  return (
    <div
      className={`inline-flex items-center gap-1 rounded-2xl border border-slate-200 bg-white/90 p-1 shadow-sm backdrop-blur ${className}`.trim()}
      role="group"
      aria-label={t('common.languageSwitcherLabel', 'Language selector')}
    >
      {!compact && <Languages className="ml-1 h-4 w-4 text-slate-400" aria-hidden="true" />}
      {OPTIONS.map((option) => {
        const isActive = currentLanguage === option.value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => i18n.changeLanguage(option.value)}
            className={`rounded-xl px-2.5 py-1 text-xs font-semibold transition-colors ${
              isActive
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
            }`}
            aria-pressed={isActive}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
