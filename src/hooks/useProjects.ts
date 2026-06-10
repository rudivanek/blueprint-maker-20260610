import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Project, GlobalSettings } from '../types';
import { DEFAULT_GLOBALS } from '../types';

export function useProjects(userId: string | undefined) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    if (error) setError(error.message);
    else setProjects(data as Project[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const createProject = async (name: string, url: string): Promise<Project | null> => {
    if (!userId) return null;
    const { data, error } = await supabase
      .from('projects')
      .insert({ user_id: userId, name, url, globals: DEFAULT_GLOBALS, design_md: '', screenshot_url: '' })
      .select()
      .single();
    if (error) { setError(error.message); return null; }
    await fetchProjects();
    return data as Project;
  };

  const updateProject = async (id: string, updates: Partial<Pick<Project, 'name' | 'url' | 'globals' | 'design_md' | 'screenshot_url'>>) => {
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
