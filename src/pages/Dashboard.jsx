import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { AlertTriangle, Brain, Download, Loader2, RefreshCcw, Sparkles, Target, TrendingUp, Upload, Users, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import LeadSlideOver from '@/components/leads/LeadSlideOver';
import ImportCSVDialog from '@/components/leads/ImportCSVDialog';
import LeadsTable from '@/components/leads/LeadsTable';
import OnboardingModal from '@/components/OnboardingModal';
import { SkeletonCard } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LEAD_STATUS } from '@/constants/leads';
import { useAuth } from '@/lib/AuthContext';
import { exportLeadsToCsv } from '@/lib/exportCsv';
import { analyzeLead } from '@/services/analysis/analyzeLead';
import { dataClient } from '@/services/dataClient';

const LIST_KEYS = {
  ALL: '__all_lists__',
  UNLISTED: '__unlisted__',
};

const STORAGE_KEY = 'aimleads:selected-source-list';
const MANTRA_SOURCE_TAG = 'given_to_sales_onboarding_2024_09_11';
const CAN_USE_DEV_TOOLS = import.meta.env.DEV || String(import.meta.env.VITE_ENABLE_DEV_TOOLS || '').trim() === '1';

const STAT_STYLE = {
  total: { icon: Users, bg: 'bg-violet-500' },
  qualified: { icon: TrendingUp, bg: 'bg-emerald-500' },
  avg: { icon: Target, bg: 'bg-amber-500' },
  toAnalyze: { icon: Sparkles, bg: 'bg-sky-500' },
};

const toSourceListKey = (lead) => {
  const value = String(lead?.source_list || '').trim();
  return value || LIST_KEYS.UNLISTED;
};

const sourceListLabel = (key) => {
  if (key === LIST_KEYS.UNLISTED) return 'Unlisted';
  return key;
};

const buildAnalysisUpdatePayload = (result) => ({
  status: result.final_status || result.status,
  icp_score: result.icp_score,
  icp_raw_score: result.icp_raw_score,
  icp_category: result.category,
  icp_priority: result.priority,
  recommended_action: result.recommended_action,
  icp_profile_id: result.icp_profile_id,
  icp_profile_name: result.icp_profile_name,
  analysis_version: result.analysis_version,
  ai_score: result.ai_score,
  ai_confidence: result.ai_confidence,
  ai_signals: result.ai_signals,
  ai_summary: result.ai_summary,
  final_score: result.final_score,
  final_category: result.final_category,
  final_priority: result.final_priority,
  final_recommended_action: result.final_recommended_action,
  final_status: result.final_status,
  signals: result.signals,
  score_details: result.score_details,
  analysis_summary: result.analysis_summary,
  generated_icebreakers: result.generated_icebreakers,
  generated_icebreaker: result.generated_icebreakers?.email,
  llm_enriched: result.llm_enriched,
  last_analyzed_at: new Date().toISOString(),
});

