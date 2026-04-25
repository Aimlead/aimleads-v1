import React, { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, ExternalLink, Loader2, Mail, Phone } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { dataClient } from '@/services/dataClient';
import { cn } from '@/lib/utils';
import { computeLeadPriority } from '@/lib/leadScoring';

const PIPELINE_STAGES = [
  { id: 'to_contact', statusLabel: 'To Contact', color: 'bg-slate-100 border-slate-300', dot: 'bg-slate-400' },
  { id: 'contacted', statusLabel: 'Contacted', color: 'bg-sky-50 border-sky-200', dot: 'bg-sky-500' },
  { id: 'meeting', statusLabel: 'Meeting Set', color: 'bg-violet-50 border-violet-200', dot: 'bg-violet-500' },
  { id: 'proposal', statusLabel: 'Proposal', color: 'bg-amber-50 border-amber-200', dot: 'bg-amber-500' },
  { id: 'won', statusLabel: 'Won', color: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
  { id: 'lost', statusLabel: 'Lost', color: 'bg-rose-50 border-rose-200', dot: 'bg-rose-400' },
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

const getStageLabel = (stageId, t) => {
  const labels = {
    to_contact: t('pipeline.stages.toContact', { defaultValue: 'À contacter' }),
    contacted: t('pipeline.stages.contacted', { defaultValue: 'Contacté' }),
    meeting: t('pipeline.stages.meeting', { defaultValue: 'RDV posé' }),
    proposal: t('pipeline.stages.proposal', { defaultValue: 'Proposition' }),
    won: t('pipeline.stages.won', { defaultValue: 'Gagné' }),
    lost: t('pipeline.stages.lost', { defaultValue: 'Perdu' }),
  };

  return labels[stageId] || stageId;
};

function LeadCard({ lead, activeIcp, onOpen, onStageChange, onDragStart }) {
  const { t } = useTranslation();
  const priority = computeLeadPriority(lead, activeIcp);
  const score = priority.finalScore ?? priority.priorityScore;
  const [moving, setMoving] = useState(false);
  const email = String(lead.contact_email || lead.email || '').trim();
  const phone = String(lead.contact_phone || lead.phone || '').trim();

  const handleStageChange = async (nextStageId) => {
    const stage = PIPELINE_STAGES.find((s) => s.id === nextStageId);
    if (!stage) return;
    setMoving(true);
    try {
      await dataClient.leads.update(lead.id, { follow_up_status: stage.statusLabel });
      toast.success(t('pipeline.toasts.movedTo', { defaultValue: 'Déplacé vers {{stage}}.', stage: getStageLabel(stage.id, t) }));
      onStageChange();
    } catch {
      toast.error(t('pipeline.toasts.updateFailed', { defaultValue: 'Impossible de mettre à jour le stage.' }));
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
      className="bg-white rounded-xl border border-[#e6e4df] p-3 shadow-sm hover:border-[#d9d5cb] transition cursor-grab active:cursor-grabbing group"
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
        {email && (
          <a href={`mailto:${email}`} aria-label={t('pipeline.actions.emailLead', { defaultValue: 'Envoyer un email' })}>
            <Button variant="ghost" size="icon" className="h-6 w-6" aria-label={t('pipeline.actions.emailLead', { defaultValue: 'Envoyer un email' })}>
              <Mail className="w-3 h-3 text-slate-400" />
            </Button>
          </a>
        )}
        {phone && (
          <a href={`tel:${phone}`} aria-label={t('pipeline.actions.callLead', { defaultValue: 'Appeler' })}>
            <Button variant="ghost" size="icon" className="h-6 w-6" aria-label={t('pipeline.actions.callLead', { defaultValue: 'Appeler' })}>
              <Phone className="w-3 h-3 text-slate-400" />
            </Button>
          </a>
        )}
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onOpen(lead)} aria-label={t('pipeline.actions.openLead', { defaultValue: 'Voir le lead' })}>
          <ExternalLink className="w-3 h-3 text-slate-400" />
        </Button>
        <Select value="" onValueChange={handleStageChange} disabled={moving}>
          <SelectTrigger className="h-6 text-[11px] px-2 py-0 border-slate-200 w-auto">
            <SelectValue placeholder={t('pipeline.actions.moveTo', { defaultValue: 'Déplacer...' })} />
          </SelectTrigger>
          <SelectContent>
            {PIPELINE_STAGES.map((stage) => (
              <SelectItem key={stage.id} value={stage.id} className="text-xs">
                {getStageLabel(stage.id, t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </motion.div>
  );
}

export default function Pipeline() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const dragLeadRef = useRef(null);
  const [draggingOver, setDraggingOver] = useState(null);
  const [mobileStageIndex, setMobileStageIndex] = useState(0);

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['leads'],
    queryFn: () => dataClient.leads.list('-created_at'),
  });

  const { data: activeIcp = null } = useQuery({
    queryKey: ['icpActive', 'pipeline'],
    queryFn: () => dataClient.icp.getActive(),
    staleTime: 60_000,
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
      await dataClient.leads.update(lead.id, { follow_up_status: stage.statusLabel });
      toast.success(t('pipeline.toasts.cardMoved', { defaultValue: '{{lead}} → {{stage}}', lead: lead.company_name, stage: getStageLabel(stage.id, t) }));
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    } catch {
      toast.error(t('pipeline.toasts.moveFailed', { defaultValue: 'Impossible de déplacer le lead.' }));
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand-sky animate-spin" />
      </div>
    );
  }

  const mobileStage = PIPELINE_STAGES[mobileStageIndex];
  const mobileStageLeads = mobileStage ? (stageMap[mobileStage.id] || []) : [];

  return (
    <div className="mx-auto w-full max-w-[1160px] space-y-4">
      <div className="rounded-xl border border-[#e6e4df] bg-white px-5 py-4 shadow-sm">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-slate-500">
          {t('pipeline.eyebrow', { defaultValue: 'Kanban commercial' })}
        </p>
        <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-[#1a1200]">{t('pipeline.title', { defaultValue: 'Pipeline' })}</h1>
        <p className="text-slate-500 mt-1 text-sm">
          {t('pipeline.totalLeads', { defaultValue: '{{count}} leads répartis par stage', count: leads.length })}
        </p>
      </div>

      {leads.length === 0 ? (
        <div className="text-center py-20 text-slate-500">
          <p className="text-lg font-semibold">{t('pipeline.empty.title', { defaultValue: 'Aucun lead pour le moment' })}</p>
          <p className="text-sm mt-1">{t('pipeline.empty.body', { defaultValue: 'Importez des leads depuis le dashboard pour alimenter votre pipeline.' })}</p>
        </div>
      ) : (
        <>
          {/* ── Mobile: one stage at a time with prev/next ───────────── */}
          <div className="md:hidden">
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => setMobileStageIndex((i) => Math.max(0, i - 1))}
                disabled={mobileStageIndex === 0}
                className="p-2 rounded-xl bg-white border border-slate-200 disabled:opacity-30 transition-opacity"
                aria-label={t('pipeline.actions.previousStage', { defaultValue: 'Stage précédent' })}
              >
                <ChevronLeft className="w-4 h-4 text-slate-600" />
              </button>

              <div className="flex-1 mx-3">
                <div className={cn('rounded-2xl border-2 px-4 py-2 flex items-center justify-between', mobileStage?.color)}>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${mobileStage?.dot}`} />
                    <span className="text-sm font-semibold text-slate-700">{mobileStage ? getStageLabel(mobileStage.id, t) : ''}</span>
                  </div>
                  <span className="text-xs text-slate-500 font-medium bg-white px-1.5 py-0.5 rounded-full border">
                    {mobileStageLeads.length}
                  </span>
                </div>
                <div className="flex justify-center gap-1 mt-2">
                  {PIPELINE_STAGES.map((s, i) => (
                    <button
                      key={s.id}
                      onClick={() => setMobileStageIndex(i)}
                      className={cn('w-1.5 h-1.5 rounded-full transition-colors', i === mobileStageIndex ? 'bg-brand-sky' : 'bg-slate-200')}
                      aria-label={t('pipeline.actions.openStage', { defaultValue: 'Ouvrir {{stage}}', stage: getStageLabel(s.id, t) })}
                    />
                  ))}
                </div>
              </div>

              <button
                onClick={() => setMobileStageIndex((i) => Math.min(PIPELINE_STAGES.length - 1, i + 1))}
                disabled={mobileStageIndex === PIPELINE_STAGES.length - 1}
                className="p-2 rounded-xl bg-white border border-slate-200 disabled:opacity-30 transition-opacity"
                aria-label={t('pipeline.actions.nextStage', { defaultValue: 'Stage suivant' })}
              >
                <ChevronRight className="w-4 h-4 text-slate-600" />
              </button>
            </div>

            <div className="space-y-2">
              {mobileStageLeads.length === 0 ? (
                <div className="text-center py-12 text-sm text-slate-400 bg-white rounded-2xl border border-slate-200">
                  {t('pipeline.noLeadsInStage', { defaultValue: 'Aucun lead dans ce stage' })}
                </div>
              ) : (
                mobileStageLeads.map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    activeIcp={activeIcp}
                    onOpen={handleOpenLead}
                    onStageChange={handleStageChange}
                    onDragStart={handleDragStart}
                  />
                ))
              )}
            </div>
          </div>

          {/* ── Desktop: full kanban board ───────────────────────────── */}
          <div className="hidden md:flex gap-4 overflow-x-auto pb-4" style={{ minHeight: '70vh' }}>
            {PIPELINE_STAGES.map((stage) => {
              const stageLeads = stageMap[stage.id] || [];
              const isDragTarget = draggingOver === stage.id;
              return (
                <div
                  key={stage.id}
                  className={cn(
                    `flex-shrink-0 w-[260px] rounded-xl border-2 flex flex-col transition-all duration-150`,
                    isDragTarget ? 'border-brand-sky bg-brand-sky/5 scale-[1.01]' : stage.color
                  )}
                  onDragOver={(e) => handleDragOver(e, stage.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, stage.id)}
                >
                  <div className="p-3 border-b border-slate-200/60">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${stage.dot}`} />
                      <span className="text-sm font-semibold text-slate-700">{getStageLabel(stage.id, t)}</span>
                      <span className="ml-auto text-xs text-slate-500 font-medium bg-white px-1.5 py-0.5 rounded-full border">
                        {stageLeads.length}
                      </span>
                    </div>
                  </div>

                  <div className="flex-1 p-2 space-y-2 overflow-y-auto">
                    {stageLeads.length === 0 ? (
                      <div className={cn('text-center py-8 text-xs transition-colors', isDragTarget ? 'text-brand-sky' : 'text-slate-400')}>
                        {isDragTarget ? t('pipeline.dropHere', { defaultValue: 'Déposer ici' }) : t('pipeline.noLeadsShort', { defaultValue: 'Aucun lead' })}
                      </div>
                    ) : (
                      stageLeads.map((lead) => (
                        <LeadCard
                          key={lead.id}
                          lead={lead}
                          activeIcp={activeIcp}
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
        </>
      )}
    </div>
  );
}
