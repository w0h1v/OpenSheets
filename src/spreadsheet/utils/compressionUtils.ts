/**
 * Simple compression utilities for reducing storage size
 * Uses browser's native CompressionStream API when available
 * Falls back to basic string compression for older browsers
 */

export async function compress(data: string): Promise<string> {
  // Check if CompressionStream is available (modern browsers)
  if ('CompressionStream' in window) {
    try {
      const encoder = new TextEncoder();
      const encoded = encoder.encode(data);
      
      const stream = new Response(encoded).body!
        .pipeThrough(new (window as any).CompressionStream('gzip'));
      
      const compressed = await new Response(stream).arrayBuffer();
      
      // Convert to base64 for storage
      return btoa(String.fromCharCode(...new Uint8Array(compressed)));
    } catch (error) {
      console.warn('CompressionStream failed, using fallback:', error);
      return fallbackCompress(data);
    }
  }
  
  // Fallback compression
  return fallbackCompress(data);
}

export async function decompress(compressed: string): Promise<string> {
  // Check if DecompressionStream is available
  if ('DecompressionStream' in window) {
    try {
      // Convert from base64
      const binaryString = atob(compressed);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const stream = new Response(bytes).body!
        .pipeThrough(new (window as any).DecompressionStream('gzip'));
      
      const decompressed = await new Response(stream).arrayBuffer();
      const decoder = new TextDecoder();
      return decoder.decode(decompressed);
    } catch (error) {
      console.warn('DecompressionStream failed, using fallback:', error);
      return fallbackDecompress(compressed);
    }
  }
  
  // Fallback decompression
  return fallbackDecompress(compressed);
}

// Simple LZ-based compression fallback
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
    
    if (dictSize < 65536) {
      dict[dictSize++] = word + entry[0];
    }
    
    word = entry;
  }
  
  return result;
}

// Estimate compression ratio
export function estimateCompressionRatio(original: string, compressed: string): number {
  if (original.length === 0) return 0;
  return Math.round((1 - compressed.length / original.length) * 100);
}

// Check if data should be compressed (based on size and content)
export function shouldCompress(data: string, threshold: number = 1024): boolean {
  // Don't compress if too small
  if (data.length < threshold) return false;
  
  // Check for already compressed data (high entropy)
  const entropy = calculateEntropy(data.slice(0, 1000)); // Sample first 1000 chars
  
  // If entropy is very high, data might already be compressed
  return entropy < 7.5;
}

function calculateEntropy(str: string): number {
  const freq: Record<string, number> = {};
  
  for (const char of str) {
    freq[char] = (freq[char] || 0) + 1;
  }
  
  let entropy = 0;
  const len = str.length;
  
  for (const count of Object.values(freq)) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  
  return entropy;
}