export default function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [selectedLead, setSelectedLead] = useState(null);
  const [slideOverOpen, setSlideOverOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [selectedSourceList, setSelectedSourceList] = useState(() => {
    if (typeof window === 'undefined') return LIST_KEYS.ALL;
    return window.localStorage.getItem(STORAGE_KEY) || LIST_KEYS.ALL;
  });
  const [isSwitchingIcp, setIsSwitchingIcp] = useState(false);
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [isRestoringMantra, setIsRestoringMantra] = useState(false);

  const { data: leads = [], isLoading, isError: leadsError, refetch: refetchLeads } = useQuery({
    queryKey: ['leads'],
    queryFn: () => dataClient.leads.list('-created_date'),
  });

  const { data: icpProfiles = [] } = useQuery({
    queryKey: ['icpProfilesQuickSwitch'],
    queryFn: () => dataClient.icp.list(),
  });

  const activeIcp = useMemo(
    () => icpProfiles.find((profile) => profile.is_active) || icpProfiles[0] || null,
    [icpProfiles]
  );

  const sourceListOptions = useMemo(() => {
    const counts = new Map();
    for (const lead of leads) {
      const key = toSourceListKey(lead);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([key, count]) => ({ key, count, label: sourceListLabel(key) }))
      .sort((left, right) => right.count - left.count);
  }, [leads]);

  const hasMantraList = sourceListOptions.some((option) => option.key === MANTRA_SOURCE_TAG);

  useEffect(() => {
    const valid =
      selectedSourceList === LIST_KEYS.ALL || sourceListOptions.some((option) => option.key === selectedSourceList);
    if (!valid) setSelectedSourceList(LIST_KEYS.ALL);
  }, [selectedSourceList, sourceListOptions]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, selectedSourceList);
  }, [selectedSourceList]);

  const visibleLeads = useMemo(() => {
    if (selectedSourceList === LIST_KEYS.ALL) return leads;
    return leads.filter((lead) => toSourceListKey(lead) === selectedSourceList);
  }, [leads, selectedSourceList]);

  useEffect(() => {
    if (!selectedLead?.id) return;
    const refreshed = leads.find((lead) => lead.id === selectedLead.id);
    if (refreshed) setSelectedLead((previous) => ({ ...previous, ...refreshed }));
  }, [leads, selectedLead?.id]);

  const handleSelectLead = async (lead) => {
    setSelectedLead(lead);
    setSlideOverOpen(true);
    const freshLead = await dataClient.leads.getById(lead.id);
    if (freshLead) setSelectedLead(freshLead);
  };

  const handleOpenLeadPage = (lead) => {
    navigate(`/leads/${lead.id}`, { state: { lead } });
  };

  const handleImportSuccess = () => queryClient.invalidateQueries({ queryKey: ['leads'] });
  const handleLeadUpdated = () => queryClient.invalidateQueries({ queryKey: ['leads'] });

  const handleSwitchIcp = async (nextIcpId) => {
    if (!nextIcpId || nextIcpId === activeIcp?.id) return;
    const nextProfile = icpProfiles.find((profile) => profile.id === nextIcpId);
    if (!nextProfile) return;
    setIsSwitchingIcp(true);
    try {
      await dataClient.icp.saveActive(nextProfile, user?.email || undefined);
      toast.success(`Active ICP changed to ${nextProfile.name}`);
      queryClient.invalidateQueries({ queryKey: ['icpProfilesQuickSwitch'] });
      queryClient.invalidateQueries({ queryKey: ['icpConfig'] });
    } catch (error) {
      console.warn('Failed to switch ICP', error);
      toast.error('Failed to switch ICP profile');
    } finally {
      setIsSwitchingIcp(false);
    }
  };

  const handleRestoreMantra = async () => {
    if (!CAN_USE_DEV_TOOLS) return;
    setIsRestoringMantra(true);
    try {
      const result = await dataClient.dev.loadMantra();
      toast.success(
        `Mantra loaded: ${result?.imported ?? 0} imported, ${result?.analyzed ?? 0} analyzed (total ${result?.total_tagged ?? 0}).`
      );
      setSelectedSourceList(MANTRA_SOURCE_TAG);
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['icpProfilesQuickSwitch'] });
      queryClient.invalidateQueries({ queryKey: ['icpConfig'] });
    } catch (error) {
      console.warn('Restore Mantra failed', error);
      toast.error('Failed to restore Mantra list');
    } finally {
      setIsRestoringMantra(false);
    }
  };

  const handleReanalyzeVisible = async () => {
    if (visibleLeads.length === 0) {
      toast('No leads to analyze in this list');
      return;
    }
    setIsReanalyzing(true);
    try {
      let analyzedCount = 0;
      const canUseDevEndpoint = selectedSourceList !== LIST_KEYS.UNLISTED;

      if (canUseDevEndpoint) {
        try {
          const payload = selectedSourceList === LIST_KEYS.ALL ? {} : { source_tag: selectedSourceList };
          const response = await dataClient.dev.reanalyze(payload);
          analyzedCount = Number(response?.analyzed || response?.total_scoped || 0);
        } catch {
          analyzedCount = 0;
        }
      }

      if (analyzedCount === 0) {
        const activeProfile = await dataClient.icp.getActive();
        if (!activeProfile) throw new Error('No active ICP profile found');

        for (const lead of visibleLeads) {
          const result = await analyzeLead({
            lead,
            icp_profile_id: activeProfile.id,
            icp_profile: activeProfile,
          });
          await dataClient.leads.update(lead.id, buildAnalysisUpdatePayload(result));
          analyzedCount += 1;
        }
      }

      toast.success(`Re-analyzed ${analyzedCount} lead(s)`);
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    } catch (error) {
      console.warn('Re-analyze failed', error);
      toast.error('Failed to re-analyze leads');
    } finally {
      setIsReanalyzing(false);
    }
  };

  const getLeadScore = (lead) => (Number.isFinite(lead.final_score) ? lead.final_score : lead.icp_score);
  const scoredLeads = visibleLeads.map((lead) => getLeadScore(lead)).filter((score) => Number.isFinite(score));
  const totalLeads = visibleLeads.length;
  const qualifiedLeads = visibleLeads.filter((lead) => lead.status === LEAD_STATUS.QUALIFIED).length;
  const toAnalyze = visibleLeads.filter((lead) => lead.status === LEAD_STATUS.TO_ANALYZE).length;
  const avgScore =
    scoredLeads.length > 0 ? Math.round(scoredLeads.reduce((acc, score) => acc + score, 0) / scoredLeads.length) : 0;
  const aiEnriched = visibleLeads.filter((l) => l.llm_enriched).length;

  const stats = [
    { key: 'total', value: totalLeads, label: 'Total Leads' },
    { key: 'qualified', value: qualifiedLeads, label: 'Qualified' },
    { key: 'avg', value: avgScore, label: 'Avg Final Score' },
    { key: 'toAnalyze', value: toAnalyze, label: 'To Analyze' },
  ];

  return (
    <>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Smart Inbox</h1>
          <p className="text-slate-500 mt-0.5 text-sm">ICP-first lead prioritization with AI intent reinforcement</p>
          {aiEnriched > 0 && (
            <p className="text-xs text-brand-sky mt-1 flex items-center gap-1">
              <Brain className="w-3 h-3" />
              {aiEnriched} leads enriched by AI
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {CAN_USE_DEV_TOOLS && (
            <Button variant="outline" size="sm" onClick={handleRestoreMantra} disabled={isRestoringMantra} className="gap-1.5 h-8 text-xs">
              {isRestoringMantra ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              Demo
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleReanalyzeVisible} disabled={isReanalyzing} className="gap-1.5 h-8 text-xs">
            {isReanalyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCcw className="w-3.5 h-3.5" />}
            Re-analyze
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportLeadsToCsv(visibleLeads, `leads-${selectedSourceList === '__all_lists__' ? 'all' : selectedSourceList}.csv`)}
            disabled={visibleLeads.length === 0}
            className="gap-1.5 h-8 text-xs"
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </Button>
          <Button onClick={() => setImportDialogOpen(true)} size="sm" className="gap-1.5 h-8 text-xs bg-gradient-to-r from-brand-sky to-brand-sky-2">
            <Upload className="w-3.5 h-3.5" />
            Import CSV
          </Button>
        </div>
      </div>

      {/* ── Context bar: ICP + List selectors ──────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5 p-3 bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold text-slate-400 uppercase shrink-0">ICP</span>
          <Select
            value={activeIcp?.id || ''}
            onValueChange={handleSwitchIcp}
            disabled={isSwitchingIcp || icpProfiles.length === 0}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Select active ICP" />
            </SelectTrigger>
            <SelectContent>
              {icpProfiles.map((profile) => (
                <SelectItem key={profile.id} value={profile.id}>
                  {profile.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-px bg-slate-200 hidden sm:block" />
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold text-slate-400 uppercase shrink-0">List</span>
          <Select value={selectedSourceList} onValueChange={setSelectedSourceList}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Select lead list" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={LIST_KEYS.ALL}>All Lists ({leads.length})</SelectItem>
              {sourceListOptions.map((option) => (
                <SelectItem key={option.key} value={option.key}>
                  {option.label} ({option.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Error state ─────────────────────────────────────────────────── */}
      {leadsError && (
        <div className="flex items-center gap-3 mb-5 p-4 bg-rose-50 border border-rose-100 rounded-xl text-rose-700 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="flex-1">Impossible de charger les leads.</span>
          <Button variant="outline" size="sm" onClick={() => refetchLeads()} className="gap-1.5 h-7 text-xs border-rose-200 text-rose-600 hover:bg-rose-100">
            <RefreshCcw className="w-3 h-3" />
            Réessayer
          </Button>
        </div>
      )}

      {/* ── Stats ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
          : stats.map((stat, index) => {
              const style = STAT_STYLE[stat.key];
              const Icon = style.icon;
              return (
                <motion.div
                  key={stat.key}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: index * 0.05 }}
                  className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg ${style.bg} flex items-center justify-center shrink-0`}>
                      <Icon className="w-4 h-4 text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xl font-bold text-slate-900 leading-tight">{stat.value}</p>
                      <p className="text-xs text-slate-500 truncate">{stat.label}</p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
      </div>

      <LeadsTable
        leads={visibleLeads}
        isLoading={isLoading}
        onSelectLead={handleSelectLead}
        onOpenLeadPage={handleOpenLeadPage}
        onLeadUpdated={handleLeadUpdated}
      />

      <OnboardingModal />

      <LeadSlideOver
        lead={selectedLead}
        open={slideOverOpen}
        onOpenChange={setSlideOverOpen}
        onLeadUpdated={handleLeadUpdated}
      />

      <ImportCSVDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onImportSuccess={handleImportSuccess}
      />
    </>
  );
}
