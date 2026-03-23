import React, { useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, FileText, Loader2, Upload, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { dataClient } from '@/services/dataClient';

// ─── Parsers ──────────────────────────────────────────────────────────────────

/**
 * RFC-4180 compliant CSV parser — handles quoted fields with commas + newlines.
 */
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
      } else if (c === ',' && !quoted) {
        fields.push(field);
        field = '';
      } else {
        field += c;
      }
    }
    fields.push(field);
    return fields;
  };

  const headers = splitRow(nonEmpty[0]).map((h) => h.trim().toLowerCase().replace(/"/g, ''));

  return nonEmpty
    .slice(1)
    .map((line) => {
      const values = splitRow(line);
      return headers.reduce((row, header, idx) => ({ ...row, [header]: (values[idx] || '').trim() }), {});
    })
    .filter((row) => row.company_name || row['company name'] || row.name);
};

/**
 * Parse XLSX/XLS file using the xlsx library.
 * Returns rows normalized with lowercase header keys.
 */
const parseXlsx = (buffer) => {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];

  const sheet = workbook.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  if (raw.length === 0) return [];

  return raw
    .map((row) => {
      const normalized = {};
      for (const [key, value] of Object.entries(row)) {
        normalized[key.trim().toLowerCase()] = String(value ?? '').trim();
      }
      return normalized;
    })
    .filter((row) => row.company_name || row['company name'] || row.name);
};

// ─── Column mapping ────────────────────────────────────────────────────────────

const COLUMN_MAP = {
  'company name': 'company_name',
  name: 'company_name',
  nom: 'company_name',
  entreprise: 'company_name',
  website: 'website_url',
  site: 'website_url',
  url: 'website_url',
  secteur: 'industry',
  sector: 'industry',
  taille: 'company_size',
  size: 'company_size',
  employees: 'company_size',
  pays: 'country',
  'contact name': 'contact_name',
  contact: 'contact_name',
  'nom contact': 'contact_name',
  role: 'contact_role',
  poste: 'contact_role',
  title: 'contact_role',
  email: 'contact_email',
  mail: 'contact_email',
  notes: 'notes',
  source: 'source_list',
};

const normalizeRow = (row) => {
  const result = { ...row };
  for (const [alias, canonical] of Object.entries(COLUMN_MAP)) {
    if (row[alias] !== undefined && result[canonical] === undefined) {
      result[canonical] = row[alias];
    }
  }
  return result;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function ImportCSVDialog({ open, onOpenChange, onImportSuccess }) {
  const [preview, setPreview] = useState([]);
  const [allRows, setAllRows] = useState([]);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [error, setError] = useState(null);
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef(null);

  const resetDialog = () => {
    setPreview([]);
    setAllRows([]);
    setImported(false);
    setImportResult(null);
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

    const isXlsx = /\.(xlsx|xls|ods)$/i.test(file.name);

    if (isXlsx) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const buffer = new Uint8Array(e.target.result);
          const rows = parseXlsx(buffer).map(normalizeRow);
          if (rows.length === 0) {
            setError('No valid rows found. Make sure the first sheet has a "company_name" (or similar) column.');
            return;
          }
          setAllRows(rows);
          setPreview(rows.slice(0, 5));
        } catch (err) {
          setError(`Failed to parse Excel file: ${err?.message || 'unknown error'}`);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const rows = parseCsv(String(e.target?.result || '')).map(normalizeRow);
          if (rows.length === 0) {
            setError('CSV must contain at least one valid lead row with a company_name column.');
            return;
          }
          setAllRows(rows);
          setPreview(rows.slice(0, 5));
        } catch {
          setError('Failed to parse CSV file.');
        }
      };
      reader.readAsText(file);
    }
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

      const result = { created: created.length, skipped: skippedRows.length, skippedRows };
      setImportResult(result);
      setImported(true);

      if (skippedRows.length > 0) {
        toast.success(`${created.length} leads imported. ${skippedRows.length} row(s) skipped.`);
      } else {
        toast.success(`${created.length} leads imported successfully.`);
      }

      onImportSuccess?.();
    } catch (err) {
      console.warn('Import failed', err);
      toast.error('Import failed. Check the file format and try again.');
    } finally {
      setImporting(false);
    }
  };

  const PREVIEW_COLS = ['company_name', 'website_url', 'industry', 'company_size', 'country'];
  const previewHeaders = preview.length > 0
    ? PREVIEW_COLS.filter((col) => preview.some((row) => row[col]))
    : [];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Leads</DialogTitle>
          <DialogDescription>
            Supports <strong>CSV</strong> and <strong>Excel (XLSX/XLS)</strong>. Required column: <code className="text-xs bg-slate-100 px-1 rounded">company_name</code>.
            Optional: website_url, industry, company_size, country, contact_name, contact_role, contact_email, notes, source_list.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!imported ? (
            <>
              <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:border-brand-sky/40 transition-colors">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls,.ods"
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
                      <p className="text-sm font-medium text-slate-700">Click to upload CSV or Excel file</p>
                      <p className="text-xs text-slate-400 mt-1">.csv · .xlsx · .xls · .ods</p>
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

              {preview.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Preview — {allRows.length} rows detected
                  </p>

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

                  <div className="flex gap-2 mt-4">
                    <Button
                      onClick={handleImport}
                      disabled={importing}
                      className="gap-2 bg-gradient-to-r from-brand-sky to-brand-sky-2"
                    >
                      {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      {importing ? 'Importing...' : `Import ${allRows.length} leads`}
                    </Button>
                    <Button variant="outline" onClick={() => handleOpenChange(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <div className="text-center py-6">
                <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto mb-3" />
                <h3 className="text-lg font-semibold text-slate-900 mb-1">Import Complete</h3>
                <p className="text-slate-500">
                  <span className="font-semibold text-emerald-600">{importResult?.created ?? 0} leads</span> imported successfully.
                  {importResult?.skipped > 0 && (
                    <span className="text-amber-600"> {importResult.skipped} row(s) skipped.</span>
                  )}
                </p>
              </div>

              {importResult?.skippedRows?.length > 0 && (
                <div className="border border-amber-200 rounded-xl bg-amber-50 p-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 mb-2">
                    <XCircle className="w-3.5 h-3.5" />
                    Skipped rows (missing company name)
                  </div>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {importResult.skippedRows.map(({ row, data }) => (
                      <div key={row} className="text-xs text-amber-700 flex gap-2">
                        <span className="font-mono font-bold">Row {row}:</span>
                        <span className="truncate text-amber-600">{JSON.stringify(data).slice(0, 80)}…</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Button onClick={() => handleOpenChange(false)} className="w-full bg-gradient-to-r from-brand-sky to-brand-sky-2">
                Done
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
