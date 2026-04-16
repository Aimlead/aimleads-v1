import AnimatedBtn from './AnimatedBtn';
import { landingHeadingFont } from '../../lib/brandFonts';

const ARTICLES = [
  {
    url: 'https://www.stemapartners.com/blog/automatisation-prospection-b2b-ia/',
    tag: 'Prospection', tagBg: 'rgba(90,211,140,.1)', tagColor: 'var(--mint)',
    date: 'Mars 2026',
    title: 'Automatisation Prospection B2B IA : Guide Complet 2026',
    desc: "Comment automatiser sa prospection B2B avec l'IA pour multiplier par 3 les leads qualifiés. Scoring, outils et workflows concrets pour PME.",
    source: 'Stema Partners',
  },
  {
    url: 'https://www.accedia.fr/blog/10-outils-dintelligence-artificielle-pour-les-commerciaux/',
    tag: 'Outils', tagBg: 'rgba(58,141,255,.1)', tagColor: 'var(--sky)',
    date: '6 fév. 2026',
    title: 'Top 10 outils IA pour les commerciaux en 2026',
    desc: "Classement des meilleurs outils d'intelligence artificielle pour booster la prospection, le suivi client et l'automatisation des ventes B2B.",
    source: 'Accédia',
  },
  {
    url: 'https://www.acceor.com/prospection-commerciale-b2b-automatisation-ia-robotique/',
    tag: 'Étude', tagBg: 'rgba(255,111,97,.12)', tagColor: 'var(--coral)',
    date: '1er fév. 2026',
    title: "IA, automatisation et prospection B2B : ce qui change vraiment",
    desc: "54 % des PME et ETI françaises ont désormais un projet IA pour leur prospection. Les entreprises qui intègrent l'IA génèrent 50 % de leads en plus.",
    source: 'Acceor',
  },
  {
    url: 'https://www.dimension-internet.com/ia-prospection-b2b-x3-rendez-vous-qualifies-pme-2026/',
    tag: 'Prospection', tagBg: 'rgba(90,211,140,.1)', tagColor: 'var(--mint)',
    date: '5 jan. 2026',
    title: 'IA Prospection B2B : x3 RDV qualifiés pour les PME',
    desc: "Multipliez vos rendez-vous qualifiés par 3 grâce au scoring prédictif. Guide pratique, outils et ROI documenté pour les équipes commerciales PME.",
    source: 'Dimension Internet',
  },
  {
    url: 'https://www.lagencesauvage.com/blog/roi-ia-pme-donnees-2025-reussir-2026.html',
    tag: 'ROI', tagBg: 'rgba(58,141,255,.1)', tagColor: 'var(--sky)',
    date: '29 déc. 2025',
    title: "ROI de l'IA en PME : ce que révèlent les données 2025",
    desc: "ROI médian de 159,8 % sur 12 mois documenté sur 200 projets. Analyse détaillée des retours sur investissement IA pour les PME françaises en 2025.",
    source: "L'Agence Sauvage",
  },
  {
    url: 'https://www.groupe-aquitem.fr/comment-les-tpe-pme-utilisent-les-ia-2025/',
    tag: 'Baromètre', tagBg: 'rgba(255,111,97,.12)', tagColor: 'var(--coral)',
    date: '22 déc. 2025',
    title: "Comment les TPE-PME utilisent l'IA en 2025 ?",
    desc: "En 2025, 26 % des TPE-PME utilisent l'IA — un taux qui a doublé en un an. Panorama des usages réels : ventes, marketing, service client.",
    source: 'Groupe Aquitem',
  },
  {
    url: 'https://www.accedia.fr/blog/vendre-grace-a-lia-en-2026/',
    tag: 'Ventes', tagBg: 'rgba(90,211,140,.1)', tagColor: 'var(--mint)',
    date: '9 déc. 2025',
    title: "Vendre grâce à l'IA : révolution de la prospection commerciale",
    desc: "Le scoring prédictif IA booste le taux de conversion de 30 à 50 %. Comment les PME transforment leur prospection avec ChatGPT et les CRM intelligents.",
    source: 'Accédia',
  },
  {
    url: 'https://www.conferencier.ai/blog/booster-productivite-entreprise-ia-2025',
    tag: 'Productivité', tagBg: 'rgba(58,141,255,.1)', tagColor: 'var(--sky)',
    date: '9 nov. 2025',
    title: "Booster la productivité avec l'IA : meilleures pratiques 2025",
    desc: "ROI de 240 % à 6 mois sur l'automatisation commerciale. Cas concret : +62 % de temps commercial libéré pour une ETI de services informatiques lyonnaise.",
    source: 'Conferencier.ai',
  },
  {
    url: 'https://www.francenum.gouv.fr/guides-et-conseils/strategie-numerique/comprendre-le-numerique/barometre-france-num-2025-le',
    tag: 'Officiel', tagBg: 'rgba(255,111,97,.12)', tagColor: 'var(--coral)',
    date: '15 sep. 2025',
    title: "Baromètre France Num 2025 : l'IA dans les TPE et PME",
    desc: "Publication officielle du Ministère : 26 % des PME utilisent l'IA, chiffre qui a doublé en un an. Analyse par secteur, taille et type d'usage.",
    source: 'France Num (DGE)',
  },
  {
    url: 'https://www.devflows.eu/post/agent-ia-entreprise-guide-complet',
    tag: 'Agents IA', tagBg: 'rgba(90,211,140,.1)', tagColor: 'var(--mint)',
    date: 'Été 2025',
    title: "Agent IA en entreprise : définition, cas d'usage et guide de déploiement",
    desc: "Guide complet pour déployer un agent IA en PME-ETI en 3 à 6 semaines. 87 % des organisations commerciales utilisent déjà l'IA dans leurs ventes.",
    source: 'DevFlows',
  },
  {
    url: 'https://dfm.fr/articles/etat-des-lieux-ia-pme-france/',
    tag: 'Étude', tagBg: 'rgba(58,141,255,.1)', tagColor: 'var(--sky)',
    date: '22 mai 2025',
    title: "L'état des lieux de l'IA dans les PME françaises en 2025",
    desc: "Deux tiers des PME françaises utilisent déjà un outil d'IA, plaçant la France au top 3 européen. Analyse complète des usages et des freins.",
    source: 'DFM',
  },
  {
    url: 'https://sells.fr/prospection/ia-prospection-commerciale-2025/',
    tag: 'Prospection', tagBg: 'rgba(255,111,97,.12)', tagColor: 'var(--coral)',
    date: '21 mai 2025',
    title: "IA et prospection commerciale : quels enjeux en 2025 ?",
    desc: "En 2025, l'IA transforme la prospection industrielle : ciblage précis, personnalisation à grande échelle et cycles de vente raccourcis pour les PME.",
    source: 'Sells.fr',
  },
  {
    url: 'https://lelab.bpifrance.fr/ia2025',
    tag: 'Étude', tagBg: 'rgba(90,211,140,.1)', tagColor: 'var(--mint)',
    date: 'Fév. 2025',
    title: "Les entreprises françaises et l'IA : l'aube d'une révolution",
    desc: "Enquête sur 1 209 dirigeants de PME-ETI : 58 % considèrent l'IA comme un enjeu de survie. 43 % ont déjà adopté une stratégie IA formalisée.",
    source: 'Bpifrance Le Lab',
  },
  {
    url: 'https://www.crossdata.tech/les-grandes-tendances-en-intelligence-artificielle-en-2025-ce-qui-va-transformer-les-entreprises/',
    tag: 'Tendances', tagBg: 'rgba(58,141,255,.1)', tagColor: 'var(--sky)',
    date: 'Jan. 2025',
    title: "Grandes tendances IA 2025 : ce qui va transformer les entreprises",
    desc: "Agents IA, IA embarquée, frugalité énergétique : les 5 tendances clés qui vont transformer les ETI industrielles et technologiques en 2025.",
    source: 'Cross Data',
  },
  {
    url: 'https://www.hubspot.fr/statistiques-intelligence-artificielle',
    tag: 'Chiffres', tagBg: 'rgba(255,111,97,.12)', tagColor: 'var(--coral)',
    date: '2024 / 2025',
    title: "Statistiques IA à connaître : l'impact sur la vente et le marketing",
    desc: "78 % des commerciaux français pensent que l'IA leur donne un net avantage. 86 % déclarent qu'elle facilite le cross-sell et l'upsell. Chiffres clés.",
    source: 'HubSpot France',
  },
];

