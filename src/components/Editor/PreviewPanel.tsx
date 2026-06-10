// src/components/Editor/PreviewPanel.tsx
//
// In-app HTML generation + live preview. Rendered in the MAIN content area
// when the "Preview" tab is active.
//
// - Generate / Regenerate (with feedback) using useGenerateHtml
// - Live iframe preview (sandboxed, no scripts — matches the master prompt's
//   "no JavaScript" rule)
// - Compare mode: original screenshot side-by-side with the generated HTML
// - Viewport toggle: desktop / tablet / mobile widths
// - Download as standalone .html / copy to clipboard
// - Generated HTML persists per page via onHtmlSaved (Supabase pages.generated_html)

import { useState } from 'react';
import {
  Wand2, Loader2, AlertCircle, Download, Copy, Check, Columns2,
  Monitor, Tablet, Smartphone, RefreshCw, XCircle,
} from 'lucide-react';
import { useGenerateHtml } from '../../hooks/useGenerateHtml';
import { prepareScreenshotForAI } from '../../lib/screenshot';
import { toast } from '../ui/Toast';
import { ding } from '../../lib/ding';
import type { GlobalSettings, Page, Section, AppSettings } from '../../types';

interface PreviewPanelProps {
  designMd: string;
  globals: GlobalSettings;
  page: Page;
  sections: Section[];
  /** Original page screenshot (data URI or URL) — used for AI reference + compare mode */
  screenshot?: string;
  appSettings: AppSettings;
  onHtmlSaved: (pageId: string, html: string) => void;
}

type Viewport = 'desktop' | 'tablet' | 'mobile';
const VIEWPORT_WIDTHS: Record<Viewport, string> = {
  desktop: '100%',
  tablet: '768px',
  mobile: '390px',
};

