// src/components/Export/ExportPanel.tsx
//
// Export panel for the Export tab in the editor. Assembles a ZIP with
// prompt.txt, design.md, blueprint.md (per page), copy.md, images.md,
// fact-check.md, screenshots, and a README — then downloads it.

import { useState } from 'react';
import { Download, Loader2, FileText, Image as ImageIcon, CheckCircle, Copy } from 'lucide-react';
import { useExport } from '../../hooks/useExport';
import { generateBlueprintMd } from '../../lib/prompts';
import { ding } from '../../lib/ding';
import type { Project, Page, Section } from '../../types';

interface ExportPanelProps {
  project: Project;
  pages: Page[];
  allSections: Record<string, Section[]>;
  activePage: Page | null;
  activeSections: Section[];
  screenshotMap: Record<string, string>;
}

export function ExportPanel({ project, pages, allSections, activePage, activeSections, screenshotMap }: ExportPanelProps) {
  const { exportZip, downloadFile, copyToClipboard, exporting } = useExport();
  const [includeScreenshots, setIncludeScreenshots] = useState(true);
  const [copied, setCopied] = useState(false);

  const handleExportZip = () => {
    exportZip(project, pages, allSections, screenshotMap, includeScreenshots);
    ding();
  };

  const handleDownloadBlueprint = () => {
    if (!activePage) return;
    const md = generateBlueprintMd(project.globals, activePage, activeSections);
    downloadFile(md, `blueprint-${activePage.slug || activePage.page_name.toLowerCase().replace(/\s+/g, '-')}.md`, 'text/markdown');
  };

  const handleDownloadDesign = () => {
    if (!project.design_md) return;
    downloadFile(project.design_md, 'design.md', 'text/markdown');
  };

  const handleCopyBlueprint = async () => {
    if (!activePage) return;
    const md = generateBlueprintMd(project.globals, activePage, activeSections);
    if (await copyToClipboard(md)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const hasDesign = !!project.design_md;
  const hasPages = pages.length > 0;
  const hasScreenshots = Object.values(screenshotMap).some(Boolean);

  return (
    <div className="h-full overflow-auto p-4 space-y-4">
      <div className="bg-white border border-[#E5E7EB] p-4">
        <h3 className="text-[#111827] font-medium text-sm mb-1">Export Blueprint Package</h3>
        <p className="text-[11px] text-[#9CA3AF] leading-relaxed mb-4">
          Downloads a ZIP with everything an AI builder needs: the master prompt, design.md, a blueprint per page,
          verbatim copy, real image URLs, fact-check notes, and optional screenshots.
        </p>

        <div className="space-y-2 mb-4">
          <div className="flex items-center gap-2 text-xs">
            <CheckCircle className={`w-3.5 h-3.5 ${hasDesign ? 'text-green-600' : 'text-[#E5E7EB]'}`} />
            <span className={hasDesign ? 'text-[#111827]' : 'text-[#9CA3AF]'}>design.md {hasDesign ? 'ready' : 'not set — extract it in the Design tab'}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <CheckCircle className={`w-3.5 h-3.5 ${hasPages ? 'text-green-600' : 'text-[#E5E7EB]'}`} />
            <span className={hasPages ? 'text-[#111827]' : 'text-[#9CA3AF]'}>{pages.length} page{pages.length === 1 ? '' : 's'} ready</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <CheckCircle className={`w-3.5 h-3.5 ${hasScreenshots ? 'text-green-600' : 'text-[#E5E7EB]'}`} />
            <span className={hasScreenshots ? 'text-[#111827]' : 'text-[#9CA3AF]'}>{Object.keys(screenshotMap).length} screenshot{Object.keys(screenshotMap).length === 1 ? '' : 's'} captured</span>
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer select-none mb-4">
          <input
            type="checkbox"
            checked={includeScreenshots}
            onChange={e => setIncludeScreenshots(e.target.checked)}
            className="w-3.5 h-3.5 accent-[#2575FC]"
          />
          <span className="text-xs text-[#9CA3AF]">Include screenshots in ZIP</span>
        </label>

        <button
          onClick={handleExportZip}
          disabled={exporting || !hasPages}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#2575FC] hover:bg-[#1a5fe0] text-white rounded-none text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Download ZIP
        </button>
      </div>

      <div className="bg-white border border-[#E5E7EB] p-4">
        <h3 className="text-[#111827] font-medium text-sm mb-1">Individual Files</h3>
        <p className="text-[11px] text-[#9CA3AF] leading-relaxed mb-4">
          Download or copy just the current page's blueprint or the design system.
        </p>

        <div className="space-y-2">
          <button
            onClick={handleDownloadBlueprint}
            disabled={!activePage}
            className="w-full flex items-center gap-2 py-2 px-3 bg-[#F9FAFB] hover:bg-white border border-[#E5E7EB] hover:border-[#2575FC] rounded-none text-xs text-[#111827] font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <FileText className="w-3.5 h-3.5 text-[#9CA3AF]" />
            Download blueprint.md {activePage ? `(${activePage.page_name})` : ''}
          </button>

          <button
            onClick={handleCopyBlueprint}
            disabled={!activePage}
            className="w-full flex items-center gap-2 py-2 px-3 bg-[#F9FAFB] hover:bg-white border border-[#E5E7EB] hover:border-[#2575FC] rounded-none text-xs text-[#111827] font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {copied ? <CheckCircle className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5 text-[#9CA3AF]" />}
            {copied ? 'Copied!' : `Copy blueprint.md ${activePage ? `(${activePage.page_name})` : ''}`}
          </button>

          <button
            onClick={handleDownloadDesign}
            disabled={!hasDesign}
            className="w-full flex items-center gap-2 py-2 px-3 bg-[#F9FAFB] hover:bg-white border border-[#E5E7EB] hover:border-[#2575FC] rounded-none text-xs text-[#111827] font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <FileText className="w-3.5 h-3.5 text-[#9CA3AF]" />
            Download design.md
          </button>
        </div>
      </div>

      {activePage && (activePage.copy_md || activePage.images_md) && (
        <div className="bg-white border border-[#E5E7EB] p-4">
          <h3 className="text-[#111827] font-medium text-sm mb-1">Captured Assets</h3>
          <p className="text-[11px] text-[#9CA3AF] leading-relaxed mb-3">
            Verbatim text and real image URLs captured at import — included in the ZIP automatically.
          </p>
          <div className="flex items-center gap-4">
            {activePage.copy_md && (
              <div className="flex items-center gap-1.5 text-xs text-green-600">
                <CheckCircle className="w-3.5 h-3.5" />
                copy.md
              </div>
            )}
            {activePage.images_md && (
              <div className="flex items-center gap-1.5 text-xs text-green-600">
                <ImageIcon className="w-3.5 h-3.5" />
                images.md
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
