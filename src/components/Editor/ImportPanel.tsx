// src/components/Editor/ImportPanel.tsx
//
// STEP 4: second source "Paste my content" — the user's own Markdown/text is
// turned into simple HTML and runs through the same structure import. The text
// itself is saved as the page's copy.md (verbatim), images.md stays empty.
//
// CHANGE IN THIS VERSION:
// - The Firecrawl full-page screenshot is now sliced (lib/screenshot.ts) and
//   sent to the AI alongside the HTML, for both the normal import path and the
//   WordPress/Elementor path. Compact-mode re-import reuses the same slices.

import { useState, useRef } from 'react';
import { ScanLine, Loader2, AlertCircle, CheckCircle, RefreshCw, Globe, FileText } from 'lucide-react';
import { useFirecrawl } from '../../hooks/useFirecrawl';
import { useAI } from '../../hooks/useAI';
import { prepareScreenshotForAI } from '../../lib/screenshot';
import { buildCopyMd, buildImagesMd } from '../../lib/pageAssets';
import { contentToHtml, contentToCopyMd } from '../../lib/presets';
import { toast } from '../ui/Toast';
import { ding } from '../../lib/ding';
import type { GlobalSettings, Section, AppSettings } from '../../types';

interface ImportPanelProps {
  projectUrl: string;
  pageUrl: string;
  appSettings: AppSettings;
  onStructureImported: (
    sections: Partial<Section>[],
    globals: Partial<GlobalSettings>,
    screenshotUrl?: string,
    assets?: { copyMd: string; imagesMd: string },
  ) => void;
  onPageUrlChange: (url: string) => void;
  /** Step 4: which source tab is selected first */
  initialSource?: 'url' | 'paste';
  /** Step 4: content written in the New Project wizard */
  initialContent?: string;
  pageName?: string;
}

type ImportStatus = 'idle' | 'loading' | 'success' | 'error' | 'truncated';

