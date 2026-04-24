import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/constants/routes';
import {
  BarChart3,
  CreditCard,
  Database,
  Kanban,
  LayoutDashboard,
  LifeBuoy,
  ListOrdered,
  LogOut,
  Mail,
  Rows3,
  ScrollText,
  Settings,
  Sparkles,
  Target,
  Users,
} from 'lucide-react';
import BrandLogo from '@/components/brand/BrandLogo';

export const sidebarNavigation = [
  { name: 'Dashboard', labelKey: 'nav.dashboard', href: ROUTES.dashboard, icon: LayoutDashboard, group: 'main', shortcut: '1' },
  { name: 'Pipeline', labelKey: 'nav.pipeline', href: ROUTES.pipeline, icon: Kanban, group: 'main', shortcut: '2' },
  { name: 'Lists', labelKey: 'nav.lists', href: ROUTES.lists, icon: Rows3, group: 'main', shortcut: '5' },
  { name: 'Priority List', labelKey: 'nav.priorityList', href: ROUTES.priorities, icon: ListOrdered, group: 'main', shortcut: '6' },
  { name: 'Analytics', labelKey: 'nav.analytics', href: ROUTES.analytics, icon: BarChart3, group: 'main', shortcut: '3' },
  { name: 'Outreach', labelKey: 'nav.outreach', href: ROUTES.outreach, icon: Mail, group: 'main', shortcut: '4' },
  { name: 'ICP Profile', labelKey: 'nav.icp', href: ROUTES.icp, icon: Target, group: 'config' },
  { name: 'Team', labelKey: 'nav.team', href: ROUTES.team, icon: Users, group: 'config' },
  { name: 'Billing', labelKey: 'nav.billing', href: ROUTES.billing, icon: CreditCard, group: 'config' },
  { name: 'Settings', labelKey: 'nav.settings', href: ROUTES.settings, icon: Settings, group: 'config' },
  { name: 'CRM Integration', labelKey: 'nav.crmIntegration', href: ROUTES.crmIntegration, icon: Database, group: 'config' },
  { name: 'Audit Log', labelKey: 'nav.auditLog', href: ROUTES.auditLog, icon: ScrollText, group: 'config' },
  { name: 'Help', labelKey: 'nav.help', href: ROUTES.help, icon: LifeBuoy, group: 'config' },
];

export default function Sidebar({ mobile = false, onNavigate, onOpenPalette, onSignOut, bannerOffset = 0 }) {
  const { t } = useTranslation();
  const location = useLocation();

  const isActive = (href) => {
    if (href === ROUTES.dashboard) {
      return location.pathname === ROUTES.dashboard || location.pathname.startsWith('/leads');
    }
    return location.pathname === href || location.pathname.startsWith(`${href}/`);
  };

  const groups = ['main', 'config'];

  return (
    <aside
      className={cn(
        'flex flex-col z-50 transition-all',
        'border-r border-white/[0.06]',
        mobile ? 'h-full w-full' : 'hidden md:flex fixed left-0 w-64'
      )}
      style={{
        background: 'linear-gradient(180deg, #0b1428 0%, #001840 60%, #001229 100%)',
        top: mobile ? 0 : bannerOffset,
        height: mobile ? '100%' : `calc(100vh - ${bannerOffset}px)`,
      }}
    >
      {/* Brand */}
      <div className="h-16 flex items-center px-5 border-b border-white/[0.06]">
        <BrandLogo variant="full" tone="light" className="h-8 w-auto max-w-[150px]" />
      </div>

      {/* Search / Cmd+K */}
      <div className="px-3 pt-4 pb-2">
        <button
          onClick={onOpenPalette}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-white/10 text-white/40 text-sm transition-all duration-150 group"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <span className="flex-1 text-left text-xs text-white/40">{t('common.quickSearch', 'Quick search…')}</span>
          <kbd className="text-[10px] bg-white/10 rounded px-1.5 py-0.5 font-medium text-white/30">⌘K</kbd>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-5">
        {groups.map((group) => {
          const items = sidebarNavigation.filter((item) => item.group === group);
          return (
            <div key={group}>
              <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-white/20">
                {group === 'main' ? t('nav.workspace', 'Workspace') : t('nav.configuration', 'Configuration')}
              </p>
              <div className="space-y-0.5">
                {items.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.name}
                      to={item.href}
                      onClick={onNavigate}
                      className={cn(
                        'group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
                        active
                          ? 'text-white'
                          : 'text-white/55 hover:bg-white/[0.05] hover:text-white/90'
                      )}
                      style={active ? {
                        background: 'linear-gradient(135deg, rgba(58,141,255,0.18) 0%, rgba(58,141,255,0.06) 100%)',
                        boxShadow: '0 0 0 1px rgba(58,141,255,0.25), 0 4px 16px -4px rgba(58,141,255,0.3)',
                      } : undefined}
                    >
                      {/* Active indicator bar */}
                      <AnimatePresence>
                        {active && (
                          <motion.div
                            layoutId="sidebar-active"
                            className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-brand-sky rounded-full"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                          />
                        )}
                      </AnimatePresence>

                      <item.icon
                        className={cn(
                          'w-[17px] h-[17px] flex-shrink-0 transition-colors',
                          active ? 'text-brand-sky' : 'text-white/35 group-hover:text-white/70'
                        )}
                      />
                      <span className="flex-1">{t(item.labelKey, item.name)}</span>
                      {item.shortcut && (
                        <span className="opacity-0 group-hover:opacity-100 text-[10px] text-slate-500 transition-opacity">
                          {item.shortcut}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* AI Badge */}
      <div className="px-3 py-4 border-t border-white/[0.06]">
        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <div className="w-6 h-6 rounded-lg bg-brand-sky/20 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-3.5 h-3.5 text-brand-sky" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-brand-sky">{t('nav.aiScoringActive', 'AI Scoring Active')}</p>
            <p className="text-[10px] text-brand-sky/60 truncate">{t('nav.aiScoringSubtitle', 'ICP · Signals · Prioritization')}</p>
          </div>
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0 animate-pulse" />
        </div>
      </div>

      {/* Sign out */}
      <div className="px-3 pb-4">
        <button
          onClick={onSignOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white/45 hover:bg-white/[0.05] hover:text-white/80 transition-all duration-150"
        >
          <LogOut className="w-[17px] h-[17px] flex-shrink-0 text-white/30" />
          {t('nav.signOut', 'Sign out')}
        </button>
      </div>
    </aside>
  );
}
