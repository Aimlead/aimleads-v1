import { useTranslation } from 'react-i18next';

const LEGAL_SECTIONS = [
  { key: 'publisher' },
  { key: 'hosting' },
  { key: 'intellectualProperty' },
  { key: 'privacy' },
  { key: 'cookies' },
  { key: 'liability' },
  { key: 'applicableLaw' },
];

export default function PageMentions({ ctx }) {
  const { t } = useTranslation();

  return (
    <div>
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="topbar-breadcrumb">
            Aimlead <span>/ {t('mentions.title')}</span>
          </div>
        </div>
        <div className="topbar-right">
          <button className="topbar-login" onClick={ctx.openLogin}>
            <svg fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            {t('landing.signIn')}
          </button>
        </div>
      </div>

      <div className="content" style={{ paddingTop: 64, maxWidth: 760 }}>
        <div style={{ marginBottom: 40 }}>
          <div className="block-label">{t('mentions.blockLabel')}</div>
          <h1
            style={{
              fontFamily: 'Bricolage Grotesque, sans-serif',
              fontWeight: 800,
              fontSize: 'clamp(28px,3vw,44px)',
              letterSpacing: -1,
              lineHeight: 1.1,
              color: 'white',
              marginBottom: 12,
            }}
          >
            {t('mentions.title')}
          </h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,.35)' }}>
            {t('mentions.lastUpdated')}
          </p>
        </div>

        {LEGAL_SECTIONS.map((section) => {
          const lines = t(`mentions.sections.${section.key}.content`, { returnObjects: true });
          return (
            <div
              key={section.key}
              style={{
                marginBottom: 36,
                padding: '28px 32px',
                background: 'rgba(255,255,255,.03)',
                borderRadius: 14,
                border: '1px solid rgba(255,255,255,.07)',
              }}
            >
              <h2
                style={{
                  fontFamily: 'Bricolage Grotesque, sans-serif',
                  fontWeight: 700,
                  fontSize: 18,
                  color: 'white',
                  marginBottom: 14,
                }}
              >
                {t(`mentions.sections.${section.key}.title`)}
              </h2>
              {Array.isArray(lines)
                ? lines.map((line, index) => (
                    <p
                      key={`${section.key}-${index}`}
                      style={{
                        fontSize: 14,
                        color: 'rgba(255,255,255,.55)',
                        lineHeight: 1.8,
                        marginBottom: index < lines.length - 1 ? 8 : 0,
                      }}
                    >
                      {line}
                    </p>
                  ))
                : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
