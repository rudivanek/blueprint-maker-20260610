// src/lib/previewStamp.ts
//
// Knows whether a saved HTML prototype still matches the page.
// When a prototype is generated, a fingerprint of what it was built from
// (design system, global settings, sections) is written at the end of the
// HTML as a comment. If the sections or the design change later, the fingerprint no
// longer matches and the prototype is "outdated".
// Prototypes made before this existed have no fingerprint → treated as current.

import type { GlobalSettings, Section } from '../types';

const STAMP_RE = /\s*<!-- bpm-source:([a-z0-9]+) -->/;

function hash(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return h1.toString(36) + h2.toString(36);
}

/** Fingerprint of everything the prototype is built from. Ids and timestamps are ignored. */
export function previewSource(designMd: string, globals: GlobalSettings, sections: Section[]): string {
  const parts = [...sections]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(s => [
      s.section_name, s.section_type, s.background_hex, s.headline_size, s.layout_variant,
      s.layout_description, s.layout_contract, s.copy, s.items, s.images, s.notes,
    ]);
  return hash(JSON.stringify([designMd ?? '', globals ?? null, parts]));
}

/** Writes the fingerprint into the HTML (replacing an older one). */
export function stampHtml(html: string, source: string): string {
  return `${html.replace(STAMP_RE, '').trimEnd()}\n<!-- bpm-source:${source} -->\n`;
}

/** true when the saved prototype was built from different sections or design. */
export function isPreviewOutdated(html: string | undefined, source: string): boolean {
  if (!html) return false;
  const m = html.match(STAMP_RE);
  return !!m && m[1] !== source;
}
