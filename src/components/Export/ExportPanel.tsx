import { useState } from 'react';
import { Download, Copy, FileText, Archive, Loader2, Check, Image } from 'lucide-react';
import type { Project, Page, Section } from '../../types';
import { useExport } from '../../hooks/useExport';
import { generateBlueprintMd, getMasterPrompt } from '../../lib/prompts';
import { ding } from '../../lib/ding';

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

  const pagesWithScreenshots = pages.filter(p => screenshotMap[p.id]);
  const hasAnyScreenshot = pagesWithScreenshots.length > 0;

  const handleCopy = async (content: string, id: string) => {
    const ok = await copyToClipboard(content);
    if (ok) { setCopied(id); setTimeout(() => setCopied(null), 2000); }
  };

  const handleExportZip = async () => {
    await exportZip(project, pages, allSections, screenshotMap, includeScreenshots);
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

  const blueprintPreview = activePage ? generateBlueprintMd(project.globals, activePage, activeSections) : '';
  const promptPreview = getMasterPrompt(includeScreenshots && hasAnyScreenshot);

  return (
    <div className="h-full overflow-auto px-4 py-5 space-y-4">
      <div>
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

        <p className="text-[#9CA3AF] text-[10px] text-center mt-2">
          prompt.txt + design.md + blueprint.md{includeScreenshots && hasAnyScreenshot ? ' + screenshot(s)' : ''}
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
            <span className="text-[#111827] text-xs font-medium">Master Prompt</span>
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