export default function PageRessources({ ctx }) {
  return (
    <div>
      {/* Topbar */}
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="topbar-title">Ressources</div>
          <div className="topbar-breadcrumb">AImlead <span>/ Veille IA &amp; Ventes</span></div>
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

      <div className="content" style={{ paddingTop: 64 }}>
        {/* Hero */}
        <div style={{ marginBottom: 52, maxWidth: 780 }}>
          <div className="block-label">Veille &amp; Ressources</div>
          <h1 style={{
            fontFamily: landingHeadingFont, fontWeight: 800,
            fontSize: 'clamp(32px,3.5vw,52px)', letterSpacing: -1.5, lineHeight: 1.05,
            color: 'var(--white)', marginBottom: 16,
          }}>
            L'IA dans les <em style={{ fontStyle: 'normal', color: 'var(--sky)' }}>PME &amp; ETI</em> :<br />
            les articles qui font référence.
          </h1>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,.45)', fontWeight: 300, lineHeight: 1.8, maxWidth: 580 }}>
            15 articles sélectionnés — études, guides et retours d'expérience issus de sources
            francophones de référence sur l'apport concret de l'IA dans les ventes, la prospection
            et la croissance des entreprises de taille intermédiaire.
          </p>
        </div>

        {/* Articles grid */}
        <div className="art-grid">
          {ARTICLES.map((a, i) => (
            <a
              key={a.url}
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="art-card rv"
              style={{ animationDelay: `${(i % 3) * 0.08}s` }}
            >
              <div className="art-card-top">
                <span className="art-tag" style={{ background: a.tagBg, color: a.tagColor }}>{a.tag}</span>
                <span className="art-date">{a.date}</span>
              </div>
              <h3 className="art-title">{a.title}</h3>
              <p className="art-desc">{a.desc}</p>
              <div className="art-footer">
                <span className="art-source">{a.source}</span>
                <span className="art-arrow">Lire l'article →</span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
