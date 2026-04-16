import AnimatedBtn from './AnimatedBtn';

function Topbar({ ctx }) {
  return (
    <div className="topbar">
      <div><div className="topbar-breadcrumb">AImlead <span>/ Lead-Scoreur</span></div></div>
      <div className="topbar-right">
        <span className="chip">SaaS</span>
        <span className="chip mint">Signal temps réel</span>
        <button className="topbar-login" onClick={ctx.openLogin}>
          <svg fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
          </svg>
          Connexion
        </button>
        <AnimatedBtn variant="sky" size="sm" onClick={ctx.goToApp}>Créer un compte</AnimatedBtn>
      </div>
    </div>
  );
}

const mockLeads = [
  { company: 'Nexum Logistics', score: 87, industry: 'Transport & Logistique', signal: 'Recrutement SDR actif', badge: 'top', badgeColor: '#5AD38C' },
  { company: 'Axiom Software', score: 74, industry: 'SaaS B2B', signal: 'Levée de fonds série A', badge: 'chaud', badgeColor: '#3A8DFF' },
  { company: 'Carbonis Group', score: 61, industry: 'Industrie verte', signal: 'Expansion marché FR', badge: 'tiède', badgeColor: '#F5A623' },
];

export default function PageLead({ ctx }) {
  return (
    <div>
      <Topbar ctx={ctx} />

      <section className="hero" style={{ background: 'var(--navy)', padding: '72px 52px 80px', position: 'relative', overflow: 'hidden' }}>
        <svg style={{ position: 'absolute', bottom: -60, right: -40, width: 360, opacity: .06, pointerEvents: 'none' }} viewBox="0 0 360 240" fill="none">
          <g stroke="white" strokeWidth="1.2" fill="none">
            <path d="M0,60 C60,30 120,90 180,60 S300,30 360,60" />
            <path d="M0,90 C60,60 120,120 180,90 S300,60 360,90" />
            <path d="M0,120 C60,90 120,150 180,120 S300,90 360,120" />
            <path d="M0,150 C60,120 120,180 180,150 S300,120 360,150" />
            <path d="M0,180 C60,150 120,210 180,180 S300,150 360,180" />
          </g>
        </svg>
        <div className="hero-grid" style={{ position: 'relative', zIndex: 1 }}>
          <div>
            <div className="hero-label white">Lead-Scoreur</div>
            <h1 className="white">Vos SDR contactent<br /><em>uniquement les bons leads.</em></h1>
            <p className="hero-sub white">
              Un moteur d'analyse alimenté par l'IA qui score, classe et alerte vos équipes sur
              les prospects à fort potentiel — en temps réel.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <AnimatedBtn variant="sky" size="lg" onClick={ctx.goToApp}>Démarrer gratuitement</AnimatedBtn>
              <AnimatedBtn variant="ghost-white" onClick={() => document.getElementById('lead-features')?.scrollIntoView({ behavior: 'smooth' })}>Voir les fonctionnalités</AnimatedBtn>
            </div>
          </div>

          <div className="saas-mock">
            <div className="mock-titlebar">
              <div className="mock-dots">
                <span className="md md-r" /><span className="md md-y" /><span className="md md-g" />
              </div>
              <div className="mock-url">app.aimlead.io/pipeline</div>
            </div>
            <div className="mock-content">
              <div className="mock-header-row">
                <span className="mock-title-txt">Pipeline actif — 24 leads</span>
                <span className="mock-filter">ICP: SaaS B2B ▾</span>
              </div>
              <div className="mock-cols">
                <span className="mock-col-head">Entreprise</span>
                <span className="mock-col-head">Score</span>
                <span className="mock-col-head">Signal</span>
                <span className="mock-col-head">Δ 7j</span>
              </div>
              <div className="mock-data-row">
                <div className="mock-cell"><div className="mock-avatar">TC</div>TechCorp SAS</div>
                <div className="mock-cell"><span className="mock-score-pill ps-h">94</span></div>
                <div className="mock-cell"><span className="mock-tag mt-hot">Recrutement</span></div>
                <div className="mock-cell mock-trend t-up">↑ +12</div>
              </div>
              <div className="mock-data-row">
                <div className="mock-cell"><div className="mock-avatar">FP</div>FinPro Group</div>
                <div className="mock-cell"><span className="mock-score-pill ps-h">88</span></div>
                <div className="mock-cell"><span className="mock-tag mt-hot">Levée fonds</span></div>
                <div className="mock-cell mock-trend t-up">↑ +8</div>
              </div>
              <div className="mock-data-row">
                <div className="mock-cell"><div className="mock-avatar">IG</div>Innova Group</div>
                <div className="mock-cell"><span className="mock-score-pill ps-m">67</span></div>
                <div className="mock-cell"><span className="mock-tag mt-warm">Croissance</span></div>
                <div className="mock-cell mock-trend t-up">↑ +3</div>
              </div>
              <div className="mock-data-row">
                <div className="mock-cell"><div className="mock-avatar">DS</div>Distrib Store</div>
                <div className="mock-cell"><span className="mock-score-pill ps-l">31</span></div>
                <div className="mock-cell"><span className="mock-tag mt-cold">Hors ICP</span></div>
                <div className="mock-cell mock-trend t-down">↓ −5</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="content">
        <div className="stats-row rv" style={{ marginTop: 0, borderRadius: '0 0 14px 14px' }}>
          <div className="stat-box">
            <div className="stat-val"><span className="accent">94%</span></div>
            <div className="stat-desc">précision de classification ICP</div>
          </div>
          <div className="stat-box">
            <div className="stat-val"><span className="accent">2×</span></div>
            <div className="stat-desc">taux de réponse sur leads scorés</div>
          </div>
          <div className="stat-box">
            <div className="stat-val"><span className="accent">−60%</span></div>
            <div className="stat-desc">de temps qualif. pour vos SDR</div>
          </div>
        </div>

        <div className="section-block rv" id="lead-features">
          <div className="block-label">Fonctionnalités clés</div>
          <h2 className="block-title">Tout ce dont vos SDR <em>ont besoin</em>.</h2>
          <p className="block-desc">Un outil pensé pour les équipes commerciales — pas pour les data scientists.</p>
          <div className="cards-3">
            <div className="card rv">
              <div className="card-icon mint-bg">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
              </div>
              <h3>Scoring automatisé</h3>
              <p>Chaque lead reçoit un score 0–100 basé sur votre ICP. Mono-lead ou import CSV multi-leads en masse.</p>
            </div>
            <div className="card rv d1">
              <div className="card-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
                </svg>
              </div>
              <h3>Matching ICP intelligent</h3>
              <p>Définissez votre profil client idéal en 5 min. Le moteur l'apprend et s'affine à chaque validation.</p>
            </div>
            <div className="card rv d2">
              <div className="card-icon coral-bg">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 01-3.46 0" />
                </svg>
              </div>
              <h3>Détection de signaux</h3>
              <p>Recrutement, levée de fonds, expansion : alertes en temps réel dès qu'un signal fort est détecté.</p>
            </div>
            <div className="card rv sand">
              <div className="card-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 9h6M9 12h6M9 15h4" />
                </svg>
              </div>
              <h3>Dashboard SDR intégré</h3>
              <p>Vue pipeline complète, filtres ICP, priorisation automatique et notes collaboratives.</p>
            </div>
            <div className="card rv sand d1">
              <div className="card-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
                </svg>
              </div>
              <h3>Enrichissement data</h3>
              <p>Secteur, taille, tech stack, actualités : chaque lead enrichi automatiquement à partir de sources ouvertes.</p>
            </div>
            <div className="card rv sand d2">
              <div className="card-icon mint-bg">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
              </div>
              <h3>Export CRM natif</h3>
              <p>HubSpot, Salesforce, Pipedrive — synchronisation automatique des leads qualifiés.</p>
            </div>
          </div>
        </div>

        <div className="section-block rv">
          <div className="block-label navy">Comparatif</div>
          <h2 className="block-title">Avant / <em>Après AImlead.</em></h2>
          <table className="compare-table" style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(0,31,77,.08)' }}>
            <tbody>
              <tr><th>Action SDR</th><th>Sans AImlead</th><th>Avec AImlead</th></tr>
              <tr><td>Qualification d'un lead</td><td>45 min de recherche manuelle</td><td>Score automatique en 30 sec</td></tr>
              <tr><td>Import de 100 leads</td><td>2 jours de traitement</td><td>15 min, score instantané</td></tr>
              <tr><td>Détection d'une opportunité</td><td>Veille manuelle aléatoire</td><td>Alerte en temps réel</td></tr>
              <tr><td>Taux de joignabilité</td><td>~18% en moyenne</td><td>~42% sur leads scorés</td></tr>
              <tr><td>Sync CRM</td><td>Export/import manuel</td><td>Automatique, bidirectionnel</td></tr>
            </tbody>
          </table>
        </div>

        <div className="cta-band rv">
          <div>
            <h3>Essayez le Lead-Scoreur dans l'app</h3>
            <p>Créez votre espace, importez vos premiers leads et testez le scoring directement depuis l'application.</p>
          </div>
          <div className="cta-band-btns">
            <AnimatedBtn variant="white" onClick={ctx.goToApp}>Créer mon compte</AnimatedBtn>
            <AnimatedBtn variant="ghost-white" onClick={() => ctx.setActivePage('bdr')}>Découvrir le BDR →</AnimatedBtn>
          </div>
        </div>
      </div>
    </div>
  );
}
