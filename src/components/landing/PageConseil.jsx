import AnimatedBtn from './AnimatedBtn';

function Topbar({ ctx }) {
  return (
    <div className="topbar">
      <div>
        <div className="topbar-breadcrumb">AImlead <span>/ Conseil &amp; Formation</span></div>
      </div>
      <div className="topbar-right">
        <span className="chip">3 volets</span>
        <span className="chip sky">Claude certifié</span>
        <button className="topbar-login" onClick={ctx.openLogin}>
          <svg fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          Connexion
        </button>
        <AnimatedBtn variant="sky" size="sm" onClick={ctx.openBooking}>Démarrer</AnimatedBtn>
      </div>
    </div>
  );
}

export default function PageConseil({ ctx }) {
  const volets = [
    {
      num: '01',
      title: 'Prompting, Skills & Claude',
      desc: "L'essentiel pour exploiter Claude immédiatement dans votre quotidien métier.",
      items: [
        'Anatomie d\'un bon prompt',
        'Skills Claude avancés',
        'Cas d\'usage par fonction (RH, vente, ops)',
        'Exercices pratiques sur vos vraies données',
      ],
    },
    {
      num: '02',
      title: 'Connexions inter-apps',
      desc: 'Reliez Claude à vos outils existants pour créer des flux automatisés sans code.',
      items: [
        'Zapier & Make — logique de base',
        'Intégration CRM / mail / Notion',
        'API Claude — premiers appels',
        'Atelier construction de votre premier flux',
      ],
    },
    {
      num: '03',
      title: 'Sensibilisation à l\'IA',
      desc: "Décryptez les enjeux de l'IA pour piloter la transformation de votre entreprise.",
      items: [
        'Panorama des modèles et usages en 2025',
        'Risques, RGPD et éthique IA',
        'Construire sa stratégie IA d\'entreprise',
        'Séance questions/réponses dirigeants',
      ],
    },
  ];

  const formats = [
    { emoji: '🏢', title: 'Présentiel sur site', sub: 'Immersion totale, équipes réunies' },
    { emoji: '💻', title: 'Distanciel — Live', sub: 'Sessions interactives en visio' },
    { emoji: '🎯', title: 'Sur mesure métier', sub: 'Adapté à votre secteur & outils', highlight: true },
  ];

  const steps = [
    { num: '1', title: 'Audit des besoins', desc: '30 min de visio pour identifier vos priorités, vos équipes cibles et vos outils actuels.' },
    { num: '2', title: 'Programme personnalisé', desc: 'Vous recevez un programme sur mesure avec le choix des volets, formats et dates sous 48h.' },
    { num: '3', title: 'Sessions de formation', desc: 'Formations en petits groupes (max 12 pers.) avec exercices concrets sur vos vrais sujets.' },
    { num: '4', title: 'Support post-formation', desc: 'Canal Slack dédié pendant 30 jours. On répond à toutes vos questions d\'implémentation.' },
  ];

  return (
    <div>
      <Topbar ctx={ctx} />

      {/* Hero */}
      <section className="hero sky-hero" style={{ position: 'relative', overflow: 'hidden' }}>
        <svg style={{ position: 'absolute', bottom: -60, right: -40, width: 360, opacity: .06, pointerEvents: 'none' }} viewBox="0 0 360 360" fill="none">
          <g stroke="white" strokeWidth="1.2">
            <path d="M20,340 Q180,-40 340,340" /><path d="M50,340 Q180,-10 310,340" />
            <path d="M80,340 Q180,20 280,340" /><path d="M110,340 Q180,50 250,340" />
            <path d="M140,340 Q180,80 220,340" />
          </g>
        </svg>
        <div className="hero-grid" style={{ position: 'relative', zIndex: 1 }}>
          <div>
            <div className="hero-label white">Conseil &amp; Formation</div>
            <h1 className="white">Vos équipes <em>maîtrisent Claude</em> en quelques sessions.</h1>
            <p className="hero-sub white">
              Un programme structuré en 3 volets pour que chaque collaborateur tire un vrai parti
              de l'IA — dès le lendemain de la formation.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <AnimatedBtn variant="white" size="lg" onClick={ctx.openBooking}>Réserver une session</AnimatedBtn>
              <AnimatedBtn variant="ghost-white" onClick={() => document.getElementById('conseil-programme')?.scrollIntoView({ behavior: 'smooth' })}>
                Voir le programme
              </AnimatedBtn>
            </div>
          </div>
          <div className="hero-right-panel" style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.09)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(255,255,255,.35)', marginBottom: 16 }}>
              Formats disponibles
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {formats.map((f) => (
                <div key={f.title} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: 14,
                  background: f.highlight ? 'rgba(58,141,255,.1)' : 'rgba(255,255,255,.05)',
                  borderRadius: 10,
                  border: `1px solid ${f.highlight ? 'rgba(58,141,255,.2)' : 'rgba(255,255,255,.08)'}`,
                }}>
                  <span style={{ fontSize: 20 }}>{f.emoji}</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'white' }}>{f.title}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,.45)' }}>{f.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="content">
        {/* 3 Volets */}
        <div className="section-block rv" id="conseil-programme">
          <div className="block-label">Le programme</div>
          <h2 className="block-title">3 volets. <em>De la prise en main à la maîtrise.</em></h2>
          <p className="block-desc">Chaque volet est autonome. Vous choisissez votre niveau d'entrée selon les besoins de vos équipes.</p>
          <div className="volet-row rv">
            {volets.map((v) => (
              <div key={v.num} className="volet">
                <div className="volet-num">Volet {v.num}</div>
                <h4>{v.title}</h4>
                <p>{v.desc}</p>
                <ul>{v.items.map((item) => <li key={item}>{item}</li>)}</ul>
              </div>
            ))}
          </div>
        </div>

        {/* Comment ça se passe */}
        <div className="cards-2 rv" style={{ marginTop: 64 }}>
          <div>
            <div className="block-label">Comment ça se passe</div>
            <h2 className="block-title">De la prise de contact au <em>déploiement.</em></h2>
            <p className="block-desc" style={{ marginBottom: 32 }}>Un parcours fluide conçu pour que vous soyez opérationnel le plus vite possible.</p>
            <div className="steps-list">
              {steps.map((s) => (
                <div key={s.num} className="step-item">
                  <div className="step-num">{s.num}</div>
                  <div className="step-content">
                    <h4>{s.title}</h4>
                    <p>{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="card navy" style={{ padding: '40px 36px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(255,255,255,.35)', marginBottom: 20 }}>Ce que vous obtenez</div>
            <ul className="feat-list">
              {[
                'Maîtrise opérationnelle de Claude par vos équipes',
                'Bibliothèque de prompts adaptés à votre métier',
                'Premier flux automatisé fonctionnel',
                'Plan de déploiement IA sur 90 jours',
                'Support Slack 30 jours inclus',
                'Accès à notre base de ressources Claude',
              ].map((item) => (
                <li key={item} style={{ color: 'var(--white)' }}>
                  <span className="feat-arrow" style={{ color: 'var(--mint)' }}>✓</span> {item}
                </li>
              ))}
            </ul>
            <AnimatedBtn variant="sky" onClick={ctx.openBooking} style={{ width: '100%', marginTop: 32 }}>Réserver une session</AnimatedBtn>
          </div>
        </div>

        {/* CTA band */}
        <div className="cta-band rv">
          <div>
            <h3>Première session offerte pour les PME</h3>
            <p>Testez le volet 01 avec votre équipe commerciale ou marketing. Gratuit, sans engagement — pour que vous jugiez sur pièces.</p>
          </div>
          <div className="cta-band-btns">
            <AnimatedBtn variant="white" onClick={ctx.openBooking}>Réserver ma session gratuite</AnimatedBtn>
            <AnimatedBtn variant="ghost-white" onClick={() => ctx.setActivePage('lead')}>Voir le Lead-Scoreur</AnimatedBtn>
          </div>
        </div>
      </div>
    </div>
  );
}
