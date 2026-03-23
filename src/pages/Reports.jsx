import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download, DollarSign, Loader2, Target, TrendingUp, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FOLLOW_UP_STATUS, ICP_CATEGORY, LEAD_STATUS } from '@/constants/leads';
import { exportLeadsToCsv } from '@/lib/exportCsv';
import { dataClient } from '@/services/dataClient';

const QUALITY_COLORS = {
  [ICP_CATEGORY.EXCELLENT]: '#10b981',
  [ICP_CATEGORY.STRONG]: '#6366f1',
  [ICP_CATEGORY.MEDIUM]: '#f59e0b',
  [ICP_CATEGORY.LOW]: '#f97316',
  [ICP_CATEGORY.EXCLUDED]: '#ef4444',
};

const CATEGORY_ALIASES = {
  Qualifie: ICP_CATEGORY.STRONG,
  'Qualifi�': ICP_CATEGORY.STRONG,
  Moyen: ICP_CATEGORY.MEDIUM,
  'Non qualifie': ICP_CATEGORY.LOW,
  'Non qualifi�': ICP_CATEGORY.LOW,
  Exclu: ICP_CATEGORY.EXCLUDED,
};

const normalizeCategory = (category) => CATEGORY_ALIASES[category] || category;
const getLeadCategory = (lead) => normalizeCategory(lead.final_category || lead.icp_category);
const getLeadScore = (lead) => (Number.isFinite(lead.final_score) ? lead.final_score : lead.icp_score);

const STAT_STYLE = {
  total: { icon: Users, iconBg: 'bg-violet-100', iconColor: 'text-violet-600' },
  qualified: { icon: Target, iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600' },
  avg: { icon: TrendingUp, iconBg: 'bg-amber-100', iconColor: 'text-amber-600' },
  won: { icon: DollarSign, iconBg: 'bg-sky-100', iconColor: 'text-sky-600' },
};

export default function Reports() {
  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['leads'],
    queryFn: () => dataClient.leads.list('-created_date'),
  });

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand-sky animate-spin" />
      </div>
    );
  }

  const qualityData = Object.values(ICP_CATEGORY)
    .map((category) => ({
      name: category,
      value: leads.filter((lead) => getLeadCategory(lead) === category).length,
      color: QUALITY_COLORS[category],
    }))
    .filter((entry) => entry.value > 0);

  const followUpData = [
    FOLLOW_UP_STATUS.TO_CONTACT,
    FOLLOW_UP_STATUS.CONTACTED,
    FOLLOW_UP_STATUS.REPLY_PENDING,
    FOLLOW_UP_STATUS.CLOSED_WON,
    FOLLOW_UP_STATUS.CLOSED_LOST,
  ].map((status) => ({
    name: status,
    value: leads.filter((lead) => lead.follow_up_status === status).length,
  }));

  const scoredLeads = leads.map((lead) => getLeadScore(lead)).filter((score) => Number.isFinite(score));
  const avgScore = scoredLeads.length ? Math.round(scoredLeads.reduce((acc, score) => acc + score, 0) / scoredLeads.length) : 0;

  const stats = [
    { key: 'total', label: 'Total Leads', value: leads.length },
    { key: 'qualified', label: 'Qualified', value: leads.filter((lead) => lead.status === LEAD_STATUS.QUALIFIED).length },
    { key: 'avg', label: 'Avg Final Score', value: avgScore },
    { key: 'won', label: 'Closed Won', value: leads.filter((lead) => lead.follow_up_status === FOLLOW_UP_STATUS.CLOSED_WON).length },
  ];

  return (
    <div>
      <div className="flex items-start justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Reports & Analytics</h1>
          <p className="text-slate-500 mt-1">Track your lead pipeline performance in real time</p>
        </div>
        <Button
          variant="outline"
          onClick={() => exportLeadsToCsv(leads, 'aimleads-report.csv')}
          disabled={leads.length === 0}
          className="gap-2 shrink-0"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => {
          const style = STAT_STYLE[stat.key];
          const Icon = style.icon;
          return (
            <Card key={stat.key} className="shadow-sm">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl ${style.iconBg} flex items-center justify-center`}>
                    <Icon className={`w-5 h-5 ${style.iconColor}`} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
                    <p className="text-sm text-slate-500">{stat.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Lead Quality Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {qualityData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={qualityData}
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {qualityData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-slate-400 py-16">No data yet</p>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Follow-up Pipeline</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={followUpData}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
