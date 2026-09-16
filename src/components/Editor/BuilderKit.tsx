// src/components/Editor/BuilderKit.tsx
//
// Builder Kit mode (default for new projects): Source → Design → Quick check →
// Download kit. Only the files an AI builder needs — no prototype unless the user
// asks for a quick preview.
//   <KitFiles>  download buttons for single files (all files, or one step's files)
//   <KitStep>   the last step: builder / output choice, prompts, README, ZIP, optional preview

import { useState } from 'react';
import type { ReactNode } from 'react';
import { Archive, Check, ChevronDown, ChevronUp, Download, Eye, FileText, Loader2, Lock } from 'lucide-react';
import type { AppSettings, Page, Project, Section } from '../../types';
import { useExport } from '../../hooks/useExport';
import { BUILDERS, OUTPUTS, buildBuilderPrompt, comboLabel, combos, promptFileName, readTargets, saveTargets, type BuilderId, type ExportTargets, type OutputId, type PackageInfo } from '../../lib/builderPrompts';
import { KIT_STEP_LABEL, kitFileText, kitFiles, kitReadme, saveBlob, saveText, screenshotBlob, type KitFile, type KitInput, type KitStepId } from '../../lib/kitFiles';
import { changesMd, cleanPrototypeHtml, readChanges } from '../../lib/changeLog';
import { syncStatus } from '../../lib/syncStatus';
import { cost } from '../../lib/models';
import { ding } from '../../lib/ding';
import { toast } from '../ui/Toast';
import { PreviewPanel } from './PreviewPanel';

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

function FileButton({ name, hint, ready, lockedNote, onClick }: {
  name: string; hint: string; ready: boolean; lockedNote?: string; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!ready}
      title={ready ? `Download ${name} — ${hint}` : lockedNote ?? hint}
      className={`group flex items-center gap-2 px-2.5 py-1.5 border text-left min-w-0 transition-colors ${ready ? 'bg-white border-[#E5E7EB] hover:border-[#2575FC]' : 'bg-[#F9FAFB] border-dashed border-[#E5E7EB] cursor-not-allowed'}`}
    >
      {ready
        ? <Download className="w-3.5 h-3.5 text-[#2575FC] shrink-0" />
        : <Lock className="w-3 h-3 text-[#D1D5DB] shrink-0" />}
      <span className="min-w-0">
        <span className={`block text-xs font-medium truncate ${ready ? 'text-[#111827]' : 'text-[#9CA3AF]'}`}>{name}</span>
        <span className="block text-[10px] text-[#9CA3AF] truncate">{ready ? hint : lockedNote ?? hint}</span>
      </span>
    </button>
  );
}

