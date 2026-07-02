/**
 * Infinite logo marquee — moteur IA et intégrations réellement disponibles.
 * Le track est dupliqué pour obtenir une boucle sans couture.
 */

const LOGOS = [
  {
    name: 'Claude · Anthropic',
    mark: (
      <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M20 4 L32 12 L32 28 L20 36 L8 28 L8 12 Z" stroke="currentColor" strokeWidth="1.6" fill="none" />
        <path d="M14 18 L20 26 L26 18" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
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
    name: 'Import CSV & Excel',
    mark: (
      <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect x="8" y="6" width="24" height="28" rx="3" stroke="currentColor" strokeWidth="1.6" fill="none" />
        <path d="M13 14 L27 14 M13 20 L27 20 M13 26 L27 26" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    name: 'Recherche web IA',
    mark: (
      <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="18" cy="18" r="10" stroke="currentColor" strokeWidth="1.6" fill="none" />
        <path d="M26 26 L34 34" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M8 18 L28 18 M18 8 Q23 18 18 28 M18 8 Q13 18 18 28" stroke="currentColor" strokeWidth="1.2" fill="none" />
      </svg>
    ),
  },
  {
    name: 'API AimLeads',
    mark: (
      <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M14 12 L6 20 L14 28" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M26 12 L34 20 L26 28" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

export default function LogosMarquee() {
  const doubled = [...LOGOS, ...LOGOS];
  return (
    <section className="lv2-marquee" aria-label="Moteur IA et intégrations">
      <p className="lv2-marquee-label">Propulsé par Claude d'Anthropic — intégré à votre CRM</p>
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
