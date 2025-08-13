import { CellFormat } from '../types/spreadsheet';

export interface NumberFormatOptions {
  formatType?: CellFormat['formatType'];
  numberFormat?: string;
  currencySymbol?: string;
  decimalPlaces?: number;
}

export interface DateFormatOptions {
  formatType?: 'date' | 'time' | 'duration';
  dateFormat?: string;
}

// Predefined format patterns similar to Google Sheets
export const PREDEFINED_FORMATS = {
  number: {
    automatic: 'General',
    number: '0.00',
    currency: '$#,##0.00',
    percentage: '0.00%',
    scientific: '0.00E+00',
    accounting: '_($* #,##0.00_);_($* (#,##0.00);_($* "-"??_);_(@_)',
  },
  date: {
    short: 'M/D/YYYY',
    medium: 'MMM D, YYYY',
    long: 'MMMM D, YYYY',
    full: 'dddd, MMMM D, YYYY',
  },
  time: {
    short: 'H:mm',
    medium: 'H:mm:ss',
    long: 'H:mm:ss A',
  }
};

/**
 * Automatically detect the data type and format accordingly
 */
export function autoDetectFormat(value: any): { value: any; format: CellFormat } {
  if (value === null || value === undefined || value === '') {
    return { value: '', format: { formatType: 'text' } };
  }

  const strValue = String(value).trim();

  // Check for date patterns
  if (isDateValue(strValue)) {
    const date = new Date(strValue);
    if (!isNaN(date.getTime())) {
      return {
        value: date,
        format: { formatType: 'date', numberFormat: PREDEFINED_FORMATS.date.short }
      };
    }
  }

  // Check for time patterns
  if (isTimeValue(strValue)) {
    return {
      value: strValue,
      format: { formatType: 'time', numberFormat: PREDEFINED_FORMATS.time.short }
    };
  }

  // Check for percentage
  if (strValue.endsWith('%')) {
    const numValue = parseFloat(strValue.slice(0, -1));
    if (!isNaN(numValue)) {
      return {
        value: numValue / 100,
        format: { formatType: 'percentage', numberFormat: PREDEFINED_FORMATS.number.percentage }
      };
    }
  }

  // Check for currency
  if (isCurrencyValue(strValue)) {
    const numValue = parseFloat(strValue.replace(/[$,]/g, ''));
    if (!isNaN(numValue)) {
      return {
        value: numValue,
        format: { formatType: 'currency', numberFormat: PREDEFINED_FORMATS.number.currency, currencySymbol: '$' }
      };
    }
  }

  // Check for number
  if (isNumberValue(strValue)) {
    const numValue = parseFloat(strValue.replace(/,/g, ''));
    if (!isNaN(numValue)) {
      return {
        value: numValue,
        format: { formatType: 'number', numberFormat: PREDEFINED_FORMATS.number.number }
      };
    }
  }

  // Default to text
  return { value: strValue, format: { formatType: 'text' } };
}

/**
 * Format a value according to the specified format
 */
export function formatCellValue(value: any, format?: CellFormat): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (!format || format.formatType === 'text') {
    return String(value);
  }

  switch (format.formatType) {
    case 'number':
      return formatNumber(value, format);
    case 'currency':
      return formatCurrency(value, format);
    case 'percentage':
      return formatPercentage(value, format);
    case 'scientific':
      return formatScientific(value, format);
    case 'accounting':
      return formatAccounting(value, format);
    case 'date':
      return formatDate(value, format);
    case 'time':
      return formatTime(value, format);
    case 'duration':
      return formatDuration(value, format);
    default:
      return String(value);
  }
}

function formatNumber(value: any, format: CellFormat): string {
  const num = Number(value);
  if (isNaN(num)) return String(value);

  const decimalPlaces = format.decimalPlaces ?? 2;
  
  if (format.numberFormat && format.numberFormat !== 'General') {
    return applyCustomNumberFormat(num, format.numberFormat);
  }

  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces
  });
}

