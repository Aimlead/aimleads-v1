import React from 'react';
import PropTypes from 'prop-types';
import { cn } from '@/lib/utils';

/**
 * Circular gauge displaying an ICP/AI/final score.
 * @param {{ score: number|null, size: 'large'|'small', label: string }} props
 */
export default function ScoreGauge({ score, size = 'large', label = 'Score', category = null }) {}
  const normalizedScore = score ?? 0;
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (normalizedScore / 100) * circumference;

  const getScoreColor = (value) => {
        if (value > 75) return { stroke: '#10b981', text: 'text-emerald-600', label: 'Good fit' };
    if (value >= 50) return { stroke: '#f97316', text: 'text-orange-600', label: 'Medium fit' };
    return { stroke: '#f43f5e', text: 'text-rose-600', label: 'Low fit' };
  };

    const getCategoryColor = (cat) => {
          const k = String(cat || '').toLowerCase();
              if (k.includes('excellent') || k.includes('strong')) return { stroke: '#10b981', text: 'text-emerald-600', label: cat };
                  if (k.includes('medium')) return { stroke: '#f97316', text: 'text-orange-600', label: cat };
                      if (k.includes('low') || k.includes('excluded')) return { stroke: '#f43f5e', text: 'text-rose-600', label: cat };
                          return null;
                            };
                              const config = (category ? getCategoryColor(category) : null) || getScoreColor(normalizedScore);
    }
  const dimensions = size === 'large' ? 'w-40 h-40' : 'w-24 h-24';
  const textSize = size === 'large' ? 'text-4xl' : 'text-xl';

  return (
    <div className="flex flex-col items-center gap-3">
      <div className={cn('relative', dimensions)}>
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="45" fill="none" className="stroke-slate-100" strokeWidth="8" />
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke={config.stroke}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-1000 ease-out"
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn('font-bold', textSize, config.text)}>{score !== null && score !== undefined ? score : '-'}</span>
          {size === 'large' && <span className="text-xs text-slate-400 mt-1">{label}</span>}
        </div>
      </div>

      {size === 'large' && score !== null && score !== undefined && (
        <span className={cn('text-sm font-medium', config.text)}>{config.label}</span>
      )}
    </div>
  );
}

ScoreGauge.propTypes = {
  score: PropTypes.number,
  size: PropTypes.oneOf(['large', 'small']),
  label: PropTypes.string,
};
