import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Building2, Globe, Loader2, Search, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { dataClient } from '@/services/dataClient';

const PROGRESS_MESSAGES = [
  'Recherche sur le web en cours…',
  'Analyse des signaux d\'achat…',
  'Extraction des informations clés…',
  'Création du lead enrichi…',
];

export default function ResearchLeadDialog({ open, onClose, onLeadCreated }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [companyName, setCompanyName] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [progressIdx, setProgressIdx] = useState(0);
  const [findings, setFindings] = useState([]);
  const [analysisRan, setAnalysisRan] = useState(null);

  const researchMutation = useMutation({
    mutationFn: async ({ company_name, website_url }) => {
      // Cycle progress messages while waiting
      let idx = 0;
      const interval = setInterval(() => {
        idx = (idx + 1) % PROGRESS_MESSAGES.length;
        setProgressIdx(idx);
      }, 2500);
      try {
        const result = await dataClient.leads.research({
          company_name,
          website_url: website_url || undefined,
          auto_analyze: true,
        });
        clearInterval(interval);
        return result;
      } catch (err) {
        clearInterval(interval);
        throw err;
      }
    },
    onSuccess: (result) => {
      const { lead, findings: found, analysis_ran } = result?.data || result || {};
      if (found?.length) setFindings(found);
      setAnalysisRan(Boolean(analysis_ran));
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success(`Lead créé : ${lead?.company_name || companyName}`);
      if (onLeadCreated) onLeadCreated(lead);
      setCompanyName('');
      setWebsiteUrl('');
      setProgressIdx(0);
    },
    onError: (err) => {
      const msg = err?.response?.data?.message || err?.message || 'Erreur lors de la recherche';
      toast.error(msg);
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!companyName.trim()) return;
    setFindings([]);
    setProgressIdx(0);
    researchMutation.mutate({ company_name: companyName.trim(), website_url: websiteUrl.trim() });
  };

  const handleClose = () => {
    if (researchMutation.isPending) return;
    setCompanyName('');
    setWebsiteUrl('');
    setFindings([]);
    setProgressIdx(0);
    setAnalysisRan(null);
    researchMutation.reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-brand-sky" />
            Trouver une entreprise
          </DialogTitle>
          <DialogDescription>
            Claude recherche l&apos;entreprise sur le web, extrait les signaux d&apos;achat et crée un lead enrichi.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-3">
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                className="pl-9"
                placeholder="Nom de l'entreprise (ex: Salesforce, Airbus…)"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                disabled={researchMutation.isPending}
                autoFocus
                required
              />
            </div>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                className="pl-9"
                placeholder="Site web (optionnel — améliore la qualité)"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                disabled={researchMutation.isPending}
                type="url"
              />
            </div>
          </div>

          <AnimatePresence mode="wait">
            {researchMutation.isPending && (
              <motion.div
                key="loading"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="flex items-center gap-3 bg-sky-50 border border-sky-100 rounded-xl px-4 py-3"
              >
                <Loader2 className="w-4 h-4 text-brand-sky animate-spin shrink-0" />
                <span className="text-sm text-sky-700 font-medium">
                  {PROGRESS_MESSAGES[progressIdx]}
                </span>
              </motion.div>
            )}

            {researchMutation.isSuccess && (
              <motion.div
                key="findings"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-2"
              >
                {analysisRan === true && (
                  <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <p className="text-xs font-semibold text-emerald-700">Score IA calculé — lead prêt à qualifier</p>
                  </div>
                )}
                {analysisRan === false && (
                  <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <X className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <p className="text-xs font-semibold text-amber-700">Aucun profil ICP actif — configurez l&apos;ICP pour scorer ce lead</p>
                  </div>
                )}
                {findings.length > 0 && (
                  <>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Signaux détectés
                    </p>
                    {findings.slice(0, 3).map((f, i) => (
                      <div key={i} className="bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                        <p className="text-xs font-semibold text-emerald-800">{f.title}</p>
                        <p className="text-xs text-emerald-700 mt-0.5 line-clamp-2">{f.snippet}</p>
                      </div>
                    ))}
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              className="flex-1"
              onClick={handleClose}
              disabled={researchMutation.isPending}
            >
              Annuler
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-brand-sky hover:bg-brand-sky/90"
              disabled={!companyName.trim() || researchMutation.isPending}
            >
              {researchMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Search className="w-4 h-4 mr-1.5" />
                  Rechercher
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
