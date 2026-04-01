import WaveCanvas from './WaveCanvas';
import AnimatedBtn from './AnimatedBtn';

function IconConseil() {
  return (
    <svg width="32" height="32" viewBox="0 0 44 44" fill="none" stroke="rgba(245,240,232,.85)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="22" cy="10" r="5" />
      <path d="M14 26c0-4.4 3.6-8 8-8s8 3.6 8 8" />
      <line x1="22" y1="26" x2="22" y2="36" />
      <line x1="17" y1="36" x2="27" y2="36" />
      <path d="M31 8a6 6 0 0 1 0 8" />
      <line x1="33" y1="12" x2="36" y2="12" />
      <path d="M34 8l2-2M34 16l2 2" />
    </svg>
  );
}

function IconLead() {
  return (
    <svg width="32" height="32" viewBox="0 0 44 44" fill="none" stroke="rgba(255,255,255,.9)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="24" width="6" height="14" rx="1" />
      <rect x="16" y="16" width="6" height="22" rx="1" />
      <rect x="26" y="8" width="6" height="30" rx="1" />
      <polyline points="6,22 16,14 26,6 38,10" />
      <circle cx="38" cy="10" r="2.5" fill="rgba(58,141,255,1)" stroke="rgba(255,255,255,.9)" strokeWidth="1.5" />
      <line x1="36" y1="36" x2="42" y2="36" />
      <line x1="39" y1="33" x2="39" y2="39" />
    </svg>
  );
}

function IconBDR() {
  return (
    <svg width="32" height="32" viewBox="0 0 44 44" fill="none" stroke="rgba(255,255,255,.9)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 6a16 16 0 0 1 13.9 8" />
      <polyline points="38 6 35.9 14 28 11.9" />
      <path d="M22 38a16 16 0 0 1-13.9-8" />
      <polyline points="6 38 8.1 30 16 32.1" />
      <circle cx="22" cy="22" r="6" />
      <line x1="20" y1="20" x2="24" y2="24" />
      <line x1="24" y1="20" x2="20" y2="24" />
    </svg>
  );
}

function ProductCard({ num, icon, title, description, iconBg, iconBorder, onClick }) {
  return (
    <a
      className={`prod-card prod-card-${num}`}
      href="#"
      onClick={(e) => { e.preventDefault(); onClick(); }}
    >
      <WaveCanvas
        color={num === 1 ? '#F5F0E8' : num === 2 ? '#3A8DFF' : '#5AD38C'}
        speed={num === 1 ? 1.4 : num === 2 ? 2.0 : 1.6}
        intensity={num === 1 ? 5.0 : num === 2 ? 7.0 : 6.0}
      />
      <div className="pc-fade" />
      <div className="pc-content">
        <div className="pc-svg-icon" style={{ background: iconBg, borderColor: iconBorder }}>
          {icon}
        </div>
        <h3>{title}</h3>
        <p>{description}</p>
        <div className="pc-arrow">Découvrir →</div>
      </div>
    </a>
  );
}

