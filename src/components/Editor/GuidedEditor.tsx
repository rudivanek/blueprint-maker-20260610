// src/components/Editor/GuidedEditor.tsx
//
// Guided mode: the editor as a step-by-step wizard.
//   Content → Design → Review → Prototype → Export
//   (Describe it myself: Design → Generate page)
// Only the current step is shown. Each step reuses the existing panels
// (ImportPanel, DesignSourcePanel, DesignPanel, SectionCard, PreviewPanel,
// ExportPanel, CreatePanel) — no AI or data logic lives here.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Check, Lock, ArrowLeft, ArrowRight, Plus, ChevronDown, ChevronUp, AlertTriangle, ShieldCheck } from 'lucide-react';
import { ImportPanel } from './ImportPanel';
import { DesignSourcePanel } from './DesignSourcePanel';
import { DesignPanel } from './DesignPanel';
import { SectionCard } from './SectionCard';
import { PreviewPanel } from './PreviewPanel';
import { CreatePanel } from './CreatePanel';
import { ExportPanel } from '../Export/ExportPanel';
import { getPreset } from '../../lib/presets';
import { checkFabrication } from '../../lib/pageAssets';
import type { AppSettings, GlobalSettings, Page, Project, Section } from '../../types';

type StepId = 'content' | 'design' | 'review' | 'prototype' | 'export' | 'brief';

const STEP_LABELS: Record<StepId, { title: string; sub: string }> = {
  content: { title: 'Content', sub: 'Get the page text' },
  design: { title: 'Design', sub: 'Colours & fonts' },
  review: { title: 'Review', sub: 'Check sections' },
  prototype: { title: 'Prototype', sub: 'Generate HTML' },
  export: { title: 'Export', sub: 'Download ZIP' },
  brief: { title: 'Generate', sub: 'Page from your text' },
};

interface GuidedEditorProps {
  project: Project;
  page: Page;
  pages: Page[];
  sections: Section[];
  allSections: Record<string, Section[]>;
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
  onSectionDelete: (id: string) => void;
  onAddSection: () => void;
  onPageUpdate: (updates: Partial<Page>) => void;
}

const scrollTop = () => document.getElementById('bpm-guided-scroll')?.scrollTo({ top: 0, behavior: 'smooth' });

const reviewedKey = (pageId: string) => `bpm_reviewed_${pageId}`;
function readReviewed(pageId: string): boolean {
  try { return localStorage.getItem(reviewedKey(pageId)) === '1'; } catch { return false; }
}

