// src/lib/prototypeSync.ts
//
// Keeps the prototype (pages.generated_html) and the sections in sync for
// text, images and links — in both directions, without AI.
//
//  - When a prototype is generated, the AI marks elements:
//      data-bpm-s="<section id>"      on each section's outer element
//      data-bpm-f="<field>"           on the element that shows that field
//    Fields: copy.headline · copy.subheadline · copy.body · copy.cta_text
//            items.N.title · items.N.description · items.N.image · images.N
//  - Edit on page → fieldForEdit() finds the section field (marks first, then
//    exact text / URL matching for older prototypes) → the section is updated.
//  - Section edited in Review → patchPrototype() writes the new value into the
//    prototype, so it stays current instead of becoming "outdated".
//  - copy.md follows text changes (replaceInCopyMd), so the export agrees.

import type { Section, SectionImage, SectionItem } from '../types';

export type FieldKind = 'text' | 'src' | 'href';
export interface FieldRef {
  sectionId: string;
  path: string;
  kind: FieldKind;
}

const TEXT_COPY = ['headline', 'subheadline', 'body', 'cta_text'] as const;
const ITEM_TEXT = ['title', 'description'] as const;

export const norm = (s: string) => (s ?? '').replace(/\s+/g, ' ').trim();

// ── reading / writing a field ──

export function getField(section: Section, path: string): string {
  const p = path.split('.');
  if (p[0] === 'copy') return String((section.copy as unknown as Record<string, string>)?.[p[1]] ?? '');
  if (p[0] === 'items') {
    const it = section.items?.[Number(p[1])] as unknown as Record<string, string> | undefined;
    return String(it?.[p[2]] ?? '');
  }
  if (p[0] === 'images') return String(section.images?.[Number(p[1])]?.src ?? '');
  return '';
}

/** The section update that sets one field. */
export function setField(section: Section, path: string, value: string): Partial<Section> {
  const p = path.split('.');
  if (p[0] === 'copy') return { copy: { ...section.copy, [p[1]]: value } };
  if (p[0] === 'items') {
    const i = Number(p[1]);
    const items = (section.items ?? []).map((it, j) => (j === i ? { ...it, [p[2]]: value } as SectionItem : it));
    return { items };
  }
  if (p[0] === 'images') {
    const i = Number(p[1]);
    const images = (section.images ?? []).map((im, j) => (j === i ? { ...im, src: value } as SectionImage : im));
    return { images };
  }
  return {};
}

/** Every field the sync handles, with its current value. */
function fields(section: Section): { path: string; kind: FieldKind; value: string }[] {
  const out: { path: string; kind: FieldKind; value: string }[] = [];
  for (const k of TEXT_COPY) out.push({ path: `copy.${k}`, kind: 'text', value: getField(section, `copy.${k}`) });
  out.push({ path: 'copy.cta_url', kind: 'href', value: getField(section, 'copy.cta_url') });
  (section.items ?? []).forEach((it, i) => {
    for (const k of ITEM_TEXT) out.push({ path: `items.${i}.${k}`, kind: 'text', value: String(it[k] ?? '') });
    out.push({ path: `items.${i}.image`, kind: 'src', value: String(it.image ?? '') });
    out.push({ path: `items.${i}.link`, kind: 'href', value: String(it.link ?? '') });
  });
  (section.images ?? []).forEach((im, i) => out.push({ path: `images.${i}`, kind: 'src', value: String(im.src ?? '') }));
  return out;
}

// ── instructions for the generator ──

export function markInstructions(sections: Section[]): string {
  const list = [...sections].sort((a, b) => a.sort_order - b.sort_order).map((s, i) => {
    const f = fields(s).filter(x => x.kind !== 'href' && x.value.trim()).map(x => x.path);
    return `${i + 1}. ${s.section_name || s.section_type} → data-bpm-s="${s.id}"${f.length ? ` · fields: ${f.join(', ')}` : ''}`;
  });
  return `=== ELEMENT MARKS (required, invisible) ===
Add these attributes so the app can keep the prototype and the blueprint in sync:
- On the outer element of each blueprint section: data-bpm-s="<id below>".
- On the element that directly shows a field's text: data-bpm-f="<field>" — e.g. <h2 data-bpm-f="copy.headline">…</h2>, <a data-bpm-f="copy.cta_text" href="…">…</a>, <h3 data-bpm-f="items.2.title">…</h3>. For images: <img data-bpm-f="images.0" …> or <img data-bpm-f="items.1.image" …>.
- Put the mark on the smallest element that contains exactly that text. Never on elements you invent. Keep existing marks when revising. Repeated copies (e.g. slider clones) keep the same marks.
${list.join('\n')}`;
}

