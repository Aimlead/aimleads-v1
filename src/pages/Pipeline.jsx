import React, { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ExternalLink, Loader2, Mail, Phone } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { dataClient } from '@/services/dataClient';
import { cn } from '@/lib/utils';

const PIPELINE_STAGES = [
  { id: 'to_contact', label: 'To Contact', color: 'bg-slate-100 border-slate-300', dot: 'bg-slate-400' },
  { id: 'contacted', label: 'Contacted', color: 'bg-sky-50 border-sky-200', dot: 'bg-sky-500' },
  { id: 'meeting', label: 'Meeting Set', color: 'bg-violet-50 border-violet-200', dot: 'bg-violet-500' },
  { id: 'proposal', label: 'Proposal', color: 'bg-amber-50 border-amber-200', dot: 'bg-amber-500' },
  { id: 'won', label: 'Won', color: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
  { id: 'lost', label: 'Lost', color: 'bg-rose-50 border-rose-200', dot: 'bg-rose-400' },
];

const STATUS_TO_STAGE = {
  'To Contact': 'to_contact',
  Contacted: 'contacted',
  'Meeting Set': 'meeting',
  Proposal: 'proposal',
  Won: 'won',
  Lost: 'lost',
  Rejected: 'lost',
};

const scoreColor = (score) => {
  if (!Number.isFinite(score)) return 'bg-slate-100 text-slate-500';
  if (score >= 80) return 'bg-violet-100 text-violet-700';
  if (score >= 50) return 'bg-blue-100 text-blue-700';
  if (score >= 20) return 'bg-amber-100 text-amber-700';
  return 'bg-rose-100 text-rose-600';
};

function LeadCard({ lead, onOpen, onStageChange, onDragStart }) {
  const score = Number.isFinite(lead.final_score) ? lead.final_score : lead.icp_score;
  const [moving, setMoving] = useState(false);

  const handleStageChange = async (nextStageId) => {
    const stage = PIPELINE_STAGES.find((s) => s.id === nextStageId);
    if (!stage) return;
    setMoving(true);
    try {
      await dataClient.leads.update(lead.id, { follow_up_status: stage.label });
      toast.success(`Moved to ${stage.label}`);
      onStageChange();
    } catch {
      toast.error('Failed to update stage');
    } finally {
      setMoving(false);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      draggable
      onDragStart={(e) => { e.stopPropagation(); onDragStart(lead); }}
      className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing group"
      onClick={() => onOpen(lead)}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate">{lead.company_name}</p>
          <p className="text-xs text-slate-500 truncate">{lead.contact_name || '—'}</p>
          {lead.contact_role && (
            <p className="text-[11px] text-slate-400 truncate">{lead.contact_role}</p>
          )}
        </div>
        {Number.isFinite(score) && (
          <span className={`text-xs font-bold px-1.5 py-0.5 rounded-md flex-shrink-0 ${scoreColor(score)}`}>
            {score}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-1 mb-2">
        {lead.industry && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{lead.industry}</span>
        )}
        {lead.country && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{lead.country}</span>
        )}
        {lead.final_category && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-sky/5 text-brand-sky">{lead.final_category}</span>
        )}
      </div>

      <div className="flex gap-1 mt-2" onClick={(e) => e.stopPropagation()}>
        {lead.contact_email && (
          <a href={`mailto:${lead.contact_email}`} title="Send email">
            <Button variant="ghost" size="icon" className="h-6 w-6">
              <Mail className="w-3 h-3 text-slate-400" />
            </Button>
          </a>
        )}
        <Select value="" onValueChange={handleStageChange} disabled={moving}>
          <SelectTrigger className="h-6 text-[11px] px-2 py-0 border-slate-200 w-auto">
            <SelectValue placeholder="Move to…" />
          </SelectTrigger>
          <SelectContent>
            {PIPELINE_STAGES.map((stage) => (
              <SelectItem key={stage.id} value={stage.id} className="text-xs">
                {stage.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </motion.div>
  );
}

export default function Pipeline() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const dragLeadRef = useRef(null);
  const [draggingOver, setDraggingOver] = useState(null);

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['leads'],
    queryFn: () => dataClient.leads.list('-created_at'),
  });

  const stageMap = useMemo(() => {
    const map = {};
    for (const stage of PIPELINE_STAGES) {
      map[stage.id] = [];
    }

    for (const lead of leads) {
      const followUp = lead.follow_up_status || 'To Contact';
      const stageId = STATUS_TO_STAGE[followUp] || 'to_contact';
      if (map[stageId]) map[stageId].push(lead);
    }

    return map;
  }, [leads]);

  const handleOpenLead = (lead) => {
    navigate(`/leads/${lead.id}`, { state: { lead } });
  };

  const handleStageChange = () => {
    queryClient.invalidateQueries({ queryKey: ['leads'] });
  };

  const handleDragStart = (lead) => {
    dragLeadRef.current = lead;
  };

  const handleDragOver = (e, stageId) => {
    e.preventDefault();
    setDraggingOver(stageId);
  };

  const handleDragLeave = () => {
    setDraggingOver(null);
  };

  const handleDrop = async (e, targetStageId) => {
    e.preventDefault();
    setDraggingOver(null);
    const lead = dragLeadRef.current;
    dragLeadRef.current = null;
    if (!lead) return;

    const stage = PIPELINE_STAGES.find((s) => s.id === targetStageId);
    if (!stage) return;

    const currentStageId = STATUS_TO_STAGE[lead.follow_up_status || 'To Contact'] || 'to_contact';
    if (currentStageId === targetStageId) return;

    try {
      await dataClient.leads.update(lead.id, { follow_up_status: stage.label });
      toast.success(`${lead.company_name} → ${stage.label}`);
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    } catch {
      toast.error('Failed to move lead');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand-sky animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Pipeline</h1>
        <p className="text-slate-500 mt-1">
          Drag leads through your sales stages — {leads.length} total leads
        </p>
      </div>

      {/* Kanban Board */}
      <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: '70vh' }}>
        {PIPELINE_STAGES.map((stage) => {
          const stageLeads = stageMap[stage.id] || [];
          const isDragTarget = draggingOver === stage.id;
          return (
            <div
              key={stage.id}
              className={cn(
                `flex-shrink-0 w-[260px] rounded-2xl border-2 flex flex-col transition-all duration-150`,
                isDragTarget ? 'border-brand-sky bg-brand-sky/5 scale-[1.01]' : stage.color
              )}
              onDragOver={(e) => handleDragOver(e, stage.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, stage.id)}
            >
              <div className="p-3 border-b border-slate-200/60">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${stage.dot}`} />
                  <span className="text-sm font-semibold text-slate-700">{stage.label}</span>
                  <span className="ml-auto text-xs text-slate-500 font-medium bg-white px-1.5 py-0.5 rounded-full border">
                    {stageLeads.length}
                  </span>
                </div>
              </div>

              <div className="flex-1 p-2 space-y-2 overflow-y-auto">
                {stageLeads.length === 0 ? (
                  <div className={cn('text-center py-8 text-xs transition-colors', isDragTarget ? 'text-brand-sky' : 'text-slate-400')}>
                    {isDragTarget ? 'Drop here' : 'No leads'}
                  </div>
                ) : (
                  stageLeads.map((lead) => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      onOpen={handleOpenLead}
                      onStageChange={handleStageChange}
                      onDragStart={handleDragStart}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {leads.length === 0 && (
        <div className="text-center py-20 text-slate-500">
          <p className="text-lg font-semibold">No leads yet</p>
          <p className="text-sm mt-1">Import leads from the Dashboard to populate your pipeline</p>
        </div>
      )}
    </div>
  );
}
