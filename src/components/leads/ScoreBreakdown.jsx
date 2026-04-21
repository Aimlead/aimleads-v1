import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, MinusCircle, ShieldAlert, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * ScoreBreakdown
 *
 * Explicit, trustworthy, actionable presentation of a lead's score.
 * Aligned with the canonical scoring model documented in
 * `docs/scoring-logic.md` and implemented in `server/services/analyzeService.js`:
 *
 *   - final_score = clamp(icp_score + ai_boost, 0, 100)
 *   - icp_score is deterministic across 5 ICP dimensions
 *   - ai_score / ai_boost reflect manual + internet intent signals
 *
 * The goal is not only to display a number, but to let the user understand
 * *why* a lead is prioritized (or not) — by criterion.
 */

const ICP_DIMENSIONS = [
  { key: 'industrie', labelKey: 'leads.icpDim.industry', fallback: 'Industry', fr: 'Industrie' },
  { key: 'roles', labelKey: 'leads.icpDim.role', fallback: 'Role', fr: 'Rôle contact' },
  { key: 'typeClient', labelKey: 'leads.icpDim.clientType', fallback: 'Client type', fr: 'Type de client' },
  { key: 'structure', labelKey: 'leads.icpDim.structure', fallback: 'Company structure', fr: 'Structure entreprise' },
  { key: 'geo', labelKey: 'leads.icpDim.geography', fallback: 'Geography', fr: 'Géographie' },
];

const MATCH_META = {
  parfait: {
    Icon: CheckCircle2,
    color: 'text-emerald-700',
    bg: 'bg-emerald-50 border-emerald-200',
    labelKey: 'leads.match.perfect',
    fallback: 'Perfect fit',
  },
  partiel: {
    Icon: MinusCircle,
    color: 'text-amber-700',
    bg: 'bg-amber-50 border-amber-200',
    labelKey: 'leads.match.partial',
    fallback: 'Partial fit',
  },
  aucun: {
    Icon: XCircle,
    color: 'text-rose-700',
    bg: 'bg-rose-50 border-rose-200',
    labelKey: 'leads.match.none',
    fallback: 'No fit',
  },
  exclu: {
    Icon: ShieldAlert,
    color: 'text-rose-800',
    bg: 'bg-rose-100 border-rose-300',
    labelKey: 'leads.match.excluded',
    fallback: 'Excluded by ICP',
  },
};

const getSaasGrade = (score) => {
  const n = Number(score);
  if (!Number.isFinite(n)) return 'N/A';
  if (n >= 90) return 'A+';
  if (n >= 80) return 'A';
  if (n >= 70) return 'B';
  if (n >= 60) return 'C';
  if (n >= 45) return 'D';
  return 'F';
};

const ScoreTile = ({ label, value, sub, tone = 'neutral' }) => {
  const toneClass =
    tone === 'positive'
      ? 'text-emerald-700'
      : tone === 'negative'
        ? 'text-rose-700'
        : tone === 'brand'
          ? 'text-brand-sky'
          : 'text-slate-900';
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`text-base font-semibold ${toneClass}`}>{value ?? '—'}</p>
      {sub ? <p className="text-[10px] text-slate-400">{sub}</p> : null}
    </div>
  );
};

const formatSignedNumber = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return null;
  const n = Number(value);
  if (n > 0) return `+${n}`;
  return `${n}`;
};

const buildWhyExplanation = ({
  t,
  finalScore,
  icpScore,
  aiBoost,
  finalCategory,
  finalAction,
  hasExclusion,
}) => {
  if (hasExclusion) {
    return t('leads.why.excluded', {
      defaultValue:
        'This lead is excluded because it matches a hard exclusion rule of your active ICP (industry or role).',
    });
  }

  const score = Number.isFinite(finalScore) ? finalScore : null;
  const boost = Number.isFinite(aiBoost) ? aiBoost : 0;

  if (score === null) {
    return t('leads.why.noAnalysis', {
      defaultValue: 'Run an analysis to compute the prioritization score for this lead.',
    });
  }

  const category = finalCategory || '—';
  const action = finalAction || '—';

  if (score >= 80) {
    return t('leads.why.excellent', {
      defaultValue:
        'Strong ICP fit (ICP {{icp}}/100) reinforced by intent signals ({{boost}} adjustment). Recommended action: {{action}}.',
      icp: icpScore ?? '—',
      boost: formatSignedNumber(boost) || '0',
      action,
    });
  }

  if (score >= 50) {
    return t('leads.why.strong', {
      defaultValue:
        'Solid ICP fit (ICP {{icp}}/100), priority {{category}}. Signal adjustment: {{boost}}. Suggested action: {{action}}.',
      icp: icpScore ?? '—',
      category,
      boost: formatSignedNumber(boost) || '0',
      action,
    });
  }

  if (score >= 20) {
    return t('leads.why.medium', {
      defaultValue:
        'Partial ICP fit (ICP {{icp}}/100). Useful for nurture, not for immediate outreach. Action: {{action}}.',
      icp: icpScore ?? '—',
      action,
    });
  }

  return t('leads.why.low', {
    defaultValue:
      'Low ICP fit (ICP {{icp}}/100). The lead does not match your active ICP and is not prioritized.',
    icp: icpScore ?? '—',
  });
};

