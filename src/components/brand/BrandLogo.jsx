import { cn } from '@/lib/utils';

export default function BrandLogo({
  variant = 'full',
  className,
  alt = 'aimlead',
}) {
  if (variant === 'mark') {
    return (
      <img
        src="/brand/aimleads-mark.svg"
        alt={alt}
        className={cn('shrink-0 h-8 w-auto', className)}
        draggable={false}
      />
    );
  }

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <img
        src="/brand/aimleads-mark.svg"
        alt=""
        aria-hidden="true"
        className="shrink-0 h-7 w-auto"
        draggable={false}
      />
      <img
        src="/brand/aimleads-wordmark.svg"
        alt={alt}
        className="shrink-0 h-5 w-auto"
        draggable={false}
      />
    </div>
  );
}
