import React, { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { BarChart3, Calendar, Loader2, Target, TrendingUp, Users, X, Zap } from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LEAD_STATUS } from '@/constants/leads';
import { dataClient } from '@/services/dataClient';

const CATEGORY_COLORS = {
  Excellent: '#f0a63b',
  'Strong Fit': '#3A8DFF',
  'Medium Fit': '#d97706',
  'Low Fit': '#dc2626',
  Excluded: '#6b7280',
};

const SCORE_BANDS = [
  { label: '80-100', min: 80, max: 100, color: '#f0a63b' },
  { label: '60-79', min: 60, max: 79, color: '#3A8DFF' },
  { label: '40–59', min: 40, max: 59, color: '#d97706' },
  { label: '20–39', min: 20, max: 39, color: '#f97316' },
  { label: '0–19', min: 0, max: 19, color: '#dc2626' },
];

/** @type {React.FC<{icon: React.ElementType, value: string|number, label: string, sub?: string, color: string, delay?: number}>} */
const StatCard = ({ icon: Icon, value, label, sub, color, delay = 0 }) => (
  <motion.div
    initial={{ opacity: 0, y: 16 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.4, delay }}
    className="rounded-xl border border-[#e6e4df] bg-white p-5 shadow-sm"
  >
    <div className="flex items-center gap-3">
      <div className={`w-11 h-11 rounded-xl ${color} flex items-center justify-center`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        <p className="text-sm text-slate-500">{label}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  </motion.div>
);

export default function Analytics() {
  const { t } = useTranslation();
  const [dateRangeDays, setDateRangeDays] = useState(null); // null = all time

  const dateRanges = [
    { label: t('analytics.ranges.last7', { defaultValue: '7 derniers jours' }), days: 7 },
    { label: t('analytics.ranges.last30', { defaultValue: '30 derniers jours' }), days: 30 },
    { label: t('analytics.ranges.last90', { defaultValue: '90 derniers jours' }), days: 90 },
    { label: t('analytics.ranges.last365', { defaultValue: '12 derniers mois' }), days: 365 },
  ];

  const { data: allLeads = [], isLoading } = useQuery({
    queryKey: ['leads'],
    queryFn: () => dataClient.leads.list('-created_at'),
  });

  const leads = useMemo(() => {
    if (!dateRangeDays) return allLeads;
    const cutoff = new Date(Date.now() - dateRangeDays * 24 * 60 * 60 * 1000);
    return allLeads.filter((l) => {
      const d = l.created_date || l.created_at;
      return d && new Date(d) >= cutoff;
    });
  }, [allLeads, dateRangeDays]);

  const stats = useMemo(() => {
    const total = leads.length;
    const qualified = leads.filter((l) => l.status === LEAD_STATUS.QUALIFIED).length;
    const scoredLeads = leads.filter((l) => Number.isFinite(l.final_score) || Number.isFinite(l.icp_score));
    const avgScore =
      scoredLeads.length > 0
        ? Math.round(
            scoredLeads.reduce((acc, l) => acc + (Number.isFinite(l.final_score) ? l.final_score : l.icp_score), 0) /
              scoredLeads.length
          )
        : 0;
    const excellent = leads.filter((l) => l.final_category === 'Excellent' || l.icp_category === 'Excellent').length;
    const conversionRate = total > 0 ? Math.round((qualified / total) * 100) : 0;
    const llmEnriched = leads.filter((l) => l.llm_enriched).length;

    return { total, qualified, avgScore, excellent, conversionRate, llmEnriched };
  }, [leads]);

  // Category distribution (pie)
  const categoryData = useMemo(() => {
    const counts = {};
    for (const lead of leads) {
      const cat = lead.final_category || lead.icp_category || 'Unknown';
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [leads]);

  // Score distribution (bar)
  const scoreDistData = useMemo(() => {
    return SCORE_BANDS.map((band) => ({
      label: band.label,
      count: leads.filter((l) => {
        const score = Number.isFinite(l.final_score) ? l.final_score : l.icp_score;
        return Number.isFinite(score) && score >= band.min && score <= band.max;
      }).length,
      color: band.color,
    }));
  }, [leads]);

  // Top industries
  const industryData = useMemo(() => {
    const counts = {};
    for (const lead of leads) {
      if (lead.industry) counts[lead.industry] = (counts[lead.industry] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [leads]);

  // Score trend by source list
  const sourceListData = useMemo(() => {
    const groups = {};
    for (const lead of leads) {
      const key = lead.source_list || t('analytics.unlistedSource', { defaultValue: 'Sans liste' });
      if (!groups[key]) groups[key] = { list: key, total: 0, scoreSum: 0, qualified: 0 };
      groups[key].total += 1;
      const score = Number.isFinite(lead.final_score) ? lead.final_score : lead.icp_score;
      if (Number.isFinite(score)) groups[key].scoreSum += score;
      if (lead.status === LEAD_STATUS.QUALIFIED) groups[key].qualified += 1;
    }
    return Object.values(groups)
      .map((g) => ({
        ...g,
        avgScore: g.total > 0 ? Math.round(g.scoreSum / g.total) : 0,
        convRate: g.total > 0 ? Math.round((g.qualified / g.total) * 100) : 0,
      }))
      .sort((a, b) => b.avgScore - a.avgScore)
      .slice(0, 6);
  }, [leads]);

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand-sky animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1160px] space-y-6">
      <div className="rounded-xl border border-[#e6e4df] bg-white px-5 py-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-slate-500">
            {t('analytics.eyebrow', { defaultValue: 'Pilotage' })}
          </p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-[#1a1200]">{t('analytics.title', { defaultValue: 'Analytiques' })}</h1>
          <p className="text-slate-500 mt-1 text-sm">{t('analytics.subtitle', { defaultValue: 'Performance du scoring lead et insights pipeline.' })}</p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
          {dateRanges.map((range) => (
            <button
              key={range.days}
              type="button"
              onClick={() => setDateRangeDays(dateRangeDays === range.days ? null : range.days)}
              className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                dateRangeDays === range.days
                  ? 'bg-[#1a1200] text-white border-[#1a1200]'
                  : 'bg-white text-slate-600 border-[#e6e4df] hover:border-brand-sky/40 hover:text-brand-sky'
              }`}
            >
              {range.label}
            </button>
          ))}
          {dateRangeDays && (
            <button
              type="button"
              onClick={() => setDateRangeDays(null)}
              className="text-xs px-2 py-1.5 rounded-lg text-slate-400 hover:text-slate-600"
              aria-label={t('analytics.clearDateFilter', { defaultValue: 'Effacer le filtre de dates' })}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users} value={stats.total} label={t('analytics.cards.totalLeads', { defaultValue: 'Total leads' })} color="bg-slate-900" delay={0} />
        <StatCard
          icon={TrendingUp}
          value={`${stats.conversionRate}%`}
          label={t('analytics.cards.qualificationRate', { defaultValue: 'Taux de qualification' })}
          sub={t('analytics.cards.qualifiedCount', { defaultValue: '{{count}} qualifiés', count: stats.qualified })}
          color="bg-emerald-500"
          delay={0.05}
        />
        <StatCard
          icon={Target}
          value={stats.avgScore}
          label={t('analytics.cards.avgFinalScore', { defaultValue: 'Score final moyen' })}
          sub={t('analytics.cards.avgFinalScoreHint', { defaultValue: 'sur les leads scorés' })}
          color="bg-amber-500"
          delay={0.1}
        />
        <StatCard
          icon={Zap}
          value={stats.excellent}
          label={t('analytics.cards.excellentLeads', { defaultValue: 'Leads excellents' })}
          sub={t('analytics.cards.excellentLeadsHint', { defaultValue: 'Score ≥ 80' })}
          color="bg-brand-sky"
          delay={0.15}
        />
      </div>

      {/* AI Enrichment Banner */}
      {stats.llmEnriched > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-2xl bg-gradient-to-r from-brand-sky to-brand-sky-2 p-4 text-white flex items-center gap-3"
        >
          <Zap className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm font-medium">
            {t('analytics.aiBanner', {
              defaultValue: '<strong>{{count}} leads</strong> enrichis avec raisonnement IA, signaux vérifiés et ajustements de score.',
              count: stats.llmEnriched,
            }).split('<strong>').map((part, index) => {
              if (index === 0) return part;
              const [strongText, rest] = part.split('</strong>');
              return (
                <React.Fragment key={`${strongText}-${index}`}>
                  <span className="font-bold">{strongText}</span>
                  {rest}
                </React.Fragment>
              );
            })}
          </p>
        </motion.div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Category Distribution */}
        <Card className="border-[#e6e4df] shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="w-4 h-4 text-violet-600" />
              {t('analytics.charts.categoryBreakdown', { defaultValue: 'Répartition des catégories ICP' })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {categoryData.length === 0 ? (
              <p className="text-slate-500 text-sm py-8 text-center">{t('analytics.empty.analyzedLeads', { defaultValue: 'Aucun lead analysé pour le moment' })}</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {categoryData.map((entry) => (
                      <Cell key={entry.name} fill={CATEGORY_COLORS[entry.name] || '#94a3b8'} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value, name) => [t('analytics.tooltip.leadsCount', { defaultValue: '{{count}} leads', count: value }), name]} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Score Distribution */}
        <Card className="border-[#e6e4df] shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">{t('analytics.charts.scoreDistribution', { defaultValue: 'Distribution des scores' })}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={scoreDistData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value) => [t('analytics.tooltip.leadsCount', { defaultValue: '{{count}} leads', count: value })]} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {scoreDistData.map((entry) => (
                    <Cell key={entry.label} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top Industries */}
        <Card className="border-[#e6e4df] shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">{t('analytics.charts.topIndustries', { defaultValue: 'Secteurs principaux' })}</CardTitle>
          </CardHeader>
          <CardContent>
            {industryData.length === 0 ? (
              <p className="text-slate-500 text-sm py-8 text-center">{t('analytics.empty.industryData', { defaultValue: 'Aucune donnée secteur pour le moment' })}</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={industryData} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value) => [t('analytics.tooltip.leadsCount', { defaultValue: '{{count}} leads', count: value })]} />
                  <Bar dataKey="count" fill="#3A8DFF" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Source List Performance */}
        <Card className="border-[#e6e4df] shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">{t('analytics.charts.sourceListPerformance', { defaultValue: 'Performance par liste source' })}</CardTitle>
          </CardHeader>
          <CardContent>
            {sourceListData.length === 0 ? (
              <p className="text-slate-500 text-sm py-8 text-center">{t('analytics.empty.sourceListData', { defaultValue: 'Aucune liste source pour le moment' })}</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={sourceListData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="list" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Area type="monotone" dataKey="avgScore" name={t('analytics.legend.avgScore', { defaultValue: 'Score moyen' })} stroke="#f0a63b" fill="#fff4db" />
                  <Area type="monotone" dataKey="convRate" name={t('analytics.legend.convRate', { defaultValue: 'Taux conv. %' })} stroke="#3A8DFF" fill="#dbeafe" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
