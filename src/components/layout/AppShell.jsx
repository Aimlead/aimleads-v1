import React, { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import CommandPalette from '@/components/CommandPalette';
import ErrorBoundary from '@/components/ErrorBoundary';
import { useAuth } from '@/lib/AuthContext';
import { ROUTES } from '@/constants/routes';


export default function AppShell({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  // Cmd+K / Ctrl+K global shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="min-h-screen" style={{ background: 'hsl(var(--background))' }}>
      {/* Skip to main */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:px-4 focus:py-2 focus:bg-brand-sky-2 focus:text-white focus:rounded-lg focus:text-sm focus:font-medium"
      >
        Skip to main content
      </a>

      <Sidebar onOpenPalette={openPalette} />

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-[280px] bg-brand-navy border-r border-white/5">
          <Sidebar mobile onNavigate={() => setMobileOpen(false)} onOpenPalette={() => { setMobileOpen(false); openPalette(); }} />
        </SheetContent>
      </Sheet>

      <Header
        user={user}
        onSignOut={() => logout(() => navigate(ROUTES.home))}
        onOpenMobileNav={() => setMobileOpen(true)}
        onOpenPalette={openPalette}
      />

      <CommandPalette open={paletteOpen} onClose={closePalette} />

      <main id="main-content" className="pt-16 px-4 md:px-6 py-8 md:ml-64">
        <ErrorBoundary>
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            {children}
          </motion.div>
        </ErrorBoundary>
      </main>
    </div>
  );
}
