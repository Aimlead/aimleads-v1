import { cn } from '@/lib/utils';

export function Skeleton({ className, ...props }) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-slate-100', className)}
      {...props}
    />
  );
}

export function SkeletonCard({ className }) {
  return (
    <div className={cn('bg-white rounded-2xl border border-slate-100 p-5 space-y-3', className)}>
      <div className="flex items-center gap-3">
        <Skeleton className="w-10 h-10 rounded-xl" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonRow() {
  return (
    <tr className="border-b border-slate-50">
      <td className="px-4 py-3"><Skeleton className="h-4 w-4 rounded" /></td>
      <td className="px-4 py-3">
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
      </td>
      <td className="px-4 py-3"><Skeleton className="h-6 w-20 rounded-full" /></td>
      <td className="px-4 py-3"><Skeleton className="h-6 w-20 rounded-full" /></td>
      <td className="px-4 py-3">
        <div className="flex gap-2">
          <Skeleton className="h-6 w-10 rounded-full" />
          <Skeleton className="h-6 w-10 rounded-full" />
          <Skeleton className="h-6 w-10 rounded-full" />
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-1">
          <Skeleton className="h-7 w-7 rounded-lg" />
          <Skeleton className="h-7 w-7 rounded-lg" />
        </div>
      </td>
    </tr>
  );
}
