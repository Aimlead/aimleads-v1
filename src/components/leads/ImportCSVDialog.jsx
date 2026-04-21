import React, { useRef, useState } from 'react';
import { AlertCircle, ArrowRight, CheckCircle2, FileText, Loader2, Sparkles, Target, Upload, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { dataClient } from '@/services/dataClient';
import { ACTIVATION_ANALYZE_BATCH_SIZE } from '@/constants/activation';

// ─── Parsers ──────────────────────────────────────────────────────────────────

/**
 * Header normalization shared across CSV + XLSX parsers.
 * - Strips accents, trims whitespace, lowercases, collapses spaces, removes punctuation.
 * - This lets us match "Société", "Raison Sociale", "COMPANY-NAME", " Company  Name " all to the same key.
 */
const normalizeHeaderKey = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[._\-/]+/g, ' ')
    .replace(/\s+/g, ' ');

/**
 * RFC-4180 compliant CSV parser — handles quoted fields with commas + newlines.
 * Also accepts ;-separated files (common for FR/EU exports).
 */
const detectDelimiter = (sample) => {
  const head = sample.split(/\r?\n/, 1)[0] || '';
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let inQuotes = false;
  for (const c of head) {
    if (c === '"') inQuotes = !inQuotes;
    else if (!inQuotes && counts[c] !== undefined) counts[c] += 1;
  }
  if (counts['\t'] > counts[','] && counts['\t'] >= counts[';']) return '\t';
  if (counts[';'] > counts[',']) return ';';
  return ',';
};

