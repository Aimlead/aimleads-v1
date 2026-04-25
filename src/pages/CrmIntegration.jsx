import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { dataClient } from '@/services/dataClient';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Database,
  Eye,
  EyeOff,
  GitMerge,
  Loader2,
  XCircle,
} from 'lucide-react';

// ─── Field definitions ────────────────────────────────────────────────────────

const AIMLEADS_FIELDS = [
  { key: 'company_name', labelKey: 'crm.aimFields.companyName' },
  { key: 'contact_name', labelKey: 'crm.aimFields.contactName' },
  { key: 'contact_email', labelKey: 'crm.aimFields.contactEmail' },
  { key: 'contact_role', labelKey: 'crm.aimFields.contactRole' },
  { key: 'industry', labelKey: 'crm.aimFields.industry' },
  { key: 'country', labelKey: 'crm.aimFields.country' },
  { key: 'company_size', labelKey: 'crm.aimFields.companySize' },
  { key: 'website_url', labelKey: 'crm.aimFields.website' },
  { key: 'icp_score', labelKey: 'crm.aimFields.icpScore' },
  { key: 'icp_category', labelKey: 'crm.aimFields.icpCategory' },
  { key: 'final_score', labelKey: 'crm.aimFields.finalScore' },
  { key: 'status', labelKey: 'crm.aimFields.status' },
  { key: 'notes', labelKey: 'crm.aimFields.notes' },
];

const getRelativeFormatterLocale = (language) => (String(language || '').toLowerCase().startsWith('fr') ? 'fr' : 'en');

const HUBSPOT_FIELDS = [
  { key: 'firstname', label: 'Prénom (firstname)' },
  { key: 'lastname', label: 'Nom (lastname)' },
  { key: 'email', label: 'Email (email)' },
  { key: 'jobtitle', label: 'Fonction (jobtitle)' },
  { key: 'company', label: 'Entreprise (company)' },
  { key: 'industry', label: 'Secteur (industry)' },
  { key: 'country', label: 'Pays (country)' },
  { key: 'numemployees', label: 'Nb employés (numemployees)' },
  { key: 'website', label: 'Site web (website)' },
  { key: 'aimlead_score', label: 'Score ICP (aimlead_score) *' },
  { key: 'aimlead_category', label: 'Catégorie ICP (aimlead_category) *' },
  { key: 'aimlead_analysis', label: 'Analyse (aimlead_analysis) *' },
  { key: 'notes_last_contacted', label: 'Notes (notes_last_contacted)' },
];

const SALESFORCE_FIELDS = [
  { key: 'FirstName', label: 'Prénom (FirstName)' },
  { key: 'LastName', label: 'Nom (LastName)' },
  { key: 'Email', label: 'Email (Email)' },
  { key: 'Title', label: 'Fonction (Title)' },
  { key: 'Company', label: 'Entreprise (Company)' },
  { key: 'Industry', label: 'Secteur (Industry)' },
  { key: 'Country', label: 'Pays (Country)' },
  { key: 'NumberOfEmployees', label: 'Nb employés (NumberOfEmployees)' },
  { key: 'Website', label: 'Site web (Website)' },
  { key: 'AimLeads_Score__c', label: 'Score ICP (AimLeads_Score__c) *' },
  { key: 'AimLeads_Category__c', label: 'Catégorie ICP (AimLeads_Category__c) *' },
  { key: 'Description', label: 'Notes (Description)' },
];

// ─── Field Mapping Component ──────────────────────────────────────────────────

