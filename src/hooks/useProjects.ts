import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Project, GlobalSettings, ProjectPreset } from '../types';
import { DEFAULT_GLOBALS } from '../types';

export interface NewProjectExtras {
  preset?: ProjectPreset;
  design_url?: string;
  brief?: string;
  /** e.g. a design.md uploaded in the wizard (restyle preset) */
  design_md?: string;
  firstPage?: { name: string; slug: string; url?: string };
}

export function useProjects(userId: string | undefined) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('projects')
      // The list only needs card fields (design.md and globals are loaded in the editor).
      .select('id, user_id, name, url, screenshot_url, preset, created_at, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    if (error) setError(error.message);
    else setProjects(data as unknown as Project[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const createProject = async (
    name: string,
    url: string,
    extras: NewProjectExtras = {},
  ): Promise<Project | null> => {
    if (!userId) return null;
    const base = { user_id: userId, name, url, globals: DEFAULT_GLOBALS, design_md: extras.design_md ?? '', screenshot_url: '' };
    const withPreset = { ...base, preset: extras.preset ?? '', design_url: extras.design_url ?? '', brief: extras.brief ?? '' };

    let { data, error } = await supabase.from('projects').insert(withPreset).select().single();
    // If the preset migration has not been applied yet, still create the project.
    if (error && /preset|design_url|brief/i.test(error.message)) {
      console.warn('Preset columns missing — run the Step 4 migration. Creating project without preset.', error.message);
      ({ data, error } = await supabase.from('projects').insert(base).select().single());
    }
    if (error || !data) { setError(error?.message ?? 'Could not create project'); return null; }

    // Presets start with a first page so the editor opens ready to work.
    if (extras.firstPage) {
      const { error: pageErr } = await supabase.from('pages').insert({
        project_id: (data as Project).id,
        page_name: extras.firstPage.name,
        slug: extras.firstPage.slug,
        purpose: '',
        primary_cta: '',
        seo_title: '',
        seo_description: '',
        screenshot_url: '',
        sort_order: 0,
        page_url: extras.firstPage.url ?? '',
      });
      if (pageErr) console.warn('Could not create first page:', pageErr.message);
    }

    await fetchProjects();
    return data as Project;
  };

  const updateProject = async (id: string, updates: Partial<Pick<Project, 'name' | 'url' | 'globals' | 'design_md' | 'screenshot_url' | 'preset' | 'design_url' | 'brief'>>) => {
    const { error } = await supabase.from('projects').update(updates).eq('id', id);
    if (error) setError(error.message);
    else setProjects(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  const deleteProject = async (id: string) => {
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) setError(error.message);
    else setProjects(prev => prev.filter(p => p.id !== id));
  };

  return { projects, loading, error, createProject, updateProject, deleteProject, refetch: fetchProjects };
}

export function useProject(projectId: string | undefined) {
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) { setLoading(false); return; }
    (async () => {
      const { data, error } = await supabase.from('projects').select('*').eq('id', projectId).maybeSingle();
      if (error) setError(error.message);
      else setProject(data as Project);
      setLoading(false);
    })();
  }, [projectId]);

  const updateGlobals = useCallback(async (globals: GlobalSettings) => {
    if (!projectId) return;
    const { error } = await supabase.from('projects').update({ globals }).eq('id', projectId);
    if (error) setError(error.message);
    else setProject(prev => prev ? { ...prev, globals } : prev);
  }, [projectId]);

  const updateDesignMd = useCallback(async (design_md: string) => {
    if (!projectId) return;
    const { error } = await supabase.from('projects').update({ design_md }).eq('id', projectId);
    if (error) setError(error.message);
    else setProject(prev => prev ? { ...prev, design_md } : prev);
  }, [projectId]);

  const updateProject = useCallback(async (updates: Partial<Project>) => {
    if (!projectId) return;
    const { error } = await supabase.from('projects').update(updates).eq('id', projectId);
    if (error) setError(error.message);
    else setProject(prev => prev ? { ...prev, ...updates } : prev);
  }, [projectId]);

  return { project, loading, error, updateGlobals, updateDesignMd, updateProject, setProject };
}

