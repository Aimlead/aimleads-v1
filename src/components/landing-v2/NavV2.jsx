import { Link } from 'react-router-dom';
import { ROUTES } from '@/constants/routes';
import BrandLogo from '@/components/brand/BrandLogo';

export default function NavV2({ onOpenBooking }) {
  const scrollTo = (id) => (e) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <nav className="lv2-nav" aria-label="Navigation principale">
      <Link to="/" className="lv2-nav-brand" aria-label="AimLeads — accueil">
        <BrandLogo variant="mark" tone="light" className="lv2-nav-brand-mark" alt="AimLeads" />
        <span>AimLeads</span>
      </Link>

      <div className="lv2-nav-links">
        <button type="button" className="lv2-nav-link" onClick={scrollTo('products')}>Produits</button>
        <button type="button" className="lv2-nav-link" onClick={scrollTo('workflow')}>Workflow</button>
        <button type="button" className="lv2-nav-link" onClick={scrollTo('pricing')}>Tarifs</button>
        <Link className="lv2-nav-link" to={ROUTES.login}>Se connecter</Link>
      </div>

      <button type="button" className="lv2-nav-cta" onClick={onOpenBooking}>
        Audit offert
      </button>
    </nav>
  );
}
