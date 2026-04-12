import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/constants/routes';
import { Search, UserCog, Zap } from 'lucide-react';
import { dataClient } from '@/services/dataClient';

// balance states: undefined = loading, -1 = error/unknown, number = actual balance
function CreditBadge() {
  const [balance, setBalance] = useState(undefined);

  useEffect(() => {
    let cancelled = false;
    dataClient.workspace.getCredits()
      .then((res) => {
        if (!cancelled) setBalance(res?.data?.balance ?? -1);
      })
      .catch(() => {
        if (!cancelled) setBalance(-1);
      });
    return () => { cancelled = true; };
  }, []);

  // Still loading — render nothing until we know
  if (balance === undefined) return null;

  const isError = balance === -1;
  const isLow = !isError && balance <= 10;
  const isEmpty = !isError && balance === 0;

  return (
    <Link
      to={ROUTES.billing}
      title={isError ? 'Credits unavailable' : `${balance} credits remaining`}
      className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition-opacity hover:opacity-80 ${
        isError
          ? 'bg-slate-50 border-slate-200 text-slate-400'
          : isEmpty
            ? 'bg-red-50 border-red-200 text-red-600'
            : isLow
              ? 'bg-amber-50 border-amber-200 text-amber-700'
              : 'bg-slate-50 border-slate-200 text-slate-500'
      }`}
    >
      <Zap className={`w-3 h-3 ${isError ? 'text-slate-300' : isEmpty ? 'text-red-500' : isLow ? 'text-amber-500' : 'text-slate-400'}`} />
      <span>{isError ? '—' : balance} credits</span>
    </Link>
  );
}

export default function Header({ user, onSignOut, onOpenPalette }) {
  return (
    <header className="fixed top-0 left-0 md:left-64 right-0 h-16 border-b border-slate-200 z-40" style={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)' }}>
      <div className="h-full px-4 md:px-6 flex items-center justify-between gap-3">

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenPalette}
            className="hidden md:flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-400 text-sm transition-all duration-150 group"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="text-xs pr-4">Search…</span>
            <kbd className="text-[10px] bg-white/5 border border-slate-200 rounded px-1.5 py-0.5 font-medium text-white/30">⌘K</kbd>
          </button>
          <span className="md:hidden text-sm font-semibold text-slate-700 tracking-wide">AimLeads</span>
        </div>

        <div className="flex items-center gap-1.5">
          <CreditBadge />
          <span className="text-sm text-slate-400 hidden lg:block mr-2">{user?.email}</span>
          <Link to={ROUTES.accountSettings}>
            <Button variant="ghost" size="icon" title="Account Settings" aria-label="Account Settings" className="w-9 h-9 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100">
              <UserCog className="w-4 h-4" />
            </Button>
          </Link>
          <Button variant="outline" size="sm" onClick={onSignOut} className="text-slate-500 border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-xl text-xs h-8 hidden sm:inline-flex">
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
