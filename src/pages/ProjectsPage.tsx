import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Globe, Clock, Trash2, Loader2, FolderOpen, ExternalLink, ArrowRight } from 'lucide-react';
import { useProjects } from '../hooks/useProjects';
import type { User } from '@supabase/supabase-js';

interface ProjectsPageProps {
  user: User;
}

export function ProjectsPage({ user }: ProjectsPageProps) {
  const navigate = useNavigate();
  const { projects, loading, createProject, deleteProject } = useProjects(user.id);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    const project = await createProject(newName.trim(), newUrl.trim());
    setCreating(false);
    if (project) {
      setShowNewModal(false);
      setNewName('');
      setNewUrl('');
      navigate(`/editor/${project.id}`);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Delete this project? This cannot be undone.')) return;
    setDeletingId(id);
    await deleteProject(id);
    setDeletingId(null);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="flex-1 overflow-auto bg-white">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-sm font-semibold text-[#111827]">Projects</h1>
            <p className="text-[#9CA3AF] text-sm mt-0.5">Blueprint files for AI-powered prototyping</p>
          </div>
          <button
            onClick={() => setShowNewModal(true)}
            className="flex items-center gap-2 bg-[#2575FC] hover:bg-[#1a5fe0] text-white text-sm font-medium px-4 py-2 rounded-none transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Project
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 text-[#9CA3AF] animate-spin" />
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-24">
            <div className="w-16 h-16 border border-[#E5E7EB] flex items-center justify-center mx-auto mb-4">
              <FolderOpen className="w-7 h-7 text-[#9CA3AF]" />
            </div>
            <h3 className="text-[#111827] font-medium mb-2">No projects yet</h3>
            <p className="text-[#9CA3AF] text-sm mb-6 max-w-xs mx-auto">Create your first project to start generating blueprint files from any website.</p>
            <button
              onClick={() => setShowNewModal(true)}
              className="flex items-center gap-2 bg-[#2575FC] hover:bg-[#1a5fe0] text-white text-sm font-medium px-5 py-2.5 rounded-none transition-colors mx-auto"
            >
              <Plus className="w-4 h-4" />
              Create First Project
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map(project => (
              <div
                key={project.id}
                onClick={() => navigate(`/editor/${project.id}`)}
                className="group relative bg-white border border-[#E5E7EB] p-5 cursor-pointer hover:border-[#2575FC] transition-all"
              >
                {project.screenshot_url ? (
                  <div className="w-full h-32 overflow-hidden mb-4 bg-[#F9FAFB] border border-[#E5E7EB]">
                    <img src={project.screenshot_url} alt={project.name} className="w-full h-full object-cover object-top opacity-80 group-hover:opacity-100 transition-opacity" />
                  </div>
                ) : (
                  <div className="w-full h-32 bg-[#F9FAFB] border border-[#E5E7EB] flex items-center justify-center mb-4">
                    <Globe className="w-8 h-8 text-[#E5E7EB]" />
                  </div>
                )}

                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[#111827] font-medium text-sm truncate">{project.name}</h3>
                    {project.url && (
                      <p className="text-[#9CA3AF] text-xs mt-0.5 truncate flex items-center gap-1">
                        <Globe className="w-3 h-3 shrink-0" />
                        {project.url.replace(/^https?:\/\//, '')}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={e => handleDelete(e, project.id)}
                    disabled={deletingId === project.id}
                    className="opacity-0 group-hover:opacity-100 w-7 h-7 flex items-center justify-center text-[#9CA3AF] hover:text-red-500 hover:bg-red-50 transition-all shrink-0"
                  >
                    {deletingId === project.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </div>

                <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-[#E5E7EB]">
                  <Clock className="w-3 h-3 text-[#9CA3AF]" />
                  <span className="text-[#9CA3AF] text-xs">{formatDate(project.updated_at)}</span>
                  <ArrowRight className="w-3 h-3 text-[#2575FC] ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showNewModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowNewModal(false)}>
          <div className="bg-white border border-[#E5E7EB] p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-[#111827] font-semibold text-sm mb-1">New Project</h2>
            <p className="text-[#9CA3AF] text-sm mb-5">Start a new blueprint project</p>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="text-xs text-[#111827] font-medium mb-1.5 block">Project Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="e.g. Acme Corp Homepage"
                  required
                  autoFocus
                  className="w-full bg-white border border-[#E5E7EB] rounded-none px-3 py-2.5 text-sm text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:border-[#2575FC] transition-all"
                />
              </div>
              <div>
                <label className="text-xs text-[#111827] font-medium mb-1.5 block">Website URL <span className="text-[#9CA3AF]">(optional)</span></label>
                <input
                  type="url"
                  value={newUrl}
                  onChange={e => setNewUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full bg-white border border-[#E5E7EB] rounded-none px-3 py-2.5 text-sm text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:border-[#2575FC] transition-all"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="flex-1 bg-white hover:bg-[#F9FAFB] text-[#111827] text-sm font-medium py-2.5 rounded-none border border-[#E5E7EB] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !newName.trim()}
                  className="flex-1 bg-[#2575FC] hover:bg-[#1a5fe0] text-white text-sm font-medium py-2.5 rounded-none transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
