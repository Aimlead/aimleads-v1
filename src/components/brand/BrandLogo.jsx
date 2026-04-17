import { cn } from '@/lib/utils';

export default function BrandLogo({
  variant = 'full',
  tone = 'default',
  className,
  alt = 'aimlead',
}) {
  const baseImg = 'select-none pointer-events-none shrink-0 object-contain';

  // On dark backgrounds (tone='light') apply a subtle brightness boost
  // so the gradient stays vivid against navy/dark surfaces.
  const toneClass = tone === 'light' ? 'brightness-110 contrast-110' : '';

  if (variant === 'mark') {
    return (
      <img
        src="/brand/aimleads-mark.png"
        alt={alt}
        draggable={false}
        className={cn('h-8 w-auto', baseImg, toneClass, className)}
      />
    );
  }

  return (
    <img
      src="/brand/aimleads-wordmark.png"
      alt={alt}
      draggable={false}
      className={cn('h-8 w-auto', baseImg, toneClass, className)}
    />
  );
}
