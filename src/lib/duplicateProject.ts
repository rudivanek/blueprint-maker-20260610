// src/lib/duplicateProject.ts
//
// "Duplicate project": copies a project with all its pages and sections
// (design.md, texts, copy.md, images.md, generated prototypes, thumbnail).
// Everything is copied through the normal Supabase client, so the usual
// row-level security applies. If a step fails, the half-made copy is removed.

import type { SupabaseClient } from '@supabase/supabase-js';

type Row = Record<string, unknown>;

/** Columns the database fills in itself — never copied. */
const DROP = ['id', 'created_at', 'updated_at'];

function strip(row: Row, extra: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) if (!DROP.includes(k)) out[k] = v;
  return { ...out, ...extra };
}

export function copyName(name: string, existing: string[]): string {
  const base = name.replace(/ \(copy(?: \d+)?\)$/, '');
  let candidate = `${base} (copy)`;
  for (let n = 2; existing.includes(candidate); n++) candidate = `${base} (copy ${n})`;
  return candidate;
}

/**
 * Duplicates a project. Returns the new project id.
 * Also copies this browser's per-project settings (Guided/Advanced mode,
 * reviewed pages, "Write it for me" descriptions) to the new ids.
 */
export async function duplicateProject(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
  existingNames: string[] = [],
): Promise<string> {
  const { data: project, error: pErr } = await supabase.from('projects').select('*').eq('id', projectId).single();
  if (pErr || !project) throw new Error(pErr?.message ?? 'Project not found');

  const { data: newProject, error: npErr } = await supabase
    .from('projects')
    .insert(strip(project as Row, { user_id: userId, name: copyName(String((project as Row).name ?? 'Project'), existingNames) }))
    .select('id')
    .single();
  if (npErr || !newProject) throw new Error(`Could not create the copy: ${npErr?.message ?? 'unknown error'}`);
  const newId = (newProject as Row).id as string;

  try {
    const { data: pages, error: pgErr } = await supabase
      .from('pages').select('*').eq('project_id', projectId).order('sort_order', { ascending: true });
    if (pgErr) throw new Error(pgErr.message);

    const pageMap = new Map<string, string>();
    for (const page of (pages ?? []) as Row[]) {
      const { data: np, error: npgErr } = await supabase
        .from('pages').insert(strip(page, { project_id: newId })).select('id').single();
      if (npgErr || !np) throw new Error(npgErr?.message ?? 'Could not copy a page');
      pageMap.set(page.id as string, (np as Row).id as string);
    }

    if (pageMap.size > 0) {
      const { data: sections, error: sErr } = await supabase
        .from('sections').select('*').in('page_id', [...pageMap.keys()]).order('sort_order', { ascending: true });
      if (sErr) throw new Error(sErr.message);
      const rows = ((sections ?? []) as Row[]).map(s => strip(s, { page_id: pageMap.get(s.page_id as string) }));
      for (let i = 0; i < rows.length; i += 100) {
        const { error: insErr } = await supabase.from('sections').insert(rows.slice(i, i + 100));
        if (insErr) throw new Error(insErr.message);
      }
    }

    copyBrowserSettings(projectId, newId, pageMap);
    return newId;
  } catch (e) {
    // Remove the incomplete copy (pages and sections are deleted with it).
    await supabase.from('projects').delete().eq('id', newId);
    throw new Error(`Could not duplicate the project: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function copyBrowserSettings(oldProjectId: string, newProjectId: string, pageMap: Map<string, string>) {
  try {
    const pairs: [string, string][] = [
      [`bpm_mode_${oldProjectId}`, `bpm_mode_${newProjectId}`],
      [`bpm_guide_collapsed_${oldProjectId}`, `bpm_guide_collapsed_${newProjectId}`],
    ];
    for (const [oldPage, newPage] of pageMap) {
      pairs.push([`bpm_reviewed_${oldPage}`, `bpm_reviewed_${newPage}`]);
      pairs.push([`bpm_copybrief_${oldPage}`, `bpm_copybrief_${newPage}`]);
    }
    for (const [from, to] of pairs) {
      const v = localStorage.getItem(from);
      if (v !== null) localStorage.setItem(to, v);
    }
  } catch { /* browser storage is optional */ }
}