export function ImportPanel({ projectUrl, pageUrl, appSettings, onStructureImported, onPageUrlChange, initialSource = 'url', initialContent = '', pageName = 'Page' }: ImportPanelProps) {
  const [url, setUrl] = useState(pageUrl || projectUrl || '');
  const [source, setSource] = useState<'url' | 'paste'>(initialSource);
  const [content, setContent] = useState(initialContent);
  const [isWordPress, setIsWordPress] = useState(false);
  const [structureStatus, setStructureStatus] = useState<ImportStatus>('idle');
  const [currentStatus, setCurrentStatus] = useState('');
  const lastRawHtml = useRef<string | null>(null);
  const lastScreenshotSlices = useRef<string[]>([]);
  const lastScreenshotUrl = useRef<string | undefined>(undefined);
  const lastAssets = useRef<{ copyMd: string; imagesMd: string } | undefined>(undefined);
  const [showCompact, setShowCompact] = useState(false);

  const firecrawl = useFirecrawl();
  const ai = useAI(appSettings.aiProvider ?? 'anthropic');

  const activeAIKey = appSettings.aiProvider === 'openai' ? appSettings.openaiApiKey : appSettings.anthropicApiKey;
  const hasKeys = !!(appSettings.firecrawlApiKey && activeAIKey);
  const providerLabel = appSettings.aiProvider === 'openai' ? 'OpenAI (GPT-4.1)' : 'Anthropic (Claude)';
  const hasAIKey = !!activeAIKey;

  const runImport = async (rawHtml: string, compactMode: boolean, screenshotSlices: string[], screenshotUrl?: string, fromContent = false) => {
    const result = await ai.importPageStructure(rawHtml, compactMode, screenshotSlices, fromContent ? 'content-import' : 'structure-import');
    if (!result) throw new Error(ai.error || 'AI failed to import structure');

    onStructureImported(result.sections, result.globals, screenshotUrl, lastAssets.current);

    if (result.wasTruncated && result.sections.length === 0) {
      setStructureStatus('truncated');
      setCurrentStatus('Import failed — no sections parsed.');
      setShowCompact(true);
      toast('Response may be incomplete — use "Re-import (compact mode)" to capture all sections.', 'warning');
    } else {
      ding();
      if (result.wasTruncated) {
        // Some sections may be missing at the end — offer the shorter re-import.
        setStructureStatus('truncated');
        setCurrentStatus(`Imported ${result.sections.length} sections, but the answer was cut off — the last sections may be missing. Try "Re-import (compact mode)".`);
        setShowCompact(true);
        toast('The import was cut off. Check the last sections or re-import in compact mode.', 'warning');
      } else {
        setStructureStatus('success');
        setCurrentStatus('Page structure imported.');
        setShowCompact(false);
      }
    }
  };

  const handleStructureImport = async () => {
    if (!url || !hasKeys) return;
    setStructureStatus('loading');
    setShowCompact(false);
    setCurrentStatus('Crawling site for page structure...');
    onPageUrlChange(url);

    try {
      setCurrentStatus('Fetching HTML and screenshot...');
      const crawlResult = await firecrawl.scrapeForStructure(url);
      if (!crawlResult) throw new Error(firecrawl.error || 'Firecrawl failed');

      // Prepare screenshot slices for the AI (best effort — empty array on failure)
      setCurrentStatus('Preparing screenshot for visual analysis...');
      const screenshotSlices = await prepareScreenshotForAI(crawlResult.screenshot);
      if (screenshotSlices.length === 0 && crawlResult.screenshot) {
        toast('Screenshot could not be prepared — importing from HTML only.', 'warning');
      }

      // Verbatim copy + real image URLs, captured without AI (saved with the page, exported in the ZIP)
      try {
        lastAssets.current = {
          copyMd: buildCopyMd(crawlResult.rawHtml, url, crawlResult.markdown),
          imagesMd: buildImagesMd(crawlResult.rawHtml, url),
        };
      } catch (err) {
        console.warn('Could not build copy.md / images.md:', err);
        lastAssets.current = undefined;
      }

      let htmlToProcess = crawlResult.rawHtml;

      if (isWordPress) {
        // For Elementor/WP sites rawHtml is mostly empty JS wrappers.
        // Use markdown (rendered DOM) + rawHtml (for image/video/link URLs) combined.
        setCurrentStatus('Extracting WordPress/Elementor content...');
        const extracted = await ai.extractWordPressContent(crawlResult.rawHtml, crawlResult.markdown, screenshotSlices);
        if (!extracted) throw new Error(ai.error || 'Failed to extract WordPress content');
        htmlToProcess = extracted;
      }

      lastRawHtml.current = htmlToProcess;
      lastScreenshotSlices.current = screenshotSlices;
      lastScreenshotUrl.current = crawlResult.screenshot;

      setCurrentStatus(`Analyzing page structure with ${providerLabel}...`);
      await runImport(htmlToProcess, false, screenshotSlices, crawlResult.screenshot);
    } catch (e) {
      setStructureStatus('error');
      setCurrentStatus(e instanceof Error ? e.message : 'Unknown error');
    }
  };

  const handleContentImport = async () => {
    if (content.trim().length < 20 || !hasAIKey) return;
    setStructureStatus('loading');
    setShowCompact(false);
    setCurrentStatus('Turning your content into sections...');
    try {
      const html = contentToHtml(content);
      lastAssets.current = { copyMd: contentToCopyMd(content, pageName), imagesMd: '' };
      lastRawHtml.current = html;
      lastScreenshotSlices.current = [];
      lastScreenshotUrl.current = undefined;
      setCurrentStatus(`Analyzing your content with ${providerLabel}...`);
      await runImport(html, false, [], undefined, true);
    } catch (e) {
      setStructureStatus('error');
      setCurrentStatus(e instanceof Error ? e.message : 'Unknown error');
    }
  };

  const handleCompactReimport = async () => {
    if (!lastRawHtml.current) return;
    setStructureStatus('loading');
    setCurrentStatus('Re-importing in compact mode...');

    try {
      await runImport(lastRawHtml.current, true, lastScreenshotSlices.current, lastScreenshotUrl.current);
    } catch (e) {
      setStructureStatus('error');
      setCurrentStatus(e instanceof Error ? e.message : 'Unknown error');
    }
  };

  const isLoading = structureStatus === 'loading' || firecrawl.loading || ai.loading;

  return (
    <div className="bg-white border border-[#E5E7EB] p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[#111827] font-medium text-sm">Import Structure</h3>
        <span className="text-[10px] px-2 py-0.5 bg-[#F9FAFB] border border-[#E5E7EB] text-[#9CA3AF] font-medium">
          {providerLabel}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-1.5 mb-3">
        {([
          { id: 'url' as const, icon: Globe, label: 'From URL' },
          { id: 'paste' as const, icon: FileText, label: 'Paste my content' },
        ]).map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setSource(id)}
            disabled={isLoading}
            className={`flex items-center justify-center gap-1.5 py-2 text-xs border transition-all disabled:opacity-50 ${source === id ? 'bg-[#2575FC]/5 border-[#2575FC] text-[#2575FC]' : 'bg-white border-[#E5E7EB] text-[#9CA3AF] hover:text-[#111827]'}`}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {source === 'url' ? (
        <>
      <div className="mb-3">
        <input
          type="url"
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder={projectUrl || 'https://example.com/page'}
          disabled={isLoading}
          className="w-full bg-white border border-[#E5E7EB] rounded-none px-3 py-2.5 text-sm text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:border-[#2575FC] transition-all disabled:opacity-50"
        />
        {projectUrl && url !== projectUrl && (
          <p className="text-[10px] text-[#9CA3AF] mt-1">
            Using page-specific URL (project default: {projectUrl})
          </p>
        )}
      </div>

      <div className="mb-3">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isWordPress}
            onChange={e => setIsWordPress(e.target.checked)}
            disabled={isLoading}
            className="w-3.5 h-3.5 accent-[#2575FC]"
          />
          <span className="text-xs text-[#9CA3AF]">WordPress site — clean HTML before import</span>
        </label>
        {isWordPress && (
          <p className="text-[10px] text-amber-500 mt-1.5 leading-relaxed">
            ⚠ For Elementor-based sites, leaving this unchecked may produce better results — Elementor renders content via JS which limits what the cleaner can extract.
          </p>
        )}
      </div>

      {!hasKeys && (
        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 px-3 py-2.5 mb-3">
          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-amber-700 text-xs">
            No Firecrawl or {appSettings.aiProvider === 'openai' ? 'OpenAI' : 'Anthropic'} key on the server yet. Add them in Settings.
          </p>
        </div>
      )}

      <button
        onClick={handleStructureImport}
        disabled={!url || !hasKeys || isLoading}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#F9FAFB] hover:bg-white border border-[#E5E7EB] hover:border-[#2575FC] rounded-none text-sm text-[#111827] font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {structureStatus === 'loading' ? <Loader2 className="w-4 h-4 text-[#2575FC] animate-spin" /> :
         structureStatus === 'success' ? <CheckCircle className="w-4 h-4 text-green-600" /> :
         structureStatus === 'truncated' ? <AlertCircle className="w-4 h-4 text-yellow-600" /> :
         structureStatus === 'error' ? <AlertCircle className="w-4 h-4 text-red-600" /> :
         <ScanLine className="w-4 h-4 text-[#9CA3AF]" />}
        Import This Page
      </button>

        </>
      ) : (
        <>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            disabled={isLoading}
            rows={10}
            placeholder={'# Hero title\nSubtitle…\n\n## Services\n- Service one: description\n\n## Contact\n…'}
            className="w-full bg-white border border-[#E5E7EB] rounded-none px-3 py-2.5 text-xs font-mono leading-relaxed text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:border-[#2575FC] transition-all disabled:opacity-50 resize-y mb-1"
          />
          <p className="text-[10px] text-[#9CA3AF] mb-3">Each # or ## heading starts a section. Your text is saved as copy.md and used word for word. No Firecrawl call.</p>
          {!hasAIKey && (
            <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 px-3 py-2.5 mb-3">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-amber-700 text-xs">No {appSettings.aiProvider === 'openai' ? 'OpenAI' : 'Anthropic'} key on the server yet. Add it in Settings.</p>
            </div>
          )}
          <button
            onClick={handleContentImport}
            disabled={content.trim().length < 20 || !hasAIKey || isLoading}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#F9FAFB] hover:bg-white border border-[#E5E7EB] hover:border-[#2575FC] rounded-none text-sm text-[#111827] font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {structureStatus === 'loading' ? <Loader2 className="w-4 h-4 text-[#2575FC] animate-spin" /> :
             structureStatus === 'success' ? <CheckCircle className="w-4 h-4 text-green-600" /> :
             structureStatus === 'error' ? <AlertCircle className="w-4 h-4 text-red-600" /> :
             <FileText className="w-4 h-4 text-[#9CA3AF]" />}
            Build Sections
          </button>
        </>
      )}

      {showCompact && lastRawHtml.current && (
        <button
          onClick={handleCompactReimport}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-2 py-2.5 mt-2 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-none text-sm text-amber-700 font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <RefreshCw className="w-4 h-4" />
          Re-import (compact mode)
        </button>
      )}

      {(isLoading || currentStatus) && (
        <div className="flex items-center gap-2 bg-[#F9FAFB] border border-[#E5E7EB] px-3 py-2 mt-2">
          {isLoading && <Loader2 className="w-3.5 h-3.5 text-[#2575FC] animate-spin shrink-0" />}
          <p className="text-[#9CA3AF] text-xs break-words">
            {isLoading ? (ai.status || firecrawl.status || currentStatus) : (currentStatus || ai.status)}
          </p>
        </div>
      )}
    </div>
  );
}
