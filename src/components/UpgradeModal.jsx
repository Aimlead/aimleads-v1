import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { X, Zap, ArrowRight } from 'lucide-react';
import { ROUTES } from '@/constants/routes';

export default function UpgradeModal() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    const handler = (e) => setDetail(e.detail ?? {});
    window.addEventListener('aimleads:insufficient-credits', handler);
    return () => window.removeEventListener('aimleads:insufficient-credits', handler);
  }, []);

  if (!detail) return null;

  const { balance = 0, required = 0, action = '' } = detail;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={() => setDetail(null)}
    >
      <div
        className="relative w-full max-w-md mx-4 rounded-2xl border border-white/10 bg-slate-900 shadow-2xl p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"
          onClick={() => setDetail(null)}
          aria-label={t('common.close', { defaultValue: 'Fermer' })}
        >
          <X className="w-5 h-5" />
        </button>

        {/* Icon */}
        <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-amber-500/10 border border-amber-500/20 mb-6">
          <Zap className="w-6 h-6 text-amber-400" />
        </div>

        <h2 className="text-xl font-bold text-white mb-2 tracking-tight">
          {t('upgrade.title', { defaultValue: 'Crédits insuffisants' })}
        </h2>

        <p className="text-sm text-slate-400 leading-relaxed mb-6">
          {required > 0
            ? t('upgrade.detailWithRequired', {
                defaultValue: `Cette action nécessite {{required}} crédit(s) mais votre solde est de {{balance}}. Passez à un plan supérieur pour continuer.`,
                required,
                balance,
              })
            : t('upgrade.detail', {
                defaultValue: `Votre solde de crédits est épuisé. Passez à un plan supérieur pour continuer à scorer, analyser et contacter vos leads.`,
                balance,
              })}
        </p>

        {/* Credit bar */}
        {required > 0 && (
          <div className="mb-6 rounded-lg border border-white/8 bg-white/4 p-3">
            <div className="flex justify-between text-xs text-slate-500 mb-2">
              <span>{t('upgrade.balance', { defaultValue: 'Solde actuel' })}</span>
              <span className="font-semibold text-white">{balance}</span>
            </div>
            <div className="flex justify-between text-xs text-slate-500">
              <span>{t('upgrade.required', { defaultValue: 'Requis' })}</span>
              <span className="font-semibold text-amber-400">{required}</span>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <button
            className="flex items-center justify-center gap-2 w-full rounded-xl bg-brand-sky hover:bg-sky-500 text-white font-semibold text-sm py-3 transition-colors"
            onClick={() => {
              setDetail(null);
              navigate(ROUTES.billing);
            }}
          >
            {t('upgrade.cta', { defaultValue: 'Voir les plans' })}
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            className="w-full rounded-xl border border-white/10 text-slate-400 hover:text-white text-sm py-2.5 transition-colors"
            onClick={() => setDetail(null)}
          >
            {t('upgrade.dismiss', { defaultValue: 'Pas maintenant' })}
          </button>
        </div>
      </div>
    </div>
  );
}
