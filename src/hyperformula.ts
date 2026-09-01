/*
 * `opensheets/hyperformula` — a formula engine backed by HyperFormula.
 *
 * Kept out of the main entry on purpose: HyperFormula is licensed
 * GPL-3.0-only (with a commercial licence available from Handsontable),
 * while OpenSheets itself is MIT. The core grid evaluates formulas with its
 * own evaluator and never loads this module; importing this entry is an
 * explicit opt-in whose licence terms are yours to satisfy. Install the
 * optional peer dependency `hyperformula` to use it.
 */
export { FormulaEngine } from './spreadsheet/utils/hyperformulaEngine';
