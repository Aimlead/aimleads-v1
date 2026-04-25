import WaveCanvas from './WaveCanvas';
import AnimatedBtn from './AnimatedBtn';
import { useTranslation } from 'react-i18next';
import { landingHeadingFont } from '../../lib/brandFonts';
import BrandLogo from '@/components/brand/BrandLogo';

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

function ProductCard({ num, icon, title, description, iconBg, iconBorder, onClick, discoverLabel }) {
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
        <div className="pc-arrow">{discoverLabel}</div>
      </div>
    </a>
  );
}

export default function PageHome({ ctx }) {
  const { t } = useTranslation();

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
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.2rem', marginBottom: '2rem' }}>
            <BrandLogo variant="mark" tone="light" className="h-40 w-auto drop-shadow-[0_0_48px_rgba(58,141,255,0.55)]" />
            <BrandLogo variant="full" tone="light" className="h-20 w-auto opacity-95" />
            <h1 className="geo-title" style={{ fontSize: 'clamp(18px, 2.4vw, 30px)', letterSpacing: '-0.5px', marginBottom: 0, marginTop: '0.4rem' }}>
              <span className="geo-title-line1">{t('landing.heroTitleLine1')}</span>
              <span className="geo-title-line2">{t('landing.heroTitleLine2')}</span>
            </h1>
          </div>

          <div className="geo-badge">
            <span className="geo-badge-dot" />
            <span className="geo-badge-txt">{t('landing.heroBadge')}</span>
          </div>

          <p className="geo-sub">
            {t('landing.heroSubtitle')}
          </p>

          <div className="geo-ctas">
            <AnimatedBtn variant="sky" size="lg" onClick={ctx.openBooking}>
              {t('landing.primaryCta')}
            </AnimatedBtn>
            <AnimatedBtn variant="ghost-white" onClick={() => ctx.setActivePage('conseil')}>
              {t('landing.secondaryCta')}
            </AnimatedBtn>
          </div>

          <div className="geo-proof-rail">
            {['one', 'two', 'three'].map((item) => (
              <div key={item} className="geo-proof-item">
                <span className="geo-proof-dot" />
                <div>
                  <p className="geo-proof-title">{t(`landing.heroProof.${item}.title`)}</p>
                  <p className="geo-proof-body">{t(`landing.heroProof.${item}.body`)}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="geo-cards">
            <div className="product-cards-home">
              <ProductCard
                num={1}
                icon={<IconConseil />}
                title={t('landing.productCards.advisoryTitle')}
                description={t('landing.productCards.advisoryDescription')}
                iconBg="rgba(255,255,255,.05)"
                iconBorder="rgba(255,255,255,.1)"
                onClick={() => ctx.setActivePage('conseil')}
                discoverLabel={t('landing.discover')}
              />
              <ProductCard
                num={2}
                icon={<IconLead />}
                title={t('landing.productCards.leadTitle')}
                description={t('landing.productCards.leadDescription')}
                iconBg="rgba(58,141,255,.15)"
                iconBorder="rgba(58,141,255,.25)"
                onClick={() => ctx.setActivePage('lead')}
                discoverLabel={t('landing.discover')}
              />
              <ProductCard
                num={3}
                icon={<IconBDR />}
                title={t('landing.productCards.bdrTitle')}
                description={t('landing.productCards.bdrDescription')}
                iconBg="rgba(90,211,140,.1)"
                iconBorder="rgba(90,211,140,.2)"
                onClick={() => ctx.setActivePage('bdr')}
                discoverLabel={t('landing.discover')}
              />
            </div>
          </div>
        </div>
      </section>

      <div className="home-stats-strip">
        <div className="hss-item rv">
          <span className="hss-val">3<span className="hss-x">×</span></span>
          <span className="hss-label">{t('landing.stats.qualifiedLeads')}</span>
        </div>
        <div className="hss-sep" />
        <div className="hss-item rv d1">
          <span className="hss-val">−70<span className="hss-x">%</span></span>
          <span className="hss-label">{t('landing.stats.prospectingTime')}</span>
        </div>
        <div className="hss-sep" />
        <div className="hss-item rv d2">
          <span className="hss-val">J+<span className="hss-x">14</span></span>
          <span className="hss-label">{t('landing.stats.measuredResults')}</span>
        </div>
      </div>

      <section className="rv px-[18px] py-16 md:px-[36px] lg:px-[52px]">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.88fr_1.12fr]">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(58,141,255,.14)] bg-[rgba(58,141,255,.06)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--sky)]">
              {t('landing.workflow.eyebrow')}
            </div>
            <h2
              style={{
                fontFamily: landingHeadingFont,
                fontWeight: 800,
                fontSize: 'clamp(28px,3.2vw,44px)',
                lineHeight: 1.06,
                letterSpacing: -1.1,
                color: 'var(--graphite)',
              }}
            >
              {t('landing.workflow.titleLine1')}
              <br />
              <span style={{ color: 'var(--navy)' }}>{t('landing.workflow.titleLine2')}</span>
            </h2>
            <p className="max-w-xl text-[15px] leading-8 text-slate-600 md:text-base">
              {t('landing.workflow.subtitle')}
            </p>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { value: '< 24h', label: t('landing.workflow.metrics.audit') },
                { value: '1', label: t('landing.workflow.metrics.scoring') },
                { value: '∞', label: t('landing.workflow.metrics.followUp') },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-[22px] border border-slate-200 bg-white px-4 py-4 shadow-[0_18px_50px_rgba(15,23,42,0.06)]"
                >
                  <div className="text-2xl font-semibold tracking-tight text-slate-950">{item.value}</div>
                  <div className="mt-1 text-sm leading-6 text-slate-500">{item.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-[32px] border border-[rgba(0,31,77,.08)] bg-[linear-gradient(180deg,#fbfdff_0%,#f3f8ff_100%)] shadow-[0_28px_80px_rgba(15,23,42,0.08)]">
            <div className="grid gap-px bg-[rgba(0,31,77,.06)] sm:grid-cols-3">
              {[
                {
                  step: '01',
                  title: t('landing.workflow.steps.auditTitle'),
                  body: t('landing.workflow.steps.auditBody'),
                },
                {
                  step: '02',
                  title: t('landing.workflow.steps.scoreTitle'),
                  body: t('landing.workflow.steps.scoreBody'),
                },
                {
                  step: '03',
                  title: t('landing.workflow.steps.actionTitle'),
                  body: t('landing.workflow.steps.actionBody'),
                },
              ].map((item, index) => (
                <div key={item.step} className={`bg-white px-5 py-6 ${index === 1 ? 'sm:bg-slate-50/70' : ''}`}>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">{item.step}</div>
                  <h3
                    className="mt-4 text-lg leading-6 text-slate-950"
                    style={{ fontFamily: landingHeadingFont, fontWeight: 700 }}
                  >
                    {item.title}
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-slate-600">{item.body}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-4 px-5 py-5 md:grid-cols-[1.1fr_0.9fr] md:px-6">
              <div className="rounded-[24px] bg-slate-950 px-5 py-5 text-white">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                  {t('landing.workflow.panelTitle')}
                </p>
                <p className="mt-3 text-xl font-semibold tracking-tight text-white">
                  {t('landing.workflow.panelHeadline')}
                </p>
                <p className="mt-3 text-sm leading-7 text-slate-300">
                  {t('landing.workflow.panelBody')}
                </p>
              </div>

              <div className="flex flex-col justify-between rounded-[24px] border border-[rgba(58,141,255,.15)] bg-[rgba(58,141,255,.06)] px-5 py-5">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--sky)]">
                    {t('landing.workflow.sideTitle')}
                  </p>
                  <p className="mt-3 text-base font-semibold leading-7 text-slate-950">
                    {t('landing.workflow.sideBody')}
                  </p>
                </div>
                <div className="mt-5">
                  <AnimatedBtn variant="ghost-white" onClick={() => ctx.setActivePage('lead')}>
                    {t('landing.workflow.sideCta')}
                  </AnimatedBtn>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rv px-[18px] pb-16 md:px-[36px] lg:px-[52px]">
        <div className="mx-auto mb-6 grid max-w-6xl gap-3 md:grid-cols-3">
          {['one', 'two', 'three'].map((item) => (
            <div
              key={item}
              className="rounded-[24px] border border-[rgba(255,255,255,.08)] bg-[rgba(255,255,255,.04)] px-5 py-5 shadow-[0_18px_50px_rgba(2,12,27,0.12)]"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                {t(`landing.decisionStrip.${item}.eyebrow`)}
              </p>
              <p
                className="mt-3 text-lg leading-6 text-white"
                style={{ fontFamily: landingHeadingFont, fontWeight: 700 }}
              >
                {t(`landing.decisionStrip.${item}.title`)}
              </p>
              <p className="mt-2 text-sm leading-7 text-slate-300">
                {t(`landing.decisionStrip.${item}.body`)}
              </p>
            </div>
          ))}
        </div>

        <div className="mx-auto max-w-6xl overflow-hidden rounded-[34px] border border-[rgba(0,31,77,.08)] bg-[linear-gradient(135deg,#041427_0%,#08213f_55%,#0a2d52_100%)] text-white shadow-[0_32px_90px_rgba(2,12,27,0.22)]">
          <div className="grid gap-0 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="space-y-5 px-6 py-8 sm:px-8 sm:py-10">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-200">
                {t('landing.proof.eyebrow')}
              </div>

              <div className="space-y-3">
                <h2
                  style={{
                    fontFamily: landingHeadingFont,
                    fontWeight: 800,
                    fontSize: 'clamp(28px,3vw,42px)',
                    lineHeight: 1.08,
                    letterSpacing: -1.1,
                    color: 'white',
                  }}
                >
                  {t('landing.proof.titleLine1')}
                  <br />
                  <span style={{ color: 'var(--mint)' }}>{t('landing.proof.titleLine2')}</span>
                </h2>
                <p className="max-w-xl text-[15px] leading-8 text-slate-300 md:text-base">
                  {t('landing.proof.subtitle')}
                </p>
              </div>

              <div className="grid gap-3">
                {[
                  t('landing.proof.points.one'),
                  t('landing.proof.points.two'),
                  t('landing.proof.points.three'),
                ].map((item) => (
                  <div
                    key={item}
                    className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-4 text-sm leading-7 text-slate-100"
                  >
                    {item}
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <AnimatedBtn variant="sky" onClick={ctx.openBooking}>
                  {t('landing.proof.primaryCta')}
                </AnimatedBtn>
                <AnimatedBtn variant="ghost-white" onClick={() => ctx.setActivePage('lead')}>
                  {t('landing.proof.secondaryCta')}
                </AnimatedBtn>
              </div>
            </div>

            <div className="grid gap-px bg-white/10 sm:grid-cols-2 lg:grid-cols-2">
              {[
                {
                  title: t('landing.proof.cards.auditTitle'),
                  body: t('landing.proof.cards.auditBody'),
                },
                {
                  title: t('landing.proof.cards.scoreTitle'),
                  body: t('landing.proof.cards.scoreBody'),
                },
                {
                  title: t('landing.proof.cards.pipelineTitle'),
                  body: t('landing.proof.cards.pipelineBody'),
                },
                {
                  title: t('landing.proof.cards.teamTitle'),
                  body: t('landing.proof.cards.teamBody'),
                },
              ].map((item) => (
                <div key={item.title} className="bg-[rgba(255,255,255,.04)] px-5 py-6 sm:px-6">
                  <h3
                    className="text-lg leading-6 text-white"
                    style={{ fontFamily: landingHeadingFont, fontWeight: 700 }}
                  >
                    {item.title}
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-slate-300">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="rv px-[18px] pb-16 md:px-[36px] lg:px-[52px]">
        <div className="mx-auto max-w-6xl rounded-[32px] border border-slate-200 bg-white px-6 py-8 shadow-[0_24px_70px_rgba(15,23,42,0.06)] md:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(58,141,255,.14)] bg-[rgba(58,141,255,.06)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--sky)]">
                {t('landing.pricing.eyebrow')}
              </div>
              <h2
                className="mt-4"
                style={{
                  fontFamily: landingHeadingFont,
                  fontWeight: 800,
                  fontSize: 'clamp(28px,3vw,42px)',
                  lineHeight: 1.08,
                  letterSpacing: -1.1,
                  color: 'var(--graphite)',
                }}
              >
                {t('landing.pricing.titleLine1')}
                <br />
                <span style={{ color: 'var(--navy)' }}>{t('landing.pricing.titleLine2')}</span>
              </h2>
              <p className="mt-3 max-w-xl text-[15px] leading-8 text-slate-600 md:text-base">
                {t('landing.pricing.subtitle')}
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <AnimatedBtn variant="ghost-white" onClick={ctx.goToPricing}>
                {t('landing.pricing.comparePlans')}
              </AnimatedBtn>
              <AnimatedBtn variant="sky" onClick={ctx.openBooking}>
                {t('landing.pricing.bookReview')}
              </AnimatedBtn>
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              {
                key: 'starter',
                price: '$49',
                metrics: t('landing.pricing.cards.starterMetrics'),
                body: t('landing.pricing.cards.starterBody'),
              },
              {
                key: 'team',
                price: '$149',
                metrics: t('landing.pricing.cards.teamMetrics'),
                body: t('landing.pricing.cards.teamBody'),
                highlight: true,
              },
              {
                key: 'scale',
                price: '$399',
                metrics: t('landing.pricing.cards.scaleMetrics'),
                body: t('landing.pricing.cards.scaleBody'),
              },
            ].map((plan) => (
              <div
                key={plan.key}
                className={`rounded-[26px] border px-5 py-5 ${
                  plan.highlight
                    ? 'border-[rgba(58,141,255,.24)] bg-[linear-gradient(180deg,#f7fbff_0%,#eef6ff_100%)] shadow-[0_20px_50px_rgba(58,141,255,0.10)]'
                    : 'border-slate-200 bg-slate-50/70'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                      {t(`landing.pricing.cards.${plan.key}Label`)}
                    </p>
                    <p className="mt-3 text-3xl font-bold tracking-tight text-slate-950">{plan.price}</p>
                    <p className="mt-1 text-sm font-medium text-slate-700">{t(`landing.pricing.cards.${plan.key}Name`)}</p>
                  </div>
                  {plan.highlight ? (
                    <span className="rounded-full bg-[var(--sky)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white">
                      {t('landing.pricing.cards.popular')}
                    </span>
                  ) : null}
                </div>

                <div className="mt-5 rounded-[20px] border border-white/70 bg-white/80 px-4 py-4">
                  <p className="text-sm font-semibold text-slate-900">{plan.metrics}</p>
                  <p className="mt-2 text-sm leading-7 text-slate-600">{plan.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="home-blocages">
        <div className="hb-intro rv">
          <div className="block-label" style={{ color: 'rgba(255,255,255,.35)' }}>
            <span style={{ display: 'inline-block', width: 20, height: 1.5, background: 'rgba(255,255,255,.25)', marginRight: 10, verticalAlign: 'middle' }} />
            {t('landing.whyAimlead')}
          </div>
          <h2 style={{ fontFamily: landingHeadingFont, fontWeight: 800, fontSize: 'clamp(28px,3.5vw,46px)', letterSpacing: -1.2, lineHeight: 1.08, color: 'var(--white)', marginBottom: 0 }}>
            {t('landing.threeBlocksTitleLine1')}<br /><em style={{ fontStyle: 'normal', color: 'var(--sky)' }}>{t('landing.threeBlocksTitleLine2')}</em>
          </h2>
        </div>
        <div className="hb-list">
          {[
            {
              num: '01', title: t('landing.blocks.oneTitle'),
              desc: t('landing.blocks.oneDescription'),
              svg: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></svg>,
            },
            {
              num: '02', title: t('landing.blocks.twoTitle'),
              desc: t('landing.blocks.twoDescription'),
              svg: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></svg>,
            },
            {
              num: '03', title: t('landing.blocks.threeTitle'),
              desc: t('landing.blocks.threeDescription'),
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
          <div className="hcf-eyebrow">{t('landing.finalEyebrow')}</div>
          <h2 className="hcf-title">{t('landing.finalTitleLine1')}<br />{t('landing.finalTitleLine2')}</h2>
          <p className="hcf-sub">{t('landing.finalSubtitle')}</p>
          <div className="hcf-btns">
            <AnimatedBtn variant="sky" size="lg" onClick={ctx.openBooking}>{t('landing.finalPrimaryCta')}</AnimatedBtn>
            <AnimatedBtn variant="ghost-white" onClick={() => ctx.setActivePage('lead')}>{t('landing.finalSecondaryCta')}</AnimatedBtn>
          </div>
        </div>
      </div>
    </div>
  );
}