/** Download buttons for the kit files. `step` = only the files that step makes. */
export function KitFiles({ input, step, title, compact }: { input: KitInput; step?: KitStepId; title?: ReactNode; compact?: boolean }) {
  const files = kitFiles(input).filter(f => !step || f.step === step);
  if (!files.length) return null;
  const readyCount = files.filter(f => f.ready).length;
  const lockedNote = (f: KitFile) => (f.name === 'screenshot.jpg' && input.sections.length ? f.hint : `after ${KIT_STEP_LABEL[f.step]}`);
  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-1.5" aria-label="Kit files">
        <span className="text-[11px] font-semibold text-[#111827] mr-1">Kit files <span className="font-normal text-[#9CA3AF]">{readyCount}/{files.length}</span></span>
        {files.map(f => (
          <button
            key={f.name}
            type="button"
            disabled={!f.ready}
            onClick={() => void downloadKitFile(f, input)}
            title={f.ready ? `Download ${f.name} — ${f.hint}` : lockedNote(f)}
            className={`flex items-center gap-1 px-2 py-0.5 text-[11px] border ${f.ready ? 'bg-green-50 border-green-200 text-green-800 hover:border-green-500' : 'bg-white border-dashed border-[#E5E7EB] text-[#9CA3AF] cursor-not-allowed'}`}
          >
            {f.ready ? <Download className="w-3 h-3" /> : <Lock className="w-2.5 h-2.5" />}
            {f.name}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className={step ? 'border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2.5' : ''}>
      <p className="text-[11px] font-semibold text-[#111827] mb-1.5 flex items-center gap-1.5">
        {title ?? (step ? (readyCount ? 'Ready to download' : 'Files from this step') : 'Kit files')}
        <span className="font-normal text-[#9CA3AF]">{readyCount}/{files.length} ready</span>
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
        {files.map(f => (
          <FileButton
            key={f.name}
            name={f.name}
            hint={f.hint}
            ready={f.ready}
            lockedNote={f.ready ? undefined : lockedNote(f)}
            onClick={() => void downloadKitFile(f, input)}
          />
        ))}
      </div>
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

const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'site';

interface KitStepProps {
  project: Project;
  page: Page;
  sections: Section[];
  screenshot?: string;
  appSettings: AppSettings;
  reviewed: boolean;
  onHtmlSaved: (pageId: string, html: string) => void;
  onSectionSync: (id: string, updates: Partial<Section>) => void;
  onPageUpdate: (updates: Partial<Page>) => void;
  onSectionDelete: (id: string) => void;
  onSectionRestore?: (section: Section) => void;
}

export function KitStep(p: KitStepProps) {
  const input: KitInput = { project: p.project, page: p.page, sections: p.sections, screenshot: p.screenshot, reviewed: p.reviewed };
  const [targets, setTargets] = useState<ExportTargets>(readTargets);
  const [showPreview, setShowPreview] = useState(!!p.page.generated_html);
  const [promptOpen, setPromptOpen] = useState('');
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
  const hasProto = !!p.page.generated_html;
  const protoState = syncStatus(p.project, p.page, p.sections).prototype;
  const pkg: PackageInfo = {
    projectName: p.project.name,
    hasDesign: !!p.project.design_md?.trim(),
    hasPrototype: hasProto,
    hasChanges: hasProto,
    hasCopy: !!p.page.copy_md?.trim(),
    hasImages: !!p.page.images_md?.trim(),
    hasScreenshots: !!p.screenshot,
    hasSite: true,
    sectionCount: p.sections.length,
    pages: [p.page.page_name],
  };
  const comboList = combos(targets);
  const readyNames = [
    ...files.filter(f => f.ready).map(f => f.name),
    ...(hasProto ? ['prototype.html', 'changes.md'] : []),
  ];
  const readme = kitReadme(p.project, p.page, targets, readyNames);

  const downloadAll = async () => {
    await exportZip(
      p.project, [p.page], { [p.page.id]: p.sections },
      p.screenshot ? { [p.page.id]: p.screenshot } : {}, true, targets,
      { zipName: `${slug(p.project.name)}-builder-kit.zip`, readme },
    );
    ding();
  };

  return (
    <div className="px-6 py-5 space-y-5">
      {/* 1. Builder + output */}
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

      {/* 2. Download everything */}
      <button
        onClick={() => void downloadAll()}
        disabled={exporting}
        className="w-full flex items-center justify-center gap-2.5 bg-[#2575FC] hover:bg-[#1a5fe0] disabled:opacity-50 text-white font-semibold text-sm py-3"
      >
        {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
        Download all (.zip)
      </button>
      {hasProto && protoState === 'outdated' && (
        <p className="-mt-3 text-[11px] text-amber-700">The quick preview is outdated (the sections or the design changed). prototype.html in the ZIP shows the old version — update it below, or ignore it.</p>
      )}

      {/* 3. Single files */}
      <KitFiles input={input} title="Single files" />

      <div>
        <p className="text-[11px] font-semibold text-[#111827] mb-1.5">Prompts and README</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
          {comboList.map(c => {
            const name = promptFileName(c.tool, c.output);
            return (
              <FileButton key={name} name={name} hint={comboLabel(c.tool, c.output)} ready
                onClick={() => saveText(buildBuilderPrompt(c.tool, c.output, pkg), name)} />
            );
          })}
          <FileButton name="README.md" hint="What to upload where" ready onClick={() => saveText(readme, 'README.md')} />
          {hasProto && (
            <>
              <FileButton name="prototype.html" hint="The quick preview" ready onClick={() => saveText(cleanPrototypeHtml(p.page.generated_html!), 'prototype.html')} />
              <FileButton name="changes.md" hint={`${readChanges(p.page).length} approved changes`} ready onClick={() => saveText(changesMd(p.page, p.sections), 'changes.md')} />
            </>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[#6B7280]">
          <FileText className="w-3.5 h-3.5" /> Show prompt:
          <select
            value={promptOpen}
            onChange={e => setPromptOpen(e.target.value)}
            aria-label="Show prompt"
            className="border border-[#E5E7EB] bg-white px-1.5 py-0.5 text-[11px] focus:outline-none focus:border-[#2575FC]"
          >
            <option value="">—</option>
            {comboList.map(c => <option key={`${c.tool}-${c.output}`} value={`${c.tool}|${c.output}`}>{comboLabel(c.tool, c.output)}</option>)}
            <option value="readme">README.md</option>
          </select>
        </div>
        {promptOpen && (
          <pre className="mt-2 max-h-64 overflow-auto border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2 text-[11px] leading-relaxed text-[#374151] whitespace-pre-wrap">
            {promptOpen === 'readme' ? readme : (() => { const [t, o] = promptOpen.split('|') as [BuilderId, OutputId]; return buildBuilderPrompt(t, o, pkg); })()}
          </pre>
        )}
      </div>

      {/* 4. Optional quick preview */}
      <div className="border border-[#E5E7EB]">
        <button
          type="button"
          onClick={() => setShowPreview(v => !v)}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
        >
          <span className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-[#2575FC]" />
            <span>
              <span className="block text-sm font-medium text-[#111827]">{hasProto ? 'Quick preview' : 'Also make a quick preview (optional)'}</span>
              <span className="block text-[11px] text-[#6B7280]">
                {hasProto
                  ? 'Added to the kit as prototype.html + changes.md. The builder then follows it closely.'
                  : `A rough HTML page to show the client. 2–4 minutes · ≈ ${cost(0.3)}. Without it, the builder designs the page from the kit.`}
              </span>
            </span>
          </span>
          {showPreview ? <ChevronUp className="w-4 h-4 text-[#9CA3AF] shrink-0" /> : <ChevronDown className="w-4 h-4 text-[#9CA3AF] shrink-0" />}
        </button>
        {showPreview && (
          <div className="border-t border-[#E5E7EB] flex flex-col">
            <PreviewPanel
              key={p.page.id}
              designMd={p.project.design_md}
              globals={p.project.globals}
              page={p.page}
              sections={p.sections}
              screenshot={p.screenshot}
              appSettings={p.appSettings}
              onHtmlSaved={p.onHtmlSaved}
              onSectionSync={p.onSectionSync}
              onPageUpdate={p.onPageUpdate}
              onSectionDelete={p.onSectionDelete}
              onSectionRestore={p.onSectionRestore}
            />
          </div>
        )}
      </div>
    </div>
  );
}
