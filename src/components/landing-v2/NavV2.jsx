import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ROUTES } from '@/constants/routes';
import BrandLogo from '@/components/brand/BrandLogo';

export default function NavV2({ onOpenBooking }) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const scrollTo = (id) => (e) => {
    e.preventDefault();
    setMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  return (
    <nav className="lv2-nav" aria-label={t('landingV2.nav.ariaLabel')} ref={menuRef}>
      <Link to="/" className="lv2-nav-brand" aria-label={t('landingV2.nav.brandAriaLabel')}>
        <BrandLogo variant="mark" tone="light" className="lv2-nav-brand-mark" alt="AimLeads" />
        <span>AimLeads</span>
      </Link>

      <div className="lv2-nav-links">
        <button type="button" className="lv2-nav-link" onClick={scrollTo('products')}>{t('landingV2.nav.products')}</button>
        <button type="button" className="lv2-nav-link" onClick={scrollTo('workflow')}>{t('landingV2.nav.workflow')}</button>
        <button type="button" className="lv2-nav-link" onClick={scrollTo('pricing')}>{t('landingV2.nav.pricing')}</button>
        <Link className="lv2-nav-link" to={ROUTES.login}>{t('landingV2.nav.login')}</Link>
      </div>

      {/* Mobile: hamburger */}
      <button
        type="button"
        className="lv2-nav-hamburger"
        aria-label={t('landingV2.nav.menuAriaLabel')}
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((v) => !v)}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          {menuOpen
            ? <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>
            : <><line x1="3" y1="7" x2="21" y2="7"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="17" x2="21" y2="17"/></>
          }
        </svg>
      </button>

      <button type="button" className="lv2-nav-cta" onClick={onOpenBooking}>
        {t('landingV2.nav.auditCta')}
      </button>

      {menuOpen && (
        <div className="lv2-nav-mobile-menu">
          <button type="button" className="lv2-nav-link" onClick={scrollTo('products')}>{t('landingV2.nav.products')}</button>
          <button type="button" className="lv2-nav-link" onClick={scrollTo('workflow')}>{t('landingV2.nav.workflow')}</button>
          <button type="button" className="lv2-nav-link" onClick={scrollTo('pricing')}>{t('landingV2.nav.pricing')}</button>
          <Link className="lv2-nav-link" to={ROUTES.login} onClick={() => setMenuOpen(false)}>{t('landingV2.nav.login')}</Link>
        </div>
      )}
    </nav>
  );
}
