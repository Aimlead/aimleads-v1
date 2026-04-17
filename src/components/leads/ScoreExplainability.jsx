import React, { useState } from 'react';
import { ChevronDown, ChevronUp, HelpCircle, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

const DIM_LABELS = {
  industry: 'Secteur',
  role: 'Rôle / Fonction',
  company_type: 'Type société',
  company_size: 'Taille société',
  geography: 'Géographie',
  icp_fit: 'Adéquation ICP',
  intent: 'Intention',
  engagement: 'Engagement',
};

const dimLabel = (key) => DIM_LABELS[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const ScoreBar = ({ value, max = 100, color = 'bg-brand-sky' }) => {
  const pct = Math.max(0, Math.min(100, Math.round((Math.abs(value) / max) * 100)));
  const isNeg = value < 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', isNeg ? 'bg-rose-400' : color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={cn('text-xs font-semibold w-8 text-right tabular-nums', isNeg ? 'text-rose-600' : 'text-slate-700')}>
        {value > 0 ? `+${value}` : value}
      </span>
    </div>
  );
};

const blendFormula = (icpScore, aiScore, weights) => {
  const icpW = weights?.icp ?? 60;
  const aiW = weights?.ai ?? 40;
  const contrib = Math.round((icpScore ?? 0) * (icpW / 100) + (aiScore ?? 0) * (aiW / 100));
  return { icpW, aiW, contrib };
};

const signalDelta = (signals = []) => {
  let pos = 0;
  let neg = 0;
  signals.forEach((s) => {
    const conf = typeof s.confidence === 'number' ? s.confidence : 1;
    const w = conf > 1 ? conf / 100 : conf;
    if (String(s.type || '').toLowerCase() === 'positive') pos += w;
    else if (String(s.type || '').toLowerCase() === 'negative') neg += w;
  });
  return { pos: Math.round(pos * 10), neg: -Math.round(neg * 10) };
};

export default function ScoreExplainability({ lead }) {
  const [open, setOpen] = useState(false);

  const icpScore = typeof lead?.icp_score === 'number' ? lead.icp_score : null;
  const aiScore = typeof lead?.ai_score === 'number' ? lead.ai_score : null;
  const finalScore = typeof lead?.final_score === 'number' ? lead.final_score : null;
  const weights = lead?.scoring_weights ?? {};
  const details = lead?.score_details && typeof lead.score_details === 'object' ? lead.score_details : {};
  const detailEntries = Object.entries(details).filter(([, v]) => v?.points !== undefined);
  const { icpW, aiW } = blendFormula(icpScore, aiScore, weights);

  const allSignals = [
    ...(Array.isArray(lead?.signals) ? lead.signals : []),
    ...(Array.isArray(lead?.internet_signals) ? lead.internet_signals.map((s) => ({
      type: ['bankruptcy', 'closed', 'layoff'].some((t) => String(s?.key || s?.label || '').toLowerCase().includes(t)) ? 'negative' : 'positive',
      label: s?.label || s?.key,
      confidence: s?.confidence,
    })) : []),
  ];
  const { pos: sigPos, neg: sigNeg } = signalDelta(allSignals);

  const hasData = icpScore !== null || detailEntries.length > 0;
  if (!hasData && !finalScore) return null;

  const improvementTips = [];
  if (lead?.company_size === null || lead?.company_size === undefined)
    improvementTips.push('Renseigner la taille de l\'entreprise');
  if (!lead?.contact_role)
    improvementTips.push('Préciser le rôle du contact');
  if (!lead?.industry)
    improvementTips.push('Ajouter le secteur d\'activité');
  if (!lead?.website_url)
    improvementTips.push('Ajouter l\'URL du site (active les signaux internet)');
  if (allSignals.filter((s) => String(s?.type).toLowerCase() === 'positive').length === 0)
    improvementTips.push('Analyser le lead pour détecter des signaux IA');

  return (
    <div className="mt-3 border border-slate-200 rounded-lg overflow-hidden text-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
      >
        <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
          <HelpCircle className="w-3.5 h-3.5" />
          Pourquoi ce score ?
        </span>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
      </button>

      {open && (
        <div className="px-3 py-3 space-y-4 bg-white">

          {/* Blending formula */}
          {icpScore !== null && aiScore !== null && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1.5">Formule de calcul</p>
              <div className="flex items-center gap-2 text-xs text-slate-600 flex-wrap">
                <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-medium">
                  ICP {icpScore} × {icpW}%
                </span>
                <span className="text-slate-400">+</span>
                <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-700 font-medium">
                  Signaux {aiScore} × {aiW}%
                </span>
                <span className="text-slate-400">=</span>
                <span className="px-2.5 py-0.5 rounded bg-slate-900 text-white font-bold">
                  {finalScore ?? '—'}
                </span>
              </div>
            </div>
          )}

          {/* ICP dimension breakdown */}
          {detailEntries.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1.5">Détail ICP par dimension</p>
              <div className="space-y-1.5">
                {detailEntries.map(([key, entry]) => (
                  <div key={key}>
                    <div className="flex justify-between mb-0.5">
                      <span className="text-[11px] text-slate-500">{dimLabel(key)}</span>
                      {entry?.matched !== undefined && (
                        <span className={cn('text-[10px]', entry.matched ? 'text-emerald-600' : 'text-rose-500')}>
                          {entry.matched ? 'Correspond' : 'Ne correspond pas'}
                        </span>
                      )}
                    </div>
                    <ScoreBar value={entry.points} max={30} color="bg-blue-400" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Signal impact */}
          {(sigPos !== 0 || sigNeg !== 0) && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1.5">Impact signaux</p>
              <div className="space-y-1.5">
                {sigPos !== 0 && (
                  <div>
                    <div className="flex items-center gap-1 mb-0.5">
                      <TrendingUp className="w-3 h-3 text-emerald-500" />
                      <span className="text-[11px] text-slate-500">Signaux positifs</span>
                    </div>
                    <ScoreBar value={sigPos} max={30} color="bg-emerald-400" />
                  </div>
                )}
                {sigNeg !== 0 && (
                  <div>
                    <div className="flex items-center gap-1 mb-0.5">
                      <TrendingDown className="w-3 h-3 text-rose-500" />
                      <span className="text-[11px] text-slate-500">Signaux négatifs</span>
                    </div>
                    <ScoreBar value={sigNeg} max={30} />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Improvement tips */}
          {improvementTips.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1.5">
                Pour améliorer ce score
              </p>
              <ul className="space-y-1">
                {improvementTips.slice(0, 3).map((tip) => (
                  <li key={tip} className="flex items-start gap-1.5 text-[11px] text-slate-500">
                    <Minus className="w-3 h-3 mt-0.5 shrink-0 text-amber-500" />
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
