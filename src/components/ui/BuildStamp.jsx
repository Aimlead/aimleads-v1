import { BUILD_INFO, getBuildLabel } from '@/lib/buildInfo';

export default function BuildStamp({
  label = 'Build',
  builtAtLabel = 'Built',
  className = '',
  tone = 'dark',
}) {
  const containerTone = tone === 'light'
    ? 'border-white/10 bg-white/5 text-white/70'
    : 'border-slate-200 bg-slate-50 text-slate-600';

  return (
    <div className={`inline-flex flex-col gap-1 rounded-2xl border px-3 py-2 text-xs ${containerTone} ${className}`.trim()}>
      <span className="font-semibold tracking-wide uppercase opacity-70">{label}</span>
      <span className="font-medium">{getBuildLabel()}</span>
      {BUILD_INFO.builtAt && (
        <span className="opacity-70">{builtAtLabel}: {BUILD_INFO.builtAt}</span>
      )}
    </div>
  );
}
