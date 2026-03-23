export default function PageMentions({ ctx }) {
  return (
    <div>
      {/* Topbar */}
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="topbar-breadcrumb">AImlead <span>/ Mentions légales</span></div>
        </div>
        <div className="topbar-right">
          <button className="topbar-login" onClick={ctx.openLogin}>
            <svg fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
            </svg>
            Connexion
          </button>
        </div>
      </div>

      <div className="content" style={{ paddingTop: 64, maxWidth: 760 }}>
        <div style={{ marginBottom: 40 }}>
          <div className="block-label">Informations légales</div>
          <h1 style={{
            fontFamily: 'Bricolage Grotesque, sans-serif', fontWeight: 800,
            fontSize: 'clamp(28px,3vw,44px)', letterSpacing: -1, lineHeight: 1.1,
            color: 'white', marginBottom: 12,
          }}>
            Mentions légales
          </h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,.35)' }}>Dernière mise à jour : mars 2026</p>
        </div>

        {[
          {
            title: 'Éditeur du site',
            content: [
              'AImlead SAS',
              'Société par actions simplifiée au capital de 1 000 €',
              'RCS Paris — SIRET : 000 000 000 00000',
              'Siège social : Paris, France',
              'Email : contact@aimlead.fr',
            ],
          },
          {
            title: 'Hébergement',
            content: [
              'Vercel Inc.',
              '340 Pine Street, Suite 600, San Francisco, CA 94104, USA',
              'Site : vercel.com',
            ],
          },
          {
            title: 'Propriété intellectuelle',
            content: [
              'L\'ensemble du contenu de ce site (textes, images, vidéos, logos, icônes, code source) est la propriété exclusive d\'AImlead SAS ou de ses partenaires.',
              'Toute reproduction, représentation, modification, publication ou adaptation de tout ou partie des éléments du site, quel que soit le moyen ou le procédé utilisé, est interdite, sauf autorisation écrite préalable d\'AImlead SAS.',
            ],
          },
          {
            title: 'Données personnelles',
            content: [
              'AImlead SAS traite des données personnelles dans le cadre de la fourniture de ses services. Conformément au Règlement Général sur la Protection des Données (RGPD) et à la loi Informatique et Libertés, vous disposez d\'un droit d\'accès, de rectification, d\'effacement et de portabilité de vos données.',
              'Pour exercer ces droits ou pour toute question, contactez-nous à : privacy@aimlead.fr',
              'Autorité de contrôle : Commission Nationale de l\'Informatique et des Libertés (CNIL) — cnil.fr',
            ],
          },
          {
            title: 'Cookies',
            content: [
              'Ce site utilise des cookies fonctionnels nécessaires à son bon fonctionnement, ainsi que des cookies analytiques anonymisés pour améliorer l\'expérience utilisateur. Aucun cookie publicitaire tiers n\'est déposé sans votre consentement.',
            ],
          },
          {
            title: 'Limitation de responsabilité',
            content: [
              'AImlead SAS s\'efforce de fournir des informations exactes et à jour sur ce site, mais ne saurait garantir l\'exactitude, la complétude ou l\'actualité des informations diffusées. AImlead SAS se réserve le droit de modifier, à tout moment et sans préavis, le contenu du site.',
              'AImlead SAS ne peut être tenue responsable des dommages directs ou indirects résultant de l\'utilisation de ce site.',
            ],
          },
          {
            title: 'Droit applicable',
            content: [
              'Les présentes mentions légales sont régies par le droit français. En cas de litige, les tribunaux compétents sont ceux du ressort de Paris.',
            ],
          },
        ].map((section) => (
          <div key={section.title} style={{
            marginBottom: 36, padding: '28px 32px',
            background: 'rgba(255,255,255,.03)', borderRadius: 14,
            border: '1px solid rgba(255,255,255,.07)',
          }}>
            <h2 style={{
              fontFamily: 'Bricolage Grotesque, sans-serif', fontWeight: 700,
              fontSize: 18, color: 'white', marginBottom: 14,
            }}>
              {section.title}
            </h2>
            {section.content.map((line, i) => (
              <p key={i} style={{
                fontSize: 14, color: 'rgba(255,255,255,.55)', lineHeight: 1.8,
                marginBottom: i < section.content.length - 1 ? 8 : 0,
              }}>
                {line}
              </p>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
