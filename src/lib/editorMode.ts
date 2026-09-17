// src/lib/editorMode.ts
//
// Editor mode per project, remembered in this browser:
//   kit      = Builder Kit (default for projects created after it was released)
//   guided   = step-by-step with prototype
//   advanced = the full editor
// Older projects keep their previous default (Guided for workflow projects, else Advanced).

import type { Project } from '../types';

export type EditorMode = 'kit' | 'guided' | 'advanced';

export const EDITOR_MODES: { id: EditorMode; label: string; hint: string }[] = [
  { id: 'kit', label: 'Builder Kit', hint: 'Only the files an AI builder needs: copy.md, design.md, blueprint.md … (+ optional quick preview)' },
  { id: 'guided', label: 'Guided', hint: 'Step by step, with the HTML prototype, chat and Edit on page' },
  { id: 'advanced', label: 'Advanced', hint: 'Every tool at once' },
];

/** Projects created from this moment on open in Builder Kit by default. */
export const KIT_SINCE = '2026-09-17T06:00:00Z';

const key = (projectId: string) => `bpm_mode_${projectId}`;

export function readMode(projectId: string | undefined): EditorMode | null {
  if (!projectId) return null;
  try {
    const v = localStorage.getItem(key(projectId));
    return v === 'kit' || v === 'guided' || v === 'advanced' ? v : null;
  } catch {
    return null;
  }
}

export function saveMode(projectId: string | undefined, mode: EditorMode) {
  if (!projectId) return;
  try { localStorage.setItem(key(projectId), mode); } catch { /* ignore */ }
}

/** Builder Kit: what the user wants from this project (decides which cards open first) */
export type KitFocus = 'design' | 'content' | 'both';

export const KIT_FOCUS: { id: KitFocus; label: string; hint: string }[] = [
  { id: 'both', label: 'Design + content', hint: 'design.md and the page content' },
  { id: 'design', label: 'Only design.md', hint: 'Colours, fonts and components — no page content' },
  { id: 'content', label: 'Only content', hint: 'copy.md, images.md, sections — no design system' },
];

const focusKey = (projectId: string) => `bpm_kit_focus_${projectId}`;

export function readKitFocus(projectId: string | undefined): KitFocus {
  if (!projectId) return 'both';
  try {
    const v = localStorage.getItem(focusKey(projectId));
    return v === 'design' || v === 'content' ? v : 'both';
  } catch {
    return 'both';
  }
}

export function saveKitFocus(projectId: string | undefined, focus: KitFocus) {
  if (!projectId) return;
  try { localStorage.setItem(focusKey(projectId), focus); } catch { /* ignore */ }
}

export function defaultMode(project: Pick<Project, 'preset' | 'created_at'>): EditorMode {
  if (!project.preset || project.preset === 'manual') return 'advanced';
  return project.created_at && project.created_at >= KIT_SINCE ? 'kit' : 'guided';
}
