import React from 'react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Info, TrendingUp } from 'lucide-react';

export default function ScoreTooltip({ lead }) {
  const getScoreBreakdown = () => {
    const score = lead.icp_score || 0;
    const breakdown = [];
    if (lead.industry) {
      const match = score >= 70;
      breakdown.push({ label: 'Industry match', impact: match ? 'positive' : 'neutral', text: `${lead.industry}` });
    }
    if (lead.company_size) {
      const ideal = lead.company_size >= 50 && lead.company_size <= 500;
      breakdown.push({ label: 'Company size', impact: ideal ? 'positive' : 'neutral', text: `${lead.company_size} employees` });
    }
    if (lead.contact_role) {
      const decision = ['CEO', 'VP', 'Director', 'Head'].some(r => lead.contact_role?.toLowerCase().includes(r.toLowerCase()));
      breakdown.push({ label: 'Contact role', impact: decision ? 'positive' : 'neutral', text: lead.contact_role });
    }
    if (lead.country) {
      breakdown.push({ label: 'Geography', impact: 'neutral', text: lead.country });
    }
    return breakdown;
  };

  const breakdown = getScoreBreakdown();

  return (
    <HoverCard openDelay={200}>
      <HoverCardTrigger asChild>
        <button className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-600 transition-colors">
          <Info className="w-3.5 h-3.5" />
        </button>
      </HoverCardTrigger>
      <HoverCardContent className="w-80" side="top">
        <div className="space-y-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-900 mb-1">Why this score?</h4>
            <p className="text-xs text-slate-500">Score calculated based on ICP criteria match</p>
          </div>
          {breakdown.length > 0 ? (
            <div className="space-y-2">
              {breakdown.map((item, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  {item.impact === 'positive' ? (
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-600 mt-0.5 flex-shrink-0" />
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-full bg-slate-200 mt-0.5 flex-shrink-0" />
                  )}
                  <div className="flex-1">
                    <p className="text-xs font-medium text-slate-700">{item.label}</p>
                    <p className="text-xs text-slate-500">{item.text}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">No detailed breakdown available yet</p>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
