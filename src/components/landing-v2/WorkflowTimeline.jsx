const STEPS = [
  {
    num: '01',
    title: 'Import',
    body: "CSV, CRM, LinkedIn export. On ingère et on nettoie en moins de 60 secondes.",
  },
  {
    num: '02',
    title: 'Score',
    body: "Claude évalue chaque lead sur votre ICP et croise les signaux d'achat internet.",
  },
  {
    num: '03',
    title: 'Outreach',
    body: "Séquences personnalisées multi-canal générées et envoyées automatiquement.",
  },
  {
    num: '04',
    title: 'Close',
    body: "Vos commerciaux reprennent la main uniquement sur les leads chauds qualifiés.",
  },
];

const STATS = [
  { value: '4×', label: "Plus de RDV qualifiés" },
  { value: '72h', label: "Pour activer votre workspace" },
  { value: '24/7', label: "Votre BDR ne dort jamais" },
  { value: '80%', label: 'Temps récupéré par commercial' },
];

export default function WorkflowTimeline() {
  return (
    <section id="workflow" className="lv2-section" aria-label="Comment ça marche">
      <div className="lv2-section-inner">
        <div className="lv2-section-head">
          <span className="lv2-eyebrow">
            <span className="lv2-eyebrow-dot" />
            <span>Workflow de bout en bout</span>
          </span>
          <h2 className="lv2-h2">
            De la donnée brute au <span className="lv2-h1-gradient">rendez-vous signé</span>.
          </h2>
          <p className="lv2-sub">
            Pas d'usine à gaz : quatre étapes, automatisées sur la totalité du parcours.
          </p>
        </div>

        <div className="lv2-timeline">
          <div className="lv2-timeline-track">
            {STEPS.map((s) => (
              <div key={s.num} className="lv2-timeline-step">
                <div className="lv2-timeline-dot">{s.num}</div>
                <h4>{s.title}</h4>
                <p>{s.body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="lv2-stats" role="list">
          {STATS.map((st) => (
            <div key={st.label} className="lv2-stat" role="listitem">
              <div className="lv2-stat-value">{st.value}</div>
              <div className="lv2-stat-label">{st.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
