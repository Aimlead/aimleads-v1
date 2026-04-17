import { useEffect, useRef, useState } from 'react';
import ProductScene from './ProductScene';

const PRODUCTS = [
  {
    id: 'lead',
    tag: 'SaaS',
    title: 'Lead-Scoreur',
    description: "Scoring ICP + signaux d'achat en temps réel. Vos commerciaux n'appellent que ceux qui comptent.",
    variant: 'grid',
    color: '#3a8dff',
    stepTitle: '01 — Lead-Scoreur',
    stepBody: "Importez vos leads, définissez votre ICP, laissez l'IA prioriser. Les signaux d'achat internet font monter les bons comptes, pas les autres.",
  },
  {
    id: 'bdr',
    tag: 'IA Agent',
    title: 'BDR Automatisé',
    description: "Un agent qui qualifie, personnalise et relance 24/7 sur les canaux LinkedIn, email et WhatsApp.",
    variant: 'orbit',
    color: '#5ad38c',
    stepTitle: '02 — BDR Automatisé',
    stepBody: "Votre premier commercial IA. Il travaille pendant que vous dormez, apprend de vos retours et ne se fatigue jamais.",
  },
  {
    id: 'conseil',
    tag: 'Conseil',
    title: 'Conseil & Formation Claude',
    description: "Formation sur 3 piliers, audit IA et déploiement accompagné pour vos équipes PME & ETI.",
    variant: 'icosa',
    color: '#ff6f61',
    stepTitle: '03 — Conseil & Formation',
    stepBody: "On ne vend pas un outil, on installe une capacité. Vos équipes sortent autonomes sur Claude, avec des workflows qui rentabilisent dès la semaine 2.",
  },
];

export default function ProductShowcase() {
  const [activeIdx, setActiveIdx] = useState(0);
  const cardRefs = useRef([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) {
          const idx = Number(visible.target.dataset.idx);
          if (!Number.isNaN(idx)) setActiveIdx(idx);
        }
      },
      { threshold: [0.35, 0.6, 0.85], rootMargin: '-20% 0px -20% 0px' },
    );

    cardRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <section id="products" className="lv2-showcase" aria-label="Nos produits">
      <div className="lv2-showcase-grid">
        <div className="lv2-showcase-left">
          <span className="lv2-eyebrow">
            <span className="lv2-eyebrow-dot" />
            <span>Trois leviers, un écosystème</span>
          </span>
          <h2 className="lv2-h2">
            Une stack IA qui <br />
            <span className="lv2-h1-gradient">remplace les 80%</span> <br />
            de votre prospection manuelle.
          </h2>
          <p className="lv2-sub">
            Chaque brique fonctionne seule. Ensemble elles couvrent tout le cycle : identifier,
            engager, convertir — pendant que vos équipes se concentrent sur le closing.
          </p>

          <div className="lv2-showcase-steps">
            {PRODUCTS.map((p, i) => (
              <div
                key={p.id}
                className={`lv2-showcase-step ${i === activeIdx ? 'is-active' : ''}`}
                onClick={() => {
                  cardRefs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    cardRefs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }
                }}
              >
                <span className="lv2-showcase-step-num">{String(i + 1).padStart(2, '0')}</span>
                <div>
                  <h4>{p.title}</h4>
                  <p>{p.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lv2-showcase-right">
          {PRODUCTS.map((p, i) => (
            <article
              key={p.id}
              ref={(el) => { cardRefs.current[i] = el; }}
              data-idx={i}
              className="lv2-showcase-card"
              style={{
                boxShadow: `0 24px 80px -20px ${p.color}40`,
              }}
            >
              <ProductScene variant={p.variant} color={p.color} />
              <span className="lv2-showcase-card-tag" style={{ color: p.color, borderColor: `${p.color}80` }}>
                {p.tag}
              </span>
              <div className="lv2-showcase-card-body">
                <h3>{p.title}</h3>
                <p>{p.description}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
