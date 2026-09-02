/*
 * Compression for storage adapters: gzip through the platform's
 * CompressionStream when it exists, otherwise a small LZW encoder. Output
 * is base64 text in both cases so it can live in localStorage.
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

function fallbackCompress(data: string): string {
  if (!data) return '';
  
  const dict: Record<string, number> = {};
  const result: number[] = [];
  let dictSize = 256;
  let word = '';
  
  for (let i = 0; i < data.length; i++) {
    const char = data[i];
    const combined = word + char;
    
    if (dict[combined] !== undefined) {
      word = combined;
    } else {
      if (word.length > 0) {
        result.push(dict[word] !== undefined ? dict[word] : word.charCodeAt(0));
      }
      
      if (dictSize < 65536) {
        dict[combined] = dictSize++;
      }
      
      word = char;
    }
  }
  
  if (word.length > 0) {
    result.push(dict[word] !== undefined ? dict[word] : word.charCodeAt(0));
  }
  
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
    
    if (dictSize < 65536) {
      dict[dictSize++] = word + entry[0];
    }
    
    word = entry;
  }
  
  return result;
}
