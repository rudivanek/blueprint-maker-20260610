// src/lib/syncStatus.ts
//
// Is a page's prototype in sync with its sections and the design?
// Used for the badges on the steps / tabs and the warning in Export.

import { isPreviewOutdated, previewSource } from './previewStamp';
import { readChanges } from './changeLog';
import type { Page, Project, Section } from '../types';

export type PrototypeState = 'none' | 'current' | 'outdated';

export interface SyncStatus {
  prototype: PrototypeState;
  /** entries in the page's change list */
  changes: number;
}

export function syncStatus(project: Pick<Project, 'design_md' | 'globals'>, page: Page, sections: Section[]): SyncStatus {
  const html = page.generated_html ?? '';
  const prototype: PrototypeState = !html
    ? 'none'
    : isPreviewOutdated(html, previewSource(project.design_md, project.globals, sections)) ? 'outdated' : 'current';
  return { prototype, changes: readChanges(page).length };
}
