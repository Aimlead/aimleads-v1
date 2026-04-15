import React from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button';

/**
 * Reusable empty-state component.
 * Replaces bare "Aucune donnée" text across Analytics, ICP, Team, Outreach, etc.
 *
 * Usage:
 *   <EmptyState
 *     icon={BarChart3}
 *     title="Pas encore de données"
 *     description="Analysez vos leads pour voir les statistiques ici."
 *     action={{ label: 'Importer des leads', onClick: () => navigate('/leads') }}
 *   />
 */
export default function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 px-6 text-center', className)}>
      {Icon && (
        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
          <Icon className="w-7 h-7 text-slate-400" />
        </div>
      )}
      {title && (
        <h3 className="text-base font-semibold text-slate-700 mb-1">{title}</h3>
      )}
      {description && (
        <p className="text-sm text-slate-500 max-w-sm leading-relaxed">{description}</p>
      )}
      {action && (
        <Button
          className="mt-5"
          variant={action.variant || 'default'}
          onClick={action.onClick}
          asChild={action.asChild}
        >
          {action.asChild ? action.children : action.label}
        </Button>
      )}
    </div>
  );
}
