import { describe, expect, it } from 'vitest';
import { buildLeadsCsv, escapeCsvValue, sanitizeSpreadsheetCell } from '@/lib/exportCsv';

describe('exportCsv', () => {
  it('neutralizes spreadsheet formulas before export', () => {
    expect(sanitizeSpreadsheetCell('=SUM(A1:A2)')).toBe("'=SUM(A1:A2)");
    expect(sanitizeSpreadsheetCell('+cmd|calc')).toBe("'+cmd|calc");
    expect(sanitizeSpreadsheetCell(' @malicious')).toBe("' @malicious");
  });

  it('still escapes quotes and commas after sanitization', () => {
    expect(escapeCsvValue('normal,value')).toBe('"normal,value"');
    expect(escapeCsvValue('=CMD(),"test"')).toBe('"\'=CMD(),""test"""');
  });

  it('includes generated icebreakers in the exported columns', () => {
    const csv = buildLeadsCsv([
      {
        company_name: 'Acme',
        final_score: 82,
        generated_icebreakers: {
          email: 'Bonjour, votre levée de fonds…',
          linkedin: 'Félicitations pour votre expansion…',
          call: 'Accroche téléphonique',
        },
      },
    ]);

    const [header, row] = csv.split('\n');
    expect(header).toContain('Icebreaker Email');
    expect(header).toContain('Icebreaker LinkedIn');
    expect(header).toContain('Icebreaker Call');
    expect(row).toContain('Bonjour, votre levée de fonds…');
    expect(row).toContain('Félicitations pour votre expansion…');
    expect(row).toContain('Accroche téléphonique');
  });

  it('falls back to the legacy generated_icebreaker string for the email column', () => {
    const csv = buildLeadsCsv([
      { company_name: 'Acme', generated_icebreaker: 'Accroche legacy' },
    ]);
    expect(csv.split('\n')[1]).toContain('Accroche legacy');
  });
});