// ── prototype → sections ──

/** Text of an element with a trailing decoration (→, ›, »…) separated. */
function splitSuffix(text: string, value: string): string | null {
  const t = norm(text);
  const v = norm(value);
  if (!v) return null;
  if (t === v) return '';
  if (t.startsWith(v) && /^[\s\W_]{1,4}$/u.test(t.slice(v.length)) && !/[\p{L}\p{N}]/u.test(t.slice(v.length))) return t.slice(v.length);
  return null;
}

/** Strip the decoration again when saving the new text into the section. */
export function cleanNewText(newText: string, oldText: string, oldValue: string): string {
  const suffix = splitSuffix(oldText, oldValue) ?? '';
  const t = norm(newText);
  return suffix && t.endsWith(suffix) ? t.slice(0, -suffix.length).trim() : t;
}

/**
 * Which section field does this element show?
 * `oldValue` is the element's text (kind text), image src (src) or href (href) BEFORE the edit.
 */
export function fieldForEdit(el: Element, kind: FieldKind, oldValue: string, sections: Section[]): FieldRef | null {
  const byId = new Map(sections.map(s => [s.id, s]));
  // 1. marks
  const sEl = el.closest('[data-bpm-s]');
  const sid = sEl?.getAttribute('data-bpm-s') ?? '';
  const marked = el.getAttribute('data-bpm-f') ?? '';
  if (sid && byId.has(sid) && marked) {
    let path = marked;
    if (kind === 'href') {
      if (marked === 'copy.cta_text') path = 'copy.cta_url';
      else if (/^items\.\d+\.title$/.test(marked)) path = marked.replace(/title$/, 'link');
      else return null;
    }
    if (kind === 'text' && !/^(copy\.(headline|subheadline|body|cta_text)|items\.\d+\.(title|description))$/.test(path)) return null;
    if (kind === 'src' && !/^(images\.\d+|items\.\d+\.image)$/.test(path)) return null;
    return { sectionId: sid, path, kind };
  }
  // 2. exact matching (older prototypes) — only when the match is unique
  const pool = sid && byId.has(sid) ? [byId.get(sid)!] : sections;
  const hits: FieldRef[] = [];
  for (const s of pool) {
    for (const f of fields(s)) {
      if (f.kind !== kind || !f.value.trim()) continue;
      const ok = kind === 'text' ? splitSuffix(oldValue, f.value) !== null : f.value.trim() === oldValue.trim();
      if (ok) hits.push({ sectionId: s.id, path: f.path, kind });
    }
  }
  return hits.length === 1 ? hits[0] : null;
}

// ── sections → prototype ──

const INLINE = /^(A|SPAN|STRONG|EM|B|I|U|S|BR|SMALL|SUP|SUB|MARK|CODE)$/;
const SIMPLE = /^(copy\.(headline|subheadline|body|cta_text|cta_url)|items\.\d+\.(title|description|image|link)|images\.\d+)$/;

function changedPaths(oldS: Section, newS: Section): string[] | null {
  // anything other than copy / items / images changed → can't patch
  const keys: (keyof Section)[] = ['section_name', 'section_type', 'background_hex', 'headline_size', 'layout_variant', 'layout_description', 'notes', 'sort_order'];
  for (const k of keys) if (JSON.stringify(oldS[k]) !== JSON.stringify(newS[k])) return null;
  if (JSON.stringify(oldS.layout_contract) !== JSON.stringify(newS.layout_contract)) return null;
  if ((oldS.items ?? []).length !== (newS.items ?? []).length) return null;
  if ((oldS.images ?? []).length !== (newS.images ?? []).length) return null;
  // item icon / image alt etc. are not synced
  const strip = (s: Section) => JSON.stringify({
    items: (s.items ?? []).map(it => ({ ...it, title: '', description: '', image: '', link: '' })),
    images: (s.images ?? []).map(im => ({ ...im, src: '' })),
  });
  if (strip(oldS) !== strip(newS)) return null;
  const out: string[] = [];
  const all = new Set([...fields(oldS).map(f => f.path), ...fields(newS).map(f => f.path)]);
  for (const p of all) if (getField(oldS, p) !== getField(newS, p)) out.push(p);
  if (out.some(p => !SIMPLE.test(p))) return null;
  return out;
}

