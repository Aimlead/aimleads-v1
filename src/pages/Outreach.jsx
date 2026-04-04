import React, { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen, Check, ChevronRight, Copy, Edit3, Linkedin, Loader2, Mail, Phone,
  Plus, RefreshCw, Save, Sparkles, Tag, Trash2, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ACTIVATION_SEQUENCE_STORAGE_KEY } from '@/constants/activation';
import { dataClient } from '@/services/dataClient';
import { cn } from '@/lib/utils';

const CHANNEL_ICONS = {
  email: { icon: Mail, label: 'Email', color: 'text-blue-500', bg: 'bg-blue-50', border: 'border-blue-100' },
  email_followup: { icon: Mail, label: 'Follow-up', color: 'text-indigo-500', bg: 'bg-indigo-50', border: 'border-indigo-100' },
  linkedin: { icon: Linkedin, label: 'LinkedIn', color: 'text-sky-600', bg: 'bg-sky-50', border: 'border-sky-100' },
  call: { icon: Phone, label: 'Call Script', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
};

const INITIAL_TEMPLATES = [
  {
    id: '1',
    name: 'SaaS Decision Maker',
    channel: 'email',
    tags: ['saas', 'b2b'],
    content: `Hi {{contact_name}},

I came across {{company_name}} and was impressed by your work in {{industry}}.

We help companies like yours reduce manual SDR research by 80% using AI-powered lead scoring and automated icebreakers.

Would it make sense to connect for 15 minutes this week to explore if there's a fit?

Best,
{{sender_name}}`,
    variables: ['contact_name', 'company_name', 'industry', 'sender_name'],
  },
  {
    id: '2',
    name: 'LinkedIn Connection Note',
    channel: 'linkedin',
    tags: ['cold', 'growth'],
    content: `Hi {{contact_name}}, noticed your work at {{company_name}} in the {{industry}} space. Our AI scoring platform has helped similar teams 3x their qualified pipeline. Worth a quick chat?`,
    variables: ['contact_name', 'company_name', 'industry'],
  },
  {
    id: '3',
    name: 'Cold Call Opener',
    channel: 'call',
    tags: ['cold', 'senior'],
    content: `Hi {{contact_name}}, this is [name] from AimLeads. I'll be direct — I'm calling because we help {{industry}} teams like {{company_name}} identify their highest-value leads using AI, so you can stop guessing and start closing. Do you have 90 seconds?`,
    variables: ['contact_name', 'industry', 'company_name'],
  },
];

const VARIABLE_COLOR = {
  contact_name: 'bg-brand-sky/10 text-brand-sky',
  company_name: 'bg-blue-100 text-blue-700',
  industry: 'bg-amber-100 text-amber-700',
  sender_name: 'bg-emerald-100 text-emerald-700',
};

function TemplateCard({ template, onEdit, onDelete, isSelected, onClick }) {
  const meta = CHANNEL_ICONS[template.channel] || CHANNEL_ICONS.email;
  const Icon = meta.icon;
  const [copied, setCopied] = useState(false);

  const handleCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(template.content);
    setCopied(true);
    toast.success('Template copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      onClick={onClick}
      className={cn(
        'group relative bg-white rounded-2xl border p-4 cursor-pointer transition-all duration-200',
        isSelected
          ? 'border-brand-sky/20 shadow-sm ring-1 ring-brand-sky/20'
          : 'border-slate-100 hover:border-slate-200 hover:shadow-sm'
      )}
    >
      {/* Channel badge */}
      <div className={cn('inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-lg border mb-3', meta.bg, meta.color, meta.border)}>
        <Icon className="w-3 h-3" />
        {meta.label}
      </div>

      <h3 className="font-semibold text-slate-800 text-sm mb-1.5">{template.name}</h3>

      <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed mb-3">
        {template.content.replace(/\n/g, ' ')}
      </p>

      {/* Variables */}
      <div className="flex flex-wrap gap-1 mb-3">
        {template.variables?.map((v) => (
          <span key={v} className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded', VARIABLE_COLOR[v] || 'bg-slate-100 text-slate-600')}>
            {`{{${v}}}`}
          </span>
        ))}
      </div>

      {/* Tags */}
      {template.tags?.length > 0 && (
        <div className="flex gap-1 mb-2">
          {template.tags.map((t) => (
            <span key={t} className="text-[10px] text-slate-400 bg-slate-50 rounded px-1.5 py-0.5">#{t}</span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1.5 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={handleCopy} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 transition-colors px-2 py-1 rounded-lg hover:bg-slate-50">
          {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button onClick={(e) => { e.stopPropagation(); onEdit(template); }} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 transition-colors px-2 py-1 rounded-lg hover:bg-slate-50">
          <Edit3 className="w-3 h-3" />
          Edit
        </button>
        <button onClick={(e) => { e.stopPropagation(); onDelete(template.id); }} className="flex items-center gap-1 text-xs text-slate-500 hover:text-rose-600 transition-colors px-2 py-1 rounded-lg hover:bg-rose-50 ml-auto">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </motion.div>
  );
}

function TemplatePreview({ template }) {
  const meta = CHANNEL_ICONS[template.channel] || CHANNEL_ICONS.email;
  const Icon = meta.icon;

  const rendered = template.content
    .replace(/{{contact_name}}/g, 'Sophie Martin')
    .replace(/{{company_name}}/g, 'Acme Corp')
    .replace(/{{industry}}/g, 'SaaS / B2B')
    .replace(/{{sender_name}}/g, 'You');

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 h-full">
      <div className="flex items-center gap-2 mb-4">
        <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center border', meta.bg, meta.border)}>
          <Icon className={cn('w-4 h-4', meta.color)} />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-800">{template.name}</p>
          <p className="text-xs text-slate-400">{meta.label} template preview</p>
        </div>
      </div>

      <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed font-mono text-xs border border-slate-100">
        {rendered}
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {template.variables?.map((v) => (
          <span key={v} className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full', VARIABLE_COLOR[v] || 'bg-slate-100 text-slate-600')}>
            {`{{${v}}}`}
          </span>
        ))}
      </div>
    </div>
  );
}

function TemplateEditor({ template, onSave, onCancel }) {
  const [name, setName] = useState(template?.name || '');
  const [channel, setChannel] = useState(template?.channel || 'email');
  const [content, setContent] = useState(template?.content || '');
  const [tags, setTags] = useState((template?.tags || []).join(', '));

  const variables = [...content.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
  const uniqueVars = [...new Set(variables)];

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-800">{template ? 'Edit Template' : 'New Template'}</h3>
        <button onClick={onCancel} className="text-slate-400 hover:text-slate-600">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-slate-600 mb-1 block">Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name" className="rounded-xl h-9 text-sm" />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600 mb-1 block">Channel</label>
          <div className="flex gap-2">
            {Object.entries(CHANNEL_ICONS).map(([key, meta]) => {
              const Icon = meta.icon;
              return (
                <button
                  key={key}
                  onClick={() => setChannel(key)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all',
                    channel === key ? cn(meta.bg, meta.color, meta.border) : 'text-slate-500 border-slate-200 hover:border-slate-300'
                  )}
                >
                  <Icon className="w-3 h-3" />
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600 mb-1 block">
            Content <span className="text-slate-400 font-normal">— use {`{{variable_name}}`} for dynamic fields</span>
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={8}
            className="w-full text-xs font-mono rounded-xl border border-slate-200 p-3 resize-none focus:outline-none focus:ring-2 focus:ring-brand-sky/20 transition-all"
            placeholder="Write your template…"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600 mb-1 block">Tags (comma-separated)</label>
          <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="e.g. cold, saas, decision-maker" className="rounded-xl h-9 text-sm" />
        </div>

        {uniqueVars.length > 0 && (
          <div>
            <p className="text-xs font-medium text-slate-500 mb-1.5">Detected variables:</p>
            <div className="flex flex-wrap gap-1">
              {uniqueVars.map((v) => (
                <span key={v} className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded', VARIABLE_COLOR[v] || 'bg-slate-100 text-slate-600')}>
                  {`{{${v}}}`}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          className="gap-1.5 rounded-xl"
          onClick={() => onSave({ name, channel, content, tags: tags.split(',').map((t) => t.trim()).filter(Boolean), variables: uniqueVars })}
          disabled={!name || !content}
        >
          <Save className="w-3.5 h-3.5" />
          Save template
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel} className="rounded-xl">
          Cancel
        </Button>
      </div>
    </motion.div>
  );
}

const STORAGE_KEY = 'aimleads_outreach_templates';

const loadTemplates = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return INITIAL_TEMPLATES;
};

// ─── AI Sequence Components ───────────────────────────────────────────────────

function TouchCard({ touch }) {
  const [copied, setCopied] = useState(false);
  const meta = CHANNEL_ICONS[touch.channel] || CHANNEL_ICONS.email;
  const Icon = meta.icon;

  const fullText = [touch.subject && `Sujet : ${touch.subject}`, touch.body, touch.cta && `→ ${touch.cta}`]
    .filter(Boolean)
    .join('\n\n');

  const handleCopy = () => {
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    toast.success('Copié !');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="border border-slate-100 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 tabular-nums">J{touch.day}</span>
            <span className={cn('inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-lg border', meta.bg, meta.color, meta.border)}>
              <Icon className="w-3 h-3" />
              {meta.label}
            </span>
          </div>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 transition-colors px-2 py-1 rounded-lg hover:bg-slate-50"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copié' : 'Copier'}
          </button>
        </div>
        {touch.subject && (
          <p className="text-sm font-semibold text-slate-800 mt-1">{touch.subject}</p>
        )}
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{touch.body}</p>
        {touch.cta && (
          <p className="text-xs font-semibold text-brand-sky border-t border-slate-100 pt-2">
            → {touch.cta}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function SequenceResult({ sequence }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4 mt-6"
    >
      {/* Header */}
      <div className="bg-gradient-to-r from-brand-sky/5 to-transparent rounded-2xl border border-brand-sky/10 p-4">
        <p className="text-base font-semibold text-slate-800">{sequence.sequence_name}</p>
        <p className="text-sm text-slate-500 mt-0.5">{sequence.objective}</p>
        {sequence.personalization_hooks?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {sequence.personalization_hooks.map((hook, i) => (
              <span key={i} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-brand-sky/10 text-brand-sky border border-brand-sky/20">
                {hook}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Touch cards */}
      <div className="space-y-3">
        {sequence.touches?.map((touch, i) => (
          <TouchCard key={i} touch={touch} />
        ))}
      </div>
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Outreach() {
  const [templates, setTemplates] = useState(loadTemplates);
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const [isNew, setIsNew] = useState(false);
  const [channelFilter, setChannelFilter] = useState('all');
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [sequence, setSequence] = useState(null);

  const { data: leads = [] } = useQuery({
    queryKey: ['leads'],
    queryFn: () => dataClient.leads.list(),
  });

  const sequenceMutation = useMutation({
    mutationFn: (id) => dataClient.leads.generateSequence(id),
    onSuccess: (data) => {
      if (!data) {
        toast.error('Génération impossible — vérifiez qu\'un ICP actif est configuré et que ANTHROPIC_API_KEY est défini.');
        return;
      }
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(ACTIVATION_SEQUENCE_STORAGE_KEY, '1');
      }
      setSequence(data);
      toast.success('Séquence générée !');
    },
    onError: (error) => {
      const msg = error?.payload?.message || error?.message || null;
      if (msg) {
        toast.error(`Génération échouée : ${msg}`);
      } else {
        toast.error('Génération échouée. Vérifiez que ANTHROPIC_API_KEY est configurée et qu\'un ICP actif existe.');
      }
    },
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(templates)); } catch { /* ignore */ }
  }, [templates]);

  const filtered = channelFilter === 'all' ? templates : templates.filter((t) => t.channel === channelFilter);

  const handleSave = (data) => {
    if (isNew) {
      const newT = { ...data, id: String(Date.now()) };
      setTemplates((prev) => [newT, ...prev]);
      toast.success('Template créé !');
    } else {
      setTemplates((prev) => prev.map((t) => t.id === editing.id ? { ...t, ...data } : t));
      toast.success('Template mis à jour !');
    }
    setEditing(null);
    setIsNew(false);
  };

  const handleDelete = (id) => {
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    if (selected?.id === id) setSelected(null);
    toast.success('Template supprimé');
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-sky-500 flex items-center justify-center">
          <BookOpen className="w-4 h-4 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Outreach</h1>
          <p className="text-sm text-slate-500">Templates manuels et séquences IA personnalisées</p>
        </div>
      </div>

      <Tabs defaultValue="templates">
        <TabsList className="bg-slate-100">
          <TabsTrigger value="templates" className="gap-2">
            <BookOpen className="w-4 h-4" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="sequences" className="gap-2">
            <Sparkles className="w-4 h-4" />
            Séquences IA
          </TabsTrigger>
        </TabsList>

        {/* ── TEMPLATES TAB ─────────────────────────────────── */}
        <TabsContent value="templates" className="space-y-5 mt-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">Gérez vos scripts email, LinkedIn et appel. Utilisez {`{{variables}}`} pour personnaliser.</p>
            <Button
              size="sm"
              className="gap-2 rounded-xl"
              onClick={() => { setEditing(null); setIsNew(true); setSelected(null); }}
            >
              <Plus className="w-4 h-4" />
              Nouveau template
            </Button>
          </div>

          {/* Channel filter */}
          <div className="flex gap-2 flex-wrap">
            {['all', 'email', 'linkedin', 'call'].map((ch) => {
              const meta = ch === 'all' ? null : CHANNEL_ICONS[ch];
              const Icon = meta?.icon;
              return (
                <button
                  key={ch}
                  onClick={() => setChannelFilter(ch)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all',
                    channelFilter === ch
                      ? 'bg-white text-white border-slate-900'
                      : 'text-slate-600 border-slate-200 hover:border-slate-300 bg-white'
                  )}
                >
                  {Icon && <Icon className="w-3 h-3" />}
                  {ch === 'all' ? 'Tous' : meta.label}
                  <span className={cn('text-[10px] px-1 rounded-full', channelFilter === ch ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500')}>
                    {ch === 'all' ? templates.length : templates.filter((t) => t.channel === ch).length}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Left: cards */}
            <div className="space-y-3">
              <AnimatePresence mode="popLayout">
                {isNew && (
                  <TemplateEditor key="new" template={null} onSave={handleSave} onCancel={() => setIsNew(false)} />
                )}
                {!isNew && editing && (
                  <TemplateEditor key={editing.id} template={editing} onSave={handleSave} onCancel={() => setEditing(null)} />
                )}
                {!isNew && !editing && filtered.map((t) => (
                  <TemplateCard
                    key={t.id}
                    template={t}
                    isSelected={selected?.id === t.id}
                    onClick={() => setSelected(t)}
                    onEdit={(tpl) => { setEditing(tpl); setSelected(null); setIsNew(false); }}
                    onDelete={handleDelete}
                  />
                ))}
              </AnimatePresence>

              {filtered.length === 0 && !isNew && !editing && (
                <div className="text-center py-12">
                  <BookOpen className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">Aucun template pour ce canal</p>
                  <Button variant="ghost" size="sm" className="mt-2" onClick={() => setIsNew(true)}>Créer →</Button>
                </div>
              )}
            </div>

            {/* Right: preview */}
            <div className="hidden lg:block">
              {selected && !editing ? (
                <TemplatePreview template={selected} />
              ) : (
                <div className="bg-slate-50 rounded-2xl border border-dashed border-slate-200 h-64 flex flex-col items-center justify-center gap-3 text-slate-400">
                  <BookOpen className="w-8 h-8 text-slate-200" />
                  <p className="text-sm">Cliquez sur un template pour le prévisualiser</p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ── SÉQUENCES IA TAB ──────────────────────────────── */}
        <TabsContent value="sequences" className="mt-5 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Générer une séquence 3 touches</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Sélectionnez un lead — Claude génère un email J1, un follow-up J5 et un message LinkedIn J10 ultra-personnalisés.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <Select value={selectedLeadId} onValueChange={(v) => { setSelectedLeadId(v); setSequence(null); }}>
              <SelectTrigger className="w-full sm:w-80">
                <SelectValue placeholder="Choisir un lead…" />
              </SelectTrigger>
              <SelectContent>
                {leads.length === 0 && (
                  <SelectItem value="__empty__" disabled>Aucun lead disponible</SelectItem>
                )}
                {leads.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {[l.contact_name, l.company_name].filter(Boolean).join(' — ') || l.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              onClick={() => sequenceMutation.mutate(selectedLeadId)}
              disabled={!selectedLeadId || sequenceMutation.isPending}
              className="gap-2 bg-gradient-to-r from-brand-sky to-brand-sky-2 shrink-0"
            >
              {sequenceMutation.isPending
                ? <><RefreshCw className="w-4 h-4 animate-spin" /> Génération…</>
                : <><Sparkles className="w-4 h-4" /> Générer la séquence</>}
            </Button>
          </div>

          {!sequence && !sequenceMutation.isPending && (
            <div className="bg-slate-50 rounded-2xl border border-dashed border-slate-200 py-16 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Sparkles className="w-8 h-8 text-slate-200" />
              <p className="text-sm">Sélectionnez un lead et cliquez sur Générer</p>
            </div>
          )}

          {sequenceMutation.isPending && (
            <div className="flex items-center justify-center py-16 gap-3 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin text-brand-sky" />
              <p className="text-sm">Claude rédige votre séquence…</p>
            </div>
          )}

          {sequence && !sequenceMutation.isPending && (
            <SequenceResult sequence={sequence} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
