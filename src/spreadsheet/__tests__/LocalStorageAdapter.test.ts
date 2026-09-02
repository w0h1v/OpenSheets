import { LocalStorageAdapter } from '../persistence/LocalStorageAdapter';
import { PersistedState } from '../persistence/types';

// A shrinking fake codec: the real one is exercised in compressionUtils.test
jest.mock('../utils/compressionUtils', () => {
  const packed = new Map<string, string>();
  return {
    compress: jest.fn(async (text: string) => {
      const token = `gz:${packed.size}`;
      packed.set(token, text);
      return token;
    }),
    decompress: jest.fn(async (token: string) => packed.get(token) ?? ''),
  };
});

// Map-backed Storage whose entries are also enumerable own properties, the
// way browsers expose them (the adapter walks Object.keys(localStorage))
function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  const api = {
    get length() { return store.size; },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key: string, value: string) => { store.set(key, String(value)); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
  };
  return new Proxy(api as unknown as Storage, {
    ownKeys: () => Array.from(store.keys()),
    getOwnPropertyDescriptor: (_target, key) =>
      typeof key === 'string' && store.has(key)
        ? { value: store.get(key), enumerable: true, configurable: true, writable: true }
        : undefined,
    get: (target, key) =>
      key in target ? target[key as keyof Storage] : typeof key === 'string' ? store.get(key) : undefined,
  });
}

const persisted = (overrides: Partial<PersistedState> = {}): PersistedState => ({
  version: '2.0.0',
  data: [['0:0', { value: 'hello' }]],
  rowHeights: [22],
  colWidths: [96],
  metadata: { id: 'doc', title: 'Doc', createdAt: 1, updatedAt: 1, revision: 0, lastModifiedBy: 'ann' },
  ...overrides,
});

const OVERSIZED = 'x'.repeat(5 * 1024 * 1024 + 1);
const quotaError = () => new DOMException('quota', 'QuotaExceededError');