function FieldMappingSection({ crmType, isConnected }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [localMapping, setLocalMapping] = useState(null);

  const { data: savedMapping = {}, isLoading } = useQuery({
    queryKey: ['crmFieldMapping', crmType],
    queryFn: () => dataClient.crm.getFieldMapping(crmType),
    enabled: isConnected,
    onSuccess: (data) => {
      if (localMapping === null) setLocalMapping(data);
    },
  });

  const mapping = localMapping ?? savedMapping;
  const crmFields = crmType === 'hubspot' ? HUBSPOT_FIELDS : SALESFORCE_FIELDS;

  const saveMutation = useMutation({
    mutationFn: () => dataClient.crm.saveFieldMapping(crmType, mapping),
    onSuccess: () => {
      toast.success(t('crm.toasts.mappingSaved'));
      queryClient.invalidateQueries({ queryKey: ['crmFieldMapping', crmType] });
    },
    onError: (err) => {
      toast.error(err?.message || t('crm.errors.saveMapping'));
    },
  });

  if (!isConnected) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <GitMerge className="w-4 h-4 text-slate-500" />
          {t('crm.mapping.title', { crm: crmType === 'hubspot' ? 'HubSpot' : 'Salesforce' })}
        </CardTitle>
        <CardDescription>
          {t('crm.mapping.description', { crm: crmType === 'hubspot' ? 'HubSpot' : 'Salesforce' })}{' '}
          <span className="font-medium">*</span> {t('crm.mapping.customFieldHint')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" /> {t('common.loading')}
          </div>
        ) : (
          <>
            <div className="hidden sm:grid grid-cols-[1fr_auto_1fr] gap-2 text-xs font-medium text-slate-500 px-1">
              <span>{t('crm.mapping.aimleadField')}</span>
              <span />
              <span>{t('crm.mapping.crmField', { crm: crmType === 'hubspot' ? 'HubSpot' : 'Salesforce' })}</span>
            </div>
            {AIMLEADS_FIELDS.map((field) => (
              <div key={field.key} className="grid grid-cols-1 gap-1 sm:grid-cols-[1fr_auto_1fr] sm:gap-2 sm:items-center">
                <div className="text-sm bg-slate-50 rounded-lg px-3 py-2 text-slate-700 border border-slate-200">
                  {t(field.labelKey)}
                </div>
                <div className="hidden sm:block text-slate-400 text-xs">→</div>
                <select
                  className="text-sm bg-white rounded-lg px-3 py-2 text-slate-700 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-sky/30"
                  value={mapping[field.key] || ''}
                  onChange={(e) =>
                    setLocalMapping((prev) => ({
                      ...prev,
                      [field.key]: e.target.value || undefined,
                    }))
                  }
                >
                  <option value="">{t('crm.mapping.unmapped')}</option>
                  {crmFields.map((cf) => (
                    <option key={cf.key} value={cf.key}>
                      {cf.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <div className="pt-2">
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                size="sm"
              >
                {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {t('crm.mapping.save')}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── CRM Card ────────────────────────────────────────────────────────────────

function CrmCard({
  crmType,
  title,
  description,
  integration,
  needsInstanceUrl = false,
  onRefresh,
  quota,
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const isConnected = Boolean(integration?.is_active);

  const [token, setToken] = useState('');
  const [instanceUrl, setInstanceUrl] = useState(integration?.config?.instance_url || '');
  const [showToken, setShowToken] = useState(false);
  // Instructions expand by default when the user hasn't connected yet so they can follow the steps
  // without an extra click; once connected they collapse to reduce noise.
  const [showInstructions, setShowInstructions] = useState(!isConnected);

  const maskedToken = integration?.api_token || '';
  const planBlocksNewConnection = Boolean(quota?.limitReached && !isConnected);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!token.trim()) {
        throw new Error(t('crm.errors.enterToken'));
      }
      if (needsInstanceUrl && !instanceUrl.trim()) {
        throw new Error(t('crm.errors.salesforceInstanceRequired'));
      }
      return dataClient.crm.save({
        crm_type: crmType,
        api_token: token.trim(),
        config: needsInstanceUrl ? { instance_url: instanceUrl.trim() } : {},
      });
    },
    onSuccess: () => {
      toast.success(t('crm.toasts.connected', { crm: title }));
      setToken('');
      queryClient.invalidateQueries({ queryKey: ['crmIntegrations'] });
      queryClient.invalidateQueries({ queryKey: ['integrationStatus'] });
      onRefresh?.();
    },
    onError: (err) => {
      if (err?.payload?.code === 'WORKSPACE_CRM_LIMIT_REACHED') {
        toast.error(t('crm.errors.limitReached'));
        return;
      }
      toast.error(err.message || t('crm.errors.connect', { crm: title }));
    },
  });

  const testMutation = useMutation({
    mutationFn: () => dataClient.crm.test(crmType),
    onSuccess: (result) => {
      if (result?.success) {
        toast.success(t('crm.toasts.connectionTestSuccess', { crm: title }));
      } else {
        toast.error(t('crm.errors.connectionTestFailed', { crm: title }));
      }
    },
    onError: () => {
      toast.error(t('crm.errors.connectionTestUnavailable', { crm: title }));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => dataClient.crm.delete(crmType),
    onSuccess: () => {
      toast.success(t('crm.toasts.disconnected', { crm: title }));
      setToken('');
      setInstanceUrl('');
      queryClient.invalidateQueries({ queryKey: ['crmIntegrations'] });
      queryClient.invalidateQueries({ queryKey: ['integrationStatus'] });
      onRefresh?.();
    },
    onError: () => {
      toast.error(t('crm.errors.disconnect', { crm: title }));
    },
  });

  const formatDate = (iso) => {
    if (!iso) return null;
    try {
      return new Intl.RelativeTimeFormat(getRelativeFormatterLocale(i18n.language), { numeric: 'auto' }).format(
        Math.round((new Date(iso) - Date.now()) / 60000),
        'minute'
      );
    } catch {
      return new Date(iso).toLocaleString(getRelativeFormatterLocale(i18n.language));
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5 text-slate-500" />
            {title}
          </CardTitle>
          <CardDescription className="mt-1">{description}</CardDescription>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isConnected ? (
            <Badge className="bg-green-100 text-green-700 border-green-200">
              <CheckCircle2 className="w-3 h-3 mr-1" /> {t('common.connected')}
            </Badge>
          ) : (
            <Badge variant="secondary">{t('crm.notConfigured')}</Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className={`rounded-xl border px-4 py-3 text-xs ${
          planBlocksNewConnection
            ? 'border-amber-200 bg-amber-50 text-amber-900'
            : 'border-slate-200 bg-slate-50 text-slate-600'
        }`}>
          <p className="font-medium text-slate-800">{t('crm.capacity.title')}</p>
          <p className="mt-1">
            {t('crm.capacity.summary', {
              used: quota?.used ?? 0,
              total: quota?.total ?? 0,
            })}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            {planBlocksNewConnection
              ? t('crm.capacity.limitReached')
              : t('crm.capacity.remaining', { count: quota?.remaining ?? 0 })}
          </p>
        </div>

        {/* Status line */}
        {isConnected && (
          <div className="text-xs text-slate-500 space-y-0.5">
            {integration.last_tested_at && (
              <p>{t('crm.status.lastTested')}: {formatDate(integration.last_tested_at)}</p>
            )}
            {integration.last_synced_at && (
              <p>{t('crm.status.lastSync')}: {formatDate(integration.last_synced_at)}</p>
            )}
            {maskedToken && (
              <p>{t('crm.status.currentToken')}: <span className="font-mono">{maskedToken}</span></p>
            )}
          </div>
        )}

        {/* Instance URL (Salesforce only) */}
        {needsInstanceUrl && (
          <div className="space-y-1.5">
            <Label htmlFor={`${crmType}-instance-url`}>{t('crm.fields.salesforceInstanceUrl')}</Label>
            <Input
              id={`${crmType}-instance-url`}
              type="url"
              placeholder="https://mycompany.salesforce.com"
              value={instanceUrl}
              onChange={(e) => setInstanceUrl(e.target.value)}
            />
          </div>
        )}

        {/* Token input */}
        <div className="space-y-1.5">
          <Label htmlFor={`${crmType}-token`}>
            {crmType === 'hubspot' ? t('crm.fields.hubspotToken') : t('crm.fields.salesforceToken')}
          </Label>
          <div className="relative">
            <Input
              id={`${crmType}-token`}
              type={showToken ? 'text' : 'password'}
              placeholder={isConnected ? t('crm.fields.newTokenPlaceholder') : t('crm.fields.enterTokenPlaceholder')}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="pr-10"
              autoComplete="off"
              disabled={planBlocksNewConnection}
            />
            <button
              type="button"
              onClick={() => setShowToken((v) => !v)}
              aria-label={showToken ? t('auth.hidePassword') : t('auth.showPassword')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !token.trim() || planBlocksNewConnection}
          >
            {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {t('common.save')}
          </Button>

          {isConnected && (
            <Button
              variant="outline"
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending}
            >
              {testMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              {t('crm.actions.testConnection')}
            </Button>
          )}

          {isConnected && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" className="text-red-500 hover:text-red-600 hover:bg-red-50">
                  <XCircle className="w-4 h-4 mr-1.5" />
                  {t('crm.actions.disconnect')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('crm.actions.disconnectConfirmTitle', { crm: title })}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('crm.actions.disconnectConfirmBody', { crm: title })}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteMutation.mutate()}
                    className="bg-red-500 hover:bg-red-600"
                  >
                    {t('crm.actions.disconnect')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        {/* Instructions collapsibles */}
        <div className="border-t pt-3">
          <button
            type="button"
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
            onClick={() => setShowInstructions((v) => !v)}
          >
            {showInstructions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            {t('crm.instructions.toggle')}
          </button>

          {showInstructions && (
            <div className="mt-3 text-sm text-slate-600 space-y-2 bg-slate-50 rounded-md p-3">
              {crmType === 'hubspot' ? (
                <>
                  <p className="font-medium">{t('crm.instructions.hubspotTitle')}</p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>{t('crm.instructions.hubspotSteps.one')}</li>
                    <li>{t('crm.instructions.hubspotSteps.two')}</li>
                    <li>{t('crm.instructions.hubspotSteps.three')}</li>
                    <li>{t('crm.instructions.hubspotSteps.four')}</li>
                    <li>{t('crm.instructions.hubspotSteps.five')}</li>
                    <li>{t('crm.instructions.hubspotSteps.six')}</li>
                  </ol>
                  <p className="mt-2 font-medium">{t('crm.instructions.customProperties')}</p>
                  <p>{t('crm.instructions.hubspotPropertiesBody')}</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li><code className="bg-slate-200 px-1 rounded">aimlead_score</code> (Nombre)</li>
                    <li><code className="bg-slate-200 px-1 rounded">aimlead_category</code> (Texte)</li>
                    <li><code className="bg-slate-200 px-1 rounded">aimlead_analysis</code> (Texte multiligne)</li>
                  </ul>
                </>
              ) : (
                <>
                  <p className="font-medium">{t('crm.instructions.salesforceTitle')}</p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>{t('crm.instructions.salesforceSteps.one')}</li>
                    <li>{t('crm.instructions.salesforceSteps.two')}</li>
                    <li>{t('crm.instructions.salesforceSteps.three')}</li>
                    <li>{t('crm.instructions.salesforceSteps.four')}</li>
                    <li>{t('crm.instructions.salesforceSteps.five')}</li>
                  </ol>
                  <p className="mt-2 font-medium">{t('crm.instructions.salesforceCustomFields')}</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li><code className="bg-slate-200 px-1 rounded">AimLeads_Score__c</code> (Nombre)</li>
                    <li><code className="bg-slate-200 px-1 rounded">AimLeads_Category__c</code> (Texte)</li>
                  </ul>
                </>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CrmIntegration() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data: integrations = [], isLoading } = useQuery({
    queryKey: ['crmIntegrations'],
    queryFn: () => dataClient.crm.list(),
  });

  const { data: creditsData = null } = useQuery({
    queryKey: ['workspaceCreditsForCrm'],
    queryFn: () => dataClient.workspace.getCredits({ limit: 10 }),
    staleTime: 60_000,
  });

  const hubspot = integrations.find((i) => i.crm_type === 'hubspot');
  const salesforce = integrations.find((i) => i.crm_type === 'salesforce');
  const crmUsage = creditsData?.usage || {};
  const crmTotal = crmUsage?.crm_slots_included ?? creditsData?.entitlements?.crm_integrations ?? 0;
  const crmUsed = crmUsage?.crm_slots_used ?? integrations.filter((integration) => integration?.is_active).length;
  const crmRemaining = crmUsage?.crm_slots_remaining ?? Math.max(0, crmTotal - crmUsed);
  const crmLimitReached = Boolean(crmUsage?.crm_limit_reached);
  const hasActiveCrm = integrations.some((integration) => integration?.is_active);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['crmIntegrations'] });
    queryClient.invalidateQueries({ queryKey: ['workspaceCreditsForCrm'] });
  };

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('crm.title')}</h1>
        <p className="mt-1 text-slate-500">
          {t('crm.subtitle')}
        </p>
      </div>

      {!isLoading && !hasActiveCrm ? (
        <div className="rounded-2xl border border-sky-200 bg-sky-50/80 px-4 py-4 shadow-sm">
          <div className="flex items-start gap-3">
            <Database className="w-5 h-5 text-sky-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-sky-900">
                {t('crm.empty.title', { defaultValue: 'Aucun CRM connecté pour le moment' })}
              </p>
              <p className="mt-1 text-sm text-sky-800/80">
                {t('crm.empty.body', { defaultValue: 'Connectez HubSpot ou Salesforce pour pousser vos leads scorés directement dans votre pipeline commercial et garder toute l’équipe alignée.' })}
              </p>
              <ul className="mt-2 text-xs text-sky-900/80 list-disc list-inside space-y-0.5">
                <li>{t('crm.empty.benefit1', { defaultValue: 'Push en un clic depuis le panneau latéral ou la page complète du lead' })}</li>
                <li>{t('crm.empty.benefit2', { defaultValue: 'Mappez score, catégorie et notes AimLeads sur les champs de votre CRM' })}</li>
                <li>{t('crm.empty.benefit3', { defaultValue: 'Suivez l’historique de synchronisation par lead' })}</li>
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      <div className={`rounded-2xl border px-4 py-4 shadow-sm ${
        crmLimitReached
          ? 'border-amber-200 bg-amber-50/80'
          : 'border-slate-200 bg-white'
      }`}>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
          {t('crm.capacity.eyebrow')}
        </p>
        <div className="mt-2 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-lg font-semibold text-slate-900">
              {t('crm.capacity.summary', { used: crmUsed, total: crmTotal })}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {crmLimitReached
                ? t('crm.capacity.limitReached')
                : t('crm.capacity.remaining', { count: crmRemaining })}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            {t('crm.capacity.planHint', {
              count: creditsData?.entitlements?.crm_integrations ?? crmTotal,
            })}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : (
        <div className="space-y-6">
          <CrmCard
            crmType="hubspot"
            title="HubSpot"
            description={t('crm.providers.hubspot')}
            integration={hubspot}
            onRefresh={handleRefresh}
            quota={{
              total: crmTotal,
              used: crmUsed,
              remaining: crmRemaining,
              limitReached: crmLimitReached,
            }}
          />
          <FieldMappingSection crmType="hubspot" isConnected={Boolean(hubspot?.is_active)} />

          <CrmCard
            crmType="salesforce"
            title="Salesforce"
            description={t('crm.providers.salesforce')}
            integration={salesforce}
            needsInstanceUrl
            onRefresh={handleRefresh}
            quota={{
              total: crmTotal,
              used: crmUsed,
              remaining: crmRemaining,
              limitReached: crmLimitReached,
            }}
          />
          <FieldMappingSection crmType="salesforce" isConnected={Boolean(salesforce?.is_active)} />
        </div>
      )}
    </div>
  );
}
