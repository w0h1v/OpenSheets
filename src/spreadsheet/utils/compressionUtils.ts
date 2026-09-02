/*
 * Compression for storage adapters: gzip through the platform's
 * CompressionStream when it exists (stored as base64), otherwise a small
 * LZW encoder whose output is packed into string code units. Both forms
 * are plain strings, so they can live in localStorage.
 */

const hasStreams = () => typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};

const fromBase64 = (text: string): Uint8Array<ArrayBuffer> => {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

export async function compress(data: string): Promise<string> {
  if (!hasStreams()) return fallbackCompress(data);
  try {
    const stream = new Response(new TextEncoder().encode(data)).body!.pipeThrough(new CompressionStream('gzip'));
    return toBase64(new Uint8Array(await new Response(stream).arrayBuffer()));
  } catch {
    return fallbackCompress(data);
  }
}

export async function decompress(compressed: string): Promise<string> {
  if (!hasStreams()) return fallbackDecompress(compressed);
  try {
    const stream = new Response(fromBase64(compressed)).body!.pipeThrough(new DecompressionStream('gzip'));
    return new TextDecoder().decode(await new Response(stream).arrayBuffer());
  } catch {
    return fallbackDecompress(compressed);
  }
}

/*
 * Simple LZW fallback. It runs over UTF-8 bytes rather than the string's own
 * code units: the decoder seeds its dictionary with codes 0..255, so any
 * symbol above 255 would collide with a learned code and decode as garbage.
 * Learned codes stop below the surrogate range so the packed output stays a
 * well-formed string that survives JSON and storage round-trips.
 */
const MAX_CODE = 0xd800;

// UTF-8 encode into a byte string (one character per byte); no TextEncoder,
// which is the whole point of the fallback path.
function toByteString(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const cp = text.codePointAt(i) as number;
    if (cp > 0xffff) i++; // surrogate pair consumed as one code point
    if (cp < 0x80) {
      out += String.fromCharCode(cp);
    } else if (cp < 0x800) {
      out += String.fromCharCode(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    } else if (cp < 0x10000) {
      out += String.fromCharCode(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else {
      out += String.fromCharCode(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f)
      );
    }
  }
  return out;
}

function fromByteString(bytes: string): string {
  let out = '';
  let i = 0;
  const at = (offset: number) => bytes.charCodeAt(i + offset) & 0x3f;
  while (i < bytes.length) {
    const b = bytes.charCodeAt(i);
    if (b < 0x80) {
      out += String.fromCharCode(b);
      i += 1;
    } else if (b < 0xe0) {
      out += String.fromCharCode(((b & 0x1f) << 6) | at(1));
      i += 2;
    } else if (b < 0xf0) {
      out += String.fromCharCode(((b & 0x0f) << 12) | (at(1) << 6) | at(2));
      i += 3;
    } else {
      out += String.fromCodePoint(((b & 0x07) << 18) | (at(1) << 12) | (at(2) << 6) | at(3));
      i += 4;
    }
  }
  return out;
}

function fallbackCompress(data: string): string {
  if (!data) return '';

  const bytes = toByteString(data);
  const dict = new Map<string, number>();
  const result: number[] = [];
  let dictSize = 256;
  // Single bytes are their own code; only longer sequences are learned
  const codeOf = (word: string) => (word.length === 1 ? word.charCodeAt(0) : (dict.get(word) as number));
  let word = bytes[0];

  for (let i = 1; i < bytes.length; i++) {
    const char = bytes[i];
    const combined = word + char;

    if (dict.has(combined)) {
      word = combined;
    } else {
      result.push(codeOf(word));

      if (dictSize < MAX_CODE) {
        dict.set(combined, dictSize++);
      }

      word = char;
    }
  }

  result.push(codeOf(word));

  // Convert to string for storage
  return result.map(n => String.fromCharCode(n)).join('');
}

function fallbackDecompress(compressed: string): string {
  if (!compressed) return '';

  const dict: string[] = [];
  for (let i = 0; i < 256; i++) {
    dict[i] = String.fromCharCode(i);
  }

  const data = compressed.split('').map(c => c.charCodeAt(0));
  let result = String.fromCharCode(data[0]);
  let word = result;
  let dictSize = 256;

  for (let i = 1; i < data.length; i++) {
    const code = data[i];
    const entry = dict[code] || (word + word[0]);
    result += entry;

    if (dictSize < MAX_CODE) {
      dict[dictSize++] = word + entry[0];
    }

    word = entry;
  }

  return fromByteString(result);
}
