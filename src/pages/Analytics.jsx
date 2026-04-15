import React, { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { BarChart3, Calendar, Target, TrendingUp, Users, X, Zap } from 'lucide-react';
import { SkeletonChart, SkeletonStats } from '@/components/ui/skeleton';
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

const DATE_RANGES = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'Last 365 days', days: 365 },
];

const CATEGORY_COLORS = {
  Excellent: '#7c3aed',
  'Strong Fit': '#2563eb',
  'Medium Fit': '#d97706',
  'Low Fit': '#dc2626',
  Excluded: '#6b7280',
};

const SCORE_BANDS = [
  { label: '80–100', min: 80, max: 100, color: '#7c3aed' },
  { label: '60–79', min: 60, max: 79, color: '#2563eb' },
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
    className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm"
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
  const [dateRangeDays, setDateRangeDays] = useState(null); // null = all time

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
      const key = lead.source_list || 'Unlisted';
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
      <div className="space-y-6">
        <div>
          <div className="h-8 w-48 bg-slate-200 rounded-lg animate-pulse mb-2" />
          <div className="h-4 w-64 bg-slate-100 rounded animate-pulse" />
        </div>
        <SkeletonStats count={4} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SkeletonChart />
          <SkeletonChart />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Analytiques</h1>
          <p className="text-slate-500 mt-1 text-sm">Performance du scoring leads et insights pipeline</p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
          {DATE_RANGES.map((range) => (
            <button
              key={range.days}
              type="button"
              onClick={() => setDateRangeDays(dateRangeDays === range.days ? null : range.days)}
              className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                dateRangeDays === range.days
                  ? 'bg-brand-sky text-white border-brand-sky'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-brand-sky/40 hover:text-brand-sky'
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
              aria-label="Clear date filter"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users} value={stats.total} label="Total Leads" color="bg-violet-500" delay={0} />
        <StatCard
          icon={TrendingUp}
          value={`${stats.conversionRate}%`}
          label="Qualification Rate"
          sub={`${stats.qualified} qualified`}
          color="bg-emerald-500"
          delay={0.05}
        />
        <StatCard
          icon={Target}
          value={stats.avgScore}
          label="Avg Final Score"
          sub="across all leads"
          color="bg-amber-500"
          delay={0.1}
        />
        <StatCard
          icon={Zap}
          value={stats.excellent}
          label="Excellent Leads"
          sub="Score ≥ 80"
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
            <span className="font-bold">{stats.llmEnriched} leads</span> enriched with AI reasoning, verified internet signals, and tailored score adjustments.
          </p>
        </motion.div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Category Distribution */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="w-4 h-4 text-violet-600" />
              ICP Category Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            {categoryData.length === 0 ? (
              <p className="text-slate-500 text-sm py-8 text-center">No analyzed leads yet</p>
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
                  <Tooltip formatter={(value, name) => [`${value} leads`, name]} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Score Distribution */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Score Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={scoreDistData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value) => [`${value} leads`]} />
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
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Top Industries</CardTitle>
          </CardHeader>
          <CardContent>
            {industryData.length === 0 ? (
              <p className="text-slate-500 text-sm py-8 text-center">No industry data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={industryData} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value) => [`${value} leads`]} />
                  <Bar dataKey="count" fill="#7c3aed" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Source List Performance */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Source List Performance</CardTitle>
          </CardHeader>
          <CardContent>
            {sourceListData.length === 0 ? (
              <p className="text-slate-500 text-sm py-8 text-center">No source list data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={sourceListData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="list" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Area type="monotone" dataKey="avgScore" name="Avg Score" stroke="#7c3aed" fill="#ede9fe" />
                  <Area type="monotone" dataKey="convRate" name="Conv. Rate %" stroke="#2563eb" fill="#dbeafe" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
