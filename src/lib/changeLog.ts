// src/lib/changeLog.ts
//
// The page's change list (pages.prototype_changes): what was approved on the
// prototype after it was built and is NOT stored in the sections —
// AI element changes, "Describe changes", deleted elements, text/image/link
// edits that don't belong to a section field.
// It is added to the blueprint (so "Generate Fresh" and AI builders rebuild
// these changes) and exported as changes.md next to prototype.html.

import type { Page, PrototypeChange, Section } from '../types';

const MAX_CHANGES = 60;
/** Long requests (pasted code, a whole design.md) are kept in full — the builder needs all of it. */
const MAX_REQUEST = 20000;
const MAX_PLAN = 2000;

const normReq = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
/** "make text white" and "make text white color!" on the same element = one change */
function sameRequest(a: PrototypeChange, b: PrototypeChange): boolean {
  if (a.kind !== b.kind || a.kind === 'edit') return false;
  if ((a.sectionId ?? '') !== (b.sectionId ?? '') || (a.target ?? '') !== (b.target ?? '')) return false;
  const x = normReq(a.request);
  const y = normReq(b.request);
  return !!x && !!y && (x.includes(y) || y.includes(x));
}

export function readChanges(page: Pick<Page, 'prototype_changes'> | null | undefined): PrototypeChange[] {
  const raw = page?.prototype_changes;
  if (!Array.isArray(raw)) return [];
  return raw.filter((c): c is PrototypeChange => !!c && typeof c === 'object' && typeof (c as PrototypeChange).request === 'string');
}

export function addChange(list: PrototypeChange[], entry: Omit<PrototypeChange, 'id' | 'at'>): PrototypeChange[] {
  const full: PrototypeChange = {
    ...entry,
    id: Math.random().toString(36).slice(2, 10),
    at: new Date().toISOString(),
    request: entry.request.trim().slice(0, MAX_REQUEST),
    plan: entry.plan?.trim().slice(0, MAX_PLAN) || undefined,
  };
  // repeated manual edits of the same text: keep one entry (old → newest)
  const last = list[list.length - 1];
  if (full.kind === 'edit' && last?.kind === 'edit' && full.from !== undefined && last.to !== undefined && last.to === full.from) {
    const merged: PrototypeChange = { ...last, to: full.to, at: full.at, request: describeEdit(last.what ?? 'Text', last.from ?? '', full.to ?? '') };
    return [...list.slice(0, -1), merged];
  }
  // the same request again on the same element: keep only the newest
  const dup = list.findIndex(c => sameRequest(c, full));
  const rest = dup < 0 ? list : list.filter((_, i) => i !== dup);
  return [...rest, full].slice(-MAX_CHANGES);
}

const cut = (s: string, n = 120) => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

export function describeEdit(what: string, from: string, to: string): string {
  return `${what} changed on the page: "${cut(from)}" → "${cut(to)}"`;
}

export function describeDelete(label: string): string {
  return `Removed from the page: ${cut(label, 100)}`;
}

function sectionName(sections: Section[], id?: string): string {
  if (!id) return '';
  const sorted = [...sections].sort((a, b) => a.sort_order - b.sort_order);
  const i = sorted.findIndex(s => s.id === id);
  return i < 0 ? '' : `Section ${i + 1}: ${sorted[i].section_name || sorted[i].section_type}`;
}

function line(c: PrototypeChange, sections: Section[]): string {
  const where = sectionName(sections, c.sectionId) || (c.kind === 'ai-page' ? 'Whole page' : 'Page');
  const target = c.target ? ` — ${c.target}` : '';
  const plan = c.plan && c.plan !== c.request ? `\n  - Agreed: ${c.plan}` : '';
  return `- **${where}**${target}: ${c.request}${plan}`;
}

/** Block appended to the blueprint (empty when there are no changes). */
export function changesBlueprintBlock(page: Page, sections: Section[]): string {
  const list = readChanges(page);
  if (!list.length) return '';
  return `

## Approved Prototype Changes (KEEP THESE)
> These changes were approved on the prototype after the sections above were written.
> Apply them on top of the sections — they win where they differ. Interactive widgets must work.

${list.map(c => line(c, sections)).join('\n')}
`;
}

/** changes.md for the export. */
export function changesMd(page: Page, sections: Section[]): string {
  const list = readChanges(page);
  return `# Approved changes — ${page.page_name}

Changes made on the prototype after it was generated. prototype.html already contains all of them.
When rebuilding the page, keep every change below (widgets must really work).

${list.length ? list.map(c => `${line(c, sections)}\n  - Date: ${c.at.slice(0, 10)}`).join('\n') : '_No changes recorded._'}
`;
}

/** Prototype HTML for the export: without the app's internal marks and comments. */
export function cleanPrototypeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html.replace(/\s*<!-- bpm-[a-z]+(?::[a-z0-9]+)? -->/g, ''), 'text/html');
  doc.querySelectorAll('*').forEach(el => {
    for (const a of [...el.attributes]) if (a.name.startsWith('data-bpm')) el.removeAttribute(a.name);
  });
  const doctype = doc.doctype ? `<!DOCTYPE ${doc.doctype.name}>` : '<!DOCTYPE html>';
  return `${doctype}\n${doc.documentElement.outerHTML}\n`;
}
