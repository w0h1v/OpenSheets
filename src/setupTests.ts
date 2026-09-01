import '@testing-library/jest-dom';

// Mock IntersectionObserver
global.IntersectionObserver = class MockIntersectionObserver implements IntersectionObserver {
  root: Element | null = null;
  rootMargin: string = '';
  thresholds: ReadonlyArray<number> = [];
  
  constructor(_callback: IntersectionObserverCallback, _options?: IntersectionObserverInit) {}
  disconnect() {}
  observe(_target: Element) {}
  unobserve(_target: Element) {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
} as any;

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
};

// Mock clipboard API
Object.assign(navigator, {
  clipboard: {
    writeText: jest.fn(),
    readText: jest.fn(),
  },
});

// Mock document.execCommand for older clipboard operations
document.execCommand = jest.fn();

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
global.localStorage = localStorageMock as any;

// Mock WebSocket
global.WebSocket = jest.fn() as any;
// Polyfill DataTransfer/ClipboardEvent for jsdom (used by clipboard code and tests)
if (typeof (global as any).DataTransfer === 'undefined') {
  (global as any).DataTransfer = class DataTransfer {
    private data = new Map<string, string>();
    setData(type: string, value: string) { this.data.set(type, value); }
    getData(type: string) { return this.data.get(type) ?? ''; }
    clearData(type?: string) { if (type) this.data.delete(type); else this.data.clear(); }
  };
}
if (typeof (global as any).ClipboardEvent === 'undefined') {
  (global as any).ClipboardEvent = class ClipboardEvent extends Event {
    clipboardData: any;
    constructor(type: string, init: any = {}) {
      super(type, init);
      this.clipboardData = init.clipboardData ?? new DataTransfer();
    }
  };
}
