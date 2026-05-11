import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ProductScene from './ProductScene';

export default function ProductShowcase() {
  const { t } = useTranslation();
  const [activeIdx, setActiveIdx] = useState(0);
  const cardRefs = useRef([]);

  const PRODUCTS = [
    {
      id: 'lead',
      tag: t('landingV2.products.lead.tag'),
      title: t('landingV2.products.lead.title'),
      description: t('landingV2.products.lead.description'),
      variant: 'grid',
      color: '#3a8dff',
      stepTitle: t('landingV2.products.lead.stepTitle'),
      stepBody: t('landingV2.products.lead.stepBody'),
    },
    {
      id: 'bdr',
      tag: t('landingV2.products.bdr.tag'),
      title: t('landingV2.products.bdr.title'),
      description: t('landingV2.products.bdr.description'),
      variant: 'orbit',
      color: '#5ad38c',
      stepTitle: t('landingV2.products.bdr.stepTitle'),
      stepBody: t('landingV2.products.bdr.stepBody'),
    },
    {
      id: 'conseil',
      tag: t('landingV2.products.conseil.tag'),
      title: t('landingV2.products.conseil.title'),
      description: t('landingV2.products.conseil.description'),
      variant: 'icosa',
      color: '#ff6f61',
      stepTitle: t('landingV2.products.conseil.stepTitle'),
      stepBody: t('landingV2.products.conseil.stepBody'),
    },
  ];

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
    <section id="products" className="lv2-showcase" aria-label={t('landingV2.products.ariaLabel')}>
      <div className="lv2-showcase-grid">
        <div className="lv2-showcase-left">
          <span className="lv2-eyebrow">
            <span className="lv2-eyebrow-dot" />
            <span>{t('landingV2.products.eyebrow')}</span>
          </span>
          <h2 className="lv2-h2">
            {t('landingV2.products.title')} <br />
            <span className="lv2-h1-gradient">{t('landingV2.products.titleHighlight')}</span> <br />
            {t('landingV2.products.titleSuffix')}
          </h2>
          <p className="lv2-sub">
            {t('landingV2.products.subtitle')}
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
