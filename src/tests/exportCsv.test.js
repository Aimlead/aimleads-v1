import { describe, expect, it } from 'vitest';
import { escapeCsvValue, sanitizeSpreadsheetCell } from '@/lib/exportCsv';

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
});
