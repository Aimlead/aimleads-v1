import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight, Layers, Loader2, Plus, RefreshCcw, Tag, TrendingUp, Users, Zap, Trash2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { dataClient } from '@/services/dataClient';
import { ROUTES } from '@/constants/routes';
import ScorePill from '@/components/leads/ScorePill';

const PRESET_SEGMENTS = [
  {
    id: 'seg-qualified',
    name: 'Qualified — Ready to contact',
    description: 'Leads currently marked as Qualified',
    icon: TrendingUp,
    color: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    filter: (leads) => leads.filter((l) => l.status === 'Qualified'),
  },
  {
    id: 'seg-hot',
    name: 'Hot leads — Score ≥ 80',
    description: 'High-value leads with excellent ICP fit',
    icon: Zap,
    color: 'bg-amber-50 text-amber-700 border-amber-100',
    filter: (leads) => leads.filter((l) => (l.final_score ?? l.icp_score ?? 0) >= 80),
  },
  {
    id: 'seg-unanalyzed',
    name: 'Not yet analyzed',
    description: 'Leads still waiting for AI scoring',
    icon: Loader2,
    color: 'bg-sky-50 text-sky-700 border-sky-100',
    filter: (leads) => leads.filter((l) => !l.final_score && l.status !== 'Error'),
  },
  {
    id: 'seg-followup',
    name: 'Pending follow-up',
    description: 'Leads contacted but awaiting reply',
    icon: Users,
    color: 'bg-violet-50 text-violet-700 border-violet-100',
    filter: (leads) => leads.filter((l) => l.follow_up_status === 'Reply Pending' || l.follow_up_status === 'Contacted'),
  },
];

const STATUS_OPTIONS = ['', 'To Analyze', 'Processing', 'Qualified', 'Rejected', 'Error'];
const FOLLOW_UP_OPTIONS = ['', 'To Contact', 'Contacted', 'Reply Pending', 'Closed Won', 'Closed Lost'];

function SegmentCard({ segment, leads, onClick }) {
  const filtered = useMemo(() => segment.filter(leads), [segment, leads]);
  const Icon = segment.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      className="group bg-white rounded-2xl border border-slate-100 p-5 cursor-pointer hover:border-slate-200 hover:shadow-md transition-all duration-200"
    >
      <div className="flex items-start gap-3">
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center border flex-shrink-0', segment.color)}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-800 text-sm">{segment.name}</h3>
          <p className="text-xs text-slate-400 mt-0.5">{segment.description}</p>
        </div>
        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors flex-shrink-0" />
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="text-2xl font-bold text-slate-800">{filtered.length}</div>
        <span className="text-xs text-slate-400">leads</span>
      </div>

      {/* Mini preview */}
      {filtered.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {filtered.slice(0, 3).map((lead) => (
            <div key={lead.id} className="flex items-center gap-2 text-xs text-slate-500">
              <div className="w-1.5 h-1.5 rounded-full bg-slate-300 flex-shrink-0" />
              <span className="truncate flex-1">{lead.company_name}</span>
              <ScorePill score={lead.final_score ?? lead.icp_score} className="text-[10px] px-1.5 py-0" />
            </div>
          ))}
          {filtered.length > 3 && (
            <p className="text-[10px] text-slate-400 pl-3.5">+{filtered.length - 3} more</p>
          )}
        </div>
      )}
    </motion.div>
  );
}

function CustomSegmentBuilder({ leads, onSave, onCancel }) {
  const [name, setName] = useState('');
  const [status, setStatus] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [minScore, setMinScore] = useState('');
  const [industry, setIndustry] = useState('');

  const preview = useMemo(() => {
    return leads.filter((l) => {
      if (status && l.status !== status) return false;
      if (followUp && l.follow_up_status !== followUp) return false;
      if (minScore && (l.final_score ?? l.icp_score ?? 0) < Number(minScore)) return false;
      if (industry && !String(l.industry || '').toLowerCase().includes(industry.toLowerCase())) return false;
      return true;
    });
  }, [leads, status, followUp, minScore, industry]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="bg-white rounded-2xl border border-brand-sky/15 p-5 space-y-4 col-span-full"
    >
      <h3 className="font-semibold text-slate-800">Build custom segment</h3>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="text-xs font-medium text-slate-500 mb-1 block">Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Segment name" className="h-9 rounded-xl text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500 mb-1 block">Status</label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9 rounded-xl text-sm"><SelectValue placeholder="Any status" /></SelectTrigger>
            <SelectContent>{STATUS_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o || 'Any status'}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500 mb-1 block">Follow-up</label>
          <Select value={followUp} onValueChange={setFollowUp}>
            <SelectTrigger className="h-9 rounded-xl text-sm"><SelectValue placeholder="Any stage" /></SelectTrigger>
            <SelectContent>{FOLLOW_UP_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o || 'Any stage'}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500 mb-1 block">Min score</label>
          <Input type="number" value={minScore} onChange={(e) => setMinScore(e.target.value)} placeholder="e.g. 60" min="0" max="100" className="h-9 rounded-xl text-sm" />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="bg-slate-50 rounded-xl px-4 py-2.5 border border-slate-100 flex items-center gap-2">
          <span className="text-2xl font-bold text-slate-800">{preview.length}</span>
          <span className="text-xs text-slate-500">leads match</span>
        </div>
        <Button
          size="sm"
          className="rounded-xl gap-1.5"
          disabled={!name || preview.length === 0}
          onClick={() => { onSave({ name, filter: { status, followUp, minScore, industry }, count: preview.length }); }}
        >
          Save segment
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel} className="rounded-xl">Cancel</Button>
      </div>
    </motion.div>
  );
}

