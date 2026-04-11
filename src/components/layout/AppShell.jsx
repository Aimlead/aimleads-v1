import React, { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import MobileBottomNav from '@/components/layout/MobileBottomNav';
import CommandPalette from '@/components/CommandPalette';
import ErrorBoundary from '@/components/ErrorBoundary';
import { useAuth } from '@/lib/AuthContext';
import { ROUTES } from '@/constants/routes';


export default function AppShell({ children }) {
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

  const handleSignOut = () => logout(() => navigate(ROUTES.home));

  // Listen for insufficient-credits events dispatched by the data client
  useEffect(() => {
    const handler = (e) => {
      const { balance = 0, required = 0, action = '' } = e.detail || {};
      toast.error(
        `Crédits insuffisants — il vous faut ${required} crédit${required !== 1 ? 's' : ''} pour cette action (solde: ${balance}).`,
        { duration: 6000, description: action ? `Action: ${action}` : undefined }
      );
    };
    window.addEventListener('aimleads:insufficient-credits', handler);
    return () => window.removeEventListener('aimleads:insufficient-credits', handler);
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

      {/* Desktop sidebar */}
      <Sidebar onOpenPalette={openPalette} />

      <Header
        user={user}
        onSignOut={handleSignOut}
        onOpenPalette={openPalette}
      />

      <CommandPalette open={paletteOpen} onClose={closePalette} />

      {/* pb-24 on mobile leaves room above bottom nav (56px bar + safe area) */}
              <main id="main-content" className="pt-20 px-4 md:px-6 py-6 md:py-8 md:ml-64 pb-24 md:pb-8">
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

      {/* Mobile bottom navigation — hidden on md+ */}
      <MobileBottomNav onSignOut={handleSignOut} />
    </div>
  );
}
