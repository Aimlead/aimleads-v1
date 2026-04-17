import { Link } from 'react-router-dom';
import { ROUTES } from '@/constants/routes';

export default function FooterV2({ onOpenBooking }) {
  return (
    <footer className="lv2-footer">
      <div className="lv2-footer-inner">
        <div className="lv2-footer-brand">
          <div className="lv2-nav-brand" style={{ gap: 10 }}>
            <span className="lv2-nav-logo" aria-hidden="true" />
            <span>AimLeads</span>
          </div>
          <p>
            L'IA qui travaille pendant que vos équipes scalent. Lead-Scoreur, BDR automatisé et
            formation Claude — pensés pour les PME & ETI françaises.
          </p>
        </div>

        <div>
          <h5>Produits</h5>
          <Link to="/">Lead-Scoreur</Link>
          <Link to="/">BDR Automatisé</Link>
          <Link to="/">Conseil & Formation</Link>
          <Link to={ROUTES.pricing}>Tarifs</Link>
        </div>

        <div>
          <h5>Ressources</h5>
          <Link to={ROUTES.help}>Centre d'aide</Link>
          <Link to={ROUTES.login}>Se connecter</Link>
          <button type="button" onClick={onOpenBooking}>Demander un audit</button>
        </div>

        <div>
          <h5>Légal</h5>
          <Link to="/">Mentions légales</Link>
          <Link to="/">Confidentialité</Link>
          <Link to="/">CGU</Link>
        </div>
      </div>

      <div className="lv2-footer-bottom">
        <span>© {new Date().getFullYear()} AimLeads. Tous droits réservés.</span>
        <span>Fait en France — avec Claude.</span>
      </div>
    </footer>
  );
}