function targets(doc: Document, sectionId: string, path: string): Element[] {
  const esc = (v: string) => v.replace(/["\\]/g, '\\$&');
  const roots = [...doc.querySelectorAll(`[data-bpm-s="${esc(sectionId)}"]`)];
  const markPath = path === 'copy.cta_url' ? 'copy.cta_text' : path.replace(/\.link$/, '.title');
  const out: Element[] = [];
  for (const r of roots) {
    if (r.getAttribute('data-bpm-f') === markPath) out.push(r);
    r.querySelectorAll(`[data-bpm-f="${esc(markPath)}"]`).forEach(e => out.push(e));
  }
  return out;
}

/** Elements (anywhere) whose text equals the old value — fallback for unmarked prototypes. */
function textMatches(doc: Document, oldValue: string): Element[] {
  const v = norm(oldValue);
  if (!v) return [];
  return [...doc.body.querySelectorAll('h1,h2,h3,h4,h5,h6,p,a,button,span,li,strong,em,small,figcaption,blockquote,label,div')]
    .filter(e => [...e.querySelectorAll('*')].every(c => INLINE.test(c.tagName)) && splitSuffix(e.textContent ?? '', v) !== null)
    // innermost only
    .filter((e, _i, arr) => !arr.some(o => o !== e && e.contains(o)));
}

function setText(el: Element, oldValue: string, value: string) {
  const suffix = splitSuffix(el.textContent ?? '', oldValue) ?? '';
  el.textContent = value + (suffix ? ` ${suffix.trim()}` : '');
}

/**
 * Write changed text / image / link fields of one section into the prototype.
 * Returns the new HTML (trailing comments kept), or null when the change
 * can't be applied safely (then the prototype simply becomes "outdated").
 */
export function patchPrototype(html: string, oldS: Section, newS: Section): string | null {
  const paths = changedPaths(oldS, newS);
  if (!paths) return null;
  if (paths.length === 0) return html;
  const tail = (html.match(/(?:\s*<!-- bpm-[a-z]+(?::[a-z0-9]+)? -->)+\s*$/) ?? [''])[0];
  const doc = new DOMParser().parseFromString(html.slice(0, html.length - tail.length), 'text/html');
  for (const path of paths) {
    const oldV = getField(oldS, path);
    const newV = getField(newS, path);
    let els = targets(doc, newS.id, path);
    const kind: FieldKind = /cta_url$|\.link$/.test(path) ? 'href' : /^images\.|\.image$/.test(path) ? 'src' : 'text';
    if (els.length === 0 && oldV.trim()) {
      if (kind === 'text') els = textMatches(doc, oldV);
      else if (kind === 'src') els = [...doc.querySelectorAll('img')].filter(i => i.getAttribute('src') === oldV);
      else els = [...doc.querySelectorAll('a')].filter(a => a.getAttribute('href') === oldV);
      if (kind === 'text' && els.length !== 1) return null;
    }
    if (els.length === 0) return null;
    for (const el of els) {
      if (kind === 'text') setText(el, oldV, newV);
      else if (kind === 'src') {
        if (el.tagName !== 'IMG' || !/^(https?:|data:image\/|\/|\.)/i.test(newV.trim() || 'x:')) return null;
        el.setAttribute('src', newV);
        el.removeAttribute('srcset');
      } else {
        const a = el.tagName === 'A' ? el : el.closest('a');
        if (!a || /^\s*(javascript|vbscript):/i.test(newV)) return null;
        a.setAttribute('href', newV);
      }
    }
  }
  const doctype = doc.doctype ? `<!DOCTYPE ${doc.doctype.name}>` : '<!DOCTYPE html>';
  return `${doctype}\n${doc.documentElement.outerHTML}${tail ? `\n${tail.trim()}\n` : ''}`;
}

// ── copy.md ──

/** Replace one text in copy.md (first exact occurrence). Returns null when not found. */
export function replaceInCopyMd(copyMd: string, oldText: string, newText: string): string | null {
  const o = oldText.trim();
  if (!copyMd || !o || o === newText.trim()) return null;
  const idx = copyMd.indexOf(o);
  if (idx < 0) return null;
  return copyMd.slice(0, idx) + newText.trim() + copyMd.slice(idx + o.length);
}

/** Text fields that changed between two versions of a section: [old, new][] */
export function changedTexts(oldS: Section, newS: Section): [string, string][] {
  const out: [string, string][] = [];
  for (const f of fields(newS)) {
    if (f.kind !== 'text') continue;
    const o = getField(oldS, f.path);
    if (o.trim() && o !== f.value) out.push([o, f.value]);
  }
  return out;
}