export function GuidedEditor(props: GuidedEditorProps) {
  const { project, page, sections } = props;
  const preset = getPreset(project.preset);
  const isDescribe = preset?.id === 'describe';

  const order: StepId[] = isDescribe
    ? ['design', 'brief']
    : ['content', 'design', 'review', 'prototype', 'export'];

  const [reviewed, setReviewed] = useState(() => readReviewed(page.id));
  useEffect(() => { setReviewed(readReviewed(page.id)); }, [page.id]);

  const done: Record<StepId, boolean> = {
    content: sections.length > 0,
    design: !!project.design_md?.trim(),
    review: reviewed,
    prototype: !!page.generated_html,
    export: false,
    brief: false,
  };

  // A step opens when it is already done, or when every step before it is done.
  const canOpen = (i: number) => done[order[i]] || order.slice(0, i).every(id => done[id]);
  const firstOpen = Math.max(0, order.findIndex(id => !done[id]));
  const [current, setCurrent] = useState(firstOpen);

  // Open on the first unfinished step. Page data loads a moment after the page
  // is selected, so follow it for a few seconds — unless the user already moved.
  const autoUntil = useRef(0);
  const userMoved = useRef(false);
  useEffect(() => {
    autoUntil.current = Date.now() + 3000;
    userMoved.current = false;
    setCurrent(firstOpen);
  }, [page.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!userMoved.current && Date.now() < autoUntil.current) setCurrent(firstOpen);
  }, [firstOpen]);

  const step = order[Math.min(current, order.length - 1)];
  const isLast = current >= order.length - 1;

  const goNext = () => {
    userMoved.current = true;
    if (step === 'review') {
      try { localStorage.setItem(reviewedKey(page.id), '1'); } catch { /* ignore */ }
      setReviewed(true);
    }
    setCurrent(c => Math.min(c + 1, order.length - 1));
    scrollTop();
  };
  const goBack = () => {
    userMoved.current = true;
    setCurrent(c => Math.max(0, c - 1));
    scrollTop();
  };

  // Review never blocks; everything else needs its result first.
  const nextEnabled = step === 'review' || done[step];
  const whyBlocked: Partial<Record<StepId, string>> = {
    content: 'Import the page (or build sections from your text) first.',
    design: 'Create or upload the design system first.',
    prototype: 'Generate the prototype first.',
  };

  return (
    <div className="max-w-[980px] mx-auto px-6 py-6">
      {/* Workflow line */}
      <div className="flex items-center gap-2 text-xs text-[#6B7280] mb-3">
        <span>Workflow:</span>
        <span className="px-2 py-0.5 border border-[#E5E7EB] bg-[#F9FAFB] text-[#111827]">{preset?.title ?? 'Custom'}</span>
        {preset && <span className="hidden sm:inline truncate">— {preset.desc}</span>}
      </div>

      {/* Step bar */}
      <div className="flex flex-col sm:flex-row mb-6">
        {order.map((id, i) => {
          const isCurrent = i === current;
          const isDone = done[id] && !isCurrent;
          const locked = !canOpen(i);
          return (
            <button
              key={id}
              onClick={() => { if (!locked) { userMoved.current = true; setCurrent(i); } }}
              disabled={locked}
              title={locked ? 'Finish the earlier steps first' : ''}
              className={`flex-1 flex items-center gap-2.5 px-3.5 py-3 border text-left transition-colors -mt-px sm:mt-0 sm:-ml-px first:ml-0 first:mt-0 ${
                isCurrent ? 'bg-[#EFF5FF] border-[#2575FC] relative z-10' : 'bg-white border-[#E5E7EB]'
              } ${locked ? 'cursor-not-allowed' : 'hover:bg-[#F9FAFB]'}`}
            >
              <span className={`w-6 h-6 shrink-0 flex items-center justify-center text-xs font-semibold border ${
                isDone ? 'bg-green-600 border-green-600 text-white' : isCurrent ? 'border-[#2575FC] text-[#2575FC]' : 'border-[#E5E7EB] text-[#9CA3AF]'
              }`}>
                {isDone ? <Check className="w-3.5 h-3.5" /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className={`flex items-center gap-1 text-[13px] font-medium ${isCurrent ? 'text-[#2575FC]' : isDone ? 'text-[#111827]' : 'text-[#9CA3AF]'}`}>
                  {STEP_LABELS[id].title}
                  {locked && <Lock className="w-3 h-3" />}
                </span>
                <span className="block text-[11px] text-[#9CA3AF] truncate">{STEP_LABELS[id].sub}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Step body */}
      <div className="border border-[#E5E7EB] bg-white">
        {step === 'content' && <ContentStep {...props} n={current + 1} />}
        {step === 'design' && <DesignStep {...props} n={current + 1} />}
        {step === 'review' && <ReviewStep {...props} n={current + 1} />}
        {step === 'prototype' && <PrototypeStep {...props} n={current + 1} />}
        {step === 'export' && <ExportStep {...props} n={current + 1} />}
        {step === 'brief' && <BriefStep {...props} n={current + 1} />}

        {/* Back / Next */}
        <div className="flex items-center justify-between gap-3 border-t border-[#E5E7EB] bg-[#F9FAFB] px-6 py-3.5">
          <button
            onClick={goBack}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm border border-[#E5E7EB] bg-white hover:border-[#2575FC] ${current === 0 ? 'invisible' : ''}`}
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          {!isLast && (
            <>
              <span className="hidden sm:block text-xs text-amber-700 text-center flex-1">
                {!nextEnabled ? whyBlocked[step] : ''}
              </span>
              <button
                onClick={goNext}
                disabled={!nextEnabled}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-[#111827] text-white disabled:bg-[#D1D5DB] disabled:cursor-not-allowed"
              >
                Next: {STEP_LABELS[order[current + 1]].title} <ArrowRight className="w-4 h-4" />
              </button>
            </>
          )}
          {isLast && !isDescribe && (
            <span className="text-xs text-[#6B7280]">Next page? Use <b>+ Add Page</b> above — design and export stay shared.</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared step header
// ---------------------------------------------------------------------------

function StepHeader({ n, name, title, lead, what, need, time }: {
  n: number; name: string; title: string; lead: ReactNode; what?: string; need?: string; time?: string;
}) {
  return (
    <div className="px-6 pt-5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#2575FC]">Step {n} · {name}</p>
      <h1 className="text-[22px] font-bold text-[#111827] mt-1 tracking-tight">{title}</h1>
      <p className="text-sm text-[#6B7280] mt-1 max-w-[640px] leading-relaxed">{lead}</p>
      {what && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-4">
          {[['What happens', what], ['What you need', need], ['Time & cost', time]].map(([k, v]) => (
            <div key={k} className="bg-[#F9FAFB] border border-[#E5E7EB] px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#111827] mb-0.5">{k}</p>
              <p className="text-xs text-[#6B7280] leading-relaxed">{v}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type StepProps = GuidedEditorProps & { n: number };

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white border border-[#E5E7EB] px-3 py-2 min-w-[110px]">
      <p className="text-[10px] uppercase tracking-wider text-[#9CA3AF]">{label}</p>
      <p className="text-[15px] font-semibold text-[#111827]">{value}</p>
    </div>
  );
}

function countWords(md?: string): number {
  if (!md) return 0;
  return md.replace(/<!--[\s\S]*?-->/g, '').split(/\s+/).filter(w => /\w/.test(w)).length;
}
function countImages(md?: string): number {
  return (md?.match(/^- https?:\/\//gm) ?? []).length;
}

// ---------------------------------------------------------------------------
// 1. Content
// ---------------------------------------------------------------------------

function ContentStep(p: StepProps) {
  const preset = getPreset(p.project.preset);
  const paste = preset?.importStart === 'paste';
  const restyle = preset?.id === 'restyle';
  return (
    <>
      <StepHeader
        n={p.n}
        name="Content"
        title={paste ? 'Turn your text into page sections' : "Import the page's content"}
        lead={paste
          ? <>Paste or edit your text below and click <b>Build Sections</b>. Every <code>#</code> or <code>##</code> heading becomes a section. Your words are used exactly as written.</>
          : <>The app reads the page and takes its <b>texts, images and layout</b>.{restyle ? ' The look will come from your design system, not from this site.' : ''} Check the address and click <b>Import This Page</b>.</>}
        what={paste
          ? 'The AI turns your text into page sections (hero, services, contact…). Your text is saved as copy.md.'
          : 'The page is scraped and split into sections. All text is saved word for word (copy.md), all images are listed (images.md).'}
        need={paste ? 'Your text. Markdown helps: # headings, - lists.' : 'The address of the page you want to rebuild.'}
        time={paste ? 'About 30 seconds · ≈ $0.05' : '1–3 minutes · 1 scrape + ≈ $0.20'}
      />
      <div className="px-6 py-5">
        <ImportPanel
          key={`guided-import-${p.page.id}`}
          projectUrl={p.project.url}
          pageUrl={p.page.page_url || ''}
          appSettings={p.appSettings}
          onStructureImported={p.onStructureImported}
          onPageUrlChange={p.onPageUrlChange}
          initialSource={paste ? 'paste' : 'url'}
          initialContent={preset?.id === 'content' ? (p.project.brief || '') : ''}
          pageName={p.page.page_name}
        />
        {p.sections.length > 0 && (
          <div className="border border-green-200 bg-green-50 px-4 py-3">
            <p className="text-sm font-semibold text-green-700 mb-2 flex items-center gap-1.5"><Check className="w-4 h-4" /> Content is ready</p>
            <div className="flex flex-wrap gap-2">
              <Stat label="Sections" value={p.sections.length} />
              <Stat label="Words" value={countWords(p.page.copy_md).toLocaleString()} />
              <Stat label="Images" value={countImages(p.page.images_md)} />
              <Stat label="Screenshot" value={p.screenshotMap[p.page.id] ? 'saved' : '—'} />
            </div>
            <p className="text-xs text-green-800 mt-2">Importing again replaces these sections.</p>
          </div>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// 2. Design
// ---------------------------------------------------------------------------

function designSummary(md: string) {
  const colors = [...new Set((md.match(/#[0-9a-fA-F]{6}\b/g) ?? []).map(c => c.toUpperCase()))].slice(0, 8);
  const fromLink = [...md.matchAll(/family=([^:&"')\s]+)/g)].map(m => decodeURIComponent(m[1]).replace(/\+/g, ' '));
  const fonts = [...new Set(fromLink)].slice(0, 3);
  return { colors, fonts };
}

function DesignStep(p: StepProps) {
  const preset = getPreset(p.project.preset);
  const hasDesign = !!p.project.design_md?.trim();
  const [showFile, setShowFile] = useState(false);
  const summary = useMemo(() => designSummary(p.project.design_md || ''), [p.project.design_md]);
  const initialMode = preset && preset.id !== 'manual'
    ? (p.project.design_url ? 'different-url' : preset.designStart === 'different-url' ? 'upload' : 'page-url')
    : undefined;

  return (
    <>
      <StepHeader
        n={p.n}
        name="Design"
        title={hasDesign ? 'Your design system is ready' : 'Get the design system'}
        lead={<>The design system (<code>design.md</code>) holds the <b>colours, fonts, sizes and spacing</b>. It is made once and used for every page. {hasDesign ? 'You can replace it below.' : 'Choose where the look comes from and click Extract.'}</>}
        what="The app measures the real stylesheets of the site and writes design.md, including which Google Fonts to use."
        need="A website with the look you want — or your own design.md file."
        time="1–2 minutes · 1 scrape + ≈ $0.15"
      />
      <div className="px-6 py-5 space-y-4">
        {hasDesign && (
          <div className="border border-green-200 bg-green-50 px-4 py-3">
            <p className="text-sm font-semibold text-green-700 mb-2 flex items-center gap-1.5"><Check className="w-4 h-4" /> Design system loaded</p>
            {summary.colors.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {summary.colors.map(c => (
                  <div key={c} className="w-[84px] border border-[#E5E7EB] bg-white">
                    <div className="h-8" style={{ background: c }} />
                    <p className="text-[10px] text-[#6B7280] px-1.5 py-1">{c}</p>
                  </div>
                ))}
              </div>
            )}
            {summary.fonts.length > 0 && (
              <p className="text-xs text-green-800 mt-2">Fonts: <b>{summary.fonts.join(', ')}</b></p>
            )}
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
          <button
            onClick={() => setShowFile(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-[#111827]"
          >
            {hasDesign ? 'Paste or edit design.md' : 'Write design.md by hand'}
            {showFile ? <ChevronUp className="w-4 h-4 text-[#9CA3AF]" /> : <ChevronDown className="w-4 h-4 text-[#9CA3AF]" />}
          </button>
          {showFile && (
            <div className="h-[420px] border-t border-[#E5E7EB]">
              <DesignPanel designMd={p.project.design_md} onChange={p.onDesignMdChange} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// 3. Review
// ---------------------------------------------------------------------------

function ReviewStep(p: StepProps) {
  const findings = useMemo(
    () => (p.page.copy_md ? checkFabrication(p.sections, p.page.copy_md) : null),
    [p.sections, p.page.copy_md],
  );
  return (
    <>
      <StepHeader
        n={p.n}
        name="Review"
        title="Check what was found"
        lead="These are the sections of the page, in order. Open one to fix its text or layout. Everything you change here is used for the prototype and the export."
      />
      <div className="px-6 py-5 grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-5">
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
            onClick={p.onAddSection}
            className="w-full flex items-center justify-center gap-2 py-3 border border-dashed border-[#E5E7EB] hover:border-[#2575FC] text-[#9CA3AF] hover:text-[#2575FC] text-sm"
          >
            <Plus className="w-4 h-4" /> Add a section
          </button>
        </div>

        <div className="space-y-4 min-w-0">
          <div>
            <p className="text-xs font-semibold text-[#111827] mb-1.5">Fact-check</p>
            {findings === null ? (
              <p className="text-xs text-[#9CA3AF] border border-[#E5E7EB] px-3 py-2">No copy.md for this page, so nothing to compare.</p>
            ) : findings.length === 0 ? (
              <p className="text-xs text-green-700 border border-green-200 bg-green-50 px-3 py-2 flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> All section text matches the original page.</p>
            ) : (
              <div className="text-xs text-amber-800 border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="font-semibold flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> {findings.length} text{findings.length === 1 ? ' is' : 's are'} not on the original page</p>
                <p className="mt-0.5">Check these before sending anything to the client:</p>
                <ul className="list-disc pl-4 mt-1 space-y-0.5">
                  {findings.slice(0, 6).map((f, i) => (
                    <li key={i} className="break-words">"{f.text.length > 80 ? f.text.slice(0, 80) + '…' : f.text}" <span className="text-amber-600">({f.sectionName})</span></li>
                  ))}
                </ul>
                {findings.length > 6 && <p className="mt-1">…and {findings.length - 6} more (full list in the ZIP).</p>}
              </div>
            )}
          </div>

          <div className="border border-[#E5E7EB] px-3 py-2 text-xs space-y-1">
            <div className="flex justify-between gap-2"><b>copy.md</b><span className="text-[#9CA3AF]">{p.page.copy_md ? `${countWords(p.page.copy_md).toLocaleString()} words` : '—'}</span></div>
            <div className="flex justify-between gap-2"><b>images.md</b><span className="text-[#9CA3AF]">{p.page.images_md ? `${countImages(p.page.images_md)} images` : '—'}</span></div>
            <div className="flex justify-between gap-2"><b>Screenshot</b><span className="text-[#9CA3AF]">{p.screenshotMap[p.page.id] ? 'saved (this session)' : '—'}</span></div>
          </div>

          <div>
            <label className="text-xs font-semibold text-[#111827] mb-1.5 block">Special instructions for this page <span className="font-normal text-[#9CA3AF]">(optional)</span></label>
            <textarea
              key={`ci-${p.page.id}`}
              defaultValue={p.page.custom_instructions}
              onBlur={e => p.onPageUpdate({ custom_instructions: e.target.value })}
              rows={4}
              placeholder="e.g. make the hero taller, add a WhatsApp button"
              className="w-full border border-[#E5E7EB] px-3 py-2 text-sm focus:outline-none focus:border-[#2575FC] resize-y"
            />
          </div>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// 4. Prototype
// ---------------------------------------------------------------------------

function PrototypeStep(p: StepProps) {
  return (
    <>
      <StepHeader
        n={p.n}
        name="Prototype"
        title="Generate the HTML prototype"
        lead={<>The AI builds a complete web page from the sections, the texts and the design system. Click <b>Generate HTML</b>, look at the result, ask for changes and download it.</>}
        what="A standalone .html page is written. If it gets cut off, the app continues automatically."
        need="Sections and a design system (done in the earlier steps)."
        time="2–4 minutes · ≈ $0.30"
      />
      <div className="px-6 py-5">
        <div className="h-[75vh] min-h-[520px] border border-[#E5E7EB] flex flex-col overflow-hidden">
          <PreviewPanel
            key={p.page.id}
            designMd={p.project.design_md}
            globals={p.project.globals}
            page={p.page}
            sections={p.sections}
            screenshot={p.screenshotMap[p.page.id]}
            appSettings={p.appSettings}
            onHtmlSaved={p.onHtmlSaved}
          />
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// 5. Export
// ---------------------------------------------------------------------------

function ExportStep(p: StepProps) {
  return (
    <>
      <StepHeader
        n={p.n}
        name="Export"
        title="Download everything"
        lead="One ZIP with all the files an AI builder needs to rebuild the site — for Bolt, Claude, Lovable and others."
      />
      <div className="px-6 py-5 grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-5">
        <div className="border border-[#E5E7EB] min-w-0">
          <ExportPanel
            project={p.project}
            pages={p.pages}
            allSections={p.allSections}
            activePage={p.page}
            activeSections={p.sections}
            screenshotMap={p.screenshotMap}
          />
        </div>
        <div className="bg-[#F9FAFB] border border-[#E5E7EB] px-4 py-3 text-sm leading-relaxed h-fit">
          <p className="font-semibold text-[#111827] mb-1">How to use the ZIP</p>
          <ol className="list-decimal pl-5 text-[#374151] space-y-1">
            <li>Paste <b>prompt.txt</b> as the first message in your AI tool.</li>
            <li>Attach <b>design.md</b>, the blueprint, <b>copy.md</b> and <b>images.md</b> (and the screenshot if included).</li>
            <li>For more pages: "Add this page using the same design system and components" + that page's files.</li>
          </ol>
          <p className="text-xs text-[#6B7280] mt-3">The prototype you generated is saved with the page; download it from the Prototype step.</p>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Describe it myself: generate from the brief
// ---------------------------------------------------------------------------

function BriefStep(p: StepProps) {
  return (
    <>
      <StepHeader
        n={p.n}
        name="Generate"
        title="Generate the page from your description"
        lead={<>Check your description below and click <b>Generate Page</b>. The page uses your design system. Download the result when you are happy with it.</>}
        what="The AI writes and builds a full page from your description."
        need="A short brief: business, audience, sections, tone."
        time="2–4 minutes · ≈ $0.30"
      />
      <div className="px-6 py-5">
        <CreatePanel
          key={`guided-brief-${p.page.id}`}
          provider={p.appSettings.aiProvider}
          anthropicKey={p.appSettings.anthropicApiKey}
          openaiKey={p.appSettings.openaiApiKey}
          inline={true}
          initialBrief={p.project.brief || ''}
          projectDesignMd={p.project.design_md}
          defaultOpen={true}
        />
      </div>
    </>
  );
}
