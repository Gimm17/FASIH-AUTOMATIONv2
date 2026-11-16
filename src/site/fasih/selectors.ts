/**
 * Centralized FASIH selector registry — the SINGLE place selectors live
 * (IMPLEMENTATION_PLAN.md §11.1.1). Updating one selector does not require touching the
 * orchestrator or matching engine.
 *
 * Selectors here are derived from the REAL FASIH DOM (reconnaissance from the working
 * prototype at FASIH-AUTOMATION/extension/content.js), not the plan's schematic guesses.
 * Priority order per selector key: stable data attribute → aria/title → semantic → icon → class.
 *
 * NOTE on icon-based selectors: `svg.tabler-icon-*` selects the SVG, not the button.
 * Resolvers MUST walk `closest('button'|'a')` to get the clickable element.
 */

export const FASIH_SELECTORS = {
  listViewToggle: [
    'button[aria-label*="Tampilan List" i]',
    'button[title*="Tampilan List" i]',
    'button[aria-label*="list" i]',
    'button[title*="list" i]',
  ],

  listViewIcon: ['svg.tabler-icon-list', 'svg[class*="icon-list"]'],

  searchInput: [
    // REAL FASIH primary (confirmed): placeholder is "Cari..."
    'input[placeholder="Cari..."]',
    'input[placeholder^="Cari" i]',
    'input[data-tsd-source*="filter-search"]',
    // Plan's schematic fallbacks (kept for resilience if FASIH changes the placeholder)
    'input[data-tsd-source="assignment-search-input"]',
    'input[data-tsd-source*="assignment-search-input"]',
    'input[placeholder*="Search" i]',
    'input.mantine-TextInput-input',
    'input[type="search"]',
  ],

  assignmentCards: [
    '[data-tsd-source^="assignment-list-item-"]',
    '[data-tsd-source*="assignment-list-item"]',
  ],

  candidateDetailTrigger: [
    'a.font-semibold.underline',
    'button.font-semibold.underline',
    'a[class*="font-semibold"][class*="underline"]',
    'button[class*="font-semibold"][class*="underline"]',
  ],

  drawer: ['[role="dialog"]', '.mantine-Modal-root', '.mantine-Drawer-root', '[data-state="open"]'],

  reviewAction: [
    'a[data-tsd-source="assignment-action-review"]',
    'a[data-tsd-source*="assignment-action-review"]',
    'a[data-tsd-source*="assignment-action"][href]',
    'a[href*="/app/assignment/"]',
    'a[href*="/assignment/"][href*="/review"]',
  ],

  reviewIcon: ['svg.tabler-icon-brand-telegram'],

  closeButton: [
    'button[aria-label*="close" i]',
    'button[aria-label*="tutup" i]',
    'button.mantine-Modal-close',
    'button.mantine-Drawer-close',
    // Tailwind utility classes with a colon MUST be CSS-escaped in JS strings.
    'button.f\\:top-4.f\\:right-4',
    'button[class*="top-4"][class*="right-4"]',
  ],

  closeIcon: ['svg.tabler-icon-x'],
} as const;

export type SelectorKey = keyof typeof FASIH_SELECTORS;

/** Resolve the first element matching any selector in a list, within an optional root. */
export function findFirstMatchingSelector<T extends Element = Element>(
  selectors: readonly string[],
  root: ParentNode | null = document,
): T | null {
  if (!root) return null;
  for (const sel of selectors) {
    try {
      const el = root.querySelector<T>(sel);
      if (el) return el;
    } catch {
      // Invalid selector string for this DOM context — skip and try the next.
    }
  }
  return null;
}

/** Resolve ALL elements matching any selector in a list, within an optional root. */
export function findAllMatchingSelectors<T extends Element = Element>(
  selectors: readonly string[],
  root: ParentNode | null = document,
): T[] {
  if (!root) return [];
  const seen = new Set<Element>();
  const out: T[] = [];
  for (const sel of selectors) {
    try {
      root.querySelectorAll<T>(sel).forEach((el) => {
        if (!seen.has(el)) {
          seen.add(el);
          out.push(el);
        }
      });
    } catch {
      // skip invalid selector
    }
  }
  return out;
}