const ScoreBreakdown = ({ lead, finalScore, icpScore, aiScore, aiBoost, scoreDetails }) => {
  const { t } = useTranslation();
  const [bilingualMode, setBilingualMode] = useState(false);

  const safeDetails = scoreDetails && typeof scoreDetails === 'object' ? scoreDetails : {};
  const finalCategory = lead?.final_category || lead?.category || null;
  const finalAction = lead?.final_recommended_action || lead?.recommended_action || null;
  const aiConfidence = Number.isFinite(Number(lead?.ai_confidence)) ? Number(lead.ai_confidence) : null;

  const hasExclusion = ICP_DIMENSIONS.some(
    ({ key }) => safeDetails?.[key]?.match === 'exclu',
  );

  const why = buildWhyExplanation({
    t,
    finalScore,
    icpScore,
    aiBoost,
    finalCategory,
    finalAction,
    hasExclusion,
  });
  const saasGrade = lead?.saas_grade || getSaasGrade(finalScore);

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-sm">
          {t('leads.scoreBreakdownTitle', { defaultValue: 'Score breakdown' })}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {/* Top-line scores: Final / ICP / Signal */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <ScoreTile
            label={t('leads.finalScore', { defaultValue: 'Final score' })}
            value={Number.isFinite(finalScore) ? `${finalScore}/100` : null}
            sub={finalCategory || undefined}
            tone="brand"
          />
          <ScoreTile
            label={t('leads.icpScore', { defaultValue: 'ICP score' })}
            value={Number.isFinite(icpScore) ? `${icpScore}/100` : null}
            sub={t('leads.icpDeterministic', { defaultValue: 'Deterministic fit' })}
          />
          <ScoreTile
            label={t('leads.signalScore', { defaultValue: 'Signal score' })}
            value={Number.isFinite(aiScore) ? `${aiScore}/100` : null}
            sub={
              aiConfidence !== null
                ? `${aiConfidence}% ${t('leads.confidenceShort', { defaultValue: 'conf.' })}`
                : t('leads.signalIntent', { defaultValue: 'Intent + internet' })
            }
          />
          <ScoreTile
            label={t('leads.saasGrade', { defaultValue: 'SaaS grade' })}
            value={saasGrade}
            sub={t('leads.saasGradeHint', { defaultValue: 'SDR-ready qualification grade' })}
            tone="brand"
          />
        </div>

        {/* Boost row */}
        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
          <span className="text-slate-500">
            {t('leads.aiBoost', { defaultValue: 'AI boost on ICP' })}
          </span>
          <span
            className={`font-semibold ${
              Number(aiBoost) > 0
                ? 'text-emerald-700'
                : Number(aiBoost) < 0
                  ? 'text-rose-700'
                  : 'text-slate-700'
            }`}
          >
            {formatSignedNumber(aiBoost) ?? '0'}
          </span>
        </div>

        {/* ICP dimensions breakdown */}
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {t('leads.icpBreakdownTitle', { defaultValue: 'ICP breakdown by criterion' })}
            </p>
            <button
              type="button"
              onClick={() => setBilingualMode((prev) => !prev)}
              className="rounded-md border border-slate-200 px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-slate-50"
            >
              {bilingualMode
                ? t('leads.singleLanguage', { defaultValue: 'Single language' })
                : t('leads.bilingualView', { defaultValue: 'FR + EN' })}
            </button>
          </div>
          <div className="space-y-1.5">
            {ICP_DIMENSIONS.map(({ key, labelKey, fallback }) => {
              const entry = safeDetails?.[key];
              const match = entry?.match;
              const points = Number.isFinite(Number(entry?.points)) ? Number(entry.points) : null;
              const meta = match ? MATCH_META[match] : null;
              const Icon = meta?.Icon;
              const evaluatedValue = entry?.evaluated_value ?? '—';
              const scoreWeights = entry?.weights || null;
              const localizedLabel = t(labelKey, { defaultValue: fallback });
              const bilingualLabel = `${fallback} / ${ICP_DIMENSIONS.find((item) => item.key === key)?.fr || fallback}`;
              const matchLabel = meta ? t(meta.labelKey, { defaultValue: meta.fallback }) : t('leads.match.notEvaluated', { defaultValue: 'Not evaluated' });
              const bilingualMatch = meta
                ? `${meta.fallback} / ${
                  ({
                    parfait: 'Correspondance parfaite',
                    partiel: 'Correspondance partielle',
                    aucun: 'Pas de correspondance',
                    exclu: 'Exclu par ICP',
                  })[match] || meta.fallback
                }`
                : 'Not evaluated / Non évalué';

              return (
                <div
                  key={key}
                  className={`flex items-center justify-between rounded-md border px-2.5 py-1.5 text-xs ${
                    meta?.bg || 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {Icon ? (
                      <Icon className={`w-3.5 h-3.5 ${meta.color}`} aria-hidden="true" />
                    ) : (
                      <span className="w-3.5 h-3.5 inline-block" aria-hidden="true" />
                    )}
                    <span className="font-medium text-slate-800 truncate">
                      {bilingualMode ? bilingualLabel : localizedLabel}
                    </span>
                    <span className={`text-[10px] font-medium ${meta?.color || 'text-slate-400'}`}>
                      · {bilingualMode ? bilingualMatch : matchLabel}
                    </span>
                  </div>
                  <span
                    className={`font-semibold tabular-nums ${
                      points === null
                        ? 'text-slate-400'
                        : points > 0
                          ? 'text-emerald-700'
                          : points < 0
                            ? 'text-rose-700'
                            : 'text-slate-600'
                    }`}
                  >
                    {points === null ? '—' : formatSignedNumber(points)}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            {t('leads.weightLegend', { defaultValue: 'Each ICP field shows lead value + per-level weights used by scoring.' })}
          </p>
          <div className="mt-2 space-y-1">
            {ICP_DIMENSIONS.map(({ key, labelKey, fallback }) => {
              const entry = safeDetails?.[key];
              if (!entry) return null;
              const weights = entry?.weights || {};
              return (
                <div key={`${key}-weights`} className="rounded-md border border-slate-200 px-2.5 py-1.5 text-[11px] text-slate-600">
                  <span className="font-medium text-slate-700">{t(labelKey, { defaultValue: fallback })}:</span>{' '}
                  {t('leads.leadValue', { defaultValue: 'Lead value' })} <span className="font-medium text-slate-800">{String(entry?.evaluated_value ?? '—')}</span>
                  {' · '}
                  {t('leads.weightsLabel', { defaultValue: 'Weights' })} P:{formatSignedNumber(weights?.parfait) ?? '—'}
                  {' / '}S:{formatSignedNumber(weights?.partiel) ?? '—'}
                  {' / '}N:{formatSignedNumber(weights?.aucun) ?? '—'}
                </div>
              );
            })}
          </div>
        </div>

        {/* Why prioritized? */}
        <div className="rounded-lg border border-brand-sky/20 bg-brand-sky/5 px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-sky mb-1">
            {t('leads.whyPrioritized', { defaultValue: 'Why this priority?' })}
          </p>
          <p className="text-xs text-slate-700 leading-relaxed">{why}</p>
        </div>

        {/* Recommended action */}
        <div className="text-xs text-slate-600 space-y-1">
          <p>
            {t('leads.categoryLabel', { defaultValue: 'Category' })}:{' '}
            <span className="text-slate-800 font-medium">{finalCategory || 'N/A'}</span>
          </p>
          <p>
            {t('leads.suggestedAction', { defaultValue: 'Suggested action' })}:{' '}
            <span className="text-emerald-700 font-medium">{finalAction || 'N/A'}</span>
          </p>
          <p className="text-[11px] text-slate-400">
            {t('leads.finalScoreFormula', {
              defaultValue:
                'Final score = deterministic ICP + intent signals (manual + internet)',
            })}
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default ScoreBreakdown;
