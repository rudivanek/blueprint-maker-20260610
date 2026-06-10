import React, { useState, useRef } from 'react';
import { Wand2, Upload, X, Download, Copy, Loader2, AlertCircle, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useGenerateHtml } from '../../hooks/useGenerateHtml';
import { AIProvider } from '../../types';

interface CreatePanelProps {
  provider: AIProvider;
  anthropicKey: string;
  openaiKey: string;
}

const EXAMPLE_BRIEFS = [
  'A modern homepage for an architects and interior design studio based in Mexico City. Full-viewport hero with a bold project image, smooth scroll animations, a featured projects grid, about section with partner photos, client logos, and a contact CTA. Sophisticated, minimal, editorial feel.',
  'Landing page for a premium wellness and meditation app. Calming hero with soft gradients, key benefits section, testimonials carousel, pricing plans, and app download CTA. Clean and trustworthy.',
  'Homepage for a boutique law firm specializing in corporate M&A. Professional dark navy and gold palette, hero with headline and appointment CTA, practice areas grid, attorney profiles, and a contact form.',
];

export function CreatePanel({ provider, anthropicKey, openaiKey }: CreatePanelProps) {
  const [brief, setBrief] = useState('');
  const [designMd, setDesignMd] = useState('');
  const [designMdName, setDesignMdName] = useState('');
  const [generatedHtml, setGeneratedHtml] = useState('');
  const [copied, setCopied] = useState(false);
  const [showDesignMd, setShowDesignMd] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const { generateFromScratch, cancel, generating, status, error } = useGenerateHtml(
    provider, anthropicKey, openaiKey
  );

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDesignMdName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => setDesignMd(ev.target?.result as string ?? '');
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleGenerate = async () => {
    if (!brief.trim()) return;
    const result = await generateFromScratch({
      designMd: designMd || '(no design.md provided — infer a clean, modern design system from the brief)',
      brief: brief.trim(),
    });
    if (result?.html) {
      setGeneratedHtml(result.html);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([generatedHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'generated-page.html';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(generatedHtml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const canGenerate = brief.trim().length > 10 && !generating &&
    (provider === 'anthropic' ? anthropicKey : openaiKey);

  return (
    <div className="flex flex-col h-full bg-white">

      {/* Header */}
      <div className="px-4 py-3 border-b border-[#E5E7EB]">
        <div className="flex items-center gap-2 mb-1">
          <Wand2 size={15} className="text-indigo-500" />
          <span className="text-[13px] font-semibold text-[#111827]">Generate from Brief</span>
        </div>
        <p className="text-[11px] text-[#6B7280] leading-relaxed">
          Describe the page you want. Optionally upload a design.md to anchor colors, fonts, and spacing.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-4">

          {/* Brief textarea */}
          <div>
            <label className="block text-[11px] font-semibold text-[#374151] uppercase tracking-wide mb-1.5">
              Creative Brief <span className="text-red-400">*</span>
            </label>
            <textarea
              value={brief}
              onChange={e => setBrief(e.target.value)}
              placeholder="Describe the page you want to build. Be specific: industry, audience, sections, mood, effects..."
              rows={6}
              className="w-full text-[12px] border border-[#E5E7EB] rounded-lg px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 text-[#111827] placeholder-[#9CA3AF] leading-relaxed"
            />
            <p className="text-[10px] text-[#9CA3AF] mt-1">{brief.length} characters</p>
          </div>

          {/* Example briefs */}
          <div>
            <p className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wide mb-1.5">Examples</p>
            <div className="space-y-1.5">
              {EXAMPLE_BRIEFS.map((ex, i) => (
                <button
                  key={i}
                  onClick={() => setBrief(ex)}
                  className="w-full text-left text-[11px] text-[#4B5563] bg-[#F9FAFB] hover:bg-indigo-50 hover:text-indigo-700 border border-[#E5E7EB] hover:border-indigo-200 rounded-md px-2.5 py-1.5 transition-colors line-clamp-2 leading-snug"
                >
                  {ex.slice(0, 80)}…
                </button>
              ))}
            </div>
          </div>

          {/* Design.md upload */}
          <div>
            <label className="block text-[11px] font-semibold text-[#374151] uppercase tracking-wide mb-1.5">
              Design System <span className="text-[#9CA3AF] font-normal normal-case">(optional)</span>
            </label>

            {designMd ? (
              <div className="border border-[#E5E7EB] rounded-lg overflow-hidden">
                {/* File header */}
                <div className="flex items-center justify-between px-3 py-2 bg-indigo-50 border-b border-[#E5E7EB]">
                  <div className="flex items-center gap-2">
                    <CheckCircle size={13} className="text-indigo-500" />
                    <span className="text-[11px] font-medium text-indigo-700">{designMdName || 'design.md'}</span>
                    <span className="text-[10px] text-indigo-400">({(designMd.length / 1000).toFixed(1)}K chars)</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setShowDesignMd(v => !v)}
                      className="p-1 hover:bg-indigo-100 rounded text-indigo-500"
                      title={showDesignMd ? 'Collapse' : 'Preview'}
                    >
                      {showDesignMd ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                    <button
                      onClick={() => { setDesignMd(''); setDesignMdName(''); setShowDesignMd(false); }}
                      className="p-1 hover:bg-red-100 rounded text-[#6B7280] hover:text-red-500"
                      title="Remove"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
                {/* Collapsible preview */}
                {showDesignMd && (
                  <pre className="text-[10px] text-[#374151] p-3 max-h-48 overflow-y-auto font-mono leading-relaxed whitespace-pre-wrap bg-white">
                    {designMd.slice(0, 2000)}{designMd.length > 2000 ? '\n\n... (truncated for preview)' : ''}
                  </pre>
                )}
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex flex-col items-center gap-2 py-5 border-2 border-dashed border-[#D1D5DB] hover:border-indigo-300 hover:bg-indigo-50 rounded-lg transition-colors group"
              >
                <Upload size={18} className="text-[#9CA3AF] group-hover:text-indigo-400 transition-colors" />
                <div className="text-center">
                  <p className="text-[12px] font-medium text-[#6B7280] group-hover:text-indigo-600">Upload design.md</p>
                  <p className="text-[10px] text-[#9CA3AF] mt-0.5">Generated by Blueprint-Maker or written manually</p>
                </div>
              </button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.txt"
              onChange={handleFileUpload}
              className="hidden"
            />

            {!designMd && (
              <p className="text-[10px] text-[#9CA3AF] mt-1.5 leading-relaxed">
                Without a design.md the AI will infer a design system from your brief. For better results, first extract design.md from a reference site in the Design tab.
              </p>
            )}
          </div>

          {/* Generate button */}
          <button
            onClick={generating ? cancel : handleGenerate}
            disabled={!canGenerate && !generating}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg font-semibold text-[13px] transition-all ${
              generating
                ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
                : canGenerate
                ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm hover:shadow-md'
                : 'bg-[#F3F4F6] text-[#9CA3AF] cursor-not-allowed'
            }`}
          >
            {generating ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Cancel
              </>
            ) : (
              <>
                <Wand2 size={14} />
                Generate Page
              </>
            )}
          </button>

          {/* Status */}
          {(status || error) && (
            <div className={`flex items-start gap-2 px-3 py-2 rounded-lg text-[11px] ${
              error ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-indigo-50 text-indigo-700'
            }`}>
              {error
                ? <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
                : <Loader2 size={12} className="mt-0.5 flex-shrink-0 animate-spin" />
              }
              <span className="leading-snug">{error || status}</span>
            </div>
          )}

        </div>
      </div>

      {/* Preview + actions — shown when HTML exists */}
      {generatedHtml && (
        <div className="border-t border-[#E5E7EB] flex flex-col" style={{ height: '55%' }}>

          {/* Actions bar */}
          <div className="flex items-center justify-between px-3 py-2 bg-[#F9FAFB] border-b border-[#E5E7EB]">
            <div className="flex items-center gap-1.5">
              <CheckCircle size={12} className="text-green-500" />
              <span className="text-[11px] font-medium text-[#374151]">Generated</span>
              <span className="text-[10px] text-[#9CA3AF]">({(generatedHtml.length / 1000).toFixed(1)}K)</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 px-2 py-1 text-[11px] text-[#6B7280] hover:text-[#111827] hover:bg-white border border-transparent hover:border-[#E5E7EB] rounded transition-all"
              >
                {copied ? <CheckCircle size={11} className="text-green-500" /> : <Copy size={11} />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <button
                onClick={handleDownload}
                className="flex items-center gap-1 px-2 py-1 text-[11px] bg-indigo-600 text-white hover:bg-indigo-700 rounded transition-colors"
              >
                <Download size={11} />
                Download
              </button>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="flex items-center gap-1 px-2 py-1 text-[11px] text-[#6B7280] hover:text-indigo-600 hover:bg-indigo-50 border border-transparent hover:border-indigo-200 rounded transition-all"
              >
                <Wand2 size={11} />
                Redo
              </button>
            </div>
          </div>

          {/* Iframe preview */}
          <iframe
            ref={iframeRef}
            srcDoc={generatedHtml}
            sandbox="allow-scripts allow-same-origin"
            title="Generated page preview"
            className="flex-1 w-full border-0 bg-white"
          />
        </div>
      )}
    </div>
  );
}
