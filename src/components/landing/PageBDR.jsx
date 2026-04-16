import { useState } from 'react';
import AnimatedBtn from './AnimatedBtn';
import { landingBodyFont, landingHeadingFont } from '../../lib/brandFonts';

function Topbar({ ctx }) {
  return (
    <div className="topbar">
      <div><div className="topbar-breadcrumb">AImlead <span>/ BDR Automatisé</span></div></div>
      <div className="topbar-right">
        <span className="chip">IA Agent</span>
        <span className="chip sky">24/7 actif</span>
        <button className="topbar-login" onClick={ctx.openLogin}>
          <svg fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
          </svg>
          Connexion
        </button>
        <AnimatedBtn variant="sky" size="sm" onClick={ctx.openBooking}>Activer mon BDR</AnimatedBtn>
      </div>
    </div>
  );
}

function GastonSlack({ ctx: _ctx }) {
  const [channel, setChannel] = useState('slack');

  return (
    <div style={{ maxWidth: 680 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          onClick={() => setChannel('slack')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 16px',
            borderRadius: 8, border: `1px solid ${channel === 'slack' ? 'rgba(255,255,255,.15)' : 'rgba(255,255,255,.08)'}`,
            background: channel === 'slack' ? 'rgba(255,255,255,.1)' : 'rgba(255,255,255,.04)',
            color: channel === 'slack' ? 'var(--white)' : 'rgba(255,255,255,.5)',
            fontFamily: landingBodyFont, fontSize: 13, fontWeight: channel === 'slack' ? 600 : 500, cursor: 'pointer', transition: 'all .2s',
          }}
        >
          <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, flexShrink: 0 }}>
            <path d="M5.042 15.165a2.528 2.528 0 01-2.52 2.523A2.528 2.528 0 010 15.165a2.527 2.527 0 012.522-2.52h2.52v2.52z" fill="#E01E5A" />
            <path d="M6.313 15.165a2.527 2.527 0 012.521-2.52 2.527 2.527 0 012.521 2.52v6.313A2.528 2.528 0 018.834 24a2.528 2.528 0 01-2.521-2.522v-6.313z" fill="#E01E5A" />
            <path d="M8.834 5.042a2.528 2.528 0 01-2.521-2.52A2.528 2.528 0 018.834 0a2.528 2.528 0 012.521 2.522v2.52H8.834z" fill="#36C5F0" />
            <path d="M8.834 6.313a2.528 2.528 0 012.521 2.521 2.528 2.528 0 01-2.521 2.521H2.522A2.528 2.528 0 010 8.834a2.528 2.528 0 012.522-2.521h6.312z" fill="#36C5F0" />
            <path d="M18.956 8.834a2.528 2.528 0 012.522-2.521A2.528 2.528 0 0124 8.834a2.528 2.528 0 01-2.522 2.521h-2.522V8.834z" fill="#2EB67D" />
            <path d="M17.688 8.834a2.528 2.528 0 01-2.523 2.521 2.527 2.527 0 01-2.52-2.521V2.522A2.527 2.527 0 0115.165 0a2.528 2.528 0 012.523 2.522v6.312z" fill="#2EB67D" />
            <path d="M15.165 18.956a2.528 2.528 0 012.523 2.522A2.528 2.528 0 0115.165 24a2.527 2.527 0 01-2.52-2.522v-2.522h2.52z" fill="#ECB22E" />
            <path d="M15.165 17.688a2.527 2.527 0 01-2.52-2.523 2.526 2.526 0 012.52-2.52h6.313A2.527 2.527 0 0124 15.165a2.528 2.528 0 01-2.522 2.523h-6.313z" fill="#ECB22E" />
          </svg>
          Slack
        </button>
        <button
          onClick={() => setChannel('teams')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 16px',
            borderRadius: 8, border: `1px solid ${channel === 'teams' ? 'rgba(255,255,255,.15)' : 'rgba(255,255,255,.08)'}`,
            background: channel === 'teams' ? 'rgba(255,255,255,.1)' : 'rgba(255,255,255,.04)',
            color: channel === 'teams' ? 'var(--white)' : 'rgba(255,255,255,.5)',
            fontFamily: landingBodyFont, fontSize: 13, fontWeight: channel === 'teams' ? 600 : 500, cursor: 'pointer', transition: 'all .2s',
          }}
        >
          <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, flexShrink: 0 }}>
            <path d="M20.625 7.875H13.5a.75.75 0 00-.75.75v6a.75.75 0 00.75.75h7.125a.75.75 0 00.75-.75v-6a.75.75 0 00-.75-.75zM9 4.5a2.25 2.25 0 100 4.5A2.25 2.25 0 009 4.5z" fill="#6264A7" />
            <path d="M12.354 15.938A4.481 4.481 0 0110.5 12.75v-.75H4.5a.75.75 0 00-.75.75v4.5A3.75 3.75 0 007.5 21h1.073a4.494 4.494 0 003.781-5.062z" fill="#6264A7" />
            <circle cx="17.25" cy="5.25" r="2.25" fill="#6264A7" />
          </svg>
          Microsoft Teams
        </button>
      </div>

      {channel === 'slack' && (
        <div>
          <div className="slack-header">
            <div className="slack-logo">
              <span style={{ background: '#E01E5A' }} /><span style={{ background: '#36C5F0' }} />
              <span style={{ background: '#2EB67D' }} /><span style={{ background: '#ECB22E' }} />
            </div>
            <div className="slack-ch"># <span>gaston-reports</span></div>
            <div className="slack-online">En ligne</div>
          </div>
          <div className="slack-body">
            <div className="slack-msg">
              <div className="slack-msg-av gaston-av">G</div>
              <div className="slack-msg-body">
                <div className="slack-msg-name">Gaston <span className="bot-badge">APP</span> <span className="msg-time">Lun 09:01</span></div>
                <div className="slack-msg-text">Bonjour équipe 👋 Voici votre rapport hebdomadaire :</div>
                <div className="slack-report-card">
                  <div className="src-title">
                    <svg fill="none" stroke="rgba(255,255,255,.6)" strokeWidth="1.5" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 9h6M9 12h6M9 15h4" />
                    </svg>
                    Rapport semaine 12 — Prospection outbound
                  </div>
                  <div className="src-row"><span className="src-key">Séquences lancées</span><span className="src-val sky">214</span></div>
                  <div className="src-row"><span className="src-key">Réponses positives</span><span className="src-val green">38 <small style={{ fontWeight: 300, color: 'rgba(255,255,255,.3)' }}>(+18% / sem. préc.)</small></span></div>
                  <div className="src-row"><span className="src-key">RDV qualifiés</span><span className="src-val green">12</span></div>
                  <div className="src-row"><span className="src-key">Hors ICP filtrés</span><span className="src-val coral">67</span></div>
                  <div className="src-row"><span className="src-key">Handoffs → commerciaux</span><span className="src-val sky">8</span></div>
                </div>
                <div className="slack-reaction"><span className="reac">👍 4</span><span className="reac">🔥 2</span><span className="reac">✅ 3</span></div>
              </div>
            </div>
            <div className="slack-msg">
              <div className="slack-msg-av user-av">MC</div>
              <div className="slack-msg-body">
                <div className="slack-msg-name">Marie C. <span className="msg-time">09:04</span></div>
                <div className="slack-msg-text">Super Gaston ! Qui sont les 12 RDV qualifiés cette semaine ?</div>
              </div>
            </div>
            <div className="slack-msg">
              <div className="slack-msg-av gaston-av">G</div>
              <div className="slack-msg-body">
                <div className="slack-msg-name">Gaston <span className="bot-badge">APP</span> <span className="msg-time">09:04</span></div>
                <div className="slack-msg-text">
                  Voici les <strong>top 3 leads chauds</strong> à rappeler en priorité :<br /><br />
                  🟢 <span className="tag-mint">TechCorp SAS</span> — Score 94 · Signal : recrutement CDO<br />
                  🟢 <span className="tag-mint">FinPro Group</span> — Score 88 · Signal : levée de fonds<br />
                  🔵 <span className="tag-sky">Innova Group</span> — Score 71 · Signal : expansion EU<br /><br />
                  Les 9 autres sont dans votre <strong>pipeline CRM</strong> → <span style={{ color: 'var(--sky)', textDecoration: 'underline', cursor: 'pointer' }}>Voir sur HubSpot</span>
                </div>
                <div className="slack-reaction"><span className="reac">🎯 6</span><span className="reac">💪 3</span></div>
              </div>
            </div>
          </div>
          <div className="slack-input-row">
            <input className="slack-input" placeholder="Demandez quelque chose à Gaston…" readOnly />
            <button className="slack-send">
              <svg fill="none" stroke="white" strokeWidth="2.2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {channel === 'teams' && (
        <div>
          <div style={{ background: 'rgba(98,100,167,.12)', border: '1px solid rgba(98,100,167,.25)', borderRadius: '14px 14px 0 0', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg viewBox="0 0 24 24" style={{ width: 20, height: 20, flexShrink: 0 }}>
              <path d="M20.625 7.875H13.5a.75.75 0 00-.75.75v6a.75.75 0 00.75.75h7.125a.75.75 0 00.75-.75v-6a.75.75 0 00-.75-.75zM9 4.5a2.25 2.25 0 100 4.5A2.25 2.25 0 009 4.5z" fill="#9496c4" />
              <path d="M12.354 15.938A4.481 4.481 0 0110.5 12.75v-.75H4.5a.75.75 0 00-.75.75v4.5A3.75 3.75 0 007.5 21h1.073a4.494 4.494 0 003.781-5.062z" fill="#9496c4" />
              <circle cx="17.25" cy="5.25" r="2.25" fill="#9496c4" />
            </svg>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--white)' }}>Gaston <span style={{ color: 'rgba(255,255,255,.35)', fontWeight: 400 }}>/ Canal</span> <strong style={{ color: '#9496c4' }}>#gaston-rapports</strong></span>
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#5AD38C' }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#5AD38C', display: 'inline-block' }} />En ligne
            </span>
          </div>
          <div style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)', borderTop: '1px solid rgba(98,100,167,.15)', padding: 20, display: 'flex', flexDirection: 'column', gap: 18, minHeight: 340 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg,#6264A7,#9496c4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: landingHeadingFont, fontWeight: 800, fontSize: 13, color: '#fff', flexShrink: 0 }}>G</div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--white)', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                  Gaston <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase', background: 'rgba(98,100,167,.3)', color: '#9496c4', padding: '2px 6px', borderRadius: 4 }}>APP</span>
                  <span style={{ fontWeight: 300, color: 'rgba(255,255,255,.25)', fontSize: 11 }}>Lun 09:02</span>
                </div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,.7)', lineHeight: 1.6 }}>👋 Bonjour équipe ! Voici le <strong style={{ color: 'var(--white)' }}>Rapport Hebdomadaire — Semaine 12</strong></div>
                <div style={{ marginTop: 10, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.09)', borderLeft: '3px solid #9496c4', borderRadius: '0 8px 8px 0', padding: '12px 14px', fontSize: 12 }}>
                  <div style={{ fontWeight: 700, color: 'rgba(255,255,255,.85)', marginBottom: 8, fontSize: 13 }}>📊 Prospection outbound — S12</div>
                  {[['Séquences envoyées', '214', 'var(--sky)'], ['Réponses positives', '38 (+18%)', 'var(--mint)'], ['RDV qualifiés', '12', 'var(--mint)'], ['Handoffs → commerciaux', '8', 'var(--sky)']].map(([k, v, c]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,.05)' }}>
                      <span style={{ color: 'rgba(255,255,255,.4)' }}>{k}</span>
                      <span style={{ fontWeight: 600, color: c }}>{v}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  {['👍 4', '🔥 2'].map((r) => <span key={r} style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 100, padding: '2px 8px', fontSize: 12, cursor: 'pointer', color: 'rgba(255,255,255,.6)' }}>{r}</span>)}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'rgba(255,255,255,.65)', flexShrink: 0 }}>TL</div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--white)', marginBottom: 3 }}>Thomas L. <span style={{ fontWeight: 300, color: 'rgba(255,255,255,.25)', fontSize: 11 }}>09:05</span></div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,.7)', lineHeight: 1.6 }}>Gaston, génère-moi un récap des leads prioritaires pour ma réunion de 10h.</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg,#6264A7,#9496c4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: landingHeadingFont, fontWeight: 800, fontSize: 13, color: '#fff', flexShrink: 0 }}>G</div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--white)', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                  Gaston <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase', background: 'rgba(98,100,167,.3)', color: '#9496c4', padding: '2px 6px', borderRadius: 4 }}>APP</span>
                  <span style={{ fontWeight: 300, color: 'rgba(255,255,255,.25)', fontSize: 11 }}>09:05</span>
                </div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,.7)', lineHeight: 1.6 }}>
                  Voici ton <strong style={{ color: 'var(--white)' }}>brief pré-réunion</strong> Thomas :<br /><br />
                  🟢 <span style={{ color: 'var(--mint)', fontWeight: 600 }}>TechCorp SAS</span> — Score 94 · Signal : recrutement CDO<br />
                  🟢 <span style={{ color: 'var(--mint)', fontWeight: 600 }}>FinPro Group</span> — Score 88 · Signal : levée de fonds B<br />
                  🔵 <span style={{ color: '#9496c4', fontWeight: 600 }}>Innova Group</span> — Score 71 · Signal : expansion EU<br /><br />
                  Fiche complète dans ton <span style={{ color: '#9496c4', textDecoration: 'underline', cursor: 'pointer' }}>CRM HubSpot →</span>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  {['🎯 5', '💪 2'].map((r) => <span key={r} style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 100, padding: '2px 8px', fontSize: 12, cursor: 'pointer', color: 'rgba(255,255,255,.6)' }}>{r}</span>)}
                </div>
              </div>
            </div>
          </div>
          <div style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', borderTop: 'none', borderRadius: '0 0 14px 14px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <input className="slack-input" placeholder="Répondre à Gaston dans Teams…" readOnly style={{ flex: 1 }} />
            <button className="slack-send" style={{ background: '#6264A7' }}>
              <svg fill="none" stroke="white" strokeWidth="2.2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PageBDR({ ctx }) {
  const timelineItems = [
    {
      day: 'Jour 1',
      title: 'Email de premier contact',
      desc: "Message personnalisé basé sur le profil enrichi du prospect et un signal détecté.",
      status: 'bdr-s-done',
      statusLabel: 'Envoyé — Ouvert ✓',
    },
    {
      day: 'Jour 3',
      title: 'Relance email + LinkedIn',
      desc: "Approche multicanal si pas de réponse. Angle différent, valeur ajoutée spécifique.",
      status: 'bdr-s-done',
      statusLabel: 'Envoyé ✓',
    },
    {
      day: 'Jour 6',
      title: 'Appel sortant automatisé',
      desc: "Tentative d'appel avec script adapté. Qualification vocale si décroché.",
      status: 'bdr-s-prog',
      statusLabel: 'En cours',
    },
    {
      day: 'Jour 10',
      title: 'Break-up email + handoff',
      desc: "Si intéressé : RDV automatiquement qualifié et transmis à votre commercial.",
      status: 'bdr-s-sched',
      statusLabel: 'Planifié',
    },
  ];

  const setupCards = [
    {
      num: '01',
      title: 'Brief & ICP',
      desc: "Vous nous transmettez votre ICP, vos séquences actuelles et vos accès CRM. 1h de travail de votre côté.",
    },
    {
      num: '02',
      title: 'Configuration IA',
      desc: "Notre équipe configure l'agent, les templates, les règles d'escalade et les connexions (CRM, mail, téléphonie).",
    },
    {
      num: '03',
      title: 'Go live + monitoring',
      desc: "Lancement avec vos premiers leads. Reporting hebdomadaire et optimisation continue inclus.",
    },
  ];

  return (
    <div>
      <Topbar ctx={ctx} />

      <section className="hero" style={{ background: 'var(--navy)', padding: '72px 52px 80px', position: 'relative', overflow: 'hidden' }}>
        <svg style={{ position: 'absolute', top: 40, right: -30, width: 340, opacity: .06, pointerEvents: 'none' }} viewBox="0 0 340 340" fill="none">
          <g stroke="white" strokeWidth="1.2">
            <line x1="170" y1="340" x2="170" y2="0" /><line x1="170" y1="340" x2="0" y2="127" />
            <line x1="170" y1="340" x2="340" y2="127" /><line x1="170" y1="340" x2="340" y2="290" />
            <line x1="170" y1="340" x2="0" y2="290" /><line x1="0" y1="340" x2="340" y2="340" />
          </g>
        </svg>
        <div className="hero-grid" style={{ position: 'relative', zIndex: 1 }}>
          <div>
            <div className="hero-label white">BDR Automatisé</div>
            <h1 className="white">Votre meilleur commercial <em>ne dort jamais.</em></h1>
            <p className="hero-sub white">
              Gaston, votre BDR IA, prospecte, relance, prend des RDV et livre des rapports —
              24/7, sur Slack et Teams, sans supervision.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <AnimatedBtn variant="sky" size="lg" onClick={ctx.openBooking}>Activer mon BDR</AnimatedBtn>
              <AnimatedBtn variant="ghost-white" onClick={() => document.getElementById('bdr-seq')?.scrollIntoView({ behavior: 'smooth' })}>Voir une séquence</AnimatedBtn>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ padding: '24px 20px', background: 'rgba(90,211,140,.08)', border: '1px solid rgba(90,211,140,.15)', borderRadius: 14 }}>
              <div style={{ fontSize: 32, fontWeight: 800, color: '#5AD38C', fontFamily: landingHeadingFont, letterSpacing: -1 }}>24/7</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,.55)', marginTop: 6, lineHeight: 1.4 }}>Prospection active sans interruption</div>
            </div>
            <div style={{ padding: '24px 20px', background: 'rgba(58,141,255,.08)', border: '1px solid rgba(58,141,255,.15)', borderRadius: 14 }}>
              <div style={{ fontSize: 32, fontWeight: 800, color: '#3A8DFF', fontFamily: landingHeadingFont, letterSpacing: -1 }}>×4</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,.55)', marginTop: 6, lineHeight: 1.4 }}>Plus de séquences qu'un BDR humain</div>
            </div>
            <div style={{ padding: '24px 20px', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 14 }}>
              <div style={{ fontSize: 32, fontWeight: 800, color: 'white', fontFamily: landingHeadingFont, letterSpacing: -1 }}>−80%</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,.55)', marginTop: 6, lineHeight: 1.4 }}>Coût vs un BDR salarié</div>
            </div>
            <div style={{ padding: '24px 20px', background: 'rgba(58,141,255,.12)', border: '1px solid rgba(58,141,255,.2)', borderRadius: 14 }}>
              <div style={{ fontSize: 32, fontWeight: 800, color: '#3A8DFF', fontFamily: landingHeadingFont, letterSpacing: -1 }}>J+3</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,.55)', marginTop: 6, lineHeight: 1.4 }}>Premières séquences lancées</div>
            </div>
          </div>
        </div>
      </section>

      <div className="content">
        <div className="cards-2 rv" style={{ marginTop: 56 }} id="bdr-seq">
          <div>
            <div className="block-label">Exemple de séquence</div>
            <h2 className="block-title">Une séquence BDR <em>complète</em>.</h2>
            <p className="block-desc" style={{ marginBottom: 32 }}>Votre agent IA exécute chaque étape au moment optimal, adapte les messages selon les réponses et escalade vers votre commercial au bon moment.</p>
            <div className="bdr-timeline">
              {timelineItems.map((item, i) => (
                <div key={item.day} className="bdr-event">
                  <div className={`bdr-dot${i < 3 ? ' active' : ''}`}><div className="bdr-dot-inner" /></div>
                  <div className="bdr-day">{item.day}</div>
                  <h4>{item.title}</h4>
                  <p>{item.desc}</p>
                  <div className={`bdr-status ${item.status}`}><span className="bdr-s-dot" />{item.statusLabel}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="block-label d1">Ce que le BDR automatise</div>
            <div className="card rv d1">
              <div className="card-icon">
                <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 014.07 9.75 19.79 19.79 0 011 1.18 2 2 0 012.96.04h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L7.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.348 1.858.544 2.82.58A2 2 0 0122 14.92z" />
                </svg>
              </div>
              <h3>Appels sortants</h3>
              <p>Scripts adaptatifs, détection de décroché, prise de notes automatique post-appel.</p>
            </div>
            <div className="card rv d2">
              <div className="card-icon mint-bg">
                <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
              </div>
              <h3>Séquences mail hyper-perso</h3>
              <p>Personnalisation basée sur le scoring, le secteur, l'actualité du prospect.</p>
            </div>
            <div className="card rv d3">
              <div className="card-icon coral-bg">
                <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </svg>
              </div>
              <h3>Qualification & handoff</h3>
              <p>Le BDR qualifie les réponses et transmet les RDV chauds directement dans votre agenda.</p>
            </div>
          </div>
        </div>

        <div className="section-block rv" style={{ marginTop: 64 }}>
          <div className="block-label">Mise en place</div>
          <h2 className="block-title">Opérationnel en <em>72 heures.</em></h2>
          <p className="block-desc">Pas de formation technique requise. Nous configurons tout et vous livrons un BDR prêt à prospecter.</p>
          <div className="cards-3" style={{ marginTop: 32 }}>
            {setupCards.map((c) => (
              <div key={c.num} className="card sand rv">
                <div style={{ fontFamily: landingHeadingFont, fontWeight: 800, fontSize: 44, color: 'var(--navy)', opacity: .15, lineHeight: 1, marginBottom: 12 }}>{c.num}</div>
                <h3>{c.title}</h3>
                <p>{c.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="section-block rv">
          <div className="block-label">Démo — Rapports Slack &amp; Teams</div>
          <GastonSlack ctx={ctx} />
        </div>

        <div className="cta-band rv" style={{ background: 'linear-gradient(135deg,var(--navy) 0%,#001a40 100%)' }}>
          <div>
            <h3>Simulez le ROI de votre BDR IA</h3>
            <p>En 10 minutes, calculez combien de RDV qualifiés vous pourriez générer en automatisant votre outbound. Simulation gratuite.</p>
          </div>
          <div className="cta-band-btns">
            <AnimatedBtn variant="sky" onClick={ctx.openBooking}>Calculer mon ROI</AnimatedBtn>
            <AnimatedBtn variant="ghost-white" onClick={() => ctx.setActivePage('home')}>Retour à l'accueil</AnimatedBtn>
          </div>
        </div>
      </div>
    </div>
  );
}
