/*
 * `opensheets/excel` — Excel (.xlsx) import and export.
 *
 * Lives in its own entry so the core package never depends on SheetJS.
 * Install the optional peer dependency `xlsx` to use it; the SheetJS CDN
 * build is recommended, since the copy on the npm registry stopped at
 * 0.18.5 and carries open advisories:
 *
 *   npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
 */
export * from './spreadsheet/utils/excelUtils';
