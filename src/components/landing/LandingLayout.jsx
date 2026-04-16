import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import BookingModal from './BookingModal';
import LoginModal from './LoginModal';
import PageHome from './PageHome';
import PageConseil from './PageConseil';
import PageLead from './PageLead';
import PageBDR from './PageBDR';
import PageRessources from './PageRessources';
import PageMentions from './PageMentions';
import { ROUTES } from '@/constants/routes';
import BrandLogo from '@/components/brand/BrandLogo';
import LanguageSwitcher from '@/components/ui/LanguageSwitcher';
import BuildStamp from '@/components/ui/BuildStamp';

const buildNavItems = (t) => [
  {
    id: 'home',
    label: t('landing.home'),
    section: 'navigation',
    icon: (
      <svg className="sb-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    id: 'conseil',
    label: t('landing.advisory'),
    badge: '3 volets',
    section: 'produits',
    icon: (
      <svg className="sb-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8m-4-4v4" />
      </svg>
    ),
  },
  {
    id: 'lead',
    label: t('landing.leadScorer'),
    badge: 'SaaS',
    badgeStyle: 'sky',
    section: 'produits',
    icon: (
      <svg className="sb-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
  {
    id: 'bdr',
    label: t('landing.automatedBdr'),
    badge: 'IA',
    badgeStyle: 'mint',
    section: 'produits',
    icon: (
      <svg className="sb-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
      </svg>
    ),
  },
  {
    id: 'ressources',
    label: t('landing.news'),
    section: 'produits',
    icon: (
      <svg className="sb-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    ),
  },
];

export default function LandingLayout() {
  const [activePage, setActivePage] = useState('home');
  const [bookingOpen, setBookingOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const navigate = useNavigate();
  const { t } = useTranslation();
  const mainRef = useRef(null);
  const navItems = buildNavItems(t);

  const observerRef = useRef(null);

  // Create the IntersectionObserver once
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add('vis');
        });
      },
      { threshold: 0.08, root: mainRef.current },
    );
    observerRef.current = obs;
    return () => obs.disconnect();
  }, []);

  // Observe .rv elements whenever the page changes (after new DOM mounts)
  useEffect(() => {
    const obs = observerRef.current;
    const main = mainRef.current;
    if (!obs || !main) return;
    // Use rAF + small delay to ensure React has committed the new DOM
    const id = requestAnimationFrame(() => {
      main.querySelectorAll('.rv').forEach((el) => {
        el.classList.remove('vis');
        obs.observe(el);
      });
    });
    return () => cancelAnimationFrame(id);
  }, [activePage]);

  const changePage = useCallback((page) => {
    setActivePage(page);
    setMobileNavOpen(false);
    if (mainRef.current) mainRef.current.scrollTop = 0;
  }, []);

  const ctx = {
    setActivePage: changePage,
    openBooking: () => {
      setMobileNavOpen(false);
      setBookingOpen(true);
    },
    openLogin: () => {
      setMobileNavOpen(false);
      setLoginOpen(true);
    },
    goToApp: () => {
      setMobileNavOpen(false);
      navigate(ROUTES.login);
    },
    goToPricing: () => {
      setMobileNavOpen(false);
      navigate(ROUTES.pricing);
    },
  };

  const navigationItems = navItems.filter((i) => i.section === 'navigation');
  const produitItems = navItems.filter((i) => i.section === 'produits');

  const renderNavItem = (item) => {
    const isActive = activePage === item.id;
    return (
      <button
        key={item.id}
        type="button"
        className={`sb-item${isActive ? ' active' : ''}`}
        onClick={() => changePage(item.id)}
      >
        {item.icon}
        {item.label}
        {item.badge && <span className="sb-badge">{item.badge}</span>}
      </button>
    );
  };

  return (
    <div className={`landing-page${mobileNavOpen ? ' landing-mobile-nav-open' : ''}`} style={{ display: 'flex', minHeight: '100vh', background: 'var(--white, #fff)' }}>
      <div
        className={`landing-mobile-overlay${mobileNavOpen ? ' active' : ''}`}
        onClick={() => setMobileNavOpen(false)}
        aria-hidden={!mobileNavOpen}
      />

      <div className="landing-mobile-bar">
        <button
          type="button"
          className="landing-mobile-menu-btn"
          onClick={() => setMobileNavOpen((open) => !open)}
          aria-label={mobileNavOpen ? t('landing.closeMenu') : t('landing.openMenu')}
          aria-expanded={mobileNavOpen}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            {mobileNavOpen ? (
              <>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </>
            ) : (
              <>
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </>
            )}
          </svg>
        </button>

        <button
          type="button"
          className="landing-mobile-brand"
          onClick={() => changePage('home')}
        >
          <BrandLogo variant="full" className="sb-logo-brand" />
        </button>

        <div className="landing-mobile-actions">
          <LanguageSwitcher className="landing-mobile-language" />
          <button
            type="button"
            className="landing-mobile-login"
            onClick={() => setLoginOpen(true)}
          >
            {t('landing.signIn')}
          </button>
        </div>
      </div>

      {/* ── Sidebar ── */}
      <aside className={`sidebar${mobileNavOpen ? ' mobile-open' : ''}`}>
        {/* Logo */}
        <a
          href="#"
          className="sb-logo"
          onClick={(e) => { e.preventDefault(); changePage('home'); }}
        >
          <BrandLogo variant="full" className="sb-logo-brand" />
        </a>

        <div className="px-3 pb-3">
          <LanguageSwitcher className="w-full justify-center" />
        </div>

        {/* Se connecter */}
        <a
          href="#"
          className="sb-login"
          onClick={(e) => { e.preventDefault(); setLoginOpen(true); }}
        >
          <svg className="sb-login-icon" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          {t('landing.signIn')}
          <svg style={{ width: 12, height: 12, marginLeft: 'auto', opacity: 0.4 }} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </a>

        {/* Navigation section */}
        <div className="sb-section">{t('landing.navigation')}</div>
        {navigationItems.map(renderNavItem)}

        <div className="sb-divider" />

        {/* Produits section */}
        <div className="sb-section">{t('landing.products')}</div>
        {produitItems.map(renderNavItem)}

        <div className="sb-divider" />

        {/* Prendre un RDV CTA */}
        <a
          href="#"
          className="sb-cta"
          onClick={(e) => { e.preventDefault(); setBookingOpen(true); }}
        >
          <span className="sb-cta-arrow">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </span>
          <span className="sb-cta-label">{t('landing.bookMeeting')}</span>
        </a>

        {/* Footer - Mentions légales */}
        <div className="sb-footer">
          <a
            href="#"
            className="sb-footer-txt"
          style={{ textDecoration: 'none', cursor: 'pointer' }}
          onClick={(e) => { e.preventDefault(); changePage('mentions'); }}
        >
            {t('landing.legalNotice')}
          </a>
          <BuildStamp
            tone="light"
            className="mt-3 w-full"
            label={t('landing.buildLabel', { defaultValue: 'Build' })}
            builtAtLabel={t('landing.buildDateLabel', { defaultValue: 'Built' })}
          />
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="main" ref={mainRef}>
        {activePage === 'home' && <PageHome ctx={ctx} />}
        {activePage === 'conseil' && <PageConseil ctx={ctx} />}
        {activePage === 'lead' && <PageLead ctx={ctx} />}
        {activePage === 'bdr' && <PageBDR ctx={ctx} />}
        {activePage === 'ressources' && <PageRessources ctx={ctx} />}
        {activePage === 'mentions' && <PageMentions ctx={ctx} />}
      </div>

      <div className="landing-mobile-cta-bar">
        <button
          type="button"
          className="landing-mobile-cta-secondary"
          onClick={() => changePage('lead')}
        >
          {t('landing.mobileCta.secondary')}
        </button>
        <button
          type="button"
          className="landing-mobile-cta-primary"
          onClick={() => setBookingOpen(true)}
        >
          {t('landing.mobileCta.primary')}
        </button>
      </div>

      {/* ── Modals ── */}
      <BookingModal open={bookingOpen} onClose={() => setBookingOpen(false)} />
      <LoginModal
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        onShowMentions={() => { setLoginOpen(false); changePage('mentions'); }}
      />
    </div>
  );
}
