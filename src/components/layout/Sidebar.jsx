import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/constants/routes';
import {
  BarChart3, Kanban,
  LayoutDashboard, LifeBuoy, LogOut, Mail, ScrollText, Settings, Sparkles, Target, Users,
} from 'lucide-react';
import BrandLogo from '@/components/brand/BrandLogo';

export const sidebarNavigation = [
  { name: 'Dashboard', href: ROUTES.dashboard, icon: LayoutDashboard, group: 'main', shortcut: '1' },
  { name: 'Pipeline', href: ROUTES.pipeline, icon: Kanban, group: 'main', shortcut: '2' },
  { name: 'Analytics', href: ROUTES.analytics, icon: BarChart3, group: 'main', shortcut: '3' },
  { name: 'Outreach', href: ROUTES.outreach, icon: Mail, group: 'main', shortcut: '4' },
  { name: 'ICP Profile', href: ROUTES.icp, icon: Target, group: 'config' },
  { name: 'Team', href: ROUTES.team, icon: Users, group: 'config' },
  { name: 'Settings', href: ROUTES.settings, icon: Settings, group: 'config' },
  { name: 'Audit Log', href: ROUTES.auditLog, icon: ScrollText, group: 'config' },
  { name: 'Help', href: ROUTES.help, icon: LifeBuoy, group: 'config' },
];

const GROUP_LABELS = {
  main: 'Workspace',
  config: 'Configuration',
};

export default function Sidebar({ mobile = false, onNavigate, onOpenPalette, onSignOut }) {
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
        'bg-brand-navy border-r border-white/[0.06]',
        mobile ? 'h-full w-full' : 'hidden md:flex fixed left-0 top-0 h-screen w-64'
      )}
    >
      {/* Brand */}
      <div className="h-16 flex items-center px-5 border-b border-slate-200">
        <BrandLogo variant="full" tone="light" className="h-7 w-auto max-w-[140px]" />
      </div>

      {/* Search / Cmd+K */}
      <div className="px-3 pt-4 pb-2">
        <button
          onClick={onOpenPalette}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white/[0.05] hover:bg-white/10 border border-slate-200 text-white/40 text-sm transition-all duration-150 group"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <span className="flex-1 text-left text-xs text-white/40">Quick search…</span>
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
                {GROUP_LABELS[group]}
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
                        'group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                        active
                          ? 'bg-white/10 text-white shadow-sm'
                          : 'text-white/55 hover:bg-white/[0.05] hover:text-white/90'
                      )}
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
                      <span className="flex-1">{item.name}</span>
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
            <p className="text-xs font-semibold text-brand-sky">AI Scoring Active</p>
            <p className="text-[10px] text-brand-sky/60 truncate">ICP · Signals · Prioritization</p>
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
          Se déconnecter
        </button>
      </div>
    </aside>
  );
}
