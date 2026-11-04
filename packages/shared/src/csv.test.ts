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
    });

    it('escapes internal double quotes by doubling them', () => {
      expect(escapeCsvCell('ESP32 "DevKit" V1')).toBe('"ESP32 ""DevKit"" V1"');
      expect(escapeCsvCell('"quoted"')).toBe('"""quoted"""');
    });

    it('neutralizes formula injection characters (=, +, -, @, \\t, \\r) with leading single quote', () => {
      expect(escapeCsvCell('=1+1')).toBe(`"'=1+1"`);
      expect(escapeCsvCell('=cmd|\' /C calc\'!A0')).toBe(`"'=cmd|' /C calc'!A0"`);
      expect(escapeCsvCell('+SUM(A1:A10)')).toBe(`"'+SUM(A1:A10)"`);
      expect(escapeCsvCell('-100')).toBe(`"'-100"`);
      expect(escapeCsvCell('@HYPERLINK("http://evil.com")')).toBe(`"'@HYPERLINK(""http://evil.com"")"`);
      expect(escapeCsvCell('\tmalicious')).toBe(`"'\tmalicious"`);
      expect(escapeCsvCell('\rmalicious')).toBe(`"'\rmalicious"`);
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
      ];
      const csv = generateSafeCsv(headers, data);
      const lines = csv.split('\r\n');
      expect(lines).toHaveLength(3);
      expect(lines[0]).toBe('"Mã linh kiện","Số lượng","Ghi chú"');
      expect(lines[1]).toBe('"ITEM-001","5","Bình thường"');
      expect(lines[2]).toBe('"ITEM-002","2","\'=SUM(B1:B2)"');
    });
  });
});