export default function PageHome({ ctx }) {
  return (
    <div style={{ minHeight: '100vh' }}>
      <section className="geo-hero">
        <div className="geo-shapes">
          <div className="geo-shape geo-s1" />
          <div className="geo-shape geo-s2" />
          <div className="geo-shape geo-s3" />
          <div className="geo-shape geo-s4" />
          <div className="geo-shape geo-s5" />
        </div>

        <div className="geo-content">
          <div className="geo-badge">
            <span className="geo-badge-dot" />
            <span className="geo-badge-txt">IA accessible aux PME &amp; ETI</span>
          </div>

          <h1 className="geo-title">
            <span className="geo-title-line1">L'IA qui travaille.</span>
            <span className="geo-title-line2">Pendant que vous scalez.</span>
          </h1>

          <p className="geo-sub">
            aimlead rend l'intelligence artificielle concrète et rentable — de la formation Claude
            à l'automatisation complète de votre prospection.
          </p>

          <div className="geo-ctas">
            <AnimatedBtn variant="sky" size="lg" onClick={ctx.openBooking}>
              Audit offert — Démarrer
            </AnimatedBtn>
            <AnimatedBtn variant="ghost-white" onClick={() => ctx.setActivePage('conseil')}>
              Voir nos solutions
            </AnimatedBtn>
          </div>

          <div className="geo-cards">
            <div className="product-cards-home">
              <ProductCard
                num={1}
                icon={<IconConseil />}
                title="Conseil & Formation"
                description="Maîtrisez Claude avec nos 3 volets : prompting, connexions, sensibilisation IA."
                iconBg="rgba(255,255,255,.05)"
                iconBorder="rgba(255,255,255,.1)"
                onClick={() => ctx.setActivePage('conseil')}
              />
              <ProductCard
                num={2}
                icon={<IconLead />}
                title="Lead-Scoreur SaaS"
                description="Scoring automatisé, matching ICP et détection de signaux pour vos SDR."
                iconBg="rgba(58,141,255,.15)"
                iconBorder="rgba(58,141,255,.25)"
                onClick={() => ctx.setActivePage('lead')}
              />
              <ProductCard
                num={3}
                icon={<IconBDR />}
                title="BDR Automatisé"
                description="Appels, relances, mails — un agent IA qui prospecte à votre place, 24/7."
                iconBg="rgba(90,211,140,.1)"
                iconBorder="rgba(90,211,140,.2)"
                onClick={() => ctx.setActivePage('bdr')}
              />
            </div>
          </div>
        </div>
      </section>

      <div className="home-stats-strip">
        <div className="hss-item rv">
          <span className="hss-val">3<span className="hss-x">×</span></span>
          <span className="hss-label">plus de leads qualifiés</span>
        </div>
        <div className="hss-sep" />
        <div className="hss-item rv d1">
          <span className="hss-val">−70<span className="hss-x">%</span></span>
          <span className="hss-label">de temps en prospection</span>
        </div>
        <div className="hss-sep" />
        <div className="hss-item rv d2">
          <span className="hss-val">J+<span className="hss-x">14</span></span>
          <span className="hss-label">premiers résultats mesurés</span>
        </div>
      </div>

      <div className="home-blocages">
        <div className="hb-intro rv">
          <div className="block-label" style={{ color: 'rgba(255,255,255,.35)' }}>
            <span style={{ display: 'inline-block', width: 20, height: 1.5, background: 'rgba(255,255,255,.25)', marginRight: 10, verticalAlign: 'middle' }} />
            Pourquoi aimlead
          </div>
          <h2 style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800, fontSize: 'clamp(28px,3.5vw,46px)', letterSpacing: -1.2, lineHeight: 1.08, color: 'var(--white)', marginBottom: 0 }}>
            Trois blocages.<br /><em style={{ fontStyle: 'normal', color: 'var(--sky)' }}>Une solution.</em>
          </h2>
        </div>
        <div className="hb-list">
          {[
            {
              num: '01', title: 'Par où commencer ?',
              desc: "Audit offert, feuille de route claire, priorisation des cas d'usage à fort ROI. On structure tout pour vous.",
              svg: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></svg>,
            },
            {
              num: '02', title: 'Mes équipes ne suivent pas',
              desc: 'Formation sur mesure en 3 volets, adaptée à votre secteur. Adoption garantie ou on recommence.',
              svg: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></svg>,
            },
            {
              num: '03', title: 'La prospection prend trop de temps',
              desc: "Scoring automatique + BDR IA : vos SDR ne contactent que des prospects chauds. Le reste est automatisé.",
              svg: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
            },
          ].map((item) => (
            <div key={item.num} className={`hb-item rv${item.num !== '01' ? ` d${item.num === '02' ? 1 : 2}` : ''}`}>
              <span className="hb-num">{item.num}</span>
              <div className="hb-body">
                <h4>{item.title}</h4>
                <p>{item.desc}</p>
              </div>
              <div className="hb-icon">{item.svg}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="home-cta-final rv">
        <div className="hcf-pill hcf-p1" />
        <div className="hcf-pill hcf-p2" />
        <div className="hcf-halo" />
        <div className="hcf-inner">
          <div className="hcf-eyebrow">Audit offert · Sans engagement · Sous 24h</div>
          <h2 className="hcf-title">Prêt à faire travailler<br />l'IA pour vous ?</h2>
          <p className="hcf-sub">30 minutes pour identifier vos 3 priorités IA et repartir avec un plan d'action concret.</p>
          <div className="hcf-btns">
            <AnimatedBtn variant="sky" size="lg" onClick={ctx.openBooking}>Réserver mon audit gratuit</AnimatedBtn>
            <AnimatedBtn variant="ghost-white" onClick={() => ctx.setActivePage('lead')}>Voir le Lead-Scoreur</AnimatedBtn>
          </div>
        </div>
      </div>
    </div>
  );
}
