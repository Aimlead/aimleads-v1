/**
 * Pill-shaped animated button — ported from landing_aimlead.html
 * On hover: a circle expands from the left to fill the button,
 * and the arrow shifts right.
 *
 * Props:
 *   variant  'sky' | 'white' | 'ghost-white' | 'ghost-sky'
 *   size     'lg' | 'sm' | '' (default)
 *   onClick  handler
 *   href     optional link
 *   className extra classes
 *   children label text
 */
export default function AnimatedBtn({ variant = 'sky', size = '', onClick, href, className = '', children }) {
  const classes = ['btn', `btn-${variant}`, size ? `btn-${size}` : '', className].filter(Boolean).join(' ');

  const arrowSvg = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );

  const inner = (
    <>
      <span className="btn-arrow">{arrowSvg}</span>
      <span className="btn-label">{children}</span>
    </>
  );

  if (href) {
    return (
      <a href={href} className={classes} onClick={onClick}>
        {inner}
      </a>
    );
  }

  return (
    <button className={classes} onClick={onClick} type="button">
      {inner}
    </button>
  );
}
