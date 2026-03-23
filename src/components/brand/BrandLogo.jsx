import React, { useId } from 'react';
import { cn } from '@/lib/utils';

/*
 * Brand palette (from official logos):
 *   Indigo  #1e1050
 *   Wine    #8b2252
 *   Coral   #e85d3a
 *   Orange  #f08030
 */

/* ─── Inline SVG: the A lettermark ─────────────────────────────────────── */
function AimMark({ className }) {
  const id = useId();
  const gradId = `alm-lg-${id}`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 60 66"
      fill="none"
      className={cn('shrink-0', className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="4" y1="62" x2="56" y2="4" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#1e1050" />
          <stop offset="35%"  stopColor="#8b2252" />
          <stop offset="70%"  stopColor="#e85d3a" />
          <stop offset="100%" stopColor="#f08030" />
        </linearGradient>
      </defs>
      {/* Left leg */}
      <line x1="4"  y1="60" x2="30" y2="8" stroke={`url(#${gradId})`} strokeWidth="6.5" strokeLinecap="round" />
      {/* Right outer leg */}
      <line x1="56" y1="60" x2="30" y2="8" stroke={`url(#${gradId})`} strokeWidth="6.5" strokeLinecap="round" />
      {/* Inner right element (crossbar → peak) */}
      <line x1="43" y1="38" x2="30" y2="8" stroke={`url(#${gradId})`} strokeWidth="6.5" strokeLinecap="round" />
      {/* Crossbar */}
      <line x1="14" y1="38" x2="46" y2="38" stroke={`url(#${gradId})`} strokeWidth="6.5" strokeLinecap="round" />
      {/* Signal dot */}
      <circle cx="30" cy="6" r="5" fill="#f08030" />
    </svg>
  );
}

/* ─── "AImlead" wordmark as styled HTML ─────────────────────────────────── */
function AimWordmark({ className }) {
  return (
    <span
      className={cn('shrink-0 font-heading', className)}
      style={{
        fontFamily: "'Bricolage Grotesque', system-ui, sans-serif",
        fontWeight: 800,
        fontSize: '1.25rem',
        letterSpacing: '-0.04em',
        background: 'linear-gradient(135deg, #1e1050 0%, #8b2252 35%, #e85d3a 70%, #f08030 100%)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
        lineHeight: 1,
      }}
    >
      AImlead
    </span>
  );
}

/* ─── Public component ──────────────────────────────────────────────────── */
export default function BrandLogo({
  variant = 'full',
  className,
  alt = 'AimLeads',
}) {
  if (variant === 'mark') {
    return <AimMark className={cn('h-8 w-auto', className)} />;
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <AimMark className="h-7 w-auto" />
      <AimWordmark />
    </div>
  );
}
