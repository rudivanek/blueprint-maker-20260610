// src/components/Editor/BuilderKit.tsx
//
// Builder Kit mode (default for new projects): independent cards, used in any order —
//   Design          → design.md
//   Content         → copy.md, images.md, site.md, screenshot.jpg
//   Sections        → blueprint.md, fact-check.md          (needs content)
//   Builder prompt  → prompts, README.md, ZIP of what exists (needs design or content)
//   Quick preview   → prototype.html + changes.md          (optional; needs sections + design)
// Make only design.md, only the content, or both. Every file downloads on its own as soon as it exists.

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AlertTriangle, Archive, Check, ChevronDown, ChevronUp, Download, Eye, FileText, LayoutList, Loader2, Lock,
  Palette, Plus, ShieldCheck, Type, Wand2,
} from 'lucide-react';
import type { AppSettings, GlobalSettings, Page, Project, Section } from '../../types';
import { useExport } from '../../hooks/useExport';
import { BUILDERS, OUTPUTS, buildBuilderPrompt, comboLabel, combos, promptFileName, readTargets, saveTargets, type BuilderId, type ExportTargets, type OutputId, type PackageInfo } from '../../lib/builderPrompts';
import { KIT_STEP_LABEL, hasContent, kitFileText, kitFiles, kitReadme, saveBlob, saveText, screenshotBlob, type KitFile, type KitInput, type KitStepId } from '../../lib/kitFiles';
import { KIT_FOCUS, readKitFocus, saveKitFocus, type KitFocus } from '../../lib/editorMode';
import { changesMd, cleanPrototypeHtml, readChanges } from '../../lib/changeLog';
import { syncStatus } from '../../lib/syncStatus';
import { getPreset, AI_COPY_MARKER } from '../../lib/presets';
import { checkFabrication } from '../../lib/pageAssets';
import { cost } from '../../lib/models';
import { ding } from '../../lib/ding';
import { toast } from '../ui/Toast';
import { ImportPanel } from './ImportPanel';
import { DesignSourcePanel } from './DesignSourcePanel';
import { DesignPanel } from './DesignPanel';
import { SectionCard } from './SectionCard';
import { PreviewPanel } from './PreviewPanel';

// ---------------------------------------------------------------------------
// Downloads
// ---------------------------------------------------------------------------

async function downloadKitFile(f: KitFile, input: KitInput) {
  if (!f.ready) return;
  if (f.name === 'screenshot.jpg') {
    const blob = input.screenshot ? await screenshotBlob(input.screenshot) : null;
    if (blob) saveBlob(blob, f.name);
    else toast('The screenshot could not be read. Import the page again to get a new one.', 'error');
    return;
  }
  saveText(kitFileText(f.name, input), f.name);
}

function lockedNote(f: KitFile, input: KitInput): string {
  if (f.name === 'screenshot.jpg' && hasContent(input.page, input.sections)) return f.hint;
  if (f.step === 'sections') return hasContent(input.page, input.sections) ? 'Build the sections in Content' : 'After Content';
  return `After ${KIT_STEP_LABEL[f.step]}`;
}

function FileButton({ name, hint, ready, note, onClick }: {
  name: string; hint: string; ready: boolean; note?: string; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!ready}
      title={ready ? `Download ${name} — ${hint}` : note ?? hint}
      className={`flex items-center gap-2 px-2.5 py-1.5 border text-left min-w-0 transition-colors ${ready ? 'bg-white border-[#E5E7EB] hover:border-[#2575FC]' : 'bg-[#F9FAFB] border-dashed border-[#E5E7EB] cursor-not-allowed'}`}
    >
      {ready ? <Download className="w-3.5 h-3.5 text-[#2575FC] shrink-0" /> : <Lock className="w-3 h-3 text-[#D1D5DB] shrink-0" />}
      <span className="min-w-0">
        <span className={`block text-xs font-medium truncate ${ready ? 'text-[#111827]' : 'text-[#9CA3AF]'}`}>{name}</span>
        <span className="block text-[10px] text-[#9CA3AF] truncate">{ready ? hint : note ?? hint}</span>
      </span>
    </button>
  );
}

