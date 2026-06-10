import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Page } from '../types';

export function usePages(projectId: string | undefined) {
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPages = useCallback(async () => {
    if (!projectId) { setLoading(false); return; }
    const { data, error } = await supabase
      .from('pages')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true });
    if (error) setError(error.message);
    else setPages(data as Page[]);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchPages(); }, [fetchPages]);

  const createPage = async (pageName: string, slug: string): Promise<Page | null> => {
    if (!projectId) return null;
    const sortOrder = pages.length;
    const { data, error } = await supabase
      .from('pages')
      .insert({
        project_id: projectId,
        page_name: pageName,
        slug,
        purpose: '',
        primary_cta: '',
        seo_title: '',
        seo_description: '',
        screenshot_url: '',
        sort_order: sortOrder,
      })
      .select()
      .single();
    if (error) { setError(error.message); return null; }
    setPages(prev => [...prev, data as Page]);
    return data as Page;
  };

  const updatePage = useCallback(async (id: string, updates: Partial<Page>) => {
    const { error } = await supabase.from('pages').update(updates).eq('id', id);
    if (error) setError(error.message);
    else setPages(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  }, []);

  const deletePage = async (id: string) => {
    const { error } = await supabase.from('pages').delete().eq('id', id);
    if (error) setError(error.message);
    else setPages(prev => prev.filter(p => p.id !== id));
  };

  const reorderPages = async (reordered: Page[]) => {
    setPages(reordered);
    for (let i = 0; i < reordered.length; i++) {
      await supabase.from('pages').update({ sort_order: i }).eq('id', reordered[i].id);
    }
  };

  return { pages, loading, error, createPage, updatePage, deletePage, reorderPages, refetch: fetchPages };
}
