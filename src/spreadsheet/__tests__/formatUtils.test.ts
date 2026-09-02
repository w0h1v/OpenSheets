import { formatCellValue, autoDetectFormat, PREDEFINED_FORMATS, getFormatOptions } from '../utils/formatUtils';
import { CellFormat } from '../types/spreadsheet';

const fmt = (formatType: CellFormat['formatType'], extra: Partial<CellFormat> = {}): CellFormat =>
  ({ formatType, ...extra });

// Local-time constructor: the formatter reads local date parts, so these
// expectations hold in any timezone
const jan15 = new Date(2024, 0, 15, 14, 5, 9);

describe('formatUtils', () => {
  describe('formatCellValue', () => {
    it('renders nothing for null and undefined', () => {
      expect(formatCellValue(null)).toBe('');
      expect(formatCellValue(undefined, fmt('number'))).toBe('');
    });

    it('renders plain text when there is no format or the format is text', () => {
      expect(formatCellValue('hello')).toBe('hello');
      expect(formatCellValue(42, fmt('text'))).toBe('42');
      expect(formatCellValue(true)).toBe('true');
    });

    it('renders a Date as a short date even without a format type', () => {
      expect(formatCellValue(jan15)).toBe('1/15/2024');
      expect(formatCellValue(jan15, {})).toBe('1/15/2024');
    });

    it('falls back to the raw value for automatic and unknown format types', () => {
      expect(formatCellValue(3.14159, fmt('automatic'))).toBe('3.14159');
    });

    describe('numbers', () => {
      it('groups thousands and rounds to two decimals by default', () => {
        expect(formatCellValue(1234.567, fmt('number'))).toBe('1,234.57');
        expect(formatCellValue(1234.5, fmt('number', { numberFormat: 'General' }))).toBe('1,234.50');
      });

      it('honours decimalPlaces', () => {
        expect(formatCellValue(1234.567, fmt('number', { decimalPlaces: 0 }))).toBe('1,235');
        expect(formatCellValue(2, fmt('number', { decimalPlaces: 3 }))).toBe('2.000');
      });

      it('applies a custom number format pattern', () => {
        expect(formatCellValue(1234.567, fmt('number', { numberFormat: '#,##0.00' }))).toBe('1,234.57');
        expect(formatCellValue(-1234.5, fmt('number', { numberFormat: '#,##0.00' }))).toBe('-1,234.50');
        expect(formatCellValue(1234.5, fmt('number', { numberFormat: '0' }))).toBe('1,234');
      });

      it('leaves non-numeric values alone', () => {
        expect(formatCellValue('abc', fmt('number'))).toBe('abc');
      });
    });

    describe('currency', () => {
      it('formats with a dollar sign by default', () => {
        expect(formatCellValue(1234.5, fmt('currency'))).toBe('$1,234.50');
        expect(formatCellValue(-5, fmt('currency'))).toBe('-$5.00');
      });

      it('swaps in a custom symbol and honours decimalPlaces', () => {
        expect(formatCellValue(1234.5, fmt('currency', { currencySymbol: '€' }))).toBe('€1,234.50');
        expect(formatCellValue(1234.5, fmt('currency', { decimalPlaces: 0 }))).toBe('$1,235');
      });

      it('leaves non-numeric values alone', () => {
        expect(formatCellValue('n/a', fmt('currency'))).toBe('n/a');
      });
    });

    describe('percentage and scientific', () => {
      it('scales fractions to percentages', () => {
        expect(formatCellValue(0.256, fmt('percentage'))).toBe('25.60%');
        expect(formatCellValue(0.256, fmt('percentage', { decimalPlaces: 1 }))).toBe('25.6%');
        expect(formatCellValue('x', fmt('percentage'))).toBe('x');
      });

      it('uses exponential notation for scientific', () => {
        expect(formatCellValue(12345, fmt('scientific'))).toBe('1.23e+4');
        expect(formatCellValue(12345, fmt('scientific', { decimalPlaces: 0 }))).toBe('1e+4');
        expect(formatCellValue('x', fmt('scientific'))).toBe('x');
      });
    });

    describe('accounting', () => {
      it('parenthesizes negatives and dashes zero', () => {
        expect(formatCellValue(1234.5, fmt('accounting'))).toBe('$1,234.50');
        expect(formatCellValue(-1234.5, fmt('accounting'))).toBe('($1,234.50)');
        expect(formatCellValue(0, fmt('accounting'))).toBe('$-');
        expect(formatCellValue(-1, fmt('accounting', { currencySymbol: '€' }))).toBe('(€1.00)');
        expect(formatCellValue('x', fmt('accounting'))).toBe('x');
      });
    });

    describe('dates', () => {
      it('applies the predefined date patterns', () => {
        expect(formatCellValue(jan15, fmt('date'))).toBe('1/15/2024');
        expect(formatCellValue(jan15, fmt('date', { numberFormat: PREDEFINED_FORMATS.date.medium }))).toBe('Jan 15, 2024');
        expect(formatCellValue(jan15, fmt('date', { numberFormat: PREDEFINED_FORMATS.date.long }))).toBe('January 15, 2024');
        expect(formatCellValue(jan15, fmt('date', { numberFormat: PREDEFINED_FORMATS.date.full }))).toBe('Monday, January 15, 2024');
      });

      it('supports padded and two-digit tokens', () => {
        expect(formatCellValue(jan15, fmt('date', { numberFormat: 'YYYY-MM-DD' }))).toBe('2024-01-15');
        expect(formatCellValue(jan15, fmt('date', { numberFormat: 'DD/MM/YY ddd' }))).toBe('15/01/24 Mon');
      });

      it('does not re-substitute letters inside month names', () => {
        expect(formatCellValue(new Date(2024, 4, 3), fmt('date', { numberFormat: 'MMMM D, YYYY' }))).toBe('May 3, 2024');
        expect(formatCellValue(new Date(2024, 11, 15), fmt('date', { numberFormat: 'MMM D, YYYY' }))).toBe('Dec 15, 2024');
        expect(formatCellValue(new Date(2024, 2, 1), fmt('date', { numberFormat: 'MMMM' }))).toBe('March');
      });

      it('reads Excel serial numbers as days since 1899-12-30', () => {
        // 45306.5 is noon UTC on 2024-01-15, so the local date matches in every timezone
        expect(formatCellValue(45306.5, fmt('date'))).toBe('1/15/2024');
      });

      it('parses date strings and leaves unparseable ones alone', () => {
        expect(formatCellValue('2024-01-15T12:00:00', fmt('date'))).toBe('1/15/2024');
        expect(formatCellValue('not a date', fmt('date'))).toBe('not a date');
      });
    });

    describe('times', () => {
      it('formats Date objects in 24h and 12h patterns', () => {
        expect(formatCellValue(jan15, fmt('time'))).toBe('14:05');
        expect(formatCellValue(jan15, fmt('time', { numberFormat: PREDEFINED_FORMATS.time.medium }))).toBe('14:05:09');
        expect(formatCellValue(jan15, fmt('time', { numberFormat: 'h:mm A' }))).toBe('2:05 PM');
        expect(formatCellValue(jan15, fmt('time', { numberFormat: 'hh:mm:ss a' }))).toBe('02:05:09 pm');
        expect(formatCellValue(new Date(2024, 0, 15, 0, 30), fmt('time', { numberFormat: 'h:mm A' }))).toBe('12:30 AM');
      });

      it('parses time strings and leaves unparseable ones alone', () => {
        expect(formatCellValue('9:07', fmt('time'))).toBe('9:07');
        expect(formatCellValue('14:05:09', fmt('time', { numberFormat: 'HH:mm:ss' }))).toBe('14:05:09');
        expect(formatCellValue('noon', fmt('time'))).toBe('noon');
      });
    });

    describe('durations', () => {
      it('renders seconds as h:mm:ss or m:ss', () => {
        expect(formatCellValue(3725, fmt('duration'))).toBe('1:02:05');
        expect(formatCellValue(125, fmt('duration'))).toBe('2:05');
        expect(formatCellValue(59, fmt('duration'))).toBe('0:59');
        expect(formatCellValue('x', fmt('duration'))).toBe('x');
      });
    });
  });

  describe('autoDetectFormat', () => {
    it('treats empty input as text', () => {
      expect(autoDetectFormat('')).toEqual({ value: '', format: { formatType: 'text' } });
      expect(autoDetectFormat(null)).toEqual({ value: '', format: { formatType: 'text' } });
      expect(autoDetectFormat(undefined)).toEqual({ value: '', format: { formatType: 'text' } });
    });

    it('detects dates in common notations', () => {
      const us = autoDetectFormat('1/15/2024');
      expect(us.value).toBeInstanceOf(Date);
      expect([us.value.getFullYear(), us.value.getMonth(), us.value.getDate()]).toEqual([2024, 0, 15]);
      expect(us.format).toEqual({ formatType: 'date', numberFormat: 'M/D/YYYY' });

      expect(autoDetectFormat('2024-01-15').value).toBeInstanceOf(Date);
      expect(autoDetectFormat('Jan 15, 2023').format.formatType).toBe('date');
    });

    it('detects times and keeps them as text values', () => {
      expect(autoDetectFormat('14:30')).toEqual({ value: '14:30', format: { formatType: 'time', numberFormat: 'H:mm' } });
      expect(autoDetectFormat('9:05 PM').format.formatType).toBe('time');
    });

    it('detects percentages and stores the fraction', () => {
      expect(autoDetectFormat('25%')).toEqual({ value: 0.25, format: { formatType: 'percentage', numberFormat: '0.00%' } });
    });

    it('detects currency and strips the symbol and separators', () => {
      expect(autoDetectFormat('$1,234.50')).toEqual({
        value: 1234.5,
        format: { formatType: 'currency', numberFormat: '$#,##0.00', currencySymbol: '$' },
      });
    });

    it('detects numbers, including grouped and negative ones', () => {
      expect(autoDetectFormat('1,234')).toEqual({ value: 1234, format: { formatType: 'number', numberFormat: '0.00' } });
      expect(autoDetectFormat('-3.5').value).toBe(-3.5);
      expect(autoDetectFormat(' 42 ').value).toBe(42);
      expect(autoDetectFormat(7).value).toBe(7);
    });

    it('falls back to trimmed text', () => {
      expect(autoDetectFormat('  hello ')).toEqual({ value: 'hello', format: { formatType: 'text' } });
      expect(autoDetectFormat('12abc').format.formatType).toBe('text');
    });
  });

  describe('PREDEFINED_FORMATS and getFormatOptions', () => {
    it('exposes the Sheets-style patterns', () => {
      expect(PREDEFINED_FORMATS.number.currency).toBe('$#,##0.00');
      expect(PREDEFINED_FORMATS.number.percentage).toBe('0.00%');
      expect(PREDEFINED_FORMATS.date.short).toBe('M/D/YYYY');
      expect(PREDEFINED_FORMATS.time.short).toBe('H:mm');
    });

    it('lists every format type the formatter understands', () => {
      const { formatTypes, fontFamilies, fontSizes } = getFormatOptions();
      expect(formatTypes.map((t) => t.value)).toEqual([
        'automatic', 'number', 'currency', 'percentage', 'scientific', 'accounting', 'date', 'time', 'duration', 'text',
      ]);
      expect(fontFamilies).toContain('Arial');
      expect(fontSizes).toEqual([...fontSizes].sort((a, b) => a - b));
    });
  });
});
