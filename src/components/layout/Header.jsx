import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/constants/routes';
import { Search, UserCog } from 'lucide-react';

export default function Header({ user, onSignOut, onOpenPalette }) {
  return (
    <header className="fixed top-0 left-0 md:left-64 right-0 h-16 backdrop-blur-xl border-b border-white/8 z-40" style={{ background: 'rgba(0,31,77,.92)' }}>
      <div className="h-full px-4 md:px-6 flex items-center justify-between gap-3">

        {/* Left — on mobile: show logo/brand area; on desktop: search */}
        <div className="flex items-center gap-2">
          {/* Search trigger — desktop only */}
          <button
            onClick={onOpenPalette}
            className="hidden md:flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/8 border border-white/10 text-white/40 text-sm transition-all duration-150 group"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="text-xs pr-4">Search…</span>
            <kbd className="text-[10px] bg-white/5 border border-white/10 rounded px-1.5 py-0.5 font-medium text-white/30">⌘K</kbd>
          </button>

          {/* Mobile: show AimLeads wordmark / app title */}
          <span className="md:hidden text-sm font-semibold text-white/70 tracking-wide">AimLeads</span>
        </div>

        {/* Right */}
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-white/40 hidden lg:block mr-2">{user?.email}</span>

          <Link to={ROUTES.accountSettings}>
            <Button
              variant="ghost"
              size="icon"
              title="Account Settings"
              aria-label="Account Settings"
              className="w-9 h-9 rounded-xl text-white/40 hover:text-white/80"
            >
              <UserCog className="w-4 h-4" />
            </Button>
          </Link>

          {/* Sign out — text on sm+, hidden on mobile (accessible from bottom nav "Plus" sheet) */}
          <Button
            variant="outline"
            size="sm"
            onClick={onSignOut}
            className="text-white/60 border-white/10 hover:border-white/20 rounded-xl text-xs h-8 hidden sm:inline-flex"
          >
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
