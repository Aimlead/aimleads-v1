import { useId } from 'react';
import { cn } from '@/lib/utils';

/*
 * Official brand palette (matches /public/brand/aimleads-mark.svg and aimleads-wordmark.svg)
 *   Violet  #7c3aed
 *   Pink    #be185d
 *   Orange  #f97316
 */

/* ─── A lettermark — pure geometry, no fonts needed ─────────────────────── */
function AimMark({ className }) {
  const id = useId();
  const gId = `aim-mark-${id}`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 60 66"
      fill="none"
      className={cn('shrink-0', className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gId} x1="4" y1="62" x2="56" y2="4" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#7c3aed" />
          <stop offset="45%"  stopColor="#be185d" />
          <stop offset="100%" stopColor="#f97316" />
        </linearGradient>
      </defs>
      {/* Left leg */}
      <line x1="4"  y1="60" x2="30" y2="8"  stroke={`url(#${gId})`} strokeWidth="6.5" strokeLinecap="round" />
      {/* Right outer leg */}
      <line x1="56" y1="60" x2="30" y2="8"  stroke={`url(#${gId})`} strokeWidth="6.5" strokeLinecap="round" />
      {/* Inner right element */}
      <line x1="43" y1="38" x2="30" y2="8"  stroke={`url(#${gId})`} strokeWidth="6.5" strokeLinecap="round" />
      {/* Crossbar */}
      <line x1="14" y1="38" x2="46" y2="38" stroke={`url(#${gId})`} strokeWidth="6.5" strokeLinecap="round" />
      {/* Signal dot */}
      <circle cx="30" cy="6" r="5" fill="#f97316" />
    </svg>
  );
}

/* ─── "aimlead" wordmark: "aim" + bar-chart icon + "leads" ──────────────── */
const WM_GRAD = 'linear-gradient(90deg, #7c3aed 0%, #9333ea 30%, #db2777 60%, #f97316 100%)';
const WM_TEXT_STYLE = {
  fontFamily: "'Nunito', 'Poppins', 'Inter', system-ui, sans-serif",
  fontWeight: 800,
  fontSize: '1.2rem',
  letterSpacing: '-0.03em',
  lineHeight: 1,
  background: WM_GRAD,
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
};
const BAR_GRAD = 'linear-gradient(180deg, #be185d 0%, #f97316 100%)';

function AimWordmark({ className }) {
  return (
    <span
      className={cn('shrink-0 inline-flex items-center', className)}
      aria-label="aimlead"
      role="img"
    >
      <span style={WM_TEXT_STYLE}>aim</span>

      {/* Bar-chart separators */}
      <span
        aria-hidden="true"
        style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2, margin: '0 2px 1px' }}
      >
        <span style={{ display: 'inline-block', width: 3, height: 9,  borderRadius: 2, background: BAR_GRAD }} />
        <span style={{ display: 'inline-block', width: 3, height: 13, borderRadius: 2, background: BAR_GRAD }} />
        <span style={{ display: 'inline-block', width: 3, height: 11, borderRadius: 2, background: BAR_GRAD }} />
      </span>

      <span style={WM_TEXT_STYLE}>leads</span>
    </span>
  );
}

/* ─── Public component ──────────────────────────────────────────────────── */
export default function BrandLogo({
  variant = 'full',
  className,
  alt = 'aimlead',
}) {
  if (variant === 'mark') {
    return <AimMark className={cn('h-8 w-auto', className)} />;
  }

  return (
    <div className={cn('flex items-center gap-2', className)} title={alt}>
      <AimMark className="h-7 w-auto" />
      <AimWordmark />
    </div>
  );
}
