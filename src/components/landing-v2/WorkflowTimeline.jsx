import { useTranslation } from 'react-i18next';

export default function WorkflowTimeline() {
  const { t } = useTranslation();

  const STEPS = [
    { num: '01', key: 'import' },
    { num: '02', key: 'score' },
    { num: '03', key: 'outreach' },
    { num: '04', key: 'close' },
  ];

  const STATS = [
    { key: 'meetings' },
    { key: 'setup' },
    { key: 'bdr' },
    { key: 'time' },
  ];

  return (
    <section id="workflow" className="lv2-section" aria-label={t('landingV2.workflow.ariaLabel')}>
      <div className="lv2-section-inner">
        <div className="lv2-section-head">
          <span className="lv2-eyebrow">
            <span className="lv2-eyebrow-dot" />
            <span>{t('landingV2.workflow.eyebrow')}</span>
          </span>
          <h2 className="lv2-h2">
            {t('landingV2.workflow.title')} <span className="lv2-h1-gradient">{t('landingV2.workflow.titleHighlight')}</span>.
          </h2>
          <p className="lv2-sub">
            {t('landingV2.workflow.subtitle')}
          </p>
        </div>

        <div className="lv2-timeline">
          <div className="lv2-timeline-track">
            {STEPS.map((s) => (
              <div key={s.num} className="lv2-timeline-step">
                <div className="lv2-timeline-dot">{s.num}</div>
                <h4>{t(`landingV2.workflow.steps.${s.key}.title`)}</h4>
                <p>{t(`landingV2.workflow.steps.${s.key}.body`)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="lv2-stats" role="list">
          {STATS.map((st) => (
            <div key={st.key} className="lv2-stat" role="listitem">
              <div className="lv2-stat-value">{t(`landingV2.workflow.stats.${st.key}.value`)}</div>
              <div className="lv2-stat-label">{t(`landingV2.workflow.stats.${st.key}.label`)}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
