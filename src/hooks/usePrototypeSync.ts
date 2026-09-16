// src/hooks/usePrototypeSync.ts
//
// Sections → prototype + copy.md (see lib/prototypeSync).
// Section edits (Review, Advanced editor) arrive keystroke by keystroke, so they
// are collected and applied 800 ms after the last change:
//  - text / image / link changes are written into the saved prototype, which
//    keeps it current (no "outdated" warning) — only if it was current before;
//  - changed texts are replaced in copy.md, so the export agrees.

import { useCallback, useEffect, useRef } from 'react';
import { changedTexts, patchPrototype, replaceInCopyMd } from '../lib/prototypeSync';
import { isPreviewOutdated, previewSource, stampHtml } from '../lib/previewStamp';
import type { Page, Project, Section } from '../types';

interface Args {
  project: Project | null;
  page: Page | null | undefined;
  sections: Section[];
  updatePage: (id: string, updates: Partial<Page>) => Promise<void> | void;
}

interface Base {
  pageId: string;
  sections: Section[];
  html: string;
  copyMd: string;
  wasCurrent: boolean;
}

export function usePrototypeSync({ project, page, sections, updatePage }: Args) {
  const latest = useRef({ project, page, sections, updatePage });
  latest.current = { project, page, sections, updatePage };
  const base = useRef<Base | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const b = base.current;
    base.current = null;
    const { project: pr, page: pg, sections: now, updatePage: save } = latest.current;
    if (!b || !pr || !pg || pg.id !== b.pageId) return;
    const updates: Partial<Page> = {};

    // copy.md
    let copyMd = b.copyMd;
    for (const s of now) {
      const old = b.sections.find(o => o.id === s.id);
      if (!old) continue;
      for (const [o, n] of changedTexts(old, s)) copyMd = replaceInCopyMd(copyMd, o, n) ?? copyMd;
    }
    if (copyMd !== b.copyMd && copyMd !== (pg.copy_md ?? '')) updates.copy_md = copyMd;

    // prototype
    if (b.wasCurrent && b.html && pg.generated_html === b.html) {
      let html: string | null = b.html;
      const oldIds = b.sections.map(s => s.id).join();
      if (oldIds !== now.map(s => s.id).join()) html = null; // sections added / removed / reordered
      for (const s of now) {
        if (!html) break;
        const old = b.sections.find(o => o.id === s.id);
        if (old) html = patchPrototype(html, old, s);
      }
      if (html) {
        const stamped = stampHtml(html, previewSource(pr.design_md, pr.globals, now));
        if (stamped !== b.html) updates.generated_html = stamped;
      }
    }
    if (Object.keys(updates).length) void save(pg.id, updates);
  }, []);

  /** Call BEFORE saving a section edit made in Review / the Advanced editor. */
  const noteSectionEdit = useCallback(() => {
    const { project: pr, page: pg, sections: now } = latest.current;
    if (!pr || !pg) return;
    if (!base.current) {
      const html = pg.generated_html ?? '';
      base.current = {
        pageId: pg.id,
        sections: now,
        html,
        copyMd: pg.copy_md ?? '',
        wasCurrent: !!html && !isPreviewOutdated(html, previewSource(pr.design_md, pr.globals, now)),
      };
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 800);
  }, [flush]);

  // switching pages: apply what is pending for the old page right away
  const pageId = page?.id;
  useEffect(() => () => { if (base.current && base.current.pageId === pageId) flush(); }, [pageId, flush]);

  return { noteSectionEdit };
}
