import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Section } from '../types';
import { DEFAULT_COPY, DEFAULT_LAYOUT_CONTRACT, normalizeLayoutContract } from '../types';

function normalizeSection(raw: Record<string, unknown>): Section {
  return {
    ...(raw as Section),
    layout_contract: normalizeLayoutContract(raw.layout_contract),
  };
}

export function useSections(pageId: string | undefined) {
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSections = useCallback(async () => {
    if (!pageId) { setLoading(false); setSections([]); return; }
    const { data, error } = await supabase
      .from('sections')
      .select('*')
      .eq('page_id', pageId)
      .order('sort_order', { ascending: true });
    if (error) setError(error.message);
    else setSections((data as Record<string, unknown>[]).map(normalizeSection));
    setLoading(false);
  }, [pageId]);

  useEffect(() => { fetchSections(); }, [fetchSections]);

  const createSection = async (partial: Partial<Section> = {}): Promise<Section | null> => {
    if (!pageId) return null;
    const sortOrder = sections.length;
    const newSection = {
      page_id: pageId,
      section_name: partial.section_name || 'New Section',
      section_type: partial.section_type || 'Content (Full)',
      background_hex: partial.background_hex || '#ffffff',
      headline_size: partial.headline_size || '48px',
      layout_variant: partial.layout_variant || '',
      layout_description: partial.layout_description || '',
      layout_contract: normalizeLayoutContract(partial.layout_contract),
      copy: partial.copy || { ...DEFAULT_COPY },
      items: partial.items || [],
      images: partial.images || [],
      notes: partial.notes || '',
      sort_order: sortOrder,
    };
    const { data, error } = await supabase
      .from('sections')
      .insert(newSection)
      .select()
      .single();
    if (error) { setError(error.message); return null; }
    return normalizeSection(data as Record<string, unknown>);
  };

  const updateSection = useCallback(async (id: string, updates: Partial<Section>) => {
    const safeUpdates = updates.layout_contract !== undefined
      ? { ...updates, layout_contract: normalizeLayoutContract(updates.layout_contract) }
      : updates;
    const { error } = await supabase.from('sections').update(safeUpdates).eq('id', id);
    if (error) setError(error.message);
    else setSections(prev => prev.map(s => s.id === id ? { ...s, ...updates, layout_contract: normalizeLayoutContract(safeUpdates.layout_contract ?? s.layout_contract) } : s));
  }, []);

  const deleteSection = async (id: string) => {
    const { error } = await supabase.from('sections').delete().eq('id', id);
    if (error) setError(error.message);
    else setSections(prev => prev.filter(s => s.id !== id));
  };

  const reorderSections = async (reordered: Section[]) => {
    setSections(reordered);
    const updates = reordered.map((s, i) => ({ id: s.id, sort_order: i }));
    for (const u of updates) {
      await supabase.from('sections').update({ sort_order: u.sort_order }).eq('id', u.id);
    }
  };

  const bulkCreateSections = async (sectionList: Partial<Section>[]) => {
    if (!pageId) return;
    const toInsert = sectionList.map((s, i) => ({
      page_id: pageId,
      section_name: s.section_name || `Section ${i + 1}`,
      section_type: s.section_type || 'Content (Full)',
      background_hex: s.background_hex || '#ffffff',
      headline_size: s.headline_size || '48px',
      layout_variant: s.layout_variant || '',
      layout_description: s.layout_description || '',
      layout_contract: normalizeLayoutContract(s.layout_contract),
      copy: s.copy || { ...DEFAULT_COPY },
      items: s.items || [],
      images: s.images || [],
      notes: s.notes || '',
      sort_order: sections.length + i,
    }));
    const { data, error } = await supabase.from('sections').insert(toInsert).select();
    if (error) setError(error.message);
    else setSections(prev => [...prev, ...(data as Record<string, unknown>[]).map(normalizeSection)]);
  };

  const replaceAllSections = async (sectionList: Partial<Section>[]) => {
    if (!pageId) return;
    const { error: delError } = await supabase.from('sections').delete().eq('page_id', pageId);
    if (delError) { setError(delError.message); return; }
    setSections([]);
    if (sectionList.length === 0) return;
    const toInsert = sectionList.map((s, i) => ({
      page_id: pageId,
      section_name: s.section_name || `Section ${i + 1}`,
      section_type: s.section_type || 'Content (Full)',
      background_hex: s.background_hex || '#ffffff',
      headline_size: s.headline_size || '48px',
      layout_variant: s.layout_variant || '',
      layout_description: s.layout_description || '',
      layout_contract: normalizeLayoutContract(s.layout_contract),
      copy: s.copy || { ...DEFAULT_COPY },
      items: s.items || [],
      images: s.images || [],
      notes: s.notes || '',
      sort_order: i,
    }));
    const { data, error } = await supabase.from('sections').insert(toInsert).select();
    if (error) setError(error.message);
    else setSections((data as Record<string, unknown>[]).map(normalizeSection));
  };

  return { sections, loading, error, createSection, updateSection, deleteSection, reorderSections, bulkCreateSections, replaceAllSections, refetch: fetchSections };
}
