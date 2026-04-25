import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import LanguageSwitcher from '@/components/ui/LanguageSwitcher';
import { ROUTES } from '@/constants/routes';
import { Search, UserCog, Zap } from 'lucide-react';
import { dataClient } from '@/services/dataClient';
import BrandLogo from '@/components/brand/BrandLogo';

const formatCompactCount = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '0';
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(parsed);
};

const resolveBadgeState = ({ creditsData, t }) => {
  if (creditsData === null) {
    return {
      to: ROUTES.billing,
      tone: 'bg-slate-50 border-slate-200 text-slate-400',
      iconTone: 'text-slate-300',
      label: '—',
      title: t('nav.creditsUnavailable'),
    };
  }

  const balance = Number(creditsData?.balance ?? 0);
  const usage = creditsData?.usage || {};
  const entitlements = creditsData?.entitlements || {};
  const planSlug = creditsData?.plan?.plan_slug ?? entitlements?.plan_slug ?? 'free';
  const planName = t(`billing.planNames.${planSlug}`, {
    defaultValue: entitlements?.plan_name || planSlug,
  });
  const seatsIncluded = Number(usage?.seats_included ?? entitlements?.seats_included ?? 1);
  const seatsRemaining = Number(usage?.seats_remaining ?? Math.max(0, seatsIncluded - Number(usage?.seats_used ?? 0)));
  const crmSlotsIncluded = Number(usage?.crm_slots_included ?? entitlements?.crm_integrations ?? 0);
  const crmSlotsRemaining = Number(
    usage?.crm_slots_remaining ?? Math.max(0, crmSlotsIncluded - Number(usage?.crm_slots_used ?? 0))
  );

  if (balance <= 0) {
    return {
      to: ROUTES.billing,
      tone: 'bg-red-50 border-red-200 text-red-600',
      iconTone: 'text-red-500',
      label: t('nav.badges.noCredits'),
      title: t('nav.badges.noCreditsTitle'),
    };
  }

  if (seatsIncluded > 0 && seatsRemaining <= 0) {
    return {
      to: ROUTES.team,
      tone: 'bg-amber-50 border-amber-200 text-amber-700',
      iconTone: 'text-amber-500',
      label: t('nav.badges.teamFull'),
      title: t('nav.badges.teamFullTitle'),
    };
  }

  if (crmSlotsIncluded > 0 && crmSlotsRemaining <= 0) {
    return {
      to: ROUTES.crmIntegration,
      tone: 'bg-amber-50 border-amber-200 text-amber-700',
      iconTone: 'text-amber-500',
      label: t('nav.badges.crmFull'),
      title: t('nav.badges.crmFullTitle'),
    };
  }

  if (balance <= 100 || Number(usage?.usage_percent ?? 0) >= 85) {
    return {
      to: ROUTES.billing,
      tone: 'bg-amber-50 border-amber-200 text-amber-700',
      iconTone: 'text-amber-500',
      label: t('nav.badges.lowCredits', { count: formatCompactCount(balance) }),
      title: t('nav.badges.lowCreditsTitle', { count: balance }),
    };
  }

  return {
    to: ROUTES.billing,
    tone: 'bg-slate-50 border-slate-200 text-slate-600',
    iconTone: 'text-slate-400',
    label: t('nav.badges.planHealthy', { plan: planName, count: formatCompactCount(balance) }),
    title: t('nav.badges.planHealthyTitle', { plan: planName, count: balance }),
  };
};

