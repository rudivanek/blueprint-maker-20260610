import { useState, useCallback, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Plus, Layers, FileText, Download, Loader2, X, Check, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Pencil } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { useProject } from '../hooks/useProjects';
import { usePages } from '../hooks/usePages';
import { useSections } from '../hooks/useSections';
import { Header } from '../components/Layout/Header';
import { GlobalSettingsPanel } from '../components/Editor/GlobalSettingsPanel';
import { SectionCard } from '../components/Editor/SectionCard';
import { SectionTemplateModal } from '../components/Editor/SectionTemplateModal';
import { DesignPanel } from '../components/Editor/DesignPanel';
import { DesignSourcePanel } from '../components/Editor/DesignSourcePanel';
import { ImportPanel } from '../components/Editor/ImportPanel';
import { ExportPanel } from '../components/Export/ExportPanel';
import { loadSettings } from '../lib/settings';
import { SECTION_TEMPLATES } from '../types';
import type { GlobalSettings, Section, Page } from '../types';

interface EditorPageProps {
  user: User;
}

type ActivePanel = 'sections' | 'design' | 'export';

export function EditorPage({ user }: EditorPageProps) {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const appSettings = loadSettings();
  const { project, loading: projectLoading, updateGlobals, updateDesignMd, updateProject } = useProject(projectId);
  const { pages, loading: pagesLoading, createPage, updatePage, deletePage, reorderPages } = usePages(projectId);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const { sections, createSection, updateSection, deleteSection, replaceAllSections } = useSections(activePageId || undefined);
  const [activePanel, setActivePanel] = useState<ActivePanel>('sections');
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showAddPage, setShowAddPage] = useState(false);
  const [newPageName, setNewPageName] = useState('');
  const [savedIndicator, setSavedIndicator] = useState(false);
  const [renamingPageId, setRenamingPageId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [showCustomInstructions, setShowCustomInstructions] = useState(false);
  const [showScreenshotPanel, setShowScreenshotPanel] = useState(false);

  // Per-page screenshots: map of pageId → screenshot data string
  const [screenshotMap, setScreenshotMap] = useState<Record<string, string>>({});

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const allSectionsRef = useRef<Record<string, Section[]>>({});

  useEffect(() => {
    if (pages.length > 0 && !activePageId) {
      setActivePageId(pages[0].id);
    }
  }, [pages, activePageId]);

  useEffect(() => {
    allSectionsRef.current[activePageId || ''] = sections;
  }, [sections, activePageId]);

  const triggerSaved = () => {
    setSavedIndicator(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => setSavedIndicator(false), 2000);
  };

  const handleGlobalsUpdate = useCallback(async (globals: GlobalSettings) => {
    await updateGlobals(globals);
    triggerSaved();
  }, [updateGlobals]);

  const handleDesignMdUpdate = useCallback(async (design_md: string) => {
    await updateDesignMd(design_md);
    triggerSaved();
  }, [updateDesignMd]);

  const handleSectionUpdate = useCallback(async (id: string, updates: Partial<Section>) => {
    await updateSection(id, updates);
    triggerSaved();
  }, [updateSection]);

  const handleAddSection = async (templateName: string) => {
    setShowTemplateModal(false);
    if (templateName === 'blank') {
      await createSection();
    } else {
      const template = SECTION_TEMPLATES[templateName];
      if (template) {
        await createSection({ ...template, section_name: templateName });
      }
    }
    triggerSaved();
  };

  const handleAddPage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPageName.trim()) return;
    const slug = newPageName.toLowerCase().replace(/\s+/g, '-');
    const page = await createPage(newPageName.trim(), slug);
    if (page) {
      setActivePageId(page.id);
      setShowAddPage(false);
      setNewPageName('');
    }
  };

  const handleDeletePage = async (e: React.MouseEvent, pageId: string) => {
    e.stopPropagation();
    if (pages.length <= 1) return;
    if (!confirm('Delete this page and all its sections?')) return;
    await deletePage(pageId);
    if (activePageId === pageId) {
      const remaining = pages.filter(p => p.id !== pageId);
      setActivePageId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  const handleRenamePage = async (pageId: string) => {
    if (!renameValue.trim()) { setRenamingPageId(null); return; }
    await updatePage(pageId, { page_name: renameValue.trim() });
    setRenamingPageId(null);
    triggerSaved();
  };

  const startRename = (e: React.MouseEvent, page: Page) => {
    e.stopPropagation();
    setRenamingPageId(page.id);
    setRenameValue(page.page_name);
  };

  const handleMovePage = async (pageId: string, direction: 'left' | 'right') => {
    const idx = pages.findIndex(p => p.id === pageId);
    if (idx === -1) return;
    const newIdx = direction === 'left' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= pages.length) return;
    const reordered = [...pages];
    [reordered[idx], reordered[newIdx]] = [reordered[newIdx], reordered[idx]];
    await reorderPages(reordered);
  };

  const handleStructureImported = async (importedSections: Partial<Section>[], importedGlobals: Partial<GlobalSettings>, screenshot?: string) => {
    if (project && importedGlobals && Object.keys(importedGlobals).length > 0) {
      await updateGlobals({ ...project.globals, ...importedGlobals });
    }
    if (screenshot && activePageId) {
      setScreenshotMap(prev => ({ ...prev, [activePageId]: screenshot }));
    }
    await replaceAllSections(importedSections);
    triggerSaved();
  };

  const handlePageUrlChange = async (url: string) => {
    if (activePageId) {
      await updatePage(activePageId, { page_url: url });
    }
  };

  const handleScreenshotUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activePageId) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const result = ev.target?.result as string;
      if (result) setScreenshotMap(prev => ({ ...prev, [activePageId]: result }));
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRemoveScreenshot = () => {
    if (activePageId) {
      setScreenshotMap(prev => { const next = { ...prev }; delete next[activePageId]; return next; });
    }
  };

  const handleDesignGenerated = async (designMd: string) => {
    await updateDesignMd(designMd);
    triggerSaved();
  };

  const handleProjectUrlChange = async (url: string) => {
    if (project && url !== project.url) {
      await updateProject({ url });
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
        e.preventDefault();
        setActivePanel('export');
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'n' && activePageId) {
        e.preventDefault();
        setShowTemplateModal(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activePageId]);

  if (projectLoading || pagesLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-[#9CA3AF] animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center">
        <p className="text-[#9CA3AF] mb-4">Project not found</p>
        <button onClick={() => navigate('/')} className="text-[#2575FC] text-sm hover:underline">Back to projects</button>
      </div>
    );
  }

  const activePage = pages.find(p => p.id === activePageId) || null;
  const allSectionsMap: Record<string, Section[]> = { ...allSectionsRef.current };
  allSectionsMap[activePageId || ''] = sections;

  const panelButtons: { id: ActivePanel; icon: typeof Layers; label: string }[] = [
    { id: 'sections', icon: Layers, label: 'Sections' },
    { id: 'design', icon: FileText, label: 'Design' },
    { id: 'export', icon: Download, label: 'Export' },
  ];

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Header
        user={user}
        onSignOut={() => {}}
        breadcrumbs={[{ label: 'Projects', href: '/' }, { label: project.name }]}
        rightSlot={
          <div className="flex items-center gap-2">
            {savedIndicator && (
              <span className="flex items-center gap-1 text-xs text-green-600 animate-fade-in">
                <Check className="w-3 h-3" /> Saved
              </span>
            )}
          </div>
        }
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar */}
        <div className="w-64 bg-[#F9FAFB] border-r border-[#E5E7EB] flex flex-col shrink-0 overflow-hidden">
          {/* Panel tabs */}
          <div className="flex border-b border-[#E5E7EB] px-2 pt-2">
            {panelButtons.map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => setActivePanel(id)}
                className={`flex-1 flex flex-col items-center gap-1 py-2 text-[10px] font-medium transition-all ${activePanel === id ? 'bg-white text-[#2575FC] border-t border-l border-r border-[#E5E7EB] -mb-px relative z-10' : 'text-[#9CA3AF] hover:text-[#111827]'}`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-auto">
            {activePanel === 'sections' && (
              <div className="p-3">
                <GlobalSettingsPanel
                  globals={project.globals}
                  onUpdate={handleGlobalsUpdate}
                />
                {/* Project URL fallback field */}
                <div className="bg-white border border-[#E5E7EB] p-4">
                  <label className="text-[10px] text-[#9CA3AF] font-medium uppercase tracking-wider mb-1.5 block">Default Project URL</label>
                  <input
                    type="url"
                    defaultValue={project.url}
                    onBlur={e => handleProjectUrlChange(e.target.value)}
                    placeholder="https://example.com"
                    className="w-full bg-white border border-[#E5E7EB] rounded-none px-3 py-2 text-sm text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:border-[#2575FC] transition-all"
                  />
                  <p className="text-[10px] text-[#9CA3AF] mt-1.5">Used when a page has no URL override.</p>
                </div>
              </div>
            )}

            {activePanel === 'design' && (
              <div className="h-full flex flex-col">
                <DesignPanel
                  designMd={project.design_md}
                  onChange={handleDesignMdUpdate}
                  topSlot={
                    <DesignSourcePanel
                      projectUrl={project.url}
                      appSettings={appSettings}
                      onDesignGenerated={handleDesignGenerated}
                    />
                  }
                />
              </div>
            )}

            {activePanel === 'export' && (
              <div className="h-full">
                <ExportPanel
                  project={project}
                  pages={pages}
                  allSections={allSectionsMap}
                  activePage={activePage}
                  activeSections={sections}
                  screenshotMap={screenshotMap}
                />
              </div>
            )}
          </div>
        </div>

        {/* Main content area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Page tabs */}
          <div className="flex items-center gap-1 px-3 py-2 border-b border-[#E5E7EB] bg-[#F9FAFB] overflow-x-auto shrink-0">
            {pages.map((page, idx) => (
              <div key={page.id} className="relative group/tab shrink-0 flex items-center">
                {renamingPageId === page.id ? (
                  <form
                    onSubmit={e => { e.preventDefault(); handleRenamePage(page.id); }}
                    className="flex items-center gap-1"
                  >
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onBlur={() => handleRenamePage(page.id)}
                      className="w-28 bg-white border border-[#2575FC] rounded-none px-2 py-1 text-xs text-[#111827] focus:outline-none"
                    />
                  </form>
                ) : (
                  <button
                    onClick={() => setActivePageId(page.id)}
                    onDoubleClick={e => startRename(e, page)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all ${activePageId === page.id ? 'bg-white text-[#2575FC] border border-[#E5E7EB] border-b-white' : 'text-[#9CA3AF] hover:text-[#111827] hover:bg-white'}`}
                  >
                    {page.page_name}
                    {screenshotMap[page.id] && (
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" title="Has screenshot" />
                    )}
                  </button>
                )}

                {/* Tab controls shown on hover */}
                <div className="absolute -top-1 right-0 hidden group-hover/tab:flex items-center gap-0.5 bg-white border border-[#E5E7EB] px-0.5">
                  <button
                    onClick={() => handleMovePage(page.id, 'left')}
                    disabled={idx === 0}
                    className="p-0.5 text-[#9CA3AF] hover:text-[#2575FC] disabled:opacity-20 transition-colors"
                    title="Move left"
                  >
                    <ChevronLeft className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => handleMovePage(page.id, 'right')}
                    disabled={idx === pages.length - 1}
                    className="p-0.5 text-[#9CA3AF] hover:text-[#2575FC] disabled:opacity-20 transition-colors"
                    title="Move right"
                  >
                    <ChevronRight className="w-3 h-3" />
                  </button>
                  <button
                    onClick={e => startRename(e, page)}
                    className="p-0.5 text-[#9CA3AF] hover:text-[#2575FC] transition-colors"
                    title="Rename"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  {pages.length > 1 && (
                    <button
                      onClick={e => handleDeletePage(e, page.id)}
                      className="p-0.5 text-[#9CA3AF] hover:text-red-500 transition-colors"
                      title="Delete page"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            ))}

            {!showAddPage ? (
              <button
                onClick={() => setShowAddPage(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-[#9CA3AF] hover:text-[#2575FC] hover:bg-white text-xs transition-all shrink-0"
              >
                <Plus className="w-3.5 h-3.5" /> Add Page
              </button>
            ) : (
              <form onSubmit={handleAddPage} className="flex items-center gap-1 shrink-0">
                <input
                  type="text"
                  value={newPageName}
                  onChange={e => setNewPageName(e.target.value)}
                  placeholder="Page name"
                  autoFocus
                  className="w-28 bg-white border border-[#E5E7EB] rounded-none px-2 py-1 text-xs text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:border-[#2575FC]"
                />
                <button type="submit" className="text-[#2575FC] hover:text-[#1a5fe0] transition-colors"><Check className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={() => { setShowAddPage(false); setNewPageName(''); }} className="text-[#9CA3AF] hover:text-[#111827] transition-colors"><X className="w-3.5 h-3.5" /></button>
              </form>
            )}
          </div>

          {/* Sections list */}
          <div className="flex-1 overflow-auto px-5 py-5">
            {!activePage ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Layers className="w-8 h-8 text-[#E5E7EB] mb-3" />
                <h3 className="text-[#9CA3AF] font-medium mb-2">No pages yet</h3>
                <p className="text-[#9CA3AF] text-sm mb-4">Add a page to start building sections</p>
                <button onClick={() => setShowAddPage(true)} className="flex items-center gap-2 text-[#2575FC] text-sm hover:underline">
                  <Plus className="w-4 h-4" /> Add First Page
                </button>
              </div>
            ) : (
              <>
                {/* Per-page import */}
                <ImportPanel
                  projectUrl={project.url}
                  pageUrl={activePage.page_url || ''}
                  appSettings={appSettings}
                  onStructureImported={handleStructureImported}
                  onPageUrlChange={handlePageUrlChange}
                />

                {/* Page info bar */}
                <div className="bg-white border border-[#E5E7EB] px-4 py-3 mb-4">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {([
                      { label: 'Slug', field: 'slug' as const, value: activePage.slug, placeholder: '/home' },
                      { label: 'Purpose', field: 'purpose' as const, value: activePage.purpose, placeholder: 'Main landing page' },
                      { label: 'SEO Title', field: 'seo_title' as const, value: activePage.seo_title, placeholder: 'Page Title' },
                      { label: 'SEO Description', field: 'seo_description' as const, value: activePage.seo_description, placeholder: 'Meta description' },
                    ] as const).map(({ label, field, value, placeholder }) => (
                      <div key={field}>
                        <label className="text-[10px] text-[#9CA3AF] font-medium uppercase tracking-wider mb-1 block">{label}</label>
                        <input
                          type="text"
                          defaultValue={value}
                          placeholder={placeholder}
                          onBlur={e => { updatePage(activePage.id, { [field]: e.target.value }); triggerSaved(); }}
                          className="w-full bg-white border border-[#E5E7EB] rounded-none px-2 py-1.5 text-xs text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:border-[#2575FC] transition-all"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Custom Instructions (collapsible) */}
                <div className="bg-white border border-[#E5E7EB] mb-4">
                  <button
                    onClick={() => setShowCustomInstructions(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[#111827] text-sm font-medium">Custom Instructions</span>
                      {activePage.custom_instructions && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-[#2575FC]/10 text-[#2575FC] font-medium">Active</span>
                      )}
                    </div>
                    {showCustomInstructions
                      ? <ChevronUp className="w-4 h-4 text-[#9CA3AF]" />
                      : <ChevronDown className="w-4 h-4 text-[#9CA3AF]" />}
                  </button>
                  {showCustomInstructions && (
                    <div className="px-4 pb-4 border-t border-[#E5E7EB] pt-3">
                      <p className="text-[10px] text-[#9CA3AF] mb-2">Instructions specific to this page. E.g. "Make the hero taller", "Add a contact form at the bottom".</p>
                      <textarea
                        defaultValue={activePage.custom_instructions}
                        onBlur={e => { updatePage(activePage.id, { custom_instructions: e.target.value }); triggerSaved(); }}
                        rows={4}
                        placeholder="Enter page-specific instructions..."
                        className="w-full bg-white border border-[#E5E7EB] rounded-none px-3 py-2 text-sm text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:border-[#2575FC] transition-all resize-none"
                      />
                    </div>
                  )}
                </div>

                {/* Screenshot (collapsible) */}
                <div className="bg-white border border-[#E5E7EB] mb-4">
                  <button
                    onClick={() => setShowScreenshotPanel(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[#111827] text-sm font-medium">Screenshot</span>
                      {activePageId && screenshotMap[activePageId] && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 font-medium">Captured</span>
                      )}
                    </div>
                    {showScreenshotPanel
                      ? <ChevronUp className="w-4 h-4 text-[#9CA3AF]" />
                      : <ChevronDown className="w-4 h-4 text-[#9CA3AF]" />}
                  </button>
                  {showScreenshotPanel && (
                    <div className="px-4 pb-4 border-t border-[#E5E7EB] pt-3 space-y-3">
                      {activePageId && screenshotMap[activePageId] ? (
                        <div>
                          <div className="relative overflow-hidden border border-[#E5E7EB] mb-2">
                            <img
                              src={screenshotMap[activePageId].startsWith('data:') || screenshotMap[activePageId].startsWith('http')
                                ? screenshotMap[activePageId]
                                : `data:image/jpeg;base64,${screenshotMap[activePageId]}`}
                              alt="Page screenshot"
                              className="w-full object-cover object-top max-h-36"
                            />
                          </div>
                          <button
                            onClick={handleRemoveScreenshot}
                            className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" /> Remove screenshot
                          </button>
                        </div>
                      ) : (
                        <div>
                          <p className="text-[10px] text-[#9CA3AF] mb-3">
                            Auto-capture happens during Import Structure. You can also upload a screenshot manually.
                          </p>
                          <label className="flex items-center justify-center gap-2 w-full py-2.5 bg-[#F9FAFB] hover:bg-white border border-dashed border-[#E5E7EB] hover:border-[#2575FC] text-sm text-[#9CA3AF] cursor-pointer transition-all">
                            <FileText className="w-4 h-4" />
                            Upload screenshot (.jpg / .png)
                            <input
                              type="file"
                              accept="image/jpeg,image/png"
                              className="hidden"
                              onChange={handleScreenshotUpload}
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Sections */}
                <div className="space-y-3">
                  {sections.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <div className="w-12 h-12 border border-[#E5E7EB] flex items-center justify-center mb-4">
                        <Layers className="w-5 h-5 text-[#9CA3AF]" />
                      </div>
                      <h3 className="text-[#9CA3AF] font-medium mb-1">No sections yet</h3>
                      <p className="text-[#9CA3AF] text-sm mb-5">Import from URL or add sections manually</p>
                      <button
                        onClick={() => setShowTemplateModal(true)}
                        className="flex items-center gap-2 bg-[#2575FC] hover:bg-[#1a5fe0] text-white text-sm font-medium px-4 py-2 rounded-none transition-colors"
                      >
                        <Plus className="w-4 h-4" /> Add Section
                      </button>
                    </div>
                  ) : (
                    sections.map(section => (
                      <SectionCard
                        key={section.id}
                        section={section}
                        onUpdate={updates => handleSectionUpdate(section.id, updates)}
                        onDelete={() => deleteSection(section.id)}
                      />
                    ))
                  )}
                </div>

                {sections.length > 0 && (
                  <div className="mt-4">
                    <button
                      onClick={() => setShowTemplateModal(true)}
                      className="w-full flex items-center justify-center gap-2 py-3 border border-dashed border-[#E5E7EB] hover:border-[#2575FC] text-[#9CA3AF] hover:text-[#2575FC] text-sm transition-all"
                    >
                      <Plus className="w-4 h-4" /> Add Section
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {showTemplateModal && (
        <SectionTemplateModal
          onSelect={handleAddSection}
          onClose={() => setShowTemplateModal(false)}
        />
      )}
    </div>
  );
}