function formatCurrency(value: any, format: CellFormat): string {
  const num = Number(value);
  if (isNaN(num)) return String(value);

  const currency = format.currencySymbol || '$';
  const decimalPlaces = format.decimalPlaces ?? 2;

  return num.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces
  }).replace('$', currency);
}

function formatPercentage(value: any, format: CellFormat): string {
  const num = Number(value);
  if (isNaN(num)) return String(value);

  const decimalPlaces = format.decimalPlaces ?? 2;
  return (num * 100).toLocaleString('en-US', {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces
  }) + '%';
}

function formatScientific(value: any, format: CellFormat): string {
  const num = Number(value);
  if (isNaN(num)) return String(value);

  const decimalPlaces = format.decimalPlaces ?? 2;
  return num.toExponential(decimalPlaces);
}

function formatAccounting(value: any, format: CellFormat): string {
  const num = Number(value);
  if (isNaN(num)) return String(value);

  const currency = format.currencySymbol || '$';
  const decimalPlaces = format.decimalPlaces ?? 2;

  if (num < 0) {
    return `(${currency}${Math.abs(num).toLocaleString('en-US', {
      minimumFractionDigits: decimalPlaces,
      maximumFractionDigits: decimalPlaces
    })})`;
  }

  if (num === 0) {
    return `${currency}-`;
  }

  return `${currency}${num.toLocaleString('en-US', {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces
  })}`;
}

function formatDate(value: any, format: CellFormat): string {
  let date: Date;
  
  if (value instanceof Date) {
    date = value;
  } else {
    date = new Date(value);
  }

  if (isNaN(date.getTime())) return String(value);

  const formatStr = format.numberFormat || PREDEFINED_FORMATS.date.short;
  return applyDateFormat(date, formatStr);
}

function formatTime(value: any, format: CellFormat): string {
  let date: Date;
  
  if (value instanceof Date) {
    date = value;
  } else if (typeof value === 'string' && isTimeValue(value)) {
    const today = new Date();
    const [hours, minutes, seconds] = value.split(':').map(Number);
    date = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, minutes || 0, seconds || 0);
  } else {
    date = new Date(value);
  }

  if (isNaN(date.getTime())) return String(value);

  const formatStr = format.numberFormat || PREDEFINED_FORMATS.time.short;
  return applyTimeFormat(date, formatStr);
}

