import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/constants/routes';

export default function PricingPreview() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const PLANS = [
    {
      slug: 'starter',
      name: t('landingV2.pricing.plans.starter.name'),
      price: 49,
      target: t('landingV2.pricing.plans.starter.target'),
      features: t('landingV2.pricing.plans.starter.features', { returnObjects: true }),
      cta: t('landingV2.pricing.plans.starter.cta'),
    },
    {
      slug: 'team',
      name: t('landingV2.pricing.plans.team.name'),
      price: 149,
      popular: true,
      target: t('landingV2.pricing.plans.team.target'),
      features: t('landingV2.pricing.plans.team.features', { returnObjects: true }),
      cta: t('landingV2.pricing.plans.team.cta'),
    },
    {
      slug: 'scale',
      name: t('landingV2.pricing.plans.scale.name'),
      price: 399,
      target: t('landingV2.pricing.plans.scale.target'),
      features: t('landingV2.pricing.plans.scale.features', { returnObjects: true }),
      cta: t('landingV2.pricing.plans.scale.cta'),
    },
  ];

  const goToSignup = (plan) => () => {
    const params = new URLSearchParams({ mode: 'signup', plan: plan.slug });
    navigate(`${ROUTES.login}?${params.toString()}`);
  };

  return (
    <section id="pricing" className="lv2-section" aria-label={t('landingV2.pricing.ariaLabel')}>
      <div className="lv2-section-inner">
        <div className="lv2-section-head">
          <span className="lv2-eyebrow">
            <span className="lv2-eyebrow-dot" />
            <span>{t('landingV2.pricing.eyebrow')}</span>
          </span>
          <h2 className="lv2-h2">
            {t('landingV2.pricing.title')} <span className="lv2-h1-gradient">{t('landingV2.pricing.titleHighlight')}</span>.
          </h2>
          <p className="lv2-sub">
            {t('landingV2.pricing.subtitle')}
          </p>
        </div>

        <div className="lv2-pricing-grid">
          {PLANS.map((plan) => (
            <article key={plan.slug} className={`lv2-price-card ${plan.popular ? 'is-popular' : ''}`}>
              {plan.popular ? (
                <span className="lv2-eyebrow">
                  <span className="lv2-eyebrow-dot" />
                  <span>{t('landingV2.pricing.popular')}</span>
                </span>
              ) : null}
              <div>
                <h3 className="lv2-price-name">{plan.name}</h3>
                <p className="lv2-sub" style={{ fontSize: 14, marginTop: 4 }}>{plan.target}</p>
              </div>
              <div className="lv2-price-amount">
                <strong>{plan.price}€</strong>
                <span>{t('landingV2.pricing.perMonth')}</span>
              </div>
              <ul className="lv2-price-features">
                {Array.isArray(plan.features) && plan.features.map((f) => <li key={f}>{f}</li>)}
              </ul>
              <button
                type="button"
                className={`lv2-btn ${plan.popular ? 'lv2-btn-primary' : 'lv2-btn-ghost'}`}
                onClick={goToSignup(plan)}
              >
                <span>{plan.cta}</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </button>
            </article>
          ))}
        </div>

        <div style={{ textAlign: 'center', marginTop: 32 }}>
          <button
            type="button"
            className="lv2-btn lv2-btn-ghost"
            onClick={() => navigate(ROUTES.pricing)}
          >
            <span>{t('landingV2.pricing.viewFull')}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  );
}
