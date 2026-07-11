/**
 * Exports an array of lead objects to a CSV file download.
 * @param {Array<Object>} leads
 * @param {string} [filename]
 */
export const sanitizeSpreadsheetCell = (value) => {
  if (value === null || value === undefined) return '';
  const str = String(value);
  return /^[\t\r ]*[=+\-@]/.test(str) ? `'${str}` : str;
};

export const escapeCsvValue = (value) => {
  const str = sanitizeSpreadsheetCell(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

export function buildLeadsCsv(leads) {
  const resolveCellValue = (lead, key) => {
    if (key === 'created_at') return lead.created_at || lead.created_date;
    if (key === 'final_recommended_action') return lead.final_recommended_action || lead.recommended_action;
    if (key === 'icebreaker_email') return lead.generated_icebreakers?.email || lead.generated_icebreaker;
    if (key === 'icebreaker_linkedin') return lead.generated_icebreakers?.linkedin;
    if (key === 'icebreaker_call') return lead.generated_icebreakers?.call;
    return lead[key];
  };

  const COLUMNS = [
    { key: 'company_name', label: 'Company Name' },
    { key: 'website_url', label: 'Website' },
    { key: 'industry', label: 'Industry' },
    { key: 'company_size', label: 'Company Size' },
    { key: 'country', label: 'Country' },
    { key: 'contact_name', label: 'Contact Name' },
    { key: 'contact_role', label: 'Contact Role' },
    { key: 'contact_email', label: 'Contact Email' },
    { key: 'status', label: 'Status' },
    { key: 'follow_up_status', label: 'Follow-up Status' },
    { key: 'final_score', label: 'Final Score' },
    { key: 'icp_score', label: 'ICP Score' },
    { key: 'icp_category', label: 'ICP Category' },
    { key: 'final_recommended_action', label: 'Recommended Action' },
    { key: 'icebreaker_email', label: 'Icebreaker Email' },
    { key: 'icebreaker_linkedin', label: 'Icebreaker LinkedIn' },
    { key: 'icebreaker_call', label: 'Icebreaker Call' },
    { key: 'source_list', label: 'Source List' },
    { key: 'notes', label: 'Notes' },
    { key: 'created_at', label: 'Created Date' },
    { key: 'last_analyzed_at', label: 'Last Analyzed' },
  ];

  const header = COLUMNS.map((col) => escapeCsvValue(col.label)).join(',');
  const rows = leads.map((lead) => COLUMNS.map((col) => escapeCsvValue(resolveCellValue(lead, col.key))).join(','));

  return [header, ...rows].join('\n');
}

export function exportLeadsToCsv(leads, filename = 'leads-export.csv') {
  if (!leads || leads.length === 0) return;

  const csv = buildLeadsCsv(leads);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
