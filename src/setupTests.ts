import '@testing-library/jest-dom';

// jsdom lacks the pieces of the platform the grid relies on
document.execCommand = jest.fn();

const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
global.localStorage = localStorageMock as unknown as Storage;

global.WebSocket = jest.fn() as unknown as typeof WebSocket;

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