const parseCsv = (text) => {
  const lines = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === '\n' && !inQuotes) {
      lines.push(current.trimEnd());
      current = '';
    } else if (char === '\r' && next === '\n' && !inQuotes) {
      lines.push(current.trimEnd());
      current = '';
      i++;
    } else {
      current += char;
    }
  }
  if (current.trim()) lines.push(current.trimEnd());

  const nonEmpty = lines.filter((l) => l.trim());
  if (nonEmpty.length < 2) return [];

  const delimiter = detectDelimiter(nonEmpty[0]);

  const splitRow = (line) => {
    const fields = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      const n = line[i + 1];
      if (c === '"') {
        if (quoted && n === '"') { field += '"'; i++; }
        else { quoted = !quoted; }
      } else if (c === delimiter && !quoted) {
        fields.push(field);
        field = '';
      } else {
        field += c;
      }
    }
    fields.push(field);
    return fields;
  };

  const headers = splitRow(nonEmpty[0]).map((h) => normalizeHeaderKey(h.replace(/"/g, '')));

  // NOTE: filtering by company_name happens AFTER normalizeRow() so we don't drop
  // rows whose company column uses an alias header like "société" or "raison sociale".
  return nonEmpty
    .slice(1)
    .map((line) => {
      const values = splitRow(line);
      return headers.reduce((row, header, idx) => ({ ...row, [header]: (values[idx] || '').trim() }), {});
    });
};

/**
 * Parse XLSX files in the browser.
 * Returns rows normalized with lowercase header keys (no accents, no punctuation).
 */
const parseXlsx = async (file) => {
  const { default: readXlsxFile } = await import('read-excel-file/browser');
  const rows = await readXlsxFile(file);
  if (rows.length < 2) return [];

  const headers = rows[0].map((header) => normalizeHeaderKey(header));

  return rows
    .slice(1)
    .map((row) =>
      headers.reduce((normalized, header, idx) => {
        normalized[header] = String(row[idx] ?? '').trim();
        return normalized;
      }, {})
    );
};

// ─── Column mapping ────────────────────────────────────────────────────────────

// Each canonical lead field maps to many possible header aliases.
// Headers are pre-normalized via normalizeHeaderKey (lowercased, accents stripped,
// punctuation collapsed) before this map is consulted, so all aliases are written
// in that same normalized form.
const COLUMN_MAP = {
  company_name: [
    'company name', 'company', 'name', 'nom', 'entreprise', 'societe', 'raison sociale',
    'business', 'business name', 'organization', 'organisation', 'account', 'account name',
    'firma', 'compania', 'compagnie', 'prospect', 'firm',
  ],
  website_url: [
    'website', 'website url', 'site', 'site web', 'site internet', 'url', 'web',
    'domain', 'domaine', 'homepage', 'lien',
  ],
  industry: [
    'industry', 'industrie', 'secteur', 'sector', 'secteur d activite', 'activite',
    'vertical', 'category', 'categorie',
  ],
  company_size: [
    'company size', 'taille', 'size', 'employees', 'employes', 'effectif', 'effectifs',
    'headcount', 'nb employes', 'nombre employes',
  ],
  country: [
    'country', 'pays', 'nation', 'location', 'pays siege',
  ],
  contact_name: [
    'contact name', 'contact', 'nom contact', 'full name', 'nom complet',
    'lead', 'lead name', 'first name last name', 'prenom nom', 'decideur',
  ],
  contact_role: [
    'role', 'poste', 'title', 'job title', 'position', 'fonction', 'titre',
  ],
  contact_email: [
    'email', 'mail', 'e mail', 'email address', 'adresse email', 'adresse mail',
    'courriel', 'work email',
  ],
  contact_phone: [
    'phone', 'telephone', 'tel', 'mobile', 'portable', 'gsm', 'phone number',
  ],
  linkedin_url: [
    'linkedin', 'linkedin url', 'linkedin profile', 'profil linkedin',
  ],
  notes: [
    'notes', 'note', 'comment', 'commentaire', 'remarques', 'remarks',
  ],
  source_list: [
    'source', 'source list', 'liste', 'campagne', 'campaign', 'origine', 'origin',
  ],
};

// Reverse lookup: alias → canonical, computed once.
const ALIAS_TO_CANONICAL = (() => {
  const out = {};
  for (const [canonical, aliases] of Object.entries(COLUMN_MAP)) {
    out[canonical] = canonical;
    for (const alias of aliases) out[alias] = canonical;
  }
  return out;
})();

const normalizeRow = (row) => {
  const result = {};
  for (const [rawKey, value] of Object.entries(row)) {
    const canonical = ALIAS_TO_CANONICAL[rawKey];
    if (canonical) {
      // First non-empty wins, in case the same canonical is fed by multiple alias columns.
      if (result[canonical] === undefined || result[canonical] === '') {
        result[canonical] = value;
      }
    } else {
      // Preserve unknown columns so power users can map them later.
      result[rawKey] = value;
    }
  }
  return result;
};

const CANONICAL_FIELDS = [
  { key: 'company_name', label: 'Entreprise', required: true },
  { key: 'website_url', label: 'Website' },
  { key: 'industry', label: 'Secteur' },
  { key: 'company_size', label: 'Taille' },
  { key: 'country', label: 'Pays' },
  { key: 'contact_name', label: 'Contact' },
  { key: 'contact_role', label: 'Poste' },
  { key: 'contact_email', label: 'Email' },
  { key: 'contact_phone', label: 'Téléphone' },
  { key: 'linkedin_url', label: 'LinkedIn' },
  { key: 'notes', label: 'Notes' },
  { key: 'source_list', label: 'Liste / source' },
];

const EMPTY_MAPPING = '__none__';

const guessFieldMapping = (headers = []) => {
  const normalizedHeaders = headers.map((header) => normalizeHeaderKey(header));
  const mapping = {};

  for (const field of CANONICAL_FIELDS) {
    const directMatch = normalizedHeaders.find((header) => ALIAS_TO_CANONICAL[header] === field.key);
    mapping[field.key] = directMatch || EMPTY_MAPPING;
  }
  return mapping;
};

const applyUserMapping = (rows = [], mapping = {}) =>
  rows.map((row) => {
    const mapped = {};
    for (const field of CANONICAL_FIELDS) {
      const sourceHeader = mapping[field.key];
      if (sourceHeader && sourceHeader !== EMPTY_MAPPING) {
        mapped[field.key] = row[sourceHeader] || '';
      }
    }
    return mapped;
  });

// ─── Component ────────────────────────────────────────────────────────────────

export default function ImportCSVDialog({
  open,
  onOpenChange,
  onImportSuccess,
  hasActiveIcp = false,
  onReviewIcp,
  onFocusImportedLeads,
  onAnalyzeImportedLeads,
}) {
  const { t } = useTranslation();
  const [preview, setPreview] = useState([]);
  const [allRows, setAllRows] = useState([]);
  const [rawRows, setRawRows] = useState([]);
  const [availableHeaders, setAvailableHeaders] = useState([]);
  const [fieldMapping, setFieldMapping] = useState({});
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [handoffAction, setHandoffAction] = useState(null);
  const [error, setError] = useState(null);
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef(null);

  const resetDialog = () => {
    setPreview([]);
    setAllRows([]);
    setRawRows([]);
    setAvailableHeaders([]);
    setFieldMapping({});
    setImported(false);
    setImportResult(null);
    setHandoffAction(null);
    setError(null);
    setImporting(false);
    setFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleOpenChange = (nextOpen) => {
    if (!nextOpen) resetDialog();
    onOpenChange(nextOpen);
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setImported(false);
    setFileName(file.name);
    setPreview([]);
    setAllRows([]);
    setRawRows([]);
    setAvailableHeaders([]);
    setFieldMapping({});

    const isXlsx = /\.xlsx$/i.test(file.name);
    const isLegacySpreadsheet = /\.(xls|ods)$/i.test(file.name);

    if (isLegacySpreadsheet) {
      setError(t('import.dialog.errors.legacyFormat', { defaultValue: 'Les fichiers .xls et .ods sont désactivés pour des raisons de sécurité. Réexportez en .xlsx ou .csv.' }));
      return;
    }

    if (isXlsx) {
      void (async () => {
        try {
          const rows = await parseXlsx(file);
          if (rows.length === 0) {
            setError(t('import.dialog.errors.noValidRows', { defaultValue: 'Aucune ligne exploitable trouvée. Vérifiez la présence d’une colonne company_name ou équivalente.' }));
            return;
          }
          const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
          const autoMapping = guessFieldMapping(headers);
          const mappedRows = applyUserMapping(rows, autoMapping).map(normalizeRow);
          setRawRows(rows);
          setAvailableHeaders(headers);
          setFieldMapping(autoMapping);
          setAllRows(mappedRows);
          setPreview(mappedRows.slice(0, 5));
        } catch (err) {
          setError(t('import.dialog.errors.excelParse', { defaultValue: 'Impossible de lire le fichier Excel : {{message}}', message: err?.message || 'unknown error' }));
        }
      })();
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const rows = parseCsv(String(e.target?.result || ''));
          if (rows.length === 0) {
            setError(t('import.dialog.errors.csvInvalid', { defaultValue: 'Le CSV doit contenir au moins une ligne valide avec company_name.' }));
            return;
          }
          const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
          const autoMapping = guessFieldMapping(headers);
          const mappedRows = applyUserMapping(rows, autoMapping).map(normalizeRow);
          setRawRows(rows);
          setAvailableHeaders(headers);
          setFieldMapping(autoMapping);
          setAllRows(mappedRows);
          setPreview(mappedRows.slice(0, 5));
        } catch {
          setError(t('import.dialog.errors.csvParse', { defaultValue: 'Impossible de lire ce fichier CSV.' }));
        }
      };
      reader.readAsText(file);
    }
  };

  const handleMappingChange = (fieldKey, headerValue) => {
    const nextMapping = { ...fieldMapping, [fieldKey]: headerValue };
    setFieldMapping(nextMapping);
    const mappedRows = applyUserMapping(rawRows, nextMapping).map(normalizeRow);
    setAllRows(mappedRows);
    setPreview(mappedRows.slice(0, 5));
  };

  const handleImport = async () => {
    if (allRows.length === 0) return;
    setImporting(true);

    try {
      const validRows = allRows.filter((r) => r.company_name || r['company name'] || r.name);
      const skippedRows = allRows
        .map((r, i) => ({ row: i + 2, data: r }))
        .filter((_, i) => !(allRows[i].company_name || allRows[i]['company name'] || allRows[i].name));

      const created = await dataClient.leads.bulkCreate(validRows);

      const result = { created: created.length, skipped: skippedRows.length, skippedRows, createdLeads: created };
      setImportResult(result);
      setImported(true);

      if (skippedRows.length > 0) {
        toast.success(
          t('import.dialog.toasts.importPartial', {
            defaultValue: '{{created}} leads importés. {{skipped}} ligne(s) ignorée(s).',
            created: created.length,
            skipped: skippedRows.length,
          })
        );
      } else {
        toast.success(
          t('import.dialog.toasts.importSuccess', {
            defaultValue: '{{created}} leads importés avec succès.',
            created: created.length,
          })
        );
      }

      onImportSuccess?.(result);
    } catch (err) {
      console.warn('Import failed', err);
      toast.error(t('import.dialog.toasts.importFailed', { defaultValue: "L'import a échoué. Vérifiez le format puis réessayez." }));
    } finally {
      setImporting(false);
    }
  };

  const PREVIEW_COLS = ['company_name', 'website_url', 'industry', 'company_size', 'country'];
  const previewHeaders = preview.length > 0
    ? PREVIEW_COLS.filter((col) => preview.some((row) => row[col]))
    : [];
  const missingCompanyMapping = availableHeaders.length > 0 && (fieldMapping.company_name || EMPTY_MAPPING) === EMPTY_MAPPING;
  const stage = imported ? 'done' : preview.length > 0 ? 'review' : 'upload';

  const handleHandoff = async (action, callback) => {
    if (!callback || !importResult) return;
    setHandoffAction(action);
    try {
      await callback(importResult);
    } finally {
      setHandoffAction(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('import.dialog.title', { defaultValue: 'Importer vos leads' })}</DialogTitle>
          <DialogDescription>
            {t('import.dialog.subtitle', {
              defaultValue: 'CSV et Excel (.xlsx) sont pris en charge. Le but ici est simple: vérifier votre fichier, importer proprement, puis vous envoyer vers la bonne prochaine action.',
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              {
                id: 'upload',
                label: t('import.dialog.stages.upload', { defaultValue: 'Charger le fichier' }),
              },
              {
                id: 'review',
                label: t('import.dialog.stages.review', { defaultValue: 'Vérifier l’aperçu' }),
              },
              {
                id: 'done',
                label: t('import.dialog.stages.done', { defaultValue: 'Lancer la suite' }),
              },
            ].map((item, index) => {
              const isCurrent = item.id === stage;
              const isDone = ['upload', 'review', 'done'].indexOf(item.id) < ['upload', 'review', 'done'].indexOf(stage);
              return (
                <div
                  key={item.id}
                  className={`rounded-2xl border px-3 py-3 text-sm transition-colors ${
                    isCurrent
                      ? 'border-brand-sky/30 bg-brand-sky/5 text-slate-950'
                      : isDone
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        : 'border-slate-200 bg-slate-50 text-slate-500'
                  }`}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                    {t('import.dialog.stepLabel', { defaultValue: 'Étape {{count}}', count: index + 1 })}
                  </p>
                  <p className="mt-1 font-medium">{item.label}</p>
                </div>
              );
            })}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            <p className="font-semibold text-slate-900">
              {t('import.dialog.formatTitle', { defaultValue: 'Formats et colonnes utiles' })}
            </p>
            <p className="mt-1">
              {t('import.dialog.formatBody', {
                defaultValue: 'Formats acceptés: CSV et .xlsx. Colonne requise: company_name. Colonnes utiles: website_url, industry, company_size, country, contact_name, contact_role, contact_email, notes, source_list.',
              })}
            </p>
          </div>

          {availableHeaders.length > 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-900">
                  {t('import.dialog.mapping.title', { defaultValue: 'Mapping des colonnes avant import' })}
                </p>
                <Badge variant="outline">
                  {t('import.dialog.mapping.detected', {
                    defaultValue: '{{count}} colonnes détectées',
                    count: availableHeaders.length,
                  })}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {t('import.dialog.mapping.body', {
                  defaultValue: 'Assignez chaque champ AimLeads à la colonne de votre fichier. Vous pouvez importer des noms de colonnes personnalisés.',
                })}
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {CANONICAL_FIELDS.map((field) => (
                  <div key={field.key} className="rounded-xl border border-slate-200 px-3 py-2">
                    <p className="text-xs font-semibold text-slate-700">
                      {field.label}
                      {field.required ? <span className="ml-1 text-rose-500">*</span> : null}
                    </p>
                    <Select value={fieldMapping[field.key] || EMPTY_MAPPING} onValueChange={(value) => handleMappingChange(field.key, value)}>
                      <SelectTrigger className="mt-1 h-8 text-xs">
                        <SelectValue placeholder="Choisir une colonne" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={EMPTY_MAPPING}>Ne pas importer</SelectItem>
                        {availableHeaders.map((header) => (
                          <SelectItem key={`${field.key}-${header}`} value={header} className="text-xs">
                            {header}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {!hasActiveIcp ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="font-semibold">
                {t('import.dialog.icpMissing.title', { defaultValue: "ICP actif recommandé avant l'import" })}
              </p>
              <p className="mt-1">
                {t('import.dialog.icpMissing.body', {
                  defaultValue: "Vous pouvez importer maintenant, mais la première analyse sera plus utile avec un ICP actif. On vous redirigera vers ce setup juste après si besoin.",
                })}
              </p>
            </div>
          ) : null}

          {!imported ? (
            <>
              <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:border-brand-sky/40 transition-colors">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx"
                  className="hidden"
                  id="lead-file-upload"
                  onChange={handleFileChange}
                />
                <label htmlFor="lead-file-upload" className="cursor-pointer">
                  <Upload className="w-10 h-10 text-slate-400 mx-auto mb-3" />
                  {fileName ? (
                    <p className="text-sm font-medium text-brand-sky">{fileName}</p>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-slate-700">
                        {t('import.dialog.dropzone.title', { defaultValue: 'Cliquez pour charger un fichier CSV ou Excel' })}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        {t('import.dialog.dropzone.subtitle', { defaultValue: '.csv · .xlsx' })}
                      </p>
                    </>
                  )}
                </label>
              </div>

              {error && (
                <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 border border-red-100">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  {error}
                </div>
              )}

              {missingCompanyMapping ? (
                <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2 border border-amber-200">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  {t('import.dialog.mapping.companyRequired', {
                    defaultValue: 'Mappez le champ "Entreprise" avant import pour éviter de perdre des lignes.',
                  })}
                </div>
              ) : null}

              {preview.length > 0 && (
                <div>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <FileText className="w-4 h-4" />
                    <p className="text-sm font-medium text-slate-700">
                      {t('import.dialog.preview.title', {
                        defaultValue: 'Aperçu prêt — {{count}} lignes détectées',
                        count: allRows.length,
                      })}
                    </p>
                    <Badge variant="outline">
                      {t('import.dialog.preview.badge', { defaultValue: 'Vérifiez avant import' })}
                    </Badge>
                  </div>

                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {previewHeaders.map((header) => (
                            <TableHead key={header} className="text-xs whitespace-nowrap">{header}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.map((row, rowIndex) => (
                          <TableRow key={rowIndex}>
                            {previewHeaders.map((header, colIndex) => (
                              <TableCell key={colIndex} className="text-xs max-w-[160px] truncate">
                                {row[header] || '-'}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-900">
                      {t('import.dialog.preview.checkTitle', { defaultValue: 'À vérifier avant de continuer' })}
                    </p>
                    <div className="mt-2 grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
                      {[
                        t('import.dialog.preview.checkOne', { defaultValue: 'Les noms d’entreprises sont bien remplis' }),
                        t('import.dialog.preview.checkTwo', { defaultValue: 'Les colonnes website / industry sont correctes' }),
                        t('import.dialog.preview.checkThree', { defaultValue: 'Le volume attendu correspond à votre fichier' }),
                      ].map((item) => (
                        <div key={item} className="rounded-xl bg-white px-3 py-2 shadow-sm ring-1 ring-slate-200">
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2 mt-4">
                    <Button
                      onClick={handleImport}
                      disabled={importing || missingCompanyMapping}
                      className="gap-2 bg-gradient-to-r from-brand-sky to-brand-sky-2"
                    >
                      {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      {importing
                        ? t('import.dialog.actions.importing', { defaultValue: 'Import en cours…' })
                        : t('import.dialog.actions.importCount', {
                            defaultValue: 'Importer {{count}} leads',
                            count: allRows.length,
                          })}
                    </Button>
                    <Button variant="outline" onClick={() => handleOpenChange(false)}>
                      {t('common.cancel', { defaultValue: 'Annuler' })}
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <div className="text-center py-6">
                <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto mb-3" />
                <h3 className="text-lg font-semibold text-slate-900 mb-1">
                  {t('import.dialog.success.title', { defaultValue: 'Import terminé' })}
                </h3>
                <p className="text-slate-500">
                  <span className="font-semibold text-emerald-600">{importResult?.created ?? 0} leads</span>{' '}
                  {t('import.dialog.success.body', { defaultValue: 'importés avec succès.' })}
                  {importResult?.skipped > 0 && (
                    <span className="text-amber-600">
                      {' '}
                      {t('import.dialog.success.skipped', {
                        defaultValue: '{{count}} ligne(s) ignorée(s).',
                        count: importResult.skipped,
                      })}
                    </span>
                  )}
                </p>
              </div>

              <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
                  {t('import.dialog.nextBestStep', { defaultValue: 'Meilleure suite' })}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {hasActiveIcp
                    ? t('import.dialog.success.analyzeHint', {
                        defaultValue: 'Analysez les {{count}} premiers leads importés pour générer score, signaux et copy commerciale prête à exploiter.',
                        count: Math.min(importResult?.created ?? 0, ACTIVATION_ANALYZE_BATCH_SIZE),
                      })
                    : t('import.dialog.success.icpHint', {
                        defaultValue: 'Activez maintenant un ICP pour scorer les leads importés avec le bon profil.',
                      })}
                </p>
              </div>

              {importResult?.skippedRows?.length > 0 && (
                <div className="border border-amber-200 rounded-xl bg-amber-50 p-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 mb-2">
                    <XCircle className="w-3.5 h-3.5" />
                    {t('import.dialog.skipped.title', { defaultValue: 'Lignes ignorées (company_name manquant)' })}
                  </div>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {importResult.skippedRows.map(({ row, data }) => (
                      <div key={row} className="text-xs text-amber-700 flex gap-2">
                        <span className="font-mono font-bold">
                          {t('import.dialog.skipped.row', { defaultValue: 'Ligne {{row}} :', row })}
                        </span>
                        <span className="truncate text-amber-600">{JSON.stringify(data).slice(0, 80)}…</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  variant="outline"
                  onClick={() => handleHandoff('focus', onFocusImportedLeads)}
                  disabled={handoffAction !== null}
                  className="gap-2"
                >
                  {handoffAction === 'focus' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  {t('import.dialog.actions.reviewImported', { defaultValue: 'Voir les leads importés' })}
                </Button>
                <Button
                  onClick={() => handleHandoff(hasActiveIcp ? 'analyze' : 'icp', hasActiveIcp ? onAnalyzeImportedLeads : onReviewIcp)}
                  disabled={handoffAction !== null}
                  className="gap-2 bg-gradient-to-r from-brand-sky to-brand-sky-2"
                >
                  {handoffAction === 'analyze' || handoffAction === 'icp' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : hasActiveIcp ? (
                    <Sparkles className="w-4 h-4" />
                  ) : (
                    <Target className="w-4 h-4" />
                  )}
                  {hasActiveIcp
                    ? t('import.dialog.actions.analyzeImported', {
                        defaultValue: 'Analyser les {{count}} premiers',
                        count: Math.min(importResult?.created ?? 0, ACTIVATION_ANALYZE_BATCH_SIZE),
                      })
                    : t('import.dialog.actions.configureIcp', { defaultValue: "Activer l'ICP avant l'analyse" })}
                </Button>
              </div>

              <Button variant="ghost" onClick={() => handleOpenChange(false)} className="w-full">
                {t('import.dialog.actions.doLater', { defaultValue: 'Je termine ça plus tard' })}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
