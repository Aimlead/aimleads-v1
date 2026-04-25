import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  BarChart3, CreditCard, HelpCircle, Kanban, LayoutDashboard, ListOrdered,
  LogOut, Mail, MoreHorizontal, Rows3, ScrollText, Settings, Target, UserCog, Users,
} from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import LanguageSwitcher from '@/components/ui/LanguageSwitcher';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/constants/routes';

function MobileBottomNav({ onSignOut }) {
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const [moreOpen, setMoreOpen] = useState(false);

  const PRIMARY_TABS = [
    { key: 'dashboard', href: ROUTES.dashboard, icon: LayoutDashboard },
    { key: 'priorities', href: ROUTES.priorities, icon: ListOrdered },
    { key: 'pipeline', href: ROUTES.pipeline, icon: Kanban },
    { key: 'outreach', href: ROUTES.outreach, icon: Mail },
  ];

  const MORE_ITEMS = [
    { key: 'icp', href: ROUTES.icp, icon: Target },
    { key: 'lists', href: ROUTES.lists, icon: Rows3 },
    { key: 'analytics', href: ROUTES.analytics, icon: BarChart3 },
    { key: 'team', href: ROUTES.team, icon: Users },
    { key: 'billing', href: ROUTES.billing, icon: CreditCard },
    { key: 'help', href: ROUTES.help, icon: HelpCircle },
    { key: 'settings', href: ROUTES.settings, icon: Settings },
    { key: 'auditLog', href: ROUTES.auditLog, icon: ScrollText },
    { key: 'accountSettings', href: ROUTES.accountSettings, icon: UserCog },
  ];


  const isActive = (href) => {
    if (href === ROUTES.priorities)
      return pathname === ROUTES.priorities || pathname.startsWith('/leads');
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const isMoreActive = MORE_ITEMS.some((item) => isActive(item.href));

  return (
    <>
      {/* ── Bottom tab bar ───────────────────────────────────────────── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200"
        style={{
          background: 'rgba(0,20,55,0.97)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <div className="flex items-stretch h-14">
          {PRIMARY_TABS.map((tab) => {
            const active = isActive(tab.href);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.key}
                to={tab.href}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 relative min-w-0 active:opacity-70 transition-opacity"
                aria-label={t(`nav.${tab.key}`)}
                title={t(`nav.${tab.key}`)}
              >
                <AnimatePresence>
                  {active && (
                    <motion.div
                      layoutId="bottom-nav-indicator"
                      className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-brand-sky"
                      initial={{ opacity: 0, scaleX: 0 }}
                      animate={{ opacity: 1, scaleX: 1 }}
                      exit={{ opacity: 0, scaleX: 0 }}
                      transition={{ duration: 0.2 }}
                    />
                  )}
                </AnimatePresence>
                <Icon
                  className={cn(
                    'w-5 h-5 transition-colors',
                    active ? 'text-brand-sky' : 'text-white/40'
                  )}
                />
                <span
                  className={cn(
                    'text-[10px] font-medium leading-none transition-colors line-clamp-1',
                    active ? 'text-brand-sky' : 'text-white/35'
                  )}
                >
                  {t(`nav.${tab.key}`)}
                </span>
              </Link>
            );
          })}

          {/* More button */}
          <button
            onClick={() => setMoreOpen(true)}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 relative min-w-0 active:opacity-70 transition-opacity"
            aria-label={t('nav.more')}
            title={t('nav.more')}
          >
            {isMoreActive && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-brand-sky" />
            )}
            <MoreHorizontal
              className={cn(
                'w-5 h-5 transition-colors',
                isMoreActive ? 'text-brand-sky' : 'text-white/40'
              )}
            />
            <span
              className={cn(
                'text-[10px] font-medium leading-none transition-colors line-clamp-1',
                isMoreActive ? 'text-brand-sky' : 'text-white/35'
              )}
            >
              {t('nav.more')}
            </span>
          </button>
        </div>
      </nav>

      {/* ── "Plus" bottom sheet ──────────────────────────────────────── */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          className="p-0 border-t border-slate-200 rounded-t-2xl"
          style={{ background: 'rgba(0,20,55,0.98)' }}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{t('nav.more')}</SheetTitle>
            <SheetDescription>
              {t('nav.configuration')}
            </SheetDescription>
          </SheetHeader>
          <div
            className="px-4 pt-4 pb-2"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
          >
            {/* Handle bar */}
            <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-5" />

            {/* Language Switcher */}
            <div className="mb-4 px-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40 mb-2">
                {t('nav.language')}
              </p>
              <LanguageSwitcher compact className="w-full justify-center" />
            </div>

            <div className="h-px bg-white/[0.07] mx-3 mb-3" />

            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/25 px-3 mb-2">
              {t('nav.configuration')}
            </p>

            <div className="space-y-0.5 mb-4 max-h-64 overflow-y-auto">
              {MORE_ITEMS.map((item) => {
                const active = isActive(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.key}
                    to={item.href}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all',
                      active
                        ? 'bg-white/10 text-white'
                        : 'text-white/60 hover:bg-white/[0.05] hover:text-white/90 active:bg-white/10'
                    )}
                  >
                    <Icon
                      className={cn(
                        'w-5 h-5 flex-shrink-0',
                        active ? 'text-brand-sky' : 'text-white/35'
                      )}
                    />
                    <span className="flex-1 min-w-0">{t(`nav.${item.key}`)}</span>
                    {active && (
                      <div className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-sky flex-shrink-0" />
                    )}
                  </Link>
                );
              })}
            </div>

            <div className="h-px bg-white/[0.07] mx-3 mb-3" />

            <button
              onClick={() => { setMoreOpen(false); onSignOut?.(); }}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-white/50 hover:bg-white/[0.05] hover:text-white/80 active:bg-white/10 transition-all"
            >
              <LogOut className="w-5 h-5 text-white/30 flex-shrink-0" />
              <span>{t('nav.signOut')}</span>
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

export default MobileBottomNav;
