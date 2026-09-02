import { CellData } from '../types/spreadsheet';

type SheetRegistry = typeof import('../utils/sheetRegistry');

describe('sheetRegistry', () => {
  let registry: SheetRegistry;

  beforeEach(async () => {
    jest.resetModules();
    registry = await import('../utils/sheetRegistry');
  });

  it('starts empty at version zero', () => {
    expect(registry.getRegistryVersion()).toBe(0);
    expect(registry.getSheetData('Sheet1')).toBeUndefined();
  });

  it('exposes registered data by sheet name', () => {
    const data = new Map<string, CellData>([['0:0', { value: 1 }]]);
    registry.registerSheetData('Sheet1', data);
    expect(registry.getSheetData('Sheet1')).toBe(data);
  });

  it('bumps the version and notifies listeners only when a sheet gets a new map', () => {
    const listener = jest.fn();
    registry.subscribeRegistryVersion(listener);
    const data = new Map<string, CellData>();

    registry.registerSheetData('Sheet1', data);
    expect(registry.getRegistryVersion()).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);

    registry.registerSheetData('Sheet1', data);
    expect(registry.getRegistryVersion()).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);

    registry.registerSheetData('Sheet1', new Map(data));
    expect(registry.getRegistryVersion()).toBe(2);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('stops notifying after unsubscribe', () => {
    const listener = jest.fn();
    const unsubscribe = registry.subscribeRegistryVersion(listener);
    unsubscribe();
    registry.registerSheetData('Sheet1', new Map());
    expect(listener).not.toHaveBeenCalled();
  });

  it('keeps the last-known data after unregister so cross-sheet formulas still resolve', () => {
    const data = new Map<string, CellData>([['0:0', { value: 'kept' }]]);
    registry.registerSheetData('Sheet2', data);
    registry.unregisterSheetData('Sheet2');
    expect(registry.getSheetData('Sheet2')).toBe(data);
  });
});