export function PreviewPanel({ designMd, globals, page, sections, screenshot, appSettings, onHtmlSaved }: PreviewPanelProps) {
  const [html, setHtml] = useState<string>(page.generated_html || '');
  const [feedback, setFeedback] = useState('');
  const [compare, setCompare] = useState(false);
  const [viewport, setViewport] = useState<Viewport>('desktop');
  const [copied, setCopied] = useState(false);
  const [localStatus, setLocalStatus] = useState('');

  const gen = useGenerateHtml(
    appSettings.aiProvider ?? 'anthropic',
    appSettings.anthropicApiKey,
    appSettings.openaiApiKey ?? ''
  );

  const activeAIKey = appSettings.aiProvider === 'openai' ? appSettings.openaiApiKey : appSettings.anthropicApiKey;
  const hasKey = !!activeAIKey;
  const hasSections = sections.length > 0;

  const runGenerate = async (isRegenerate: boolean) => {
    if (!hasKey || !hasSections) return;

    // Prepare screenshot slices as visual reference (best effort)
    let slices: string[] = [];
    if (screenshot) {
      setLocalStatus('Preparing screenshot reference...');
      slices = await prepareScreenshotForAI(screenshot, 4);
    }
    setLocalStatus('');

    const result = await gen.generate({
      designMd,
      globals,
      page,
      sections,
      screenshots: slices,
      previousHtml: isRegenerate && html ? html : undefined,
      feedback: isRegenerate && feedback.trim() ? feedback.trim() : undefined,
    });

    if (result) {
      setHtml(result.html);
      onHtmlSaved(page.id, result.html);
      setFeedback('');
      ding();
      if (result.truncated) {
        toast('Output hit the token limit — bottom sections may be missing. Try regenerating or simplify the blueprint.', 'warning');
      } else {
        toast(isRegenerate ? 'Prototype updated.' : 'Prototype generated.', 'success');
      }
    }
  };

  const handleDownload = () => {
    if (!html) return;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(page.slug || page.page_name || 'page').replace(/^\//, '').replace(/\s+/g, '-').toLowerCase() || 'page'}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopy = async () => {
    if (!html) return;
    try {
      await navigator.clipboard.writeText(html);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast('Copy failed — use Download instead.', 'error');
    }
  };

  const isBusy = gen.generating || !!localStatus;
  const screenshotSrc = screenshot
    ? (screenshot.startsWith('data:') || screenshot.startsWith('http')
        ? screenshot
        : `data:image/jpeg;base64,${screenshot}`)
    : '';

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="border-b border-[#E5E7EB] bg-white px-4 py-3 shrink-0 space-y-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => runGenerate(false)}
            disabled={!hasKey || !hasSections || isBusy}
            className="flex items-center gap-2 px-4 py-2 bg-[#2575FC] hover:bg-[#1a5fe0] text-white text-sm font-medium rounded-none transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {gen.generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            {html ? 'Generate Fresh' : 'Generate HTML'}
          </button>

          {gen.generating && (
            <button
              onClick={gen.cancel}
              className="flex items-center gap-1.5 px-3 py-2 border border-[#E5E7EB] hover:border-red-400 text-xs text-[#9CA3AF] hover:text-red-500 transition-all"
            >
              <XCircle className="w-3.5 h-3.5" /> Cancel
            </button>
          )}

          <div className="flex-1" />

          {/* Viewport toggle */}
          <div className="flex border border-[#E5E7EB]">
            {([
              { id: 'desktop' as Viewport, icon: Monitor },
              { id: 'tablet' as Viewport, icon: Tablet },
              { id: 'mobile' as Viewport, icon: Smartphone },
            ]).map(({ id, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setViewport(id)}
                disabled={!html}
                title={id}
                className={`p-2 transition-colors disabled:opacity-30 ${viewport === id ? 'bg-[#2575FC]/10 text-[#2575FC]' : 'text-[#9CA3AF] hover:text-[#111827]'}`}
              >
                <Icon className="w-4 h-4" />
              </button>
            ))}
          </div>

          {screenshot && (
            <button
              onClick={() => setCompare(v => !v)}
              disabled={!html}
              className={`flex items-center gap-1.5 px-3 py-2 border text-xs font-medium transition-all disabled:opacity-30 ${compare ? 'bg-[#2575FC]/10 border-[#2575FC] text-[#2575FC]' : 'border-[#E5E7EB] text-[#9CA3AF] hover:text-[#111827] hover:border-[#2575FC]'}`}
              title="Compare with original screenshot"
            >
              <Columns2 className="w-3.5 h-3.5" /> Compare
            </button>
          )}

          <button
            onClick={handleCopy}
            disabled={!html}
            className="flex items-center gap-1.5 px-3 py-2 border border-[#E5E7EB] hover:border-[#2575FC] text-xs text-[#9CA3AF] hover:text-[#111827] font-medium transition-all disabled:opacity-30"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>

          <button
            onClick={handleDownload}
            disabled={!html}
            className="flex items-center gap-1.5 px-3 py-2 border border-[#E5E7EB] hover:border-[#2575FC] text-xs text-[#9CA3AF] hover:text-[#111827] font-medium transition-all disabled:opacity-30"
          >
            <Download className="w-3.5 h-3.5" /> Download .html
          </button>
        </div>

        {/* Feedback / regenerate row */}
        {html && (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={feedback}
              onChange={e => setFeedback(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && feedback.trim() && !isBusy) runGenerate(true); }}
              placeholder='Describe changes, e.g. "Make the hero taller, move the CTA button to the right, lighter gray for section 3 background"'
              disabled={isBusy}
              className="flex-1 bg-white border border-[#E5E7EB] rounded-none px-3 py-2 text-sm text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:border-[#2575FC] transition-all disabled:opacity-50"
            />
            <button
              onClick={() => runGenerate(true)}
              disabled={!feedback.trim() || isBusy}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#F9FAFB] hover:bg-white border border-[#E5E7EB] hover:border-[#2575FC] text-sm text-[#111827] font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Apply Changes
            </button>
          </div>
        )}

        {/* Status / errors */}
        {(isBusy || gen.status || gen.error) && (
          <div className="flex items-center gap-2 bg-[#F9FAFB] border border-[#E5E7EB] px-3 py-2">
            {isBusy && <Loader2 className="w-3.5 h-3.5 text-[#2575FC] animate-spin shrink-0" />}
            {gen.error && !isBusy && <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
            <p className={`text-xs truncate ${gen.error && !isBusy ? 'text-red-600' : 'text-[#9CA3AF]'}`}>
              {localStatus || gen.error || gen.status}
            </p>
          </div>
        )}

        {!hasKey && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-amber-700 text-xs">
              Add your {appSettings.aiProvider === 'openai' ? 'OpenAI' : 'Anthropic'} API key in Settings to generate HTML.
            </p>
          </div>
        )}
        {hasKey && !hasSections && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-amber-700 text-xs">
              This page has no sections yet — import a URL or add sections first.
            </p>
          </div>
        )}
      </div>

      {/* Canvas */}
      <div className="flex-1 overflow-hidden bg-[#F0F1F3]">
        {!html ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="w-12 h-12 border border-[#E5E7EB] bg-white flex items-center justify-center mb-4">
              <Wand2 className="w-5 h-5 text-[#9CA3AF]" />
            </div>
            <h3 className="text-[#9CA3AF] font-medium mb-1">No prototype yet</h3>
            <p className="text-[#9CA3AF] text-sm max-w-md">
              Generate a standalone HTML prototype from this page's design system and blueprint.
              The result renders here and can be downloaded as a single .html file.
            </p>
          </div>
        ) : compare && screenshotSrc ? (
          <div className="grid grid-cols-2 gap-px bg-[#E5E7EB] h-full">
            <div className="bg-white overflow-auto">
              <div className="sticky top-0 z-10 bg-[#F9FAFB] border-b border-[#E5E7EB] px-3 py-1.5 text-[10px] font-medium text-[#9CA3AF] uppercase tracking-wider">Original</div>
              <img src={screenshotSrc} alt="Original page" className="w-full" />
            </div>
            <div className="bg-white overflow-hidden flex flex-col">
              <div className="bg-[#F9FAFB] border-b border-[#E5E7EB] px-3 py-1.5 text-[10px] font-medium text-[#9CA3AF] uppercase tracking-wider shrink-0">Generated</div>
              <iframe
                title="Generated prototype"
                srcDoc={html}
                sandbox=""
                className="w-full flex-1 border-0 bg-white"
              />
            </div>
          </div>
        ) : (
          <div className="h-full flex justify-center overflow-hidden py-0">
            <iframe
              title="Generated prototype"
              srcDoc={html}
              sandbox=""
              style={{ width: VIEWPORT_WIDTHS[viewport], maxWidth: '100%' }}
              className="h-full border-0 bg-white shadow-sm transition-all"
            />
          </div>
        )}
      </div>
    </div>
  );
}
