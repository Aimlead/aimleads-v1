import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/constants/routes';
import { Search, UserCog } from 'lucide-react';

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
