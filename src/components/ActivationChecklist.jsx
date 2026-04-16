import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, CheckCircle2, ChevronDown, ChevronUp, ListChecks } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ACTIVATION_CHECKLIST_STORAGE_KEY } from '@/constants/activation';
import { cn } from '@/lib/utils';

const readCollapsedState = () => {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(ACTIVATION_CHECKLIST_STORAGE_KEY) === '1';
};

export default function ActivationChecklist({ title, steps = [] }) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(readCollapsedState);
  const completedCount = useMemo(() => steps.filter((step) => step.complete).length, [steps]);
  const totalCount = steps.length;
  const progress = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);
  const resolvedTitle = title || t('activationChecklist.title', { defaultValue: 'Activation Checklist' });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (collapsed) {
      window.localStorage.setItem(ACTIVATION_CHECKLIST_STORAGE_KEY, '1');
      return;
    }
    window.localStorage.removeItem(ACTIVATION_CHECKLIST_STORAGE_KEY);
  }, [collapsed]);

  useEffect(() => {
    if (completedCount === totalCount) {
      setCollapsed(false);
    }
  }, [completedCount, totalCount]);

  if (totalCount === 0 || completedCount === totalCount) {
    return null;
  }

  if (collapsed) {
    return (
      <motion.button
        type="button"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={() => setCollapsed(false)}
        className="w-full mb-5 rounded-2xl border border-brand-sky/15 bg-gradient-to-r from-brand-sky/8 to-sky-50 px-4 py-3 text-left shadow-sm transition-colors hover:border-brand-sky/25"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-sky text-white shadow-sm">
            <ListChecks className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">{resolvedTitle}</p>
            <p className="text-xs text-slate-500">
              {t('activationChecklist.collapsedSummary', {
                defaultValue: '{{completed}}/{{total}} complete. Resume setup.',
                completed: completedCount,
                total: totalCount,
              })}
            </p>
          </div>
          <ChevronDown className="h-4 w-4 text-slate-400" />
        </div>
      </motion.button>
    );
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-5 overflow-hidden rounded-3xl border border-brand-sky/15 bg-gradient-to-br from-white via-sky-50/60 to-white shadow-sm"
    >
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-sky to-brand-sky-2 text-white shadow-sm">
              <ListChecks className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">{resolvedTitle}</p>
              <p className="text-sm text-slate-500">
                {t('activationChecklist.subtitle', {
                  defaultValue: 'Follow the next best action to reach first value faster.',
                })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-semibold text-slate-900">
                {t('activationChecklist.progressSummary', {
                  defaultValue: '{{completed}}/{{total}} complete',
                  completed: completedCount,
                  total: totalCount,
                })}
              </p>
              <p className="text-xs text-slate-500">
                {t('activationChecklist.progressPercent', {
                  defaultValue: '{{progress}}% activated',
                  progress,
                })}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-700"
            >
              <span className="inline-flex items-center gap-1.5">
                {t('activationChecklist.hide', { defaultValue: 'Hide' })}
                <ChevronUp className="h-3.5 w-3.5" />
              </span>
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="h-2 rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-sky to-brand-sky-2 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-slate-500">
            {t('activationChecklist.helper', {
              defaultValue: 'Complete ICP setup, import, first analysis, and first follow-up to fully unlock the workflow.',
            })}
          </p>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <div
                key={step.id}
                className={cn(
                  'rounded-2xl border px-4 py-4 shadow-sm transition-colors',
                  step.complete
                    ? 'border-emerald-200 bg-emerald-50/80'
                    : 'border-slate-200 bg-white'
                )}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      'mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl',
                      step.complete ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600'
                    )}
                  >
                    {step.complete ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">{step.title}</p>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                          step.complete ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                        )}
                      >
                        {step.complete
                          ? t('activationChecklist.status.done', { defaultValue: 'Done' })
                          : t('activationChecklist.status.next', { defaultValue: 'Next' })}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{step.description}</p>
                    {!step.complete && step.actionLabel && (
                      <Button
                        size="sm"
                        className="mt-3 gap-1.5 rounded-xl bg-gradient-to-r from-brand-sky to-brand-sky-2"
                        disabled={step.disabled}
                        onClick={step.onAction}
                      >
                        {step.actionLabel}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </motion.section>
  );
}
