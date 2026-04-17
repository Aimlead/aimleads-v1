/**
 * Infinite logo marquee — ecosystem logos stylisés en SVG inline.
 * Le track est dupliqué pour obtenir une boucle sans couture.
 */

const LOGOS = [
  {
    name: 'Claude',
    mark: (
      <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M20 4 L32 12 L32 28 L20 36 L8 28 L8 12 Z" stroke="currentColor" strokeWidth="1.6" fill="none" />
        <path d="M14 18 L20 26 L26 18" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    name: 'OpenAI',
    mark: (
      <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="20" cy="20" r="14" stroke="currentColor" strokeWidth="1.6" fill="none" />
        <path d="M20 8 L24 20 L20 32 L16 20 Z" stroke="currentColor" strokeWidth="1.6" fill="none" />
      </svg>
    ),
  },
  {
    name: 'HubSpot',
    mark: (
      <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="20" cy="22" r="8" stroke="currentColor" strokeWidth="1.6" fill="none" />
        <line x1="20" y1="14" x2="20" y2="8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="20" cy="6" r="2.2" stroke="currentColor" strokeWidth="1.4" fill="none" />
      </svg>
    ),
  },
  {
    name: 'Salesforce',
    mark: (
      <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M10 22 Q6 20 6 16 Q6 10 12 10 Q14 7 18 7 Q22 7 24 10 Q30 10 30 16 Q34 18 34 22 Q34 28 28 28 L12 28 Q6 28 10 22 Z" stroke="currentColor" strokeWidth="1.6" fill="none" />
      </svg>
    ),
  },
  {
    name: 'Slack',
    mark: (
      <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect x="8" y="16" width="12" height="4" rx="2" stroke="currentColor" strokeWidth="1.6" fill="none" />
        <rect x="20" y="8" width="4" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" fill="none" />
        <rect x="20" y="20" width="12" height="4" rx="2" stroke="currentColor" strokeWidth="1.6" fill="none" />
        <rect x="16" y="20" width="4" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" fill="none" />
      </svg>
    ),
  },
  {
    name: 'Pipedrive',
    mark: (
      <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M14 10 L14 34" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M14 10 L22 10 Q30 10 30 18 Q30 26 22 26 L14 26" stroke="currentColor" strokeWidth="1.6" fill="none" />
      </svg>
    ),
  },
  {
    name: 'Linear',
    mark: (
      <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M6 24 L16 34" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M6 18 L22 34" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M6 12 L28 34" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M10 6 L34 30" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    name: 'Notion',
    mark: (
      <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect x="8" y="8" width="24" height="24" rx="3" stroke="currentColor" strokeWidth="1.6" fill="none" />
        <path d="M14 14 L14 26 M14 14 L24 26 M24 14 L24 26" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
];

export default function LogosMarquee() {
  const doubled = [...LOGOS, ...LOGOS];
  return (
    <section className="lv2-marquee" aria-label="Écosystème d'intégrations">
      <p className="lv2-marquee-label">Propulsé par et intégré avec</p>
      <div className="lv2-marquee-mask lv2-marquee-mask-l" />
      <div className="lv2-marquee-mask lv2-marquee-mask-r" />
      <div className="lv2-marquee-track">
        {doubled.map((logo, i) => (
          <div key={`${logo.name}-${i}`} className="lv2-marquee-item">
            {logo.mark}
            <span>{logo.name}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
