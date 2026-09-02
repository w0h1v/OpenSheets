import { gzipSync, gunzipSync } from 'zlib';
import { TextDecoder, TextEncoder } from 'util';
import { compress, decompress } from '../utils/compressionUtils';

type Globals = Record<string, unknown>;

// jsdom ships none of the streaming codec; these stand-ins run real gzip
// through the same call shape the browser path uses
const installNativeCodec = () => {
  const globals = window as unknown as Globals;
  const bytesOf = (input: unknown): Buffer => {
    if (input && typeof input === 'object' && 'bytes' in (input as Globals)) return (input as { bytes: Buffer }).bytes;
    return Buffer.from(input as Uint8Array);
  };
  class Codec {
    constructor(readonly format: string, readonly run: (input: Buffer) => Buffer) {}
  }
  globals.TextEncoder = TextEncoder;
  globals.TextDecoder = TextDecoder;
  globals.CompressionStream = class extends Codec {
    constructor(format: string) { super(format, gzipSync); }
  };
  globals.DecompressionStream = class extends Codec {
    constructor(format: string) { super(format, gunzipSync); }
  };
  globals.Response = class {
    constructor(private readonly input: unknown) {}
    get body() {
      return { pipeThrough: (codec: Codec) => ({ bytes: codec.run(bytesOf(this.input)) }) };
    }
    async arrayBuffer() {
      const buffer = bytesOf(this.input);
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    }
  };
  return () => {
    ['TextEncoder', 'TextDecoder', 'CompressionStream', 'DecompressionStream', 'Response'].forEach((key) => {
      delete globals[key];
    });
  };
};

describe('compressionUtils', () => {
  describe('with the platform codec available', () => {
    let uninstall: () => void;

    beforeEach(() => { uninstall = installNativeCodec(); });
    afterEach(() => uninstall());

    it('gzips to base64 and back', async () => {
      const text = 'gzip me — 日本語 🌍';
      const packed = await compress(text);
      expect(packed).toMatch(/^[A-Za-z0-9+/]+=*$/);
      expect(await decompress(packed)).toBe(text);
    });

    it('shrinks repetitive input well below its original size', async () => {
      const text = 'repeat '.repeat(500);
      expect((await compress(text)).length).toBeLessThan(text.length / 10);
    });
  });

  // jsdom has no CompressionStream, so these run the built-in LZ fallback
  it('round-trips ASCII text', async () => {
    const text = 'The quick brown fox jumps over the lazy dog';
    expect(await decompress(await compress(text))).toBe(text);
  });

  it('round-trips unicode text', async () => {
    const text = 'héllo wörld 🌍 日本語 — “quotes”';
    expect(await decompress(await compress(text))).toBe(text);
  });

  it('round-trips serialized spreadsheet data', async () => {
    const text = JSON.stringify({
      data: Array.from({ length: 200 }, (_, i) => [`${i}:0`, { value: i, formula: `=A${i}+1` }]),
    });
    expect(await decompress(await compress(text))).toBe(text);
  });

  it('returns empty output for empty input', async () => {
    expect(await compress('')).toBe('');
    expect(await decompress('')).toBe('');
  });

  it('shrinks repetitive input', async () => {
    const text = 'abcabcabc'.repeat(200);
    expect((await compress(text)).length).toBeLessThan(text.length / 4);
  });

  it('falls back to the built-in codec when the native streams fail', async () => {
    const globals = window as unknown as Record<string, unknown>;
    globals.CompressionStream = class { constructor() { throw new Error('unsupported'); } };
    globals.DecompressionStream = class { constructor() { throw new Error('unsupported'); } };
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const text = 'fallback please 🙂';
      const packed = await compress(text);
      expect(await decompress(packed)).toBe(text);
      expect(warn).toHaveBeenCalledTimes(2);
    } finally {
      warn.mockRestore();
      delete globals.CompressionStream;
      delete globals.DecompressionStream;
    }
  });
});
