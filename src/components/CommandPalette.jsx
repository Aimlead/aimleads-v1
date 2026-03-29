import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart3, Kanban, LayoutDashboard, LogOut, Search,
  ScrollText, Settings, Sparkles, Target, Users, Upload,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/constants/routes';
import { useAuth } from '@/lib/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { dataClient } from '@/services/dataClient';

const NAV_ITEMS = [
  { id: 'nav-dashboard', label: 'Dashboard', icon: LayoutDashboard, href: ROUTES.dashboard, group: 'Navigate' },
  { id: 'nav-pipeline', label: 'Pipeline', icon: Kanban, href: ROUTES.pipeline, group: 'Navigate' },
  { id: 'nav-analytics', label: 'Analytics', icon: BarChart3, href: ROUTES.analytics, group: 'Navigate' },
  { id: 'nav-icp', label: 'ICP Profile', icon: Target, href: ROUTES.icp, group: 'Navigate' },
  { id: 'nav-team', label: 'Team', icon: Users, href: ROUTES.team, group: 'Navigate' },
  { id: 'nav-settings', label: 'Settings', icon: Settings, href: ROUTES.settings, group: 'Navigate' },
  { id: 'nav-audit', label: 'Audit Log', icon: ScrollText, href: ROUTES.auditLog, group: 'Navigate' },
];

const ACTION_ITEMS = [
  { id: 'action-import', label: 'Import CSV', icon: Upload, href: `${ROUTES.dashboard}?openImport=1`, group: 'Actions' },
  { id: 'action-icp', label: 'Configure ICP', icon: Target, href: ROUTES.icp, group: 'Actions' },
];

function highlight(text, query) {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-brand-sky/10 text-brand-sky rounded px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export default function CommandPalette({ open, onClose }) {
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const navigate = useNavigate();
  const { logout } = useAuth();

  const { data: leads = [] } = useQuery({
    queryKey: ['leads'],
    queryFn: () => dataClient.leads.list(),
    enabled: open,
    staleTime: 30000,
  });

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const filteredNav = NAV_ITEMS.filter((item) =>
    item.label.toLowerCase().includes(query.toLowerCase())
  );

  const filteredActions = ACTION_ITEMS.filter((item) =>
    item.label.toLowerCase().includes(query.toLowerCase())
  );

  const filteredLeads = query.length >= 2
    ? leads
        .filter((l) =>
          String(l.company_name || '').toLowerCase().includes(query.toLowerCase()) ||
          String(l.contact_name || '').toLowerCase().includes(query.toLowerCase())
        )
        .slice(0, 5)
        .map((l) => ({
          id: `lead-${l.id}`,
          label: l.company_name,
          sublabel: l.contact_name || l.industry,
          icon: Sparkles,
          href: `/leads/${l.id}`,
          group: 'Leads',
        }))
    : [];

  const items = [
    ...filteredActions,
    ...filteredNav,
    ...filteredLeads,
    ...(query === '' ? [{ id: 'action-signout', label: 'Sign out', icon: LogOut, action: logout, group: 'Account' }] : []),
  ];

  const groups = [...new Set(items.map((i) => i.group))];

  const handleSelect = useCallback((item) => {
    if (item.action) {
      item.action();
    } else if (item.href) {
      navigate(item.href);
    }
    onClose();
  }, [navigate, onClose]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  useEffect(() => {
    const handler = (e) => {
      if (!open) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, items.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (items[activeIdx]) handleSelect(items[activeIdx]);
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, items, activeIdx, handleSelect, onClose]);

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector('[data-active="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  let globalIdx = 0;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="fixed top-[20vh] left-1/2 -translate-x-1/2 w-full max-w-xl z-[101] px-4"
          >
            <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-200/80 overflow-hidden">
              {/* Search input */}
              <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100">
                <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search pages, leads, actions…"
                  className="flex-1 text-sm bg-transparent outline-none text-slate-800 placeholder:text-slate-400"
                />
                <kbd className="text-[10px] font-medium text-slate-400 bg-slate-100 rounded px-1.5 py-0.5">ESC</kbd>
              </div>

              {/* Results */}
              <div ref={listRef} className="max-h-80 overflow-y-auto py-2">
                {items.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-8">No results for "{query}"</p>
                ) : (
                  groups.map((group) => {
                    const groupItems = items.filter((i) => i.group === group);
                    return (
                      <div key={group}>
                        <p className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                          {group}
                        </p>
                        {groupItems.map((item) => {
                          const idx = globalIdx++;
                          const isActive = idx === activeIdx;
                          return (
                            <button
                              key={item.id}
                              data-active={isActive}
                              onClick={() => handleSelect(item)}
                              className={cn(
                                'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                                isActive ? 'bg-brand-sky/5 text-brand-sky' : 'text-slate-700 hover:bg-slate-50'
                              )}
                            >
                              <div className={cn(
                                'w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0',
                                isActive ? 'bg-brand-sky/10' : 'bg-slate-100'
                              )}>
                                <item.icon className="w-3.5 h-3.5" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{highlight(item.label, query)}</p>
                                {item.sublabel && (
                                  <p className="text-xs text-slate-400 truncate">{item.sublabel}</p>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              <div className="px-4 py-2.5 border-t border-slate-100 flex items-center gap-4 text-[11px] text-slate-400">
                <span><kbd className="font-medium">↑↓</kbd> navigate</span>
                <span><kbd className="font-medium">↵</kbd> select</span>
                <span><kbd className="font-medium">esc</kbd> close</span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
