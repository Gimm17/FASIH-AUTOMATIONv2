/**
 * AI response cache (IMPLEMENTATION_PLAN.md §25).
 * Key = sha256(normalizedInput + model + promptVersion).
 * Never stores credentials.
 *
 * The cache is an injectable interface so it can be backed by IndexedDB in the SW and
 * a plain Map in tests.
 */

import { PROMPT_VERSION } from '@shared/constants';
import type { AiQueryCorrection, AiCandidateVerdict } from '@ai/schemas';

export interface AiCacheEntry<T> {
  key: string;
  response: T;
  model: string;
  promptVersion: string;
  timestamp: string;
}

export interface AiCache {
  getQueryCorrection(key: string): Promise<AiQueryCorrection | null>;
  setQueryCorrection(key: string, response: AiQueryCorrection, model: string): Promise<void>;
  getCandidateVerdict(key: string): Promise<AiCandidateVerdict | null>;
  setCandidateVerdict(key: string, response: AiCandidateVerdict, model: string): Promise<void>;
  clear(): Promise<void>;
}

/** Build the deterministic cache key for a query-correction call. */
export async function queryCorrectionCacheKey(normalizedTarget: string, model: string): Promise<string> {
  return 'query-correction:' + (await sha256Hex(`${normalizedTarget}|${model}|${PROMPT_VERSION}`));
}

/** Build the deterministic cache key for a candidate-adjudication call. */
export async function candidateVerdictCacheKey(normalizedTarget: string, normalizedCandidate: string, model: string): Promise<string> {
  return 'candidate-review:' + (await sha256Hex(`${normalizedTarget}|${normalizedCandidate}|${model}|${PROMPT_VERSION}`));
}

/**
 * In-memory cache implementation (used in tests and as a fast tier). The service worker
 * wraps this with IndexedDB persistence.
 */
export function createInMemoryAiCache(): AiCache {
  const qc = new Map<string, AiQueryCorrection>();
  const cv = new Map<string, AiCandidateVerdict>();
  return {
    async getQueryCorrection(key) {
      return qc.get(key) ?? null;
    },
    async setQueryCorrection(key, response) {
      qc.set(key, response);
    },
    async getCandidateVerdict(key) {
      return cv.get(key) ?? null;
    },
    async setCandidateVerdict(key, response) {
      cv.set(key, response);
    },
    async clear() {
      qc.clear();
      cv.clear();
    },
  };
}

/**
 * SHA-256 → hex. Uses the SubtleCrypto API when available (service worker / window),
 * falls back to a pure-JS implementation for jsdom tests where crypto.subtle may be absent.
 */
export async function sha256Hex(input: string): Promise<string> {
  // Prefer Web Crypto (fast, constant-time, available in SW + most jsdom setups via Node crypto).
  if (hasSubtleCrypto()) {
    try {
      const buf = await crypto.subtle.digest('SHA-256', encodeUtf8(input).buffer as ArrayBuffer);
      return bufToHex(buf);
    } catch {
      // fall through to pure JS
    }
  }
  return sha256PureJs(input);
}

function hasSubtleCrypto(): boolean {
  return typeof crypto !== 'undefined' && !!crypto.subtle && typeof crypto.subtle.digest === 'function';
}

function encodeUtf8(s: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
  }
  return new Uint8Array(out);
}

function bufToHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}

/**
 * Minimal pure-JS SHA-256 (RFC 6234). Used only as a fallback when crypto.subtle is absent
 * (e.g. older jsdom). Correct but not constant-time — fine for non-secret cache keys.
 */
export function sha256PureJs(input: string): string {
  const bytes = encodeUtf8(input);
  return sha256Bytes(bytes);
}

function sha256Bytes(bytes: Uint8Array): string {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const H = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];

  const l = bytes.length;
  const bitLen = l * 8;
  // padding: 0x80, then zeros, then 64-bit length
  const padLen = ((l + 9 + 63) >> 6) << 6; // multiple of 64
  const padded = new Uint8Array(padLen);
  padded.set(bytes);
  padded[l] = 0x80;
  // 64-bit big-endian length (we only use the low 32 bits — input is small)
  padded[padLen - 4] = (bitLen >>> 24) & 0xff;
  padded[padLen - 3] = (bitLen >>> 16) & 0xff;
  padded[padLen - 2] = (bitLen >>> 8) & 0xff;
  padded[padLen - 1] = bitLen & 0xff;

  const w = new Uint32Array(64);

  for (let off = 0; off < padLen; off += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] =
        (padded[off + i * 4] << 24) |
        (padded[off + i * 4 + 1] << 16) |
        (padded[off + i * 4 + 2] << 8) |
        padded[off + i * 4 + 3];
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }

    let [a, b, c, d, e, f, g, h] = H;

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const mj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + mj) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }

    H[0] = (H[0] + a) | 0;
    H[1] = (H[1] + b) | 0;
    H[2] = (H[2] + c) | 0;
    H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0;
    H[5] = (H[5] + f) | 0;
    H[6] = (H[6] + g) | 0;
    H[7] = (H[7] + h) | 0;
  }

  return H.map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
}

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}
