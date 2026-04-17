import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/constants/routes';

const PLANS = [
  {
    slug: 'starter',
    name: 'Starter',
    price: 49,
    target: 'Solo founders & petites équipes',
    features: [
      '1 000 crédits de scoring',
      '3 sièges inclus',
      '1 intégration CRM',
      'Signaux internet de base',
      'Support email',
    ],
    cta: 'Démarrer le Starter',
  },
  {
    slug: 'team',
    name: 'Team',
    price: 149,
    popular: true,
    target: "PME & équipes sales 5-20",
    features: [
      '3 500 crédits de scoring',
      '10 sièges inclus',
      '2 intégrations CRM',
      'Signaux internet avancés',
      'API de facturation',
      'Support prioritaire',
    ],
    cta: 'Passer au Team',
  },
  {
    slug: 'scale',
    name: 'Scale',
    price: 399,
    target: "ETI & organisations multi-workspace",
    features: [
      '10 000 crédits de scoring',
      '25 sièges inclus',
      '5 intégrations CRM',
      'API complète',
      'Audit log entreprise',
      'CSM dédié',
    ],
    cta: 'Contacter Scale',
  },
];

export default function PricingPreview() {
  const navigate = useNavigate();

  const goToSignup = (plan) => () => {
    const params = new URLSearchParams({ mode: 'signup', plan: plan.slug });
    navigate(`${ROUTES.login}?${params.toString()}`);
  };

  return (
    <section id="pricing" className="lv2-section" aria-label="Tarifs">
      <div className="lv2-section-inner">
        <div className="lv2-section-head">
          <span className="lv2-eyebrow">
            <span className="lv2-eyebrow-dot" />
            <span>Tarifs transparents</span>
          </span>
          <h2 className="lv2-h2">
            Choisissez votre <span className="lv2-h1-gradient">vitesse d'exécution</span>.
          </h2>
          <p className="lv2-sub">
            Tous les plans incluent le scoring Claude, les signaux internet et l'accompagnement d'onboarding.
          </p>
        </div>

        <div className="lv2-pricing-grid">
          {PLANS.map((plan) => (
            <article key={plan.slug} className={`lv2-price-card ${plan.popular ? 'is-popular' : ''}`}>
              {plan.popular ? (
                <span className="lv2-eyebrow">
                  <span className="lv2-eyebrow-dot" />
                  <span>Le plus populaire</span>
                </span>
              ) : null}
              <div>
                <h3 className="lv2-price-name">{plan.name}</h3>
                <p className="lv2-sub" style={{ fontSize: 14, marginTop: 4 }}>{plan.target}</p>
              </div>
              <div className="lv2-price-amount">
                <strong>{plan.price}€</strong>
                <span>/ mois</span>
              </div>
              <ul className="lv2-price-features">
                {plan.features.map((f) => <li key={f}>{f}</li>)}
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
            <span>Voir la grille complète</span>
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
