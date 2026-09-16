import { useState } from 'react';
import { Download, Copy, FileText, Archive, Loader2, Check, Image, ShieldCheck, AlertTriangle } from 'lucide-react';
import type { Project, Page, Section } from '../../types';
import { useExport } from '../../hooks/useExport';
import { generateBlueprintMd } from '../../lib/prompts';
import { BUILDERS, OUTPUTS, buildBuilderPrompt, comboLabel, combos, promptFileName, readTargets, saveTargets, type BuilderId, type ExportTargets, type OutputId } from '../../lib/builderPrompts';
import { readChanges } from '../../lib/changeLog';
import { ding } from '../../lib/ding';
import { checkFabrication } from '../../lib/pageAssets';
import { syncStatus } from '../../lib/syncStatus';

interface ExportPanelProps {
  project: Project;
  pages: Page[];
  allSections: Record<string, Section[]>;
  activePage: Page | null;
  activeSections: Section[];
  screenshotMap: Record<string, string>;
}

export function ExportPanel({ project, pages, allSections, activePage, activeSections, screenshotMap }: ExportPanelProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [includeScreenshots, setIncludeScreenshots] = useState(false);
  const { exportZip, downloadFile, copyToClipboard, exporting } = useExport();
  // "Build with" (tools) × "Output" (React / single HTML) — one prompt per combination, remembered in this browser
  const [targets, setTargets] = useState<ExportTargets>(readTargets);
  const [previewKey, setPreviewKey] = useState('');
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
  const comboList = combos(targets);
  const previewCombo = comboList.find(c => `${c.tool}-${c.output}` === previewKey) ?? comboList[0];

  const pagesWithScreenshots = pages.filter(p => screenshotMap[p.id]);
  const hasAnyScreenshot = pagesWithScreenshots.length > 0;

  const handleCopy = async (content: string, id: string) => {
    const ok = await copyToClipboard(content);
    if (ok) { setCopied(id); setTimeout(() => setCopied(null), 2000); }
  };

  const handleExportZip = async () => {
    await exportZip(project, pages, allSections, screenshotMap, includeScreenshots, targets);
    ding();
  };

  const handleDownloadDesign = () => {
    if (!project.design_md) return;
    downloadFile(project.design_md, 'design.md', 'text/markdown');
  };

  const handleDownloadBlueprint = () => {
    if (!activePage) return;
    const md = generateBlueprintMd(project.globals, activePage, activeSections);
    const filename = pages.length > 1 ? `blueprint-${activePage.slug || activePage.page_name.toLowerCase().replace(/\s+/g, '-')}.md` : 'blueprint.md';
    downloadFile(md, filename, 'text/markdown');
  };

  const factFindings = activePage?.copy_md ? checkFabrication(activeSections, activePage.copy_md) : null;

  const handleDownloadCopy = () => {
    if (activePage?.copy_md) downloadFile(activePage.copy_md, 'copy.md', 'text/markdown');
  };
  const handleDownloadImages = () => {
    if (activePage?.images_md) downloadFile(activePage.images_md, 'images.md', 'text/markdown');
  };

  const blueprintPreview = activePage ? generateBlueprintMd(project.globals, activePage, activeSections) : '';
  const promptPreview = buildBuilderPrompt(previewCombo.tool, previewCombo.output, {
    projectName: project.name,
    hasDesign: !!project.design_md,
    hasPrototype: pages.some(p => p.generated_html),
    hasChanges: pages.some(p => p.generated_html || readChanges(p).length),
    hasCopy: pages.some(p => p.copy_md),
    hasImages: pages.some(p => p.images_md),
    hasScreenshots: includeScreenshots && hasAnyScreenshot,
    hasSite: true,
    sectionCount: pages.length === 1 ? activeSections.length : undefined,
    pages: pages.map(p => p.page_name),
  });

  // Pages whose prototype no longer matches their sections / the design (only pages whose sections are loaded)
  const outdatedPages = pages.filter(pg => {
    const secs = pg.id === activePage?.id ? activeSections : allSections[pg.id];
    return !!secs && syncStatus(project, pg, secs).prototype === 'outdated';
  });

  return (
    <div className="h-full overflow-auto px-4 py-5 space-y-4">
      <div>
        <p className="text-[11px] font-medium text-[#111827] mb-1.5">Build with</p>
        <div className="flex flex-wrap gap-1.5 mb-2.5">
          {BUILDERS.map(b => (
            <Chip key={b.id} on={targets.tools.includes(b.id)} title={b.hint} onClick={() => toggle('tools', b.id as BuilderId)}>{b.label}</Chip>
          ))}
        </div>
        <p className="text-[11px] font-medium text-[#111827] mb-1.5">Output</p>
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {OUTPUTS.map(o => (
            <Chip key={o.id} on={targets.outputs.includes(o.id)} title={o.hint} onClick={() => toggle('outputs', o.id as OutputId)}>{o.label}</Chip>
          ))}
        </div>
        <p className="text-[10px] text-[#9CA3AF] mb-3">
          {comboList.length} prompt{comboList.length === 1 ? '' : 's'} in the ZIP — one per tool and output. Choose several of each if you like.
        </p>
        <button
          onClick={handleExportZip}
          disabled={exporting}
          className="w-full flex items-center justify-center gap-2.5 bg-[#2575FC] hover:bg-[#1a5fe0] disabled:opacity-50 text-white font-semibold text-sm py-3 rounded-none transition-all"
        >
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
          Export Package (.zip)
        </button>

        <label className="flex items-center gap-2.5 mt-3 px-1 cursor-pointer select-none">
          <div
            onClick={() => setIncludeScreenshots(v => !v)}
            className={`w-8 h-4 rounded-full transition-colors flex items-center px-0.5 shrink-0 ${includeScreenshots ? 'bg-[#2575FC]' : 'bg-[#E5E7EB]'}`}
          >
            <div className={`w-3 h-3 rounded-full bg-white shadow transition-transform ${includeScreenshots ? 'translate-x-4' : 'translate-x-0'}`} />
          </div>
          <div>
            <span className="text-[#111827] text-xs font-medium">Include screenshots</span>
            {hasAnyScreenshot ? (
              <span className="block text-[10px] text-[#9CA3AF]">
                {pagesWithScreenshots.length} page{pagesWithScreenshots.length !== 1 ? 's' : ''} with screenshots
              </span>
            ) : (
              <span className="block text-[10px] text-[#9CA3AF]">No screenshots captured yet</span>
            )}
          </div>
        </label>

        {outdatedPages.length > 0 && (
          <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-800">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
            <span>
              Outdated prototype: <b>{outdatedPages.map(pg => pg.page_name).join(', ')}</b>. Its prototype.html shows the old content — update it in Preview first.
            </span>
          </div>
        )}

        <p className="text-[#9CA3AF] text-[10px] text-center mt-2">
          {comboList.length > 2 ? `${comboList.length} prompts` : comboList.map(c => promptFileName(c.tool, c.output)).join(' + ')} + design.md + blueprint.md + site.md{pages.some(p => p.copy_md) ? ' + copy.md + images.md + fact-check.md' : ''}{pages.some(p => p.generated_html) ? ' + prototype.html + changes.md' : ''}{includeScreenshots && hasAnyScreenshot ? ' + screenshot(s)' : ''}
        </p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleDownloadDesign}
          disabled={!project.design_md}
          className="flex-1 flex items-center justify-center gap-2 bg-white hover:bg-[#F9FAFB] border border-[#E5E7EB] hover:border-[#2575FC] disabled:opacity-40 text-[#111827] text-xs font-medium py-2.5 rounded-none transition-all"
        >
          <Download className="w-3.5 h-3.5" /> design.md
        </button>
        <button
          onClick={handleDownloadBlueprint}
          disabled={!activePage}
          className="flex-1 flex items-center justify-center gap-2 bg-white hover:bg-[#F9FAFB] border border-[#E5E7EB] hover:border-[#2575FC] disabled:opacity-40 text-[#111827] text-xs font-medium py-2.5 rounded-none transition-all"
        >
          <Download className="w-3.5 h-3.5" /> blueprint.md
        </button>
      </div>

      {activePage && (activePage.copy_md || activePage.images_md) && (
        <div className="flex gap-2">
          <button
            onClick={handleDownloadCopy}
            disabled={!activePage.copy_md}
            className="flex-1 flex items-center justify-center gap-2 bg-white hover:bg-[#F9FAFB] border border-[#E5E7EB] hover:border-[#2575FC] disabled:opacity-40 text-[#111827] text-xs font-medium py-2.5 rounded-none transition-all"
          >
            <Download className="w-3.5 h-3.5" /> copy.md
          </button>
          <button
            onClick={handleDownloadImages}
            disabled={!activePage.images_md}
            className="flex-1 flex items-center justify-center gap-2 bg-white hover:bg-[#F9FAFB] border border-[#E5E7EB] hover:border-[#2575FC] disabled:opacity-40 text-[#111827] text-xs font-medium py-2.5 rounded-none transition-all"
          >
            <Download className="w-3.5 h-3.5" /> images.md
          </button>
        </div>
      )}

      {factFindings && (
        <div className={`border overflow-hidden ${factFindings.length ? 'bg-amber-50 border-amber-200' : 'bg-white border-[#E5E7EB]'}`}>
          <div className="flex items-center gap-2 px-4 py-3">
            {factFindings.length
              ? <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              : <ShieldCheck className="w-3.5 h-3.5 text-green-600" />}
            <span className="text-[#111827] text-xs font-medium">
              {factFindings.length
                ? `${factFindings.length} text${factFindings.length === 1 ? '' : 's'} not found on the original page`
                : 'All blueprint text matches the original page'}
            </span>
          </div>
          {factFindings.length > 0 && (
            <ul className="px-4 pb-3 space-y-1.5">
              {factFindings.slice(0, 6).map((f, i) => (
                <li key={i} className="text-[11px] text-amber-800 break-words">
                  <span className="font-medium">{f.sectionName} · {f.field}:</span> {f.text}
                </li>
              ))}
              {factFindings.length > 6 && (
                <li className="text-[11px] text-amber-700">…and {factFindings.length - 6} more (see fact-check.md in the ZIP)</li>
              )}
            </ul>
          )}
        </div>
      )}

      {hasAnyScreenshot && (
        <div className="bg-white border border-[#E5E7EB] overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[#E5E7EB]">
            <Image className="w-3.5 h-3.5 text-[#9CA3AF]" />
            <span className="text-[#111827] text-xs font-medium">Screenshots</span>
            <span className="ml-auto text-[10px] bg-[#F9FAFB] border border-[#E5E7EB] text-[#9CA3AF] px-2 py-0.5">
              {pagesWithScreenshots.length} captured
            </span>
          </div>
          <div className="p-2 space-y-1.5">
            {pagesWithScreenshots.map(page => {
              const data = screenshotMap[page.id];
              const src = data.startsWith('data:') || data.startsWith('http') ? data : `data:image/jpeg;base64,${data}`;
              return (
                <div key={page.id} className="flex items-center gap-2">
                  <img src={src} alt={page.page_name} className="w-12 h-8 object-cover object-top shrink-0 border border-[#E5E7EB]" />
                  <span className="text-[#111827] text-xs truncate">{page.page_name}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-white border border-[#E5E7EB] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#E5E7EB]">
          <div className="flex items-center gap-2">
            <FileText className="w-3.5 h-3.5 text-[#9CA3AF]" />
            <span className="text-[#111827] text-xs font-medium">Prompt for</span>
            <select
              value={`${previewCombo.tool}-${previewCombo.output}`}
              onChange={e => setPreviewKey(e.target.value)}
              aria-label="Prompt for which tool"
              className="text-xs border border-[#E5E7EB] bg-white px-1.5 py-0.5 focus:outline-none focus:border-[#2575FC] max-w-[200px]"
            >
              {comboList.map(c => <option key={`${c.tool}-${c.output}`} value={`${c.tool}-${c.output}`}>{comboLabel(c.tool, c.output)}</option>)}
            </select>
          </div>
          <button
            onClick={() => handleCopy(promptPreview, 'prompt')}
            className="flex items-center gap-1.5 text-xs text-[#9CA3AF] hover:text-[#2575FC] transition-colors"
          >
            {copied === 'prompt' ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
            {copied === 'prompt' ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <div className="px-4 py-3 max-h-40 overflow-auto">
          <pre className="text-[#9CA3AF] text-[11px] font-mono leading-relaxed whitespace-pre-wrap">{promptPreview.slice(0, 300)}...</pre>
        </div>
      </div>

      {blueprintPreview && (
        <div className="bg-white border border-[#E5E7EB] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#E5E7EB]">
            <div className="flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-[#9CA3AF]" />
              <span className="text-[#111827] text-xs font-medium">blueprint.md preview</span>
            </div>
            <button
              onClick={() => handleCopy(blueprintPreview, 'blueprint')}
              className="flex items-center gap-1.5 text-xs text-[#9CA3AF] hover:text-[#2575FC] transition-colors"
            >
              {copied === 'blueprint' ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
              {copied === 'blueprint' ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <div className="px-4 py-3 max-h-60 overflow-auto">
            <pre className="text-[#9CA3AF] text-[11px] font-mono leading-relaxed whitespace-pre-wrap">{blueprintPreview.slice(0, 800)}{blueprintPreview.length > 800 ? '\n...' : ''}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({ on, title, onClick, children }: { on: boolean; title: string; onClick: () => void; children: React.ReactNode }) {
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
