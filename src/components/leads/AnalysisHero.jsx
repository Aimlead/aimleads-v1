import React from 'react';
import { ArrowRight, Sparkles, Target, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ScoreGauge from '@/components/leads/ScoreGauge';
import AnalysisLevelBadge from '@/components/leads/AnalysisLevelBadge';
import { getLeadPrimaryActionText, getLeadScores, getLeadTopSignals, getLeadWhyItMatters } from '@/lib/leadPresentation';

export default function AnalysisHero({
  lead,
  t,
  primaryAction = null,
  secondaryAction = null,
  compact = false,
}) {
  const { icpScore, aiScore, finalScore, aiBoost } = getLeadScores(lead);
  const whyItMatters = getLeadWhyItMatters(lead, t);
  const topSignals = getLeadTopSignals(lead);
  const nextActionText = getLeadPrimaryActionText(lead, t);
  const showExtendedMetrics = !compact;

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white shadow-xl">
      <div className={`grid gap-5 ${compact ? 'p-4 lg:grid-cols-[150px_1fr]' : 'p-5 lg:grid-cols-[180px_1fr]'}`}>
        <div className="flex items-center justify-center">
          <ScoreGauge
            score={finalScore}
            size={compact ? 'small' : 'large'}
            label={t('leads.finalScore', { defaultValue: 'Final score' })}
            category={lead?.final_category}
          />
        </div>

        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <AnalysisLevelBadge lead={lead} t={t} />
                {lead?.final_category ? (
                  <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-200">
                    {lead.final_category}
                  </span>
                ) : null}
              </div>
              <h2 className={`${compact ? 'text-lg' : 'text-2xl'} font-bold tracking-tight`}>
                {t('leads.heroTitle', {
                  defaultValue: 'Why this lead deserves attention',
                })}
              </h2>
              {showExtendedMetrics ? <p className="max-w-3xl text-sm leading-6 text-slate-300">{whyItMatters}</p> : null}
            </div>
          </div>

          {showExtendedMetrics ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <p className="text-[11px] uppercase tracking-wide text-slate-400">{t('leads.icpBase', { defaultValue: 'ICP base' })}</p>
                <p className="mt-1 text-lg font-semibold text-white">{icpScore ?? 'n/a'}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <p className="text-[11px] uppercase tracking-wide text-slate-400">{t('leads.aiScore', { defaultValue: 'AI score' })}</p>
                <p className="mt-1 text-lg font-semibold text-white">{aiScore ?? 'n/a'}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <p className="text-[11px] uppercase tracking-wide text-slate-400">{t('leads.aiBoost', { defaultValue: 'AI boost' })}</p>
                <p className={`mt-1 text-lg font-semibold ${aiBoost > 0 ? 'text-emerald-300' : aiBoost < 0 ? 'text-rose-300' : 'text-white'}`}>
                  {aiBoost === null ? 'n/a' : aiBoost > 0 ? `+${aiBoost}` : aiBoost}
                </p>
              </div>
            </div>
          ) : null}

          {showExtendedMetrics ? (
            <div className="grid gap-3 lg:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Target className="h-4 w-4 text-sky-300" />
                {t('leads.heroWhyTitle', { defaultValue: 'Why this lead' })}
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-300">{whyItMatters}</p>
            </div>

            {showExtendedMetrics ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Sparkles className="h-4 w-4 text-emerald-300" />
                  {t('leads.heroSignalsTitle', { defaultValue: 'Signals to keep' })}
                </div>
                {topSignals.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {topSignals.map((signal) => (
                      <span key={signal} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-200">
                        {signal}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    {t('leads.heroSignalsEmpty', {
                      defaultValue: 'No standout signal yet. Use the score and baseline fit to decide the next move.',
                    })}
                  </p>
                )}
              </div>
            ) : null}

            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Zap className="h-4 w-4 text-amber-300" />
                {t('leads.heroActionTitle', { defaultValue: 'Next best action' })}
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                {nextActionText}
              </p>
              {(primaryAction || secondaryAction) ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {primaryAction ? (
                    <Button onClick={primaryAction.onClick} size="sm" className="gap-2 bg-white text-slate-900 hover:bg-slate-100">
                      {primaryAction.label}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                  {secondaryAction ? (
                    <Button onClick={secondaryAction.onClick} size="sm" variant="outline" className="gap-2 border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white">
                      {secondaryAction.label}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