const SEGMENTS_KEY = 'aimleads_custom_segments';

const loadCustomSegments = () => {
  try {
    const saved = localStorage.getItem(SEGMENTS_KEY);
    if (saved) {
      return JSON.parse(saved).map((seg) => ({
        ...seg,
        icon: Tag,
        filter: (ls) => ls.filter((l) => {
          const f = seg.filterCriteria || {};
          if (f.status && l.status !== f.status) return false;
          if (f.followUp && l.follow_up_status !== f.followUp) return false;
          if (f.minScore && (l.final_score ?? l.icp_score ?? 0) < Number(f.minScore)) return false;
          if (f.industry && !String(l.industry || '').toLowerCase().includes(f.industry.toLowerCase())) return false;
          return true;
        }),
      }));
    }
  } catch { /* ignore */ }
  return [];
};

export default function Segments() {
  const navigate = useNavigate();
  const [showBuilder, setShowBuilder] = useState(false);
  const [customSegments, setCustomSegments] = useState(loadCustomSegments);

  useEffect(() => {
    try {
      const serializable = customSegments.map(({ icon: _icon, filter: _filter, ...rest }) => rest);
      localStorage.setItem(SEGMENTS_KEY, JSON.stringify(serializable));
    } catch { /* ignore */ }
  }, [customSegments]);

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['leads'],
    queryFn: () => dataClient.leads.list(),
    staleTime: 30000,
  });

  const handleSaveCustom = (seg) => {
    const newSeg = {
      ...seg,
      id: `custom-${Date.now()}`,
      icon: Tag,
        color: 'bg-brand-sky/5 text-brand-sky border-brand-sky/15',
        filterCriteria: seg.filter,
        filter: (ls) => ls.filter((l) => {
          const f = seg.filter || {};
          if (f.status && l.status !== f.status) return false;
          if (f.followUp && l.follow_up_status !== f.followUp) return false;
          if (f.minScore && (l.final_score ?? l.icp_score ?? 0) < Number(f.minScore)) return false;
        if (f.industry && !String(l.industry || '').toLowerCase().includes(f.industry.toLowerCase())) return false;
        return true;
      }),
    };
    setCustomSegments((prev) => [...prev, newSeg]);
    setShowBuilder(false);
    toast.success(`Segment "${seg.name}" created!`);
  };

  const handleDeleteCustom = (id) => {
    setCustomSegments((prev) => prev.filter((s) => s.id !== id));
    toast.success('Segment deleted');
  };

  const allSegments = [...PRESET_SEGMENTS, ...customSegments];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-sky to-brand-sky-2 flex items-center justify-center">
              <Layers className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Segments</h1>
          </div>
          <p className="text-sm text-slate-500">Smart groups of leads based on criteria — auto-refreshed in real time.</p>
        </div>
        <Button
          size="sm"
          className="gap-2 rounded-xl"
          onClick={() => setShowBuilder(true)}
          disabled={showBuilder}
        >
          <Plus className="w-4 h-4" />
          Custom segment
        </Button>
      </div>

      {/* Stats bar */}
      <div className="bg-white rounded-2xl border border-slate-100 p-4 flex items-center gap-6">
        <div>
          <p className="text-xs text-slate-400">Total leads</p>
          <p className="text-xl font-bold text-slate-800">{leads.length}</p>
        </div>
        <div className="w-px h-10 bg-slate-100" />
        <div>
          <p className="text-xs text-slate-400">Segments</p>
          <p className="text-xl font-bold text-slate-800">{allSegments.length}</p>
        </div>
        <div className="w-px h-10 bg-slate-100" />
        <div>
          <p className="text-xs text-slate-400">Qualified</p>
          <p className="text-xl font-bold text-emerald-600">
            {leads.filter((l) => l.status === 'Qualified').length}
          </p>
        </div>
        {isLoading && <Loader2 className="w-4 h-4 text-slate-300 animate-spin ml-auto" />}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">
        <AnimatePresence>
          {showBuilder && (
            <CustomSegmentBuilder leads={leads} onSave={handleSaveCustom} onCancel={() => setShowBuilder(false)} />
          )}
        </AnimatePresence>

        {allSegments.map((seg) => (
          <div key={seg.id} className="relative group/seg">
            <SegmentCard
              segment={seg}
              leads={leads}
              onClick={() => navigate(ROUTES.dashboard)}
            />
            {seg.id.startsWith('custom-') && (
              <button
                onClick={() => handleDeleteCustom(seg.id)}
                className="absolute top-3 right-3 opacity-0 group-hover/seg:opacity-100 transition-opacity text-slate-300 hover:text-rose-500 p-1 rounded-lg hover:bg-rose-50"
                title="Delete segment"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
