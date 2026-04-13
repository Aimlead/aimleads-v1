import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  Loader2,
  XCircle,
} from 'lucide-react';

// ─── CRM Card ────────────────────────────────────────────────────────────────

function CrmCard({ crmType, title, description, integration, needsInstanceUrl = false, onRefresh }) {
  const queryClient = useQueryClient();
  const isConnected = Boolean(integration?.is_active);

  const [token, setToken] = useState('');
  const [instanceUrl, setInstanceUrl] = useState(integration?.config?.instance_url || '');
  const [showToken, setShowToken] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

  const maskedToken = integration?.api_token || '';

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!token.trim()) {
        throw new Error('Veuillez entrer un token.');
      }
      if (needsInstanceUrl && !instanceUrl.trim()) {
        throw new Error("L'URL de l'instance Salesforce est requise.");
      }
      return dataClient.crm.save({
        crm_type: crmType,
        api_token: token.trim(),
        config: needsInstanceUrl ? { instance_url: instanceUrl.trim() } : {},
      });
    },
    onSuccess: () => {
      toast.success(`${title} connecté avec succès.`);
      setToken('');
      queryClient.invalidateQueries({ queryKey: ['crmIntegrations'] });
      queryClient.invalidateQueries({ queryKey: ['integrationStatus'] });
      onRefresh?.();
    },
    onError: (err) => {
      toast.error(err.message || `Erreur lors de la connexion à ${title}.`);
    },
  });

  const testMutation = useMutation({
    mutationFn: () => dataClient.crm.test(crmType),
    onSuccess: (result) => {
      if (result?.success) {
        toast.success(`Connexion ${title} vérifiée avec succès.`);
      } else {
        toast.error(`Échec de la connexion ${title}. Vérifiez votre token.`);
      }
    },
    onError: () => {
      toast.error(`Impossible de tester la connexion ${title}.`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => dataClient.crm.delete(crmType),
    onSuccess: () => {
      toast.success(`Intégration ${title} supprimée.`);
      setToken('');
      setInstanceUrl('');
      queryClient.invalidateQueries({ queryKey: ['crmIntegrations'] });
      queryClient.invalidateQueries({ queryKey: ['integrationStatus'] });
      onRefresh?.();
    },
    onError: () => {
      toast.error(`Erreur lors de la suppression de l'intégration ${title}.`);
    },
  });

  const formatDate = (iso) => {
    if (!iso) return null;
    try {
      return new Intl.RelativeTimeFormat('fr', { numeric: 'auto' }).format(
        Math.round((new Date(iso) - Date.now()) / 60000),
        'minute'
      );
    } catch {
      return new Date(iso).toLocaleString('fr');
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
              <CheckCircle2 className="w-3 h-3 mr-1" /> Connecté
            </Badge>
          ) : (
            <Badge variant="secondary">Non configuré</Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Status line */}
        {isConnected && (
          <div className="text-xs text-slate-500 space-y-0.5">
            {integration.last_tested_at && (
              <p>Dernier test : {formatDate(integration.last_tested_at)}</p>
            )}
            {integration.last_synced_at && (
              <p>Dernier sync : {formatDate(integration.last_synced_at)}</p>
            )}
            {maskedToken && (
              <p>Token actuel : <span className="font-mono">{maskedToken}</span></p>
            )}
          </div>
        )}

        {/* Instance URL (Salesforce only) */}
        {needsInstanceUrl && (
          <div className="space-y-1.5">
            <Label htmlFor={`${crmType}-instance-url`}>URL de l&apos;instance Salesforce</Label>
            <Input
              id={`${crmType}-instance-url`}
              type="url"
              placeholder="https://monentreprise.salesforce.com"
              value={instanceUrl}
              onChange={(e) => setInstanceUrl(e.target.value)}
            />
          </div>
        )}

        {/* Token input */}
        <div className="space-y-1.5">
          <Label htmlFor={`${crmType}-token`}>
            {crmType === 'hubspot' ? 'Token Private App HubSpot' : 'Token d\'accès Salesforce'}
          </Label>
          <div className="relative">
            <Input
              id={`${crmType}-token`}
              type={showToken ? 'text' : 'password'}
              placeholder={isConnected ? 'Nouveau token (laisser vide pour conserver l\'actuel)' : 'Entrez votre token...'}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="pr-10"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowToken((v) => !v)}
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
            disabled={saveMutation.isPending || !token.trim()}
          >
            {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Enregistrer
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
              Tester la connexion
            </Button>
          )}

          {isConnected && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" className="text-red-500 hover:text-red-600 hover:bg-red-50">
                  <XCircle className="w-4 h-4 mr-1.5" />
                  Déconnecter
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Déconnecter {title} ?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Cette action supprime le token enregistré. Les leads déjà synchronisés restent
                    dans votre CRM. Vous pourrez reconnecter à tout moment.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteMutation.mutate()}
                    className="bg-red-500 hover:bg-red-600"
                  >
                    Déconnecter
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
            Comment obtenir le token ?
          </button>

          {showInstructions && (
            <div className="mt-3 text-sm text-slate-600 space-y-2 bg-slate-50 rounded-md p-3">
              {crmType === 'hubspot' ? (
                <>
                  <p className="font-medium">Token HubSpot Private App :</p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Connectez-vous à votre compte HubSpot</li>
                    <li>Allez dans <strong>Paramètres → Intégrations → Applications privées</strong></li>
                    <li>Cliquez sur <strong>Créer une application privée</strong></li>
                    <li>Donnez-lui un nom (ex. &quot;AimLeads&quot;)</li>
                    <li>Dans <strong>Scopes</strong>, activez : <code className="bg-slate-200 px-1 rounded">crm.objects.contacts.write</code> et <code className="bg-slate-200 px-1 rounded">crm.objects.contacts.read</code></li>
                    <li>Cliquez <strong>Créer l&apos;application</strong> puis copiez le token</li>
                  </ol>
                  <p className="mt-2 font-medium">Propriétés personnalisées requises :</p>
                  <p>Créez ces propriétés sur l&apos;objet Contact dans HubSpot :</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li><code className="bg-slate-200 px-1 rounded">aimlead_score</code> (Nombre)</li>
                    <li><code className="bg-slate-200 px-1 rounded">aimlead_category</code> (Texte)</li>
                    <li><code className="bg-slate-200 px-1 rounded">aimlead_analysis</code> (Texte multiligne)</li>
                  </ul>
                </>
              ) : (
                <>
                  <p className="font-medium">Token Salesforce :</p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Connectez-vous à votre organisation Salesforce</li>
                    <li>Allez dans <strong>Configuration → Gérer les applications connectées</strong></li>
                    <li>Créez une application connectée avec OAuth activé</li>
                    <li>Utilisez le <strong>Session Token</strong> obtenu après authentification</li>
                    <li>Copiez l&apos;URL de votre instance (ex. <code className="bg-slate-200 px-1 rounded">https://monentreprise.salesforce.com</code>)</li>
                  </ol>
                  <p className="mt-2 font-medium">Champs personnalisés requis (objet Lead) :</p>
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
  const queryClient = useQueryClient();

  const { data: integrations = [], isLoading } = useQuery({
    queryKey: ['crmIntegrations'],
    queryFn: () => dataClient.crm.list(),
  });

  const hubspot = integrations.find((i) => i.crm_type === 'hubspot');
  const salesforce = integrations.find((i) => i.crm_type === 'salesforce');

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['crmIntegrations'] });
  };

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Intégration CRM</h1>
        <p className="mt-1 text-slate-500">
          Poussez vos leads qualifiés vers HubSpot ou Salesforce automatiquement ou manuellement.
          Les leads passant au statut <strong>Qualifié</strong> sont synchronisés automatiquement.
        </p>
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
            description="Synchronise les leads comme Contacts dans votre compte HubSpot."
            integration={hubspot}
            onRefresh={handleRefresh}
          />

          <CrmCard
            crmType="salesforce"
            title="Salesforce"
            description="Synchronise les leads comme objets Lead dans votre organisation Salesforce."
            integration={salesforce}
            needsInstanceUrl
            onRefresh={handleRefresh}
          />
        </div>
      )}
    </div>
  );
}