function CreditBadge() {
  const [creditsData, setCreditsData] = useState(undefined);
  const { t } = useTranslation();

  useEffect(() => {
    let cancelled = false;
    dataClient.workspace.getCredits()
      .then((res) => {
        if (!cancelled) setCreditsData(res ?? null);
      })
      .catch(() => {
        if (!cancelled) setCreditsData(null);
      });
    return () => { cancelled = true; };
  }, []);

  // Still loading — render nothing until we know
  if (creditsData === undefined) return null;

  const badgeState = resolveBadgeState({ creditsData, t });

  return (
    <Link
      to={badgeState.to}
      title={badgeState.title}
      className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs font-medium transition-opacity hover:opacity-80 ${badgeState.tone}`}
    >
      <Zap className={`w-3.5 h-3.5 sm:w-3 sm:h-3 ${badgeState.iconTone}`} />
      <span className="hidden sm:inline">{badgeState.label}</span>
    </Link>
  );
}

export default function Header({ user, onSignOut, onOpenPalette, bannerOffset = 0 }) {
  const { t } = useTranslation();

  return (
    <header className="fixed left-0 md:left-64 right-0 h-16 border-b border-[#e6e4df] z-40" style={{ top: bannerOffset, background: 'rgba(247,247,245,0.92)', backdropFilter: 'blur(16px) saturate(1.2)', WebkitBackdropFilter: 'blur(16px) saturate(1.2)', boxShadow: '0 1px 0 rgba(26,18,0,0.05)' }}>
      <div className="h-full px-2 md:px-6 flex items-center justify-between gap-2 md:gap-3">

        <div className="flex items-center gap-1 md:gap-3 min-w-0">
          {/* Desktop: logo top-left */}
          <Link to={ROUTES.dashboard} className="hidden md:flex items-center gap-2 flex-shrink-0 mr-1">
            <img src="/brand/aimleads-mark.png" alt="AimLeads" style={{ height: 22, width: 'auto' }} />
            <span className="text-sm font-bold text-slate-800 tracking-tight">AimLeads</span>
          </Link>
          <button
            onClick={onOpenPalette}
            className="hidden md:flex items-center gap-2 px-3 py-2 rounded-lg bg-white hover:bg-[#fbfaf8] border border-[#e6e4df] text-slate-500 text-sm transition-all duration-150 group"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="text-xs pr-4">{t('nav.searchPlaceholder')}</span>
            <kbd className="text-[10px] bg-[#f7f5f0] border border-[#e6e4df] rounded px-1.5 py-0.5 font-medium text-slate-500">⌘K</kbd>
          </button>
          {/* Mobile: search icon button */}
          <button
            onClick={onOpenPalette}
            className="md:hidden flex items-center justify-center w-9 h-9 rounded-xl bg-white border border-[#e6e4df] text-slate-500 hover:bg-[#fbfaf8] transition-colors flex-shrink-0"
            aria-label={t('nav.searchPlaceholder')}
          >
            <Search className="w-4 h-4" />
          </button>
        </div>

        {/* Mobile: centered brand name */}
        <div className="md:hidden absolute left-1/2 -translate-x-1/2 pointer-events-none select-none">
          <Link to={ROUTES.dashboard} className="pointer-events-auto flex items-center gap-1.5">
            <img src="/brand/aimleads-mark.png" alt="" aria-hidden="true" style={{ height: 20, width: 'auto' }} />
            <span className="text-sm font-bold text-slate-800 tracking-tight">AimLeads</span>
          </Link>
        </div>

        <div className="flex items-center gap-1 md:gap-1.5 min-w-0 flex-shrink-0">
          <LanguageSwitcher compact className="hidden sm:inline-flex" />
          <CreditBadge />
          <span className="text-sm text-slate-400 hidden lg:inline mr-1 truncate">{user?.email}</span>
          <Link to={ROUTES.accountSettings} className="flex-shrink-0">
            <Button variant="ghost" size="icon" title={t('nav.accountSettings')} aria-label={t('nav.accountSettings')} className="w-9 h-9 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100">
              <UserCog className="w-4 h-4" />
            </Button>
          </Link>
          <Button variant="outline" size="sm" onClick={onSignOut} className="text-slate-500 border-slate-200/80 hover:border-brand-sky/40 hover:text-brand-sky hover:bg-brand-sky/5 rounded-xl text-xs h-8 hidden sm:inline-flex transition-all flex-shrink-0">
            {t('nav.signOut')}
          </Button>
        </div>
      </div>
    </header>
  );
}
