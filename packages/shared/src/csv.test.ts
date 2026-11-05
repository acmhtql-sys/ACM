import { describe, it, expect } from 'vitest';
import { escapeCsvCell, formatCsvRow, generateSafeCsv } from './csv';

describe('CSV Generator & Formula Injection Mitigation Utility', () => {
  describe('escapeCsvCell', () => {
    it('handles null and undefined gracefully as empty cell', () => {
      expect(escapeCsvCell(null)).toBe('""');
      expect(escapeCsvCell(undefined)).toBe('""');
    });

    it('formats plain text and numbers wrapped in quotes', () => {
      expect(escapeCsvCell('KIT-001')).toBe('"KIT-001"');
      expect(escapeCsvCell(42)).toBe('"42"');
      expect(escapeCsvCell('Kho tổng')).toBe('"Kho tổng"');
      expect(escapeCsvCell('  Văn phòng Lab')).toBe('"  Văn phòng Lab"');
    });

    it('escapes internal double quotes by doubling them', () => {
      expect(escapeCsvCell('ESP32 "DevKit" V1')).toBe('"ESP32 ""DevKit"" V1"');
      expect(escapeCsvCell('"quoted"')).toBe('"""quoted"""');
    });

    it('neutralizes formula injection characters (=, +, -, @, \\t, \\r, \\n) with leading single quote', () => {
      expect(escapeCsvCell('=1+1')).toBe(`"'=1+1"`);
      expect(escapeCsvCell('=cmd|\' /C calc\'!A0')).toBe(`"'=cmd|' /C calc'!A0"`);
      expect(escapeCsvCell('+SUM(A1:A10)')).toBe(`"'+SUM(A1:A10)"`);
      expect(escapeCsvCell('-100')).toBe(`"'-100"`);
      expect(escapeCsvCell('@HYPERLINK("http://evil.com")')).toBe(`"'@HYPERLINK(""http://evil.com"")"`);
      expect(escapeCsvCell('\tmalicious')).toBe(`"'\tmalicious"`);
      expect(escapeCsvCell('\rmalicious')).toBe(`"'\rmalicious"`);
      expect(escapeCsvCell('\n=cmd')).toBe(`"'\n=cmd"`);
      expect(escapeCsvCell('\r\n+100')).toBe(`"'\r\n+100"`);
    });

    it('neutralizes formula injection characters preceded by leading whitespace (TC-REP-05 OWASP)', () => {
      expect(escapeCsvCell('  =1+1')).toBe(`"'  =1+1"`);
      expect(escapeCsvCell('   @SUM(A1:B10)')).toBe(`"'   @SUM(A1:B10)"`);
      expect(escapeCsvCell(' \t-50')).toBe(`"' \t-50"`);
      expect(escapeCsvCell('  +cmd|\' /C calc\'!A0')).toBe(`"'  +cmd|' /C calc'!A0"`);
    });
  });

  describe('formatCsvRow', () => {
    it('joins sanitized cells with comma', () => {
      const row = ['ESP32', 10, '=2+2', 'Board "test"'];
      expect(formatCsvRow(row)).toBe('"ESP32","10","\'=2+2","Board ""test"""');
    });
  });

  describe('generateSafeCsv', () => {
    it('assembles headers and data rows correctly with CRLF separator', () => {
      const headers = ['Mã linh kiện', 'Số lượng', 'Ghi chú'];
      const data = [
        ['ITEM-001', 5, 'Bình thường'],
        ['ITEM-002', 2, '=SUM(B1:B2)'],
        ['ITEM-003', 1, '  =cmd|\' /C calc\'!A0'],
      ];
      const csv = generateSafeCsv(headers, data);
      const lines = csv.split('\r\n');
      expect(lines).toHaveLength(4);
      expect(lines[0]).toBe('"Mã linh kiện","Số lượng","Ghi chú"');
      expect(lines[1]).toBe('"ITEM-001","5","Bình thường"');
      expect(lines[2]).toBe('"ITEM-002","2","\'=SUM(B1:B2)"');
      expect(lines[3]).toBe('"ITEM-003","1","\'  =cmd|\' /C calc\'!A0"');
    });
  });
});
