import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import '@/styles/landing-v2.css';

import BrandLogo from '@/components/brand/BrandLogo';
import HeroScene from '@/components/landing-v2/HeroScene';
import NavV2 from '@/components/landing-v2/NavV2';
import LogosMarquee from '@/components/landing-v2/LogosMarquee';
import ProductShowcase from '@/components/landing-v2/ProductShowcase';
import WorkflowTimeline from '@/components/landing-v2/WorkflowTimeline';
import PricingPreview from '@/components/landing-v2/PricingPreview';
import FinalCTA from '@/components/landing-v2/FinalCTA';
import FooterV2 from '@/components/landing-v2/FooterV2';
import BookingModal from '@/components/landing/BookingModal';
import { ROUTES } from '@/constants/routes';
import { dataClient } from '@/services/dataClient';

const ArrowIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
);

export default function LandingV2() {
  const [bookingOpen, setBookingOpen] = useState(false);

  useEffect(() => {
    dataClient.public.trackEvent({
      event: 'landing_v2_viewed',
      path: '/v2',
      source: 'landing_v2',
      properties: {},
    }).catch(() => {});
  }, []);

  const openBooking = () => {
    setBookingOpen(true);
    dataClient.public.trackEvent({
      event: 'landing_v2_cta_booking',
      path: '/v2',
      source: 'landing_v2',
      properties: {},
    }).catch(() => {});
  };

  return (
    <div className="lv2-root">
      <NavV2 onOpenBooking={openBooking} />

      <section className="lv2-hero" aria-label="Hero">
        <HeroScene />
        <div className="lv2-hero-content">
          <span className="lv2-eyebrow">
            <span className="lv2-eyebrow-dot" />
            <span>IA accessible aux PME & ETI · 2026</span>
          </span>

          <h1 className="lv2-hero-logo-title" aria-label="AimLeads">
            <span className="lv2-hero-menu-logo">
              <BrandLogo variant="mark" tone="light" className="lv2-hero-logo-mark" alt="AimLeads" />
              <span>AimLeads</span>
            </span>
          </h1>

          <p className="lv2-sub">
            AimLeads rend l&apos;intelligence artificielle concrète et rentable —
            de la formation Claude à l&apos;automatisation complète de votre prospection B2B.
          </p>

          <div className="lv2-hero-ctas">
            <Link to={`${ROUTES.login}?mode=signup`} className="lv2-btn lv2-btn-primary lv2-btn-lg">
              <span>Essai gratuit — Commencer</span>
              {ArrowIcon}
            </Link>
            <button type="button" className="lv2-btn lv2-btn-ghost lv2-btn-lg" onClick={openBooking}>
              <span>Démo guidée</span>
              {ArrowIcon}
            </button>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.55)', marginTop: '0.75rem' }}>
            Bêta ouverte · Aucune CB requise
          </p>
        </div>

        <div className="lv2-hero-scroll" aria-hidden="true">
          <span>Scroll</span>
          <span className="lv2-hero-scroll-line" />
        </div>
      </section>

      <LogosMarquee />
      <ProductShowcase />
      <WorkflowTimeline />
      <PricingPreview />
      <FinalCTA onOpenBooking={openBooking} />
      <FooterV2 onOpenBooking={openBooking} />

      <BookingModal open={bookingOpen} onClose={() => setBookingOpen(false)} />
    </div>
  );
}
