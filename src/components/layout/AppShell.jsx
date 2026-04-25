import React, { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import MobileBottomNav from '@/components/layout/MobileBottomNav';
import CommandPalette from '@/components/CommandPalette';
import ErrorBoundary from '@/components/ErrorBoundary';
import { useAuth } from '@/lib/AuthContext';
import { ROUTES } from '@/constants/routes';

const BETA_BANNER_KEY = 'aimleads:beta-banner-dismissed';
const BANNER_H = 32; // px — matches py-1.5 text-xs strip

function BetaBanner({ onVisibilityChange }) {
  const [visible, setVisible] = useState(() => {
    try { return !window.localStorage.getItem(BETA_BANNER_KEY); } catch { return true; }
  });

  useEffect(() => {
    onVisibilityChange(visible);
    document.documentElement.style.setProperty('--banner-h', visible ? `${BANNER_H}px` : '0px');
  }, [visible, onVisibilityChange]);

  const dismiss = () => {
    try { window.localStorage.setItem(BETA_BANNER_KEY, '1'); } catch { /* */ }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-0 z-[150] bg-gradient-to-r from-violet-600 via-brand-sky to-sky-500 text-white text-xs font-medium px-4 flex items-center justify-center gap-3 shadow-sm"
      style={{ top: 0, height: BANNER_H }}
    >
      <span className="inline-flex items-center gap-1.5">
        <span className="bg-white/20 rounded px-1.5 py-0.5 font-bold text-[10px] tracking-wide">BÊTA</span>
        AimLeads est en bêta — vos retours nous aident à améliorer le produit.
        <a href="mailto:beta@aimlead.io" className="underline underline-offset-2 hover:opacity-80">Écrire à l&apos;équipe</a>
      </span>
      <button onClick={dismiss} className="ml-2 opacity-70 hover:opacity-100 transition-opacity" aria-label="Fermer">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export default function AppShell({ children }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [bannerVisible, setBannerVisible] = useState(() => {
    try { return !window.localStorage.getItem(BETA_BANNER_KEY); } catch { return true; }
  });

  // Keep --banner-h CSS variable in sync so fixed overlays (Sheet, dialogs) can offset themselves
  useEffect(() => {
    document.documentElement.style.setProperty('--banner-h', bannerVisible ? `${BANNER_H}px` : '0px');
  }, [bannerVisible]);
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

  const bannerOffset = bannerVisible ? BANNER_H : 0;

  return (
    <div className="min-h-screen" style={{ background: 'hsl(var(--background))' }}>
      <BetaBanner onVisibilityChange={setBannerVisible} />

      {/* Skip to main */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:px-4 focus:py-2 focus:bg-brand-sky-2 focus:text-white focus:rounded-lg focus:text-sm focus:font-medium"
      >
        Skip to main content
      </a>

      {/* Desktop sidebar — pushed below banner */}
      <Sidebar onOpenPalette={openPalette} onSignOut={handleSignOut} bannerOffset={bannerOffset} />

      <Header
        user={user}
        onSignOut={handleSignOut}
        onOpenPalette={openPalette}
        bannerOffset={bannerOffset}
      />

      <CommandPalette open={paletteOpen} onClose={closePalette} />

      {/* pt accounts for header (64px) + banner */}
      <main
        id="main-content"
        className="px-4 md:px-6 md:ml-64 pb-24 md:pb-8"
        style={{ paddingTop: 64 + bannerOffset + 16 }}
      >
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
