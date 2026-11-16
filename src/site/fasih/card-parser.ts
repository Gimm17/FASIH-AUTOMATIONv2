import { FASIH_SELECTORS, findAllMatchingSelectors } from './selectors';
import type { ParsedCard } from './site-types';
import { normalizeIdentityCode } from '@matching/normalize';

/**
 * Parse a single FASIH assignment card into primitives (no persisted DOM references).
 *
 * Card root (real FASIH DOM):
 *   <div data-tsd-source="assignment-list-item-SE26mpewbw33D8">
 *     ... "SE26mpewbw33D8 - Polindes Labangun" ...
 *     ... "Nama Keluarga/Bangunan/Usaha  Polindes Labangun" ...
 *   </div>
 *
 * Card code is extracted with priority:
 *   1. suffix of data-tsd-source "assignment-list-item-<CODE>"
 *   2. a leading SE-code or numeric code in the card's raw text
 *   3. text on the detail trigger
 */

const CODE_PREFIX = 'assignment-list-item-';

/** Extract the card code from the data-tsd-source attribute (preferred). */
export function parseCodeFromCard(card: HTMLElement): string | null {
  const source = card.getAttribute('data-tsd-source') ?? '';
  if (source.startsWith(CODE_PREFIX)) {
    const code = source.slice(CODE_PREFIX.length).trim();
    if (code) return code;
  }
  if (source.includes(CODE_PREFIX)) {
    const idx = source.indexOf(CODE_PREFIX);
    const code = source.slice(idx + CODE_PREFIX.length).trim();
    if (code) return code;
  }
  // Fallback: scan the card text for an identity code.
  return extractCodeFromText(card.innerText);
}

/**
 * Extract a usable identity code from arbitrary text.
 * Priority: SE-code → leading numeric code before a dash → standalone 16-digit code.
 *
 * SE-codes observed on FASIH look like "SE26mpewbw33D8": "SE" + 2 digits + 8-12 alnum.
 * The digits are REQUIRED so plain words (SEMARANG, SEJAHTERA) are never mistaken
 * for codes.
 */
export function extractCodeFromText(text: string | null | undefined): string | null {
  if (!text) return null;
  const seMatch = text.match(/\bSE\d{2}[0-9A-Za-z]{8,12}\b/i);
  if (seMatch) return seMatch[0];
  const dashMatch = text.match(/^\s*(\d{4,})\s*[-–—]/);
  if (dashMatch) return dashMatch[1];
  const d16 = text.match(/\b(\d{16})\b/);
  if (d16) return d16[1];
  return null;
}

/**
 * Extract the clean entity NAME from a card, using the card's own labels.
 * FASIH renders "Nama Keluarga/Bangunan/Usaha  <value>" inside the card.
 */
export function extractFasihName(card: HTMLElement | null): string {
  if (!card) return '';
  const labels = Array.from(card.querySelectorAll('span, label, dt, p, div, b, strong'));
  for (const el of labels) {
    const t = (el.textContent ?? '').trim();
    if (/nama\s*(keluarga|bangunan|usaha)/i.test(t) && t.length < 40) {
      const nxt = el.nextElementSibling ?? el.parentElement?.nextElementSibling ?? null;
      if (nxt && nxt.textContent && nxt.textContent.trim()) {
        const v = nxt.textContent.replace(/\s+/g, ' ').trim();
        if (v && v.length < 160) return v;
      }
      const parent = el.parentElement;
      if (parent && parent.textContent) {
        const re = /nama\s*(?:keluarga|bangunan|usaha)[^a-z0-9]*([A-Za-z0-9][^\n]{2,160})/i;
        const m = parent.textContent.match(re);
        if (m && m[1]) return m[1].trim();
      }
    }
  }
  return '';
}

/**
 * Clean a raw card-text into a presentable name (strips leading code + metadata after "|").
 * Used when extractFasihName() found nothing.
 */
export function cleanCardName(cardText: string | null | undefined, nameHint?: string | null): string {
  if (nameHint && nameHint.trim()) return nameHint.trim();
  if (!cardText) return '';
  let text = String(cardText).replace(/\s+/g, ' ').trim();
  text = text.split(/\s*\|\s*/)[0]?.trim() ?? text;
  text = text.replace(/^(?:SE\d{2}[0-9A-Za-z]{8,12}|\d{10,})\s*[-–—]\s*/i, '');
  text = text.replace(/^(?:SE\d{2}[0-9A-Za-z]{8,12}|\d{16})\b/i, '');
  return text.trim();
}

/** Parse one card element into a ParsedCard. */
export function parseCard(card: HTMLElement, sourceQuery: string): ParsedCard | null {
  const rawText = (card.innerText ?? '').replace(/\s+/g, ' ').trim();
  const code = parseCodeFromCard(card);
  if (!code) return null;
  const name = extractFasihName(card) || cleanCardName(rawText);
  return {
    sourceQuery,
    cardName: name,
    cardCode: code,
    rawText,
    metadata: {},
    transientElement: card,
  };
}

/**
 * Collect all currently-rendered cards on the page.
 * Returns ParsedCards keyed by NORMALIZED code so the virtual-scroll engine can merge
 * incremental passes without duplicating.
 */
export function collectRenderedCards(sourceQuery: string): Map<string, ParsedCard> {
  const cards = findAllMatchingSelectors<HTMLElement>(FASIH_SELECTORS.assignmentCards, document);
  const out = new Map<string, ParsedCard>();
  for (const card of cards) {
    const parsed = parseCard(card, sourceQuery);
    if (!parsed) continue;
    const key = normalizeIdentityCode(parsed.cardCode);
    if (!key) continue;
    // Prefer the parsed entry that already has a non-empty name.
    const existing = out.get(key);
    if (!existing || (!existing.cardName && parsed.cardName)) {
      out.set(key, parsed);
    }
  }
  return out;
}