/** Small download chips. `step` = only that card's files. */
function FileChips({ input, step, label }: { input: KitInput; step?: KitStepId; label?: ReactNode }) {
  const files = kitFiles(input).filter(f => !step || f.step === step);
  if (!files.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label={step ? `${KIT_STEP_LABEL[step]} files` : 'Kit files'}>
      {label}
      {files.map(f => (
        <button
          key={f.name}
          type="button"
          disabled={!f.ready}
          onClick={e => { e.stopPropagation(); void downloadKitFile(f, input); }}
          title={f.ready ? `Download ${f.name} — ${f.hint}` : lockedNote(f, input)}
          className={`flex items-center gap-1 px-2 py-0.5 text-[11px] border ${f.ready ? 'bg-green-50 border-green-200 text-green-800 hover:border-green-500' : 'bg-white border-dashed border-[#E5E7EB] text-[#9CA3AF] cursor-not-allowed'}`}
        >
          {f.ready ? <Download className="w-3 h-3" /> : <Lock className="w-2.5 h-2.5" />}
          {f.name}
        </button>
      ))}
    </div>
  );
}

function Chip({ on, title, onClick, children }: { on: boolean; title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={on}
      className={`flex items-center gap-1 px-2.5 py-1 text-xs border transition-colors ${on ? 'bg-[#2575FC] border-[#2575FC] text-white' : 'bg-white border-[#E5E7EB] text-[#374151] hover:border-[#2575FC]'}`}
    >
      {on && <Check className="w-3 h-3" />}{children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Card frame
// ---------------------------------------------------------------------------

type Tone = 'done' | 'todo' | 'blocked';

function KitCard({ id, icon, title, desc, tone, status, open, onToggle, files, children }: {
  id: KitStepId; icon: ReactNode; title: string; desc: string; tone: Tone; status: string;
  open: boolean; onToggle: () => void; files?: ReactNode; children: ReactNode;
}) {
  const pill = tone === 'done'
    ? 'bg-green-50 border-green-200 text-green-700'
    : tone === 'blocked' ? 'bg-[#F9FAFB] border-[#E5E7EB] text-[#9CA3AF]' : 'bg-amber-50 border-amber-200 text-amber-700';
  return (
    <section id={`kit-${id}`} className={`border bg-white ${open ? 'border-[#2575FC]/40' : 'border-[#E5E7EB]'}`}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={onToggle}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
        className="flex items-start gap-3 px-5 py-4 cursor-pointer hover:bg-[#F9FAFB]"
      >
        <span className={`w-8 h-8 shrink-0 flex items-center justify-center border ${tone === 'done' ? 'bg-green-600 border-green-600 text-white' : 'border-[#E5E7EB] text-[#2575FC]'}`}>
          {tone === 'done' ? <Check className="w-4 h-4" /> : icon}
        </span>
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-2 flex-wrap">
            <span className="text-[15px] font-semibold text-[#111827]">{title}</span>
            <span className={`inline-flex items-center gap-1 px-1.5 py-px text-[10px] font-medium border ${pill}`}>
              {tone === 'blocked' && <Lock className="w-2.5 h-2.5" />}{status}
            </span>
          </span>
          <span className="block text-xs text-[#6B7280] mt-0.5">{desc}</span>
          {files && <span className="block mt-2">{files}</span>}
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-[#9CA3AF] shrink-0 mt-1" /> : <ChevronDown className="w-4 h-4 text-[#9CA3AF] shrink-0 mt-1" />}
      </div>
      {open && <div className="border-t border-[#E5E7EB]">{children}</div>}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function designSummary(md: string) {
  const colors = [...new Set((md.match(/#[0-9a-fA-F]{6}\b/g) ?? []).map(c => c.toUpperCase()))].slice(0, 8);
  const fromLink = [...md.matchAll(/family=([^:&"')\s]+)/g)].map(m => decodeURIComponent(m[1]).replace(/\+/g, ' '));
  return { colors, fonts: [...new Set(fromLink)].slice(0, 3) };
}
const countWords = (md?: string) => (md ? md.replace(/<!--[\s\S]*?-->/g, '').split(/\s+/).filter(w => /\w/.test(w)).length : 0);
const countImages = (md?: string) => (md?.match(/^- https?:\/\//gm) ?? []).length;
const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'site';

type CardId = KitStepId;
const openKey = (projectId: string) => `bpm_kit_open_${projectId}`;
function defaultOpen(focus: KitFocus): CardId[] {
  return focus === 'design' ? ['design'] : focus === 'content' ? ['content'] : ['design', 'content'];
}
function readOpen(projectId: string, focus: KitFocus): CardId[] {
  try {
    const raw = JSON.parse(localStorage.getItem(openKey(projectId)) ?? 'null');
    if (Array.isArray(raw)) return raw.filter((x): x is CardId => typeof x === 'string');
  } catch { /* ignore */ }
  return defaultOpen(focus);
}
function saveOpen(projectId: string, list: CardId[]) {
  try { localStorage.setItem(openKey(projectId), JSON.stringify(list)); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// The hub
// ---------------------------------------------------------------------------

export interface KitHubProps {
  project: Project;
  page: Page;
  sections: Section[];
  screenshotMap: Record<string, string>;
  appSettings: AppSettings;
  onStructureImported: (
    sections: Partial<Section>[],
    globals: Partial<GlobalSettings>,
    screenshotUrl?: string,
    assets?: { copyMd: string; imagesMd: string },
  ) => void;
  onPageUrlChange: (url: string) => void;
  onDesignGenerated: (designMd: string, meta?: { screenshot?: string; sourceUrl?: string }) => void;
  onDesignMdChange: (designMd: string) => void;
  onHtmlSaved: (pageId: string, html: string) => void;
  onSectionUpdate: (id: string, updates: Partial<Section>) => void;
  onSectionSync: (id: string, updates: Partial<Section>) => void;
  onSectionDelete: (id: string) => void;
  onSectionRestore?: (section: Section) => void;
  onAddSection: () => void;
  onPageUpdate: (updates: Partial<Page>) => void;
}

export function KitHub(p: KitHubProps) {
  const { project, page, sections } = p;
  const preset = getPreset(project.preset);
  const screenshot = p.screenshotMap[page.id];
  const input: KitInput = { project, page, sections, screenshot };

  const [focus, setFocus] = useState<KitFocus>(() => readKitFocus(project.id));
  const [open, setOpen] = useState<CardId[]>(() => readOpen(project.id, readKitFocus(project.id)));
  const toggle = (id: CardId) => setOpen(cur => {
    const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
    saveOpen(project.id, next);
    return next;
  });
  const openOnly = (id: CardId) => setOpen(cur => {
    const next = cur.includes(id) ? cur : [...cur, id];
    saveOpen(project.id, next);
    setTimeout(() => document.getElementById(`kit-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    return next;
  });
  const chooseFocus = (f: KitFocus) => {
    setFocus(f);
    saveKitFocus(project.id, f);
    const next = defaultOpen(f);
    setOpen(next);
    saveOpen(project.id, next);
  };

  const hasDesign = !!project.design_md?.trim();
  const content = hasContent(page, sections);
  const hasSections = sections.length > 0;
  const readyCount = kitFiles(input).filter(f => f.ready).length;

  const designCard = (
    <KitCard
      key="design"
      id="design"
      icon={<Palette className="w-4 h-4" />}
      title="Design"
      desc="Colours, fonts, sizes and components from a website, another site or your own file."
      tone={hasDesign ? 'done' : 'todo'}
      status={hasDesign ? 'design.md ready' : 'Not made yet'}
      open={open.includes('design')}
      onToggle={() => toggle('design')}
      files={<FileChips input={input} step="design" />}
    >
      <DesignBody {...p} />
    </KitCard>
  );
  const contentCard = (
    <KitCard
      key="content"
      id="content"
      icon={<Type className="w-4 h-4" />}
      title="Content"
      desc="The page text and images: import a URL, paste your own text, or let the AI write it."
      tone={content ? 'done' : 'todo'}
      status={content ? (hasSections ? `${sections.length} sections` : 'Text ready — sections not built') : 'Not made yet'}
      open={open.includes('content')}
      onToggle={() => toggle('content')}
      files={<FileChips input={input} step="content" />}
    >
      <ContentBody {...p} />
    </KitCard>
  );
  const first = focus === 'content' ? [contentCard, designCard] : [designCard, contentCard];

  return (
    <div className="max-w-[980px] mx-auto px-6 py-6 space-y-4">
      {/* Top: what do you need + all files */}
      <div className="border border-[#E5E7EB] bg-[#F9FAFB] px-5 py-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="px-2 py-0.5 bg-[#111827] text-white text-xs font-medium">Builder Kit</span>
          <span className="text-xs text-[#6B7280]">Make only what you need, in any order. Every file can be downloaded as soon as it exists.</span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-semibold text-[#111827] mr-1">What do you need?</span>
          {KIT_FOCUS.map(f => (
            <Chip key={f.id} on={focus === f.id} title={f.hint} onClick={() => chooseFocus(f.id)}>{f.label}</Chip>
          ))}
          {preset && <span className="text-[10px] text-[#9CA3AF] ml-auto">Workflow: {preset.title}</span>}
        </div>
        <FileChips input={input} label={<span className="text-[11px] font-semibold text-[#111827] mr-1">Kit files <span className="font-normal text-[#9CA3AF]">{readyCount}/7</span></span>} />
      </div>

      {first}

      <KitCard
        id="sections"
        icon={<LayoutList className="w-4 h-4" />}
        title="Sections"
        desc="Check and fix the page structure — makes blueprint.md for the builder. Optional."
        tone={hasSections ? 'done' : 'blocked'}
        status={hasSections ? `${sections.length} sections` : content ? 'Build the sections in Content' : 'Needs content'}
        open={open.includes('sections')}
        onToggle={() => toggle('sections')}
        files={<FileChips input={input} step="sections" />}
      >
        {hasSections
          ? <SectionsBody {...p} />
          : <Blocked text={content ? 'The text is ready but not built into sections yet. Click Build Sections in Content.' : 'Get the page content first.'} action="Open Content" onAction={() => openOnly('content')} />}
      </KitCard>

      <KitCard
        id="prompt"
        icon={<FileText className="w-4 h-4" />}
        title="Builder prompt"
        desc="The first message for Bolt, Lovable, Replit, Claude … plus README and a ZIP of everything that exists."
        tone={hasDesign || content ? 'todo' : 'blocked'}
        status={hasDesign || content ? `Uses ${[hasDesign && 'design', content && 'content'].filter(Boolean).join(' + ')}` : 'Needs design or content'}
        open={open.includes('prompt')}
        onToggle={() => toggle('prompt')}
      >
        {hasDesign || content
          ? <PromptBody project={project} page={page} sections={sections} screenshot={screenshot} />
          : <Blocked text="Make design.md or the content first — the prompt is built from what exists." action="Open Design" onAction={() => openOnly('design')} />}
      </KitCard>

      <KitCard
        id="preview"
        icon={<Eye className="w-4 h-4" />}
        title="Quick preview"
        desc={`Optional: a rough HTML page to show the client (2–4 minutes · ≈ ${cost(0.3)}). Added to the kit as prototype.html.`}
        tone={page.generated_html ? 'done' : hasSections && hasDesign ? 'todo' : 'blocked'}
        status={page.generated_html ? 'prototype.html ready' : hasSections && hasDesign ? 'Optional' : 'Needs sections + design'}
        open={open.includes('preview')}
        onToggle={() => toggle('preview')}
      >
        {hasSections && hasDesign ? (
          <div className="flex flex-col">
            <PreviewPanel
              key={page.id}
              designMd={project.design_md}
              globals={project.globals}
              page={page}
              sections={sections}
              screenshot={screenshot}
              appSettings={p.appSettings}
              onHtmlSaved={p.onHtmlSaved}
              onSectionSync={p.onSectionSync}
              onPageUpdate={p.onPageUpdate}
              onSectionDelete={p.onSectionDelete}
              onSectionRestore={p.onSectionRestore}
            />
          </div>
        ) : (
          <Blocked
            text={`The preview needs ${[!hasSections && 'the sections', !hasDesign && 'design.md'].filter(Boolean).join(' and ')}.`}
            action={!hasDesign ? 'Open Design' : 'Open Content'}
            onAction={() => openOnly(!hasDesign ? 'design' : 'content')}
          />
        )}
      </KitCard>
    </div>
  );
}

function Blocked({ text, action, onAction }: { text: string; action: string; onAction: () => void }) {
  return (
    <div className="px-5 py-4 flex items-center gap-3 flex-wrap">
      <p className="text-sm text-[#6B7280] flex-1 min-w-[220px]">{text}</p>
      <button type="button" onClick={onAction} className="px-3 py-1.5 text-xs font-medium border border-[#E5E7EB] hover:border-[#2575FC] bg-white">{action}</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card bodies
// ---------------------------------------------------------------------------

function DesignBody(p: KitHubProps) {
  const preset = getPreset(p.project.preset);
  const hasDesign = !!p.project.design_md?.trim();
  const [showFile, setShowFile] = useState(false);
  const summary = useMemo(() => designSummary(p.project.design_md || ''), [p.project.design_md]);
  const initialMode = preset && preset.id !== 'manual'
    ? (p.project.design_url ? 'different-url' : preset.designStart === 'different-url' ? 'upload' : 'page-url')
    : undefined;
  return (
    <div className="px-5 py-4 space-y-4">
      <p className="text-xs text-[#6B7280]">1–2 minutes · 1 scrape + ≈ {cost(0.15)} · or paste your own design.md (free)</p>
      {hasDesign && (summary.colors.length > 0 || summary.fonts.length > 0) && (
        <div className="border border-green-200 bg-green-50 px-4 py-3">
          <div className="flex flex-wrap gap-2">
            {summary.colors.map(c => (
              <div key={c} className="w-[72px] border border-[#E5E7EB] bg-white">
                <div className="h-6" style={{ background: c }} />
                <p className="text-[10px] text-[#6B7280] px-1.5 py-0.5">{c}</p>
              </div>
            ))}
          </div>
          {summary.fonts.length > 0 && <p className="text-xs text-green-800 mt-2">Fonts: <b>{summary.fonts.join(', ')}</b></p>}
        </div>
      )}
      <div className="border border-[#E5E7EB]">
        <DesignSourcePanel
          projectUrl={p.project.url}
          appSettings={p.appSettings}
          onDesignGenerated={p.onDesignGenerated}
          initialMode={initialMode}
          initialOtherUrl={p.project.design_url || ''}
        />
      </div>
      <div className="border border-[#E5E7EB]">
        <button type="button" onClick={() => setShowFile(v => !v)} className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-[#111827]">
          {hasDesign ? 'Paste or edit design.md' : 'Paste or write design.md'}
          {showFile ? <ChevronUp className="w-4 h-4 text-[#9CA3AF]" /> : <ChevronDown className="w-4 h-4 text-[#9CA3AF]" />}
        </button>
        {showFile && (
          <div className="h-[420px] border-t border-[#E5E7EB]">
            <DesignPanel designMd={p.project.design_md} onChange={p.onDesignMdChange} />
          </div>
        )}
      </div>
    </div>
  );
}

function ContentBody(p: KitHubProps) {
  const preset = getPreset(p.project.preset);
  const mode = preset?.id === 'content' ? 'paste' : preset?.id === 'describe' ? 'write' : 'url';
  const words = countWords(p.page.copy_md);
  return (
    <div className="px-5 py-4 space-y-3">
      <p className="text-xs text-[#6B7280]">
        Import: 1–3 minutes · 1 scrape + ≈ {cost(0.2)} · Paste: ≈ {cost(0.05)} · Write it for me: ≈ {cost(0.06)} + {cost(0.05)}
      </p>
      <ImportPanel
        key={`kit-import-${p.page.id}`}
        projectUrl={p.project.url}
        pageUrl={p.page.page_url || ''}
        appSettings={p.appSettings}
        onStructureImported={p.onStructureImported}
        onPageUrlChange={p.onPageUrlChange}
        initialSource={mode}
        initialContent={preset?.id === 'content' ? (p.project.brief || '') : ''}
        pageName={p.page.page_name}
        pageId={p.page.id}
        initialDescription={preset?.id === 'describe' ? (p.project.brief || '') : ''}
        existingSections={p.sections.length}
      />
      {hasContent(p.page, p.sections) && (
        <div className="flex flex-wrap gap-2 text-xs">
          {[['Sections', p.sections.length], ['Words', words.toLocaleString()], ['Images', countImages(p.page.images_md)], ['Screenshot', p.screenshotMap[p.page.id] ? 'saved' : '—']].map(([k, v]) => (
            <div key={k} className="bg-white border border-[#E5E7EB] px-3 py-1.5 min-w-[96px]">
              <p className="text-[10px] uppercase tracking-wider text-[#9CA3AF]">{k}</p>
              <p className="text-sm font-semibold text-[#111827]">{v}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SectionsBody(p: KitHubProps) {
  const findings = useMemo(
    () => (p.page.copy_md ? checkFabrication(p.sections, p.page.copy_md) : null),
    [p.sections, p.page.copy_md],
  );
  const aiCopy = !!p.page.copy_md?.includes(AI_COPY_MARKER);
  return (
    <div className="px-5 py-4 grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-5">
      <div className="space-y-3 min-w-0">
        {p.sections.map(section => (
          <SectionCard
            key={section.id}
            section={section}
            onUpdate={updates => p.onSectionUpdate(section.id, updates)}
            onDelete={() => p.onSectionDelete(section.id)}
          />
        ))}
        <button
          type="button"
          onClick={p.onAddSection}
          className="w-full flex items-center justify-center gap-2 py-3 border border-dashed border-[#E5E7EB] hover:border-[#2575FC] text-[#9CA3AF] hover:text-[#2575FC] text-sm"
        >
          <Plus className="w-4 h-4" /> Add a section
        </button>
      </div>
      <div className="space-y-4 min-w-0">
        <div>
          <p className="text-xs font-semibold text-[#111827] mb-1.5">{aiCopy ? 'Sections vs. the written copy' : 'Fact-check'}</p>
          {findings === null ? (
            <p className="text-xs text-[#9CA3AF] border border-[#E5E7EB] px-3 py-2">No copy.md, so nothing to compare.</p>
          ) : findings.length === 0 ? (
            <p className="text-xs text-green-700 border border-green-200 bg-green-50 px-3 py-2 flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> All section text matches copy.md.</p>
          ) : (
            <div className="text-xs text-amber-800 border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="font-semibold flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> {findings.length} text{findings.length === 1 ? ' is' : 's are'} not in copy.md</p>
              <ul className="list-disc pl-4 mt-1 space-y-0.5">
                {findings.slice(0, 6).map((f, i) => (
                  <li key={i} className="break-words">"{f.text.length > 80 ? f.text.slice(0, 80) + '…' : f.text}" <span className="text-amber-600">({f.sectionName})</span></li>
                ))}
              </ul>
              {findings.length > 6 && <p className="mt-1">…and {findings.length - 6} more (see fact-check.md).</p>}
            </div>
          )}
        </div>
        <div>
          <label className="text-xs font-semibold text-[#111827] mb-1.5 block">Special instructions for the builder <span className="font-normal text-[#9CA3AF]">(optional)</span></label>
          <textarea
            key={`kit-ci-${p.page.id}`}
            defaultValue={p.page.custom_instructions}
            onBlur={e => p.onPageUpdate({ custom_instructions: e.target.value })}
            rows={4}
            placeholder="e.g. make the hero taller, add a WhatsApp button"
            className="w-full border border-[#E5E7EB] px-3 py-2 text-sm focus:outline-none focus:border-[#2575FC] resize-y"
          />
        </div>
      </div>
    </div>
  );
}

function PromptBody({ project, page, sections, screenshot }: { project: Project; page: Page; sections: Section[]; screenshot?: string }) {
  const input: KitInput = { project, page, sections, screenshot };
  const [targets, setTargets] = useState<ExportTargets>(readTargets);
  const [shown, setShown] = useState('');
  const { exportZip, exporting } = useExport();

  const toggle = <K extends keyof ExportTargets>(kind: K, id: ExportTargets[K][number]) => {
    setTargets(cur => {
      const list = cur[kind] as string[];
      const nextList = list.includes(id) ? list.filter(x => x !== id) : [...list, id];
      if (nextList.length === 0) return cur; // keep at least one
      const next = { ...cur, [kind]: nextList } as ExportTargets;
      saveTargets(next);
      return next;
    });
  };

  const files = kitFiles(input);
  const ready = (n: string) => !!files.find(f => f.name === n)?.ready;
  const hasProto = !!page.generated_html;
  const protoOutdated = hasProto && syncStatus(project, page, sections).prototype === 'outdated';
  const pkg: PackageInfo = {
    projectName: project.name,
    hasDesign: ready('design.md'),
    hasPrototype: hasProto,
    hasChanges: hasProto,
    hasCopy: ready('copy.md'),
    hasImages: ready('images.md'),
    hasScreenshots: ready('screenshot.jpg'),
    hasSite: ready('site.md'),
    hasBlueprint: ready('blueprint.md'),
    sectionCount: sections.length || undefined,
    pages: [page.page_name],
  };
  const comboList = combos(targets);
  const inZip = [...files.filter(f => f.ready).map(f => f.name), ...(hasProto ? ['prototype.html', 'changes.md'] : [])];
  const readme = kitReadme(project, page, targets, inZip);

  const downloadAll = async () => {
    await exportZip(
      project, [page], { [page.id]: sections },
      screenshot ? { [page.id]: screenshot } : {}, true, targets,
      { zipName: `${slug(project.name)}-builder-kit.zip`, readme, onlyReady: true },
    );
    ding();
  };

  return (
    <div className="px-5 py-4 space-y-4">
      <div>
        <p className="text-xs font-semibold text-[#111827] mb-1.5">Build with</p>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {BUILDERS.map(b => (
            <Chip key={b.id} on={targets.tools.includes(b.id)} title={b.hint} onClick={() => toggle('tools', b.id as BuilderId)}>{b.label}</Chip>
          ))}
        </div>
        <p className="text-xs font-semibold text-[#111827] mb-1.5">Output</p>
        <div className="flex flex-wrap gap-1.5">
          {OUTPUTS.map(o => (
            <Chip key={o.id} on={targets.outputs.includes(o.id)} title={o.hint} onClick={() => toggle('outputs', o.id as OutputId)}>{o.label}</Chip>
          ))}
        </div>
      </div>

      <div>
        <button
          type="button"
          onClick={() => void downloadAll()}
          disabled={exporting}
          className="w-full flex items-center justify-center gap-2.5 bg-[#2575FC] hover:bg-[#1a5fe0] disabled:opacity-50 text-white font-semibold text-sm py-3"
        >
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
          Download all (.zip)
        </button>
        <p className="text-[10px] text-[#9CA3AF] text-center mt-1.5">
          {comboList.length} prompt{comboList.length === 1 ? '' : 's'} + README.md + {inZip.join(' + ')}
        </p>
        {!pkg.hasDesign && <p className="text-[11px] text-[#6B7280] mt-1">No design.md — the prompt asks the builder to choose a fitting design.</p>}
        {!pkg.hasCopy && !pkg.hasBlueprint && <p className="text-[11px] text-[#6B7280] mt-1">No content — the prompt ends with a space where you describe the page (or paste your texts) before sending.</p>}
        {protoOutdated && <p className="text-[11px] text-amber-700 mt-1">The quick preview is outdated (sections or design changed). prototype.html in the ZIP shows the old version.</p>}
      </div>

      <div>
        <p className="text-[11px] font-semibold text-[#111827] mb-1.5">Prompts and README</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
          {comboList.map(c => {
            const name = promptFileName(c.tool, c.output);
            return <FileButton key={name} name={name} hint={comboLabel(c.tool, c.output)} ready onClick={() => saveText(buildBuilderPrompt(c.tool, c.output, pkg), name)} />;
          })}
          <FileButton name="README.md" hint="What to upload where" ready onClick={() => saveText(readme, 'README.md')} />
          {hasProto && (
            <>
              <FileButton name="prototype.html" hint="The quick preview" ready onClick={() => saveText(cleanPrototypeHtml(page.generated_html!), 'prototype.html')} />
              <FileButton name="changes.md" hint={`${readChanges(page).length} approved changes`} ready onClick={() => saveText(changesMd(page, sections), 'changes.md')} />
            </>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[#6B7280]">
          <Wand2 className="w-3.5 h-3.5" /> Show:
          <select
            value={shown}
            onChange={e => setShown(e.target.value)}
            aria-label="Show prompt"
            className="border border-[#E5E7EB] bg-white px-1.5 py-0.5 text-[11px] focus:outline-none focus:border-[#2575FC]"
          >
            <option value="">—</option>
            {comboList.map(c => <option key={`${c.tool}-${c.output}`} value={`${c.tool}|${c.output}`}>{comboLabel(c.tool, c.output)}</option>)}
            <option value="readme">README.md</option>
          </select>
        </div>
        {shown && (
          <pre className="mt-2 max-h-64 overflow-auto border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2 text-[11px] leading-relaxed text-[#374151] whitespace-pre-wrap">
            {shown === 'readme' ? readme : (() => { const [t, o] = shown.split('|') as [BuilderId, OutputId]; return buildBuilderPrompt(t, o, pkg); })()}
          </pre>
        )}
      </div>

      <div>
        <p className="text-[11px] font-semibold text-[#111827] mb-1.5">All files</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
          {files.map(f => (
            <FileButton key={f.name} name={f.name} hint={f.hint} ready={f.ready} note={lockedNote(f, input)} onClick={() => void downloadKitFile(f, input)} />
          ))}
        </div>
      </div>
    </div>
  );
}
