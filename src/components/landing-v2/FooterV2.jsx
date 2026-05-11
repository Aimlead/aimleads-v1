import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ROUTES } from '@/constants/routes';
import BrandLogo from '@/components/brand/BrandLogo';

export default function FooterV2({ onOpenBooking }) {
  const { t } = useTranslation();

  return (
    <footer className="lv2-footer">
      <div className="lv2-footer-inner">
        <div className="lv2-footer-brand">
          <div className="lv2-nav-brand" style={{ gap: 12 }}>
            <BrandLogo variant="wordmark" tone="light" className="lv2-footer-wordmark" alt="AimLeads" />
          </div>
          <p>{t('landingV2.footer.description')}</p>
        </div>

        <div>
          <h5>{t('landingV2.footer.products')}</h5>
          <Link to="/">{t('landingV2.products.lead.title')}</Link>
          <Link to="/">{t('landingV2.products.bdr.title')}</Link>
          <Link to="/">{t('landingV2.products.conseil.title')}</Link>
          <Link to={ROUTES.pricing}>{t('landingV2.nav.pricing')}</Link>
        </div>

        <div>
          <h5>{t('landingV2.footer.resources')}</h5>
          <Link to={ROUTES.help}>{t('landingV2.footer.helpCenter')}</Link>
          <Link to={ROUTES.login}>{t('landingV2.footer.login')}</Link>
          <button type="button" onClick={onOpenBooking}>{t('landingV2.footer.requestAudit')}</button>
        </div>

        <div>
          <h5>{t('landingV2.footer.legal')}</h5>
          <Link to="/">{t('landingV2.footer.legalNotices')}</Link>
          <Link to="/">{t('landingV2.footer.privacy')}</Link>
          <Link to="/">{t('landingV2.footer.terms')}</Link>
        </div>
      </div>

      <div className="lv2-footer-bottom">
        <span>{t('landingV2.footer.copyright', { year: new Date().getFullYear() })}</span>
        <span>{t('landingV2.footer.madeIn')}</span>
      </div>
    </footer>
  );
}
