// src/lib/versions.ts
//
// Version history of a page's prototype (table prototype_versions).
// A snapshot is saved before the prototype is replaced; the newest
// KEEP_VERSIONS per page are kept. Restore = load a snapshot back.

import { supabase } from './supabase';
import type { PrototypeChange } from '../types';

export const KEEP_VERSIONS = 10;

export interface VersionInfo {
  id: string;
  label: string;
  created_at: string;
}

export async function listVersions(pageId: string): Promise<VersionInfo[]> {
  const { data, error } = await supabase
    .from('prototype_versions')
    .select('id, label, created_at')
    .eq('page_id', pageId)
    .order('created_at', { ascending: false })
    .limit(KEEP_VERSIONS);
  if (error) throw new Error(error.message);
  return (data ?? []) as VersionInfo[];
}

export async function loadVersion(id: string): Promise<{ html: string; changes: PrototypeChange[] }> {
  const { data, error } = await supabase
    .from('prototype_versions')
    .select('html, changes')
    .eq('id', id)
    .single();
  if (error) throw new Error(error.message);
  return { html: String(data?.html ?? ''), changes: Array.isArray(data?.changes) ? (data.changes as PrototypeChange[]) : [] };
}

/** Save a snapshot and drop the oldest beyond KEEP_VERSIONS. Never throws (history is best effort). */
export async function saveVersion(pageId: string, html: string, label: string, changes: PrototypeChange[]): Promise<boolean> {
  if (!html.trim()) return false;
  try {
    const { error } = await supabase
      .from('prototype_versions')
      .insert({ page_id: pageId, html, label: label.slice(0, 160), changes });
    if (error) return false;
    const { data } = await supabase
      .from('prototype_versions')
      .select('id')
      .eq('page_id', pageId)
      .order('created_at', { ascending: false })
      .range(KEEP_VERSIONS, KEEP_VERSIONS + 50);
    const old = (data ?? []).map(r => (r as { id: string }).id);
    if (old.length) await supabase.from('prototype_versions').delete().in('id', old);
    return true;
  } catch {
    return false;
  }
}
