import { cn } from '@/lib/utils';

export default function BrandLogo({
  variant = 'full',
  className,
  alt = 'aimlead',
}) {
  if (variant === 'mark') {
    return (
      <img
        src="/brand/aimleads-mark.png"
        alt={alt}
        className={cn('h-8 w-auto shrink-0', className)}
      />
    );
  }

  return (
    <img
      src="/brand/aimleads-wordmark.png"
      alt={alt}
      className={cn('h-7 w-auto shrink-0', className)}
    />
  );
}
