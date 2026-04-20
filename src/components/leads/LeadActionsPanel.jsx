import React from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Loader2, Sparkles, Target, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';

/**
 * Unified action panel surfaced in both LeadSlideOver and LeadDetail.
 * - ICP score is deterministic and free (no AI credit shown).
 * - Analyse and Discover are AI-powered and display their credit cost.
 *
 * Props:
 *   onScoreIcp, onAnalyse, onDiscover  — async handlers
 *   scoring, analysing, discovering    — booleans (loading)
 *   disabled                           — global disable (job in flight)
 *   variant                            — "compact" (slide-over) or "full" (detail page)
 */
export default function LeadActionsPanel({
  onScoreIcp,
  onAnalyse,
  onDiscover,
  scoring = false,
  analysing = false,
  discovering = false,
  disabled = false,
  variant = 'compact',
}) {
  const { t } = useTranslation();
  const isFull = variant === 'full';

  const baseClass = isFull
    ? 'flex-col h-auto py-3 gap-1 text-center min-h-[88px] hover:scale-[1.02] active:scale-[0.98] transition-transform'
    : 'flex-col h-auto py-2 gap-0.5 text-center';

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={isFull ? 'rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-brand-sky/4 p-5 shadow-sm' : ''}
    >
      {isFull ? (
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Zap className="w-4 h-4 text-brand-sky" />
              {t('leads.leadActionsTitle', { defaultValue: 'Lead actions' })}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {t('leads.leadActionsSubtitle', {
                defaultValue: 'Deterministic ICP scoring is free. AI analysis and web discovery consume credits.',
              })}
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-2">
        {/* 1. Score ICP — deterministic, FREE */}
        <Button
          variant="outline"
          size="sm"
          onClick={onScoreIcp}
          disabled={scoring || disabled}
          className={baseClass}
          title={t('leads.scoreIcpDeterministicHint', { defaultValue: 'Deterministic score — no AI credit consumed.' })}
        >
          {scoring ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Target className={`${isFull ? 'w-5 h-5' : 'w-4 h-4'} text-brand-sky`} />
          )}
          <span className={`${isFull ? 'text-xs' : 'text-[11px]'} font-semibold leading-tight`}>
            {scoring ? t('leads.scoreIcpBtnLoading') : t('leads.scoreIcpBtn')}
          </span>
          <span className={`${isFull ? 'text-[10px]' : 'text-[9px]'} font-medium text-emerald-600`}>
            {t('leads.scoreIcpCost', { defaultValue: 'Free' })}
          </span>
        </Button>

        {/* 2. Analyser signaux — AI (3 credits) */}
        <Button
          size="sm"
          onClick={onAnalyse}
          disabled={analysing || disabled}
          className={baseClass}
          title={t('leads.analyseSignalsCost')}
        >
          {analysing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className={isFull ? 'w-5 h-5' : 'w-4 h-4'} />}
          <span className={`${isFull ? 'text-xs' : 'text-[11px]'} font-semibold leading-tight`}>
            {analysing ? t('leads.analyseSignalsBtnLoading') : t('leads.analyseSignalsBtn')}
          </span>
          <span className={`${isFull ? 'text-[10px]' : 'text-[9px]'} opacity-70`}>
            {t('leads.analyseSignalsCost')}
          </span>
        </Button>

        {/* 3. Discover web — AI (10 credits) */}
        <Button
          variant="outline"
          size="sm"
          onClick={onDiscover}
          disabled={discovering || disabled}
          className={baseClass}
          title={t('leads.discoverWebCost')}
        >
          {discovering ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Globe className={`${isFull ? 'w-5 h-5' : 'w-4 h-4'} text-emerald-600`} />
          )}
          <span className={`${isFull ? 'text-xs' : 'text-[11px]'} font-semibold leading-tight`}>
            {discovering ? t('leads.discoverWebBtnLoading') : t('leads.discoverWebBtn')}
          </span>
          <span className={`${isFull ? 'text-[10px]' : 'text-[9px]'} text-slate-400`}>
            {t('leads.discoverWebCost')}
          </span>
        </Button>
      </div>
    </motion.div>
  );
}
