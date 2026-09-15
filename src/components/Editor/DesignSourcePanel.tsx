import { useState, useRef } from 'react';
import { Link, ExternalLink, Upload, Code, Loader2, AlertCircle, CheckCircle, Ruler } from 'lucide-react';
import { useFirecrawl } from '../../hooks/useFirecrawl';
import { useAI } from '../../hooks/useAI';
import { prepareScreenshotForAI } from '../../lib/screenshot';
import { ding } from '../../lib/ding';
import { fetchDesignTokens, summarizeTokens, annotateInferredColors, fontWarnings } from '../../lib/designTokens';
import type { AppSettings } from '../../types';

interface DesignSourcePanelProps {
  projectUrl: string;
  appSettings: AppSettings;
  /** meta: the scraped screenshot + which URL it came from (used for the project thumbnail) */
  onDesignGenerated: (designMd: string, meta?: { screenshot?: string; sourceUrl?: string }) => void;
  /** Step 4: preset decides the starting mode */
  initialMode?: SourceMode;
  /** Step 4: reference URL chosen in the New Project wizard */
  initialOtherUrl?: string;
}

export type SourceMode = 'page-url' | 'different-url' | 'upload' | 'paste-html';
type Status = 'idle' | 'loading' | 'success' | 'error';

export function DesignSourcePanel({ projectUrl, appSettings, onDesignGenerated, initialMode, initialOtherUrl }: DesignSourcePanelProps) {
  const [mode, setMode] = useState<SourceMode>(initialMode ?? (projectUrl || !initialOtherUrl ? 'page-url' : 'different-url'));
  const [differentUrl, setDifferentUrl] = useState(initialOtherUrl ?? '');
  const [pastedHtml, setPastedHtml] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  // Result of the stylesheet measurement (extract-design-tokens edge function)
  const [cssSummary, setCssSummary] = useState<{ text: string; warning: string | null } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const firecrawl = useFirecrawl();
  const ai = useAI(appSettings.aiProvider ?? 'anthropic');

  const activeAIKey = appSettings.aiProvider === 'openai' ? appSettings.openaiApiKey : appSettings.anthropicApiKey;
  const hasAPIKeys = !!(appSettings.firecrawlApiKey && activeAIKey);
  const hasAIKey = !!activeAIKey;
  const providerLabel = appSettings.aiProvider === 'openai' ? 'OpenAI' : 'Anthropic';

  const extractFromUrl = async (url: string) => {
    if (!url || !hasAPIKeys) return;
    setStatus('loading');
    setStatusMsg('Fetching site with Firecrawl...');

    try {
      const crawlResult = await firecrawl.scrapeForDesign(url);
      if (!crawlResult) throw new Error(firecrawl.error || 'Firecrawl failed');

      // In parallel: screenshot slices (visual ground truth) and measured CSS
      // from the site's real stylesheets (exact values). The CSS step is
      // optional — if it fails, extraction continues without it.
      setStatusMsg('Reading stylesheets and preparing screenshot...');
      setCssSummary(null);
      const [screenshotSlices, tokens] = await Promise.all([
        prepareScreenshotForAI(crawlResult.screenshot, 3),
        fetchDesignTokens(url, crawlResult.rawHtml),
      ]);

      if (tokens.data) {
        const d = tokens.data.diagnostics;
        const warnings = [
          d.cssLooksInsufficient ? `CSS looks incomplete: ${d.insufficientReasons.join('; ')}` : '',
          ...fontWarnings(tokens.data),
        ].filter(Boolean);
        setCssSummary({ text: summarizeTokens(tokens.data), warning: warnings.length ? warnings.join(' · ') : null });
      } else {
        setCssSummary({ text: 'Stylesheets not measured', warning: `${tokens.error ?? 'Unknown error'} — using inline CSS and screenshot only.` });
      }

      const sources = [screenshotSlices.length > 0 ? 'screenshot' : '', tokens.data ? 'measured CSS' : ''].filter(Boolean);
      setStatusMsg(`Analyzing design system with ${providerLabel}${sources.length ? ` (with ${sources.join(' + ')})` : ''}...`);
      const designMd = await ai.generateDesignSystem(
        crawlResult.extract,
        crawlResult.rawHtml,
        screenshotSlices,
        tokens.data?.digest,
      );
      if (!designMd) throw new Error(ai.error || 'AI failed to generate design system');

      // Safety net: mark every colour the stylesheets don't contain as "(inferred)".
      let finalMd = designMd;
      let inferredNote = '';
      if (tokens.data) {
        const { text, marked } = annotateInferredColors(designMd, tokens.data);
        finalMd = text;
        if (marked > 0) inferredNote = ` ${marked} colour row${marked === 1 ? '' : 's'} not found in the CSS marked (inferred).`;
      }

      onDesignGenerated(finalMd, { screenshot: crawlResult.screenshot, sourceUrl: url });
      setStatus('success');
      setStatusMsg(`Design system extracted.${inferredNote}`);
      ding();
    } catch (e) {
      setStatus('error');
      setStatusMsg(e instanceof Error ? e.message : 'Unknown error');
    }
  };

  const handleExtract = () => {
    if (mode === 'page-url') extractFromUrl(projectUrl);
    else if (mode === 'different-url') extractFromUrl(differentUrl);
  };

  const handleExtractFromHtml = async () => {
    if (!pastedHtml.trim() || !hasAIKey) return;
    setStatus('loading');
    setStatusMsg(`Analyzing design system with ${providerLabel}...`);

    try {
      const designMd = await ai.generateDesignSystem({}, pastedHtml);
      if (!designMd) throw new Error(ai.error || 'AI failed to generate design system');

      onDesignGenerated(designMd);
      setStatus('success');
      setStatusMsg('Design system extracted.');
      ding();
    } catch (e) {
      setStatus('error');
      setStatusMsg(e instanceof Error ? e.message : 'Unknown error');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.md') && file.type !== 'text/markdown' && file.type !== 'text/plain') {
      setStatus('error');
      setStatusMsg('Please select a .md file.');
      return;
    }

    setStatus('loading');
    setStatusMsg('Reading file...');
    const reader = new FileReader();
    reader.onload = ev => {
      const content = ev.target?.result as string;
      if (!content?.trim()) {
        setStatus('error');
        setStatusMsg('File appears to be empty.');
        return;
      }
      onDesignGenerated(content);
      setStatus('success');
      setStatusMsg('Design file loaded.');
      ding();
    };
    reader.onerror = () => {
      setStatus('error');
      setStatusMsg('Failed to read file.');
    };
    reader.readAsText(file);

    // reset so same file can be re-selected
    e.target.value = '';
  };

  const isLoading = status === 'loading' || firecrawl.loading || ai.loading;

  const modeButtons: { id: SourceMode; icon: typeof Link; label: string; desc: string }[] = [
    { id: 'page-url', icon: Link, label: 'Page URL', desc: 'Use main project URL' },
    { id: 'different-url', icon: ExternalLink, label: 'Other URL', desc: 'Use a reference site' },
    { id: 'upload', icon: Upload, label: 'Upload .md', desc: 'Load from file' },
    { id: 'paste-html', icon: Code, label: 'Paste HTML', desc: 'Paste raw HTML code' },
  ];

  return (
    <div className="border-b border-[#E5E7EB] shrink-0">
      <div className="px-4 py-3 border-b border-[#E5E7EB]">
        <p className="text-[#9CA3AF] text-xs font-medium mb-2.5">Design Source</p>
        <div className="grid grid-cols-2 gap-1.5">
          {modeButtons.map(({ id, icon: Icon, label, desc }) => (
            <button
              key={id}
              type="button"
              onClick={() => { setMode(id); setStatus('idle'); setStatusMsg(''); }}
              disabled={isLoading}
              className={`flex flex-col items-center gap-1 px-2 py-2.5 border text-center transition-all disabled:opacity-50 ${
                mode === id
                  ? 'bg-[#2575FC]/5 border-[#2575FC] text-[#2575FC]'
                  : 'bg-white border-[#E5E7EB] text-[#9CA3AF] hover:border-[#2575FC] hover:text-[#111827]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="text-[10px] font-medium leading-tight">{label}</span>
              <span className="text-[9px] opacity-60 leading-tight">{desc}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-3 space-y-2.5">
        {mode === 'page-url' && (
          <div>
            <div className="bg-[#F9FAFB] border border-[#E5E7EB] px-3 py-2 text-xs text-[#9CA3AF] font-mono truncate">
              {projectUrl || <span className="italic">No URL set on project</span>}
            </div>
            {!hasAPIKeys && <MissingKeysWarning provider={appSettings.aiProvider ?? 'anthropic'} />}
            <button
              onClick={handleExtract}
              disabled={!projectUrl || !hasAPIKeys || isLoading}
              className="mt-2 w-full flex items-center justify-center gap-2 py-2 bg-[#2575FC]/5 hover:bg-[#2575FC]/10 border border-[#2575FC]/30 hover:border-[#2575FC] rounded-none text-xs text-[#2575FC] font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Extract Design System
            </button>
          </div>
        )}

        {mode === 'different-url' && (
          <div>
            <input
              type="url"
              value={differentUrl}
              onChange={e => { setDifferentUrl(e.target.value); setStatus('idle'); }}
              placeholder="https://reference-site.com"
              disabled={isLoading}
              className="w-full bg-white border border-[#E5E7EB] rounded-none px-3 py-2 text-xs text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:border-[#2575FC] transition-all disabled:opacity-50"
            />
            {!hasAPIKeys && <MissingKeysWarning provider={appSettings.aiProvider ?? 'anthropic'} />}
            <button
              onClick={handleExtract}
              disabled={!differentUrl || !hasAPIKeys || isLoading}
              className="mt-2 w-full flex items-center justify-center gap-2 py-2 bg-[#2575FC]/5 hover:bg-[#2575FC]/10 border border-[#2575FC]/30 hover:border-[#2575FC] rounded-none text-xs text-[#2575FC] font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Extract Design System
            </button>
          </div>
        )}

        {mode === 'upload' && (
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,text/markdown,text/plain"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className="w-full flex flex-col items-center gap-2 py-5 border-2 border-dashed border-[#E5E7EB] hover:border-[#2575FC] text-[#9CA3AF] hover:text-[#2575FC] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Upload className="w-5 h-5" />
              <div className="text-center">
                <p className="text-xs font-medium">Click to select .md file</p>
                <p className="text-[10px] opacity-60 mt-0.5">design.md or any markdown file</p>
              </div>
            </button>
          </div>
        )}

        {mode === 'paste-html' && (
          <div>
            <textarea
              value={pastedHtml}
              onChange={e => { setPastedHtml(e.target.value); setStatus('idle'); setStatusMsg(''); }}
              placeholder="Paste raw HTML here..."
              disabled={isLoading}
              rows={8}
              className="w-full bg-white border border-[#E5E7EB] rounded-none px-3 py-2 text-xs text-[#111827] placeholder-[#9CA3AF] font-mono focus:outline-none focus:border-[#2575FC] transition-all disabled:opacity-50 resize-none"
            />
            {!hasAIKey && <MissingAIKeyWarning provider={appSettings.aiProvider ?? 'anthropic'} />}
            <button
              onClick={handleExtractFromHtml}
              disabled={!pastedHtml.trim() || !hasAIKey || isLoading}
              className="mt-2 w-full flex items-center justify-center gap-2 py-2 bg-[#2575FC]/5 hover:bg-[#2575FC]/10 border border-[#2575FC]/30 hover:border-[#2575FC] rounded-none text-xs text-[#2575FC] font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Extract Design from HTML
            </button>
          </div>
        )}

        {(isLoading || statusMsg) && (
          <div className="flex items-center gap-2 bg-[#F9FAFB] border border-[#E5E7EB] px-3 py-2">
            {isLoading && <Loader2 className="w-3 h-3 text-[#2575FC] animate-spin shrink-0" />}
            {status === 'success' && !isLoading && <CheckCircle className="w-3 h-3 text-green-600 shrink-0" />}
            {status === 'error' && !isLoading && <AlertCircle className="w-3 h-3 text-red-600 shrink-0" />}
            <p className={`text-[11px] break-words ${status === 'error' ? 'text-red-600' : status === 'success' ? 'text-green-600' : 'text-[#9CA3AF]'}`}>
              {status === 'loading' ? (statusMsg || ai.status || firecrawl.status) : statusMsg}
            </p>
          </div>
        )}

        {cssSummary && (mode === 'page-url' || mode === 'different-url') && (
          <div className={`border px-3 py-2 ${cssSummary.warning ? 'bg-amber-50 border-amber-200' : 'bg-[#F9FAFB] border-[#E5E7EB]'}`}>
            <div className="flex items-start gap-2">
              <Ruler className={`w-3 h-3 shrink-0 mt-0.5 ${cssSummary.warning ? 'text-amber-500' : 'text-[#2575FC]'}`} />
              <div className="min-w-0">
                <p className="text-[11px] text-[#111827] break-words">{cssSummary.text}</p>
                {cssSummary.warning && <p className="text-[11px] text-amber-700 break-words mt-0.5">{cssSummary.warning}</p>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MissingKeysWarning({ provider }: { provider: string }) {
  const name = provider === 'openai' ? 'OpenAI' : 'Anthropic';
  return (
    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 px-3 py-2 mt-2">
      <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
      <p className="text-amber-700 text-[11px]">Add your Firecrawl and {name} API keys in Settings.</p>
    </div>
  );
}

function MissingAIKeyWarning({ provider }: { provider: string }) {
  const name = provider === 'openai' ? 'OpenAI' : 'Anthropic';
  return (
    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 px-3 py-2 mt-2">
      <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
      <p className="text-amber-700 text-[11px]">Add your {name} API key in Settings.</p>
    </div>
  );
}