function formatDuration(value: any, _format: CellFormat): string {
  const num = Number(value);
  if (isNaN(num)) return String(value);

  // Assume value is in seconds
  const hours = Math.floor(num / 3600);
  const minutes = Math.floor((num % 3600) / 60);
  const seconds = Math.floor(num % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  } else {
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
}

/**
 * Apply custom number format string (simplified version of Excel/Sheets format codes)
 */
function applyCustomNumberFormat(num: number, formatStr: string): string {
  // Handle basic format codes
  if (formatStr === 'General') {
    return String(num);
  }

  // Replace # and 0 patterns
  const parts = formatStr.split('.');
  const _integerPart = parts[0] || '';
  const decimalPart = parts[1] || '';

  let result = '';
  
  // Handle integer part
  const intStr = Math.floor(Math.abs(num)).toString();
  const intFormatted = intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  result = intFormatted;

  // Handle decimal part
  if (decimalPart) {
    const decimalDigits = (Math.abs(num) % 1).toFixed(decimalPart.length).substring(2);
    result += '.' + decimalDigits;
  }

  // Handle negative numbers
  if (num < 0) {
    result = '-' + result;
  }

  return result;
}

/**
 * Apply date format string
 */
function applyDateFormat(date: Date, formatStr: string): string {
  const replacements: { [key: string]: string } = {
    'YYYY': date.getFullYear().toString(),
    'YY': date.getFullYear().toString().slice(-2),
    'MMMM': date.toLocaleString('en-US', { month: 'long' }),
    'MMM': date.toLocaleString('en-US', { month: 'short' }),
    'MM': (date.getMonth() + 1).toString().padStart(2, '0'),
    'M': (date.getMonth() + 1).toString(),
    'DD': date.getDate().toString().padStart(2, '0'),
    'D': date.getDate().toString(),
    'dddd': date.toLocaleString('en-US', { weekday: 'long' }),
    'ddd': date.toLocaleString('en-US', { weekday: 'short' }),
  };

  let result = formatStr;
  Object.entries(replacements).forEach(([pattern, replacement]) => {
    result = result.replace(new RegExp(pattern, 'g'), replacement);
  });

  return result;
}

/**
 * Apply time format string
 */
function applyTimeFormat(date: Date, formatStr: string): string {
  const hours24 = date.getHours();
  const hours12 = hours24 % 12 || 12;
  const ampm = hours24 >= 12 ? 'PM' : 'AM';

  const replacements: { [key: string]: string } = {
    'HH': hours24.toString().padStart(2, '0'),
    'H': hours24.toString(),
    'hh': hours12.toString().padStart(2, '0'),
    'h': hours12.toString(),
    'mm': date.getMinutes().toString().padStart(2, '0'),
    'm': date.getMinutes().toString(),
    'ss': date.getSeconds().toString().padStart(2, '0'),
    's': date.getSeconds().toString(),
    'A': ampm,
    'a': ampm.toLowerCase(),
  };

  let result = formatStr;
  Object.entries(replacements).forEach(([pattern, replacement]) => {
    result = result.replace(new RegExp(pattern, 'g'), replacement);
  });

  return result;
}

// Helper functions for detection
function isDateValue(value: string): boolean {
  const datePatterns = [
    /^\d{1,2}\/\d{1,2}\/\d{4}$/, // MM/DD/YYYY
    /^\d{4}-\d{2}-\d{2}$/, // YYYY-MM-DD
    /^\d{1,2}-\d{1,2}-\d{4}$/, // MM-DD-YYYY
    /^[A-Za-z]{3}\s+\d{1,2},?\s+\d{4}$/, // Jan 1, 2023
  ];
  
  return datePatterns.some(pattern => pattern.test(value));
}

function isTimeValue(value: string): boolean {
  const timePatterns = [
    /^\d{1,2}:\d{2}$/, // HH:MM
    /^\d{1,2}:\d{2}:\d{2}$/, // HH:MM:SS
    /^\d{1,2}:\d{2}\s?(AM|PM)$/i, // HH:MM AM/PM
  ];
  
  return timePatterns.some(pattern => pattern.test(value));
}

function isCurrencyValue(value: string): boolean {
  return /^\$[\d,]+\.?\d*$/.test(value);
}

function isNumberValue(value: string): boolean {
  return /^-?[\d,]+\.?\d*$/.test(value) && !isNaN(parseFloat(value.replace(/,/g, '')));
}

/**
 * Get available format options for formatting toolbar
 */
export function getFormatOptions() {
  return {
    formatTypes: [
      { value: 'automatic', label: 'Automatic' },
      { value: 'number', label: 'Number' },
      { value: 'currency', label: 'Currency' },
      { value: 'percentage', label: 'Percentage' },
      { value: 'scientific', label: 'Scientific' },
      { value: 'accounting', label: 'Accounting' },
      { value: 'date', label: 'Date' },
      { value: 'time', label: 'Time' },
      { value: 'duration', label: 'Duration' },
      { value: 'text', label: 'Plain text' },
    ],
    fontFamilies: [
      'Arial',
      'Helvetica',
      'Times New Roman',
      'Courier New',
      'Verdana',
      'Georgia',
      'Palatino',
      'Garamond',
      'Bookman',
      'Comic Sans MS',
    ],
    fontSizes: [6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72],
  };
}