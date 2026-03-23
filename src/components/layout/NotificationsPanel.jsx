import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Check, CheckCheck, Sparkles, Target, Trash2, TrendingUp, UserPlus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { dataClient } from '@/services/dataClient';
import { formatDistanceToNow } from 'date-fns';

const ACTION_ICON = {
  create: { icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-50' },
  update: { icon: Sparkles, color: 'text-blue-500', bg: 'bg-blue-50' },
  delete: { icon: Trash2, color: 'text-rose-500', bg: 'bg-rose-50' },
  analyze: { icon: Target, color: 'text-brand-sky', bg: 'bg-brand-sky/5' },
  invite: { icon: UserPlus, color: 'text-amber-500', bg: 'bg-amber-50' },
};

function NotificationItem({ entry }) {
  const meta = ACTION_ICON[entry.action] || ACTION_ICON.update;
  const IconComp = meta.icon;

  const label = entry.action === 'create'
    ? `Created ${entry.resource_type?.replace('_', ' ')}`
    : entry.action === 'delete'
      ? `Deleted ${entry.resource_type?.replace('_', ' ')}`
      : `Updated ${entry.resource_type?.replace('_', ' ')}`;

  const detail = entry.changes?.company_name || entry.changes?.name || entry.resource_id?.slice(0, 8);

  return (
    <div className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors group">
      <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5', meta.bg)}>
        <IconComp className={cn('w-3.5 h-3.5', meta.color)} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-700 truncate">{label}</p>
        {detail && <p className="text-xs text-slate-400 truncate mt-0.5">{detail}</p>}
        <p className="text-[11px] text-slate-300 mt-1">
          {entry.created_at ? formatDistanceToNow(new Date(entry.created_at), { addSuffix: true }) : ''}
        </p>
      </div>
    </div>
  );
}

export default function NotificationsPanel() {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(0);
  const panelRef = useRef(null);

  const { data: entries = [] } = useQuery({
    queryKey: ['audit-log', 'recent'],
    queryFn: () => dataClient.audit.list({ limit: 20 }),
    refetchInterval: 30000,
    staleTime: 15000,
  });

  const unread = Math.max(0, entries.length - seen);

  useEffect(() => {
    if (open) setSeen(entries.length);
  }, [open, entries.length]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'relative w-9 h-9 rounded-xl flex items-center justify-center transition-colors',
          open ? 'bg-slate-100 text-slate-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
        )}
        aria-label="Notifications"
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-brand-sky text-white text-[9px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-11 w-80 bg-white rounded-2xl shadow-xl border border-slate-100 z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-800">Activity</h3>
                {unread > 0 && (
                  <span className="text-[10px] font-bold bg-brand-sky/10 text-brand-sky rounded-full px-1.5 py-0.5">
                    {unread} new
                  </span>
                )}
              </div>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* List */}
            <div className="max-h-80 overflow-y-auto divide-y divide-slate-50">
              {entries.length === 0 ? (
                <div className="py-12 text-center">
                  <CheckCheck className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">All caught up!</p>
                </div>
              ) : (
                entries.map((entry, i) => <NotificationItem key={entry.id || i} entry={entry} />)
              )}
            </div>

            {/* Footer */}
            {entries.length > 0 && (
              <div className="px-4 py-2.5 border-t border-slate-100">
                <a href={'/audit'} className="text-xs text-brand-sky hover:text-brand-sky font-medium transition-colors">
                  View full audit log →
                </a>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