describe('LocalStorageAdapter', () => {
  let storage: Storage;
  let adapter: LocalStorageAdapter;
  let now: number;

  beforeEach(() => {
    storage = createMemoryStorage();
    Object.defineProperty(window, 'localStorage', { configurable: true, value: storage });
    // A realistic clock: freeUpSpace prunes autosaves older than seven days
    now = 1_700_000_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => ++now);
    jest.spyOn(console, 'error').mockImplementation(() => {});
    adapter = new LocalStorageAdapter();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('save and load', () => {
    it('stores the document under a prefixed key and reads it back', async () => {
      const state = persisted();
      await adapter.save('doc', state);
      expect(JSON.parse(storage.getItem('opensheets_doc') as string).data).toEqual([['0:0', { value: 'hello' }]]);
      expect(storage.getItem('opensheets_doc_compressed')).toBeNull();
      expect(await adapter.load('doc')).toEqual(persisted());
    });

    it('bumps the revision, stamps the metadata and reports the sync', async () => {
      const onSyncStatusChange = jest.fn();
      adapter.onSyncStatusChange = onSyncStatusChange;
      const state = persisted();

      const first = await adapter.save('doc', state);
      expect(first).toEqual({ success: true, revision: 1, timestamp: first.timestamp });
      expect(await adapter.getMetadata('doc')).toMatchObject({ id: 'doc', revision: 1, updatedAt: first.timestamp });
      expect(onSyncStatusChange).toHaveBeenCalledWith(expect.objectContaining({ syncing: false, connected: true, mode: 'local' }));
      expect(adapter.getSyncStatus().lastSync).toBeGreaterThan(first.timestamp);

      const second = await adapter.save('doc', state);
      expect(second.revision).toBe(2);
    });

    it('returns null for a missing or corrupt document', async () => {
      expect(await adapter.load('missing')).toBeNull();
      storage.setItem('opensheets_doc', '{oops');
      expect(await adapter.load('doc')).toBeNull();
      expect(console.error).toHaveBeenCalled();
    });

    it('answers exists from the main key only', async () => {
      expect(await adapter.exists('doc')).toBe(false);
      await adapter.save('doc', persisted());
      expect(await adapter.exists('doc')).toBe(true);
    });
  });

  describe('delete', () => {
    it('removes the document, its metadata and every version', async () => {
      await adapter.save('doc', persisted());
      const version = await adapter.saveVersion('doc', persisted(), 'v1');
      await adapter.save('other', persisted());

      await adapter.delete('doc');

      expect(Object.keys(storage).filter((k) => k.startsWith('opensheets_doc'))).toEqual([]);
      expect(storage.getItem(`opensheets_doc_version_${version.id}`)).toBeNull();
      expect(await adapter.exists('other')).toBe(true);
    });
  });

  describe('versions', () => {
    it('saves a labelled snapshot, lists it and loads it back', async () => {
      const state = persisted();
      const version = await adapter.saveVersion('doc', state, 'draft');
      expect(version).toEqual({
        id: expect.stringMatching(/^v_/),
        timestamp: expect.any(Number),
        label: 'draft',
        author: 'ann',
        size: JSON.stringify(state).length,
        revision: 0,
      });
      expect(await adapter.listVersions('doc')).toEqual([version]);
      expect(await adapter.loadVersion('doc', version.id)).toEqual(state);
      expect(await adapter.loadVersion('doc', 'missing')).toBeNull();
    });

    it('lists no versions when the version list is missing or corrupt', async () => {
      expect(await adapter.listVersions('doc')).toEqual([]);
      storage.setItem('opensheets_doc_versions', '[oops');
      expect(await adapter.listVersions('doc')).toEqual([]);
    });

    it('keeps only the ten newest versions after a save', async () => {
      const versions = [];
      for (let i = 0; i < 12; i++) versions.push(await adapter.saveVersion('doc', persisted(), `v${i}`));

      await adapter.save('doc', persisted());

      const remaining = await adapter.listVersions('doc');
      expect(remaining.map((v) => v.label)).toEqual(versions.slice(2).map((v) => v.label));
      expect(storage.getItem(`opensheets_doc_version_${versions[0].id}`)).toBeNull();
      expect(storage.getItem(`opensheets_doc_version_${versions[1].id}`)).toBeNull();
      expect(storage.getItem(`opensheets_doc_version_${versions[2].id}`)).not.toBeNull();
    });
  });

  describe('metadata', () => {
    it('is null until something is saved and merges updates with a fresh timestamp', async () => {
      expect(await adapter.getMetadata('doc')).toBeNull();
      await adapter.save('doc', persisted());
      await adapter.updateMetadata('doc', { title: 'Renamed', tags: ['a'] });
      expect(await adapter.getMetadata('doc')).toMatchObject({ id: 'doc', title: 'Renamed', tags: ['a'], revision: 1, updatedAt: now });
    });

    it('treats corrupt metadata as missing', async () => {
      storage.setItem('opensheets_doc_metadata', '{oops');
      expect(await adapter.getMetadata('doc')).toBeNull();
    });
  });

  describe('compression', () => {
    const oversized = () => persisted({ data: [['0:0', { value: OVERSIZED }]] });

    it('compresses documents over the size limit and flags them', async () => {
      const result = await adapter.save('doc', oversized());
      expect(result.success).toBe(true);
      expect(storage.getItem('opensheets_doc')).toMatch(/^gz:/);
      expect(storage.getItem('opensheets_doc_compressed')).toBe('true');
      const loaded = await adapter.load('doc');
      expect(loaded?.data[0][1].value).toBe(OVERSIZED);
    });

    it('clears the compression flag once a smaller document is saved', async () => {
      await adapter.save('doc', oversized());
      await adapter.save('doc', persisted());
      expect(storage.getItem('opensheets_doc_compressed')).toBeNull();
      expect(await adapter.load('doc')).toEqual(persisted());
    });

    it('refuses oversized documents when compression is disabled', async () => {
      const plain = new LocalStorageAdapter(false);
      expect(await plain.save('doc', oversized())).toEqual({
        success: false,
        timestamp: expect.any(Number),
        error: 'Data too large for LocalStorage',
      });
      expect(storage.getItem('opensheets_doc')).toBeNull();
    });

    it('refuses documents that stay oversized after compression', async () => {
      const { compress } = jest.requireMock('../utils/compressionUtils') as { compress: jest.Mock };
      compress.mockImplementationOnce(async (text: string) => text + text);
      expect((await adapter.save('doc', oversized())).error).toBe('Data too large for LocalStorage even after compression');
    });

    it('cannot read a compressed document with compression disabled', async () => {
      await adapter.save('doc', oversized());
      expect(await new LocalStorageAdapter(false).load('doc')).toBeNull();
    });
  });

  describe('quota handling', () => {
    it('frees old versions and stale autosaves, then retries once', async () => {
      storage.setItem('opensheets_other_version_v1', '{}');
      storage.setItem('opensheets_old_autosave', JSON.stringify({ metadata: { updatedAt: 0 } }));
      storage.setItem('opensheets_fresh_autosave', JSON.stringify({ metadata: { updatedAt: now } }));
      storage.setItem('opensheets_broken_autosave', '{oops');
      const setItem = jest.spyOn(storage, 'setItem');
      setItem.mockImplementationOnce(() => { throw quotaError(); });

      const result = await adapter.save('doc', persisted());

      expect(result.success).toBe(true);
      expect(storage.getItem('opensheets_doc')).not.toBeNull();
      expect(storage.getItem('opensheets_other_version_v1')).toBeNull();
      expect(storage.getItem('opensheets_old_autosave')).toBeNull();
      expect(storage.getItem('opensheets_broken_autosave')).toBeNull();
      expect(storage.getItem('opensheets_fresh_autosave')).not.toBeNull();
    });

    it('reports a quota error when the retry fails as well', async () => {
      jest.spyOn(storage, 'setItem').mockImplementation(() => { throw quotaError(); });
      expect(await adapter.save('doc', persisted())).toEqual({
        success: false,
        timestamp: expect.any(Number),
        error: 'Storage quota exceeded',
      });
    });

    it('reports other storage failures by message', async () => {
      jest.spyOn(storage, 'setItem').mockImplementation(() => { throw new Error('disk on fire'); });
      expect((await adapter.save('doc', persisted())).error).toBe('disk on fire');
    });
  });
});
