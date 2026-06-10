import React, { useState, useRef } from 'react';
import { Wand2, Upload, X, Download, Copy, Loader2, AlertCircle, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { AIProvider } from '../../types';
import { getScratchPrompt } from '../../lib/prompts';
import { VibeExportPanel } from './VibeExportPanel';

interface CreatePanelProps {
  provider: AIProvider;
  anthropicKey: string;
  openaiKey: string;
  inline?: boolean;
}

const EXAMPLE_BRIEFS = [
  'A modern homepage for an architects and interior design studio in Mexico City. Full-viewport hero with bold project image, scroll animations, featured projects grid, about section, client logos, and contact CTA. Sophisticated, minimal, editorial.',
  'Landing page for a premium wellness and meditation app. Calming hero with soft gradients, key benefits, testimonials, pricing plans, and app download CTA.',
  'Homepage for a boutique law firm specializing in corporate M&A. Dark navy and gold, hero with appointment CTA, practice areas grid, attorney profiles, contact form.',
];

function extractHtml(raw: string): string {
  const lower = raw.toLowerCase();
  const start = lower.indexOf('<!doctype html');
  if (start !== -1) return raw.slice(start);
  const h = lower.indexOf('<html');
  if (h !== -1) return raw.slice(h);
  return raw.replace(/^```html\s*/i, '').replace(/```\s*$/i, '').trim();
}

export function CreatePanel({ provider, anthropicKey, openaiKey, inline = false }: CreatePanelProps) {
  const [open, setOpen] = useState(false);
  const [brief, setBrief] = useState('');
  const [designMd, setDesignMd] = useState('');
  const [designMdName, setDesignMdName] = useState('');
  const [generatedHtml, setGeneratedHtml] = useState('');
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

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
    const activeKey = provider === 'anthropic' ? anthropicKey : openaiKey;
    if (!activeKey) { setError('No API key set for ' + provider); return; }

    setGenerating(true);
    setError('');
    setStatus('Starting generation...');
    const controller = new AbortController();
    abortRef.current = controller;

    const systemPrompt = getScratchPrompt();
    const userText = `Build a complete standalone HTML page based on this creative brief and design system.\n\n=== CREATIVE BRIEF ===\n${brief.trim()}\n\n=== design.md ===\n${designMd || '(no design.md — infer a clean modern design system from the brief)'}\n\nReturn ONLY the complete HTML document, starting with <!DOCTYPE html>. No explanations before or after.`;

    try {
      if (provider === 'anthropic') {
        // Streaming
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 64000,
            stream: true,
            system: systemPrompt,
            messages: [{ role: 'user', content: userText }],
          }),
          signal: controller.signal,
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error((err as any)?.error?.message ?? `HTTP ${resp.status}`);
        }
        const reader = resp.body!.getReader();
        const dec = new TextDecoder();
        let accumulated = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = dec.decode(value);
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;
            try {
              const evt = JSON.parse(data);
              if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
                accumulated += evt.delta.text;
                setStatus(`Generating... ${(accumulated.length / 1000).toFixed(1)}K characters`);
              }
            } catch {}
          }
        }
        const html = extractHtml(accumulated);
        if (html.length < 200) throw new Error('Model returned no usable HTML — try again.');
        setGeneratedHtml(html);
        setStatus('Page generated successfully.');
      } else {
        // OpenAI non-streaming
        setStatus('Generating with OpenAI...');
        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${activeKey}` },
          body: JSON.stringify({
            model: 'gpt-4.1',
            max_tokens: 32000,
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userText }],
          }),
          signal: controller.signal,
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error((err as any)?.error?.message ?? `HTTP ${resp.status}`);
        }
        const data = await resp.json();
        const html = extractHtml(data.choices?.[0]?.message?.content ?? '');
        if (html.length < 200) throw new Error('Model returned no usable HTML — try again.');
        setGeneratedHtml(html);
        setStatus('Page generated successfully.');
      }
    } catch (err: any) {
      if (err.name === 'AbortError') { setStatus('Cancelled.'); }
      else { setError(err.message ?? 'Unknown error'); setStatus(''); }
    } finally {
      setGenerating(false);
      abortRef.current = null;
    }
  };

  const cancel = () => { abortRef.current?.abort(); };

  const handleDownload = () => {
    const blob = new Blob([generatedHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'generated-page.html'; a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(generatedHtml);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const canGenerate = brief.trim().length > 10 && !generating &&
    !!(provider === 'anthropic' ? anthropicKey : openaiKey);

  return (
    <div className="bg-white border border-[#E5E7EB] mb-4">
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center justify-between px-4 py-3 text-left">
        <div className="flex items-center gap-2">
          <Wand2 className="w-4 h-4 text-indigo-500" />
          <span className="text-[#111827] text-sm font-medium">Generate from Brief</span>
          <span className="text-[10px] px-1.5 py-0.5 bg-indigo-50 text-indigo-600 font-medium rounded">NEW</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-[#9CA3AF]" /> : <ChevronDown className="w-4 h-4 text-[#9CA3AF]" />}
      </button>

      {open && (
        <div className="border-t border-[#E5E7EB] px-4 py-4 space-y-3">
          <p className="text-[11px] text-[#6B7280]">Skip URL scraping — describe the page you want and generate HTML directly from a brief + design.md.</p>

          <div>
            <label className="block text-[10px] font-semibold text-[#374151] uppercase tracking-wide mb-1">Creative Brief <span className="text-red-400">*</span></label>
            <textarea value={brief} onChange={e => setBrief(e.target.value)}
              placeholder="Describe the page: industry, audience, sections, mood, effects..." rows={4}
              className="w-full text-[12px] border border-[#E5E7EB] rounded px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-indigo-300 focus:border-indigo-400 text-[#111827] placeholder-[#9CA3AF] leading-relaxed" />
          </div>

          <div>
            <p className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wide mb-1">Quick examples</p>
            <div className="space-y-1">
              {EXAMPLE_BRIEFS.map((ex, i) => (
                <button key={i} onClick={() => setBrief(ex)}
                  className="w-full text-left text-[11px] text-[#4B5563] bg-[#F9FAFB] hover:bg-indigo-50 hover:text-indigo-700 border border-[#E5E7EB] hover:border-indigo-200 rounded px-2 py-1.5 transition-colors leading-snug">
                  {ex.slice(0, 90)}…
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-[#374151] uppercase tracking-wide mb-1">Design.md <span className="text-[#9CA3AF] font-normal normal-case">(optional but recommended)</span></label>
            {designMd ? (
              <div className="flex items-center justify-between px-3 py-2 bg-indigo-50 border border-indigo-200 rounded">
                <div className="flex items-center gap-2">
                  <CheckCircle size={12} className="text-indigo-500" />
                  <span className="text-[11px] font-medium text-indigo-700">{designMdName}</span>
                  <span className="text-[10px] text-indigo-400">({(designMd.length / 1000).toFixed(1)}K)</span>
                </div>
                <button onClick={() => { setDesignMd(''); setDesignMdName(''); }} className="text-[#9CA3AF] hover:text-red-500"><X size={12} /></button>
              </div>
            ) : (
              <button onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center gap-2 py-2 border border-dashed border-[#D1D5DB] hover:border-indigo-300 hover:bg-indigo-50 rounded transition-colors px-3">
                <Upload size={13} className="text-[#9CA3AF]" />
                <span className="text-[11px] text-[#6B7280]">Upload design.md from Design tab</span>
              </button>
            )}
            <input ref={fileInputRef} type="file" accept=".md,.txt" onChange={handleFileUpload} className="hidden" />
          </div>

          <button onClick={generating ? cancel : handleGenerate} disabled={!canGenerate && !generating}
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded font-semibold text-[13px] transition-all ${generating ? 'bg-red-50 text-red-600 border border-red-200' : canGenerate ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-[#F3F4F6] text-[#9CA3AF] cursor-not-allowed'}`}>
            {generating ? <><Loader2 size={13} className="animate-spin" />Cancel</> : <><Wand2 size={13} />Generate Page</>}
          </button>

          {(status || error) && (
            <div className={`flex items-start gap-2 px-3 py-2 rounded text-[11px] ${error ? 'bg-red-50 text-red-700' : 'bg-indigo-50 text-indigo-700'}`}>
              {error ? <AlertCircle size={11} className="mt-0.5 shrink-0" /> : <Loader2 size={11} className="mt-0.5 shrink-0 animate-spin" />}
              <span>{error || status}</span>
            </div>
          )}

          {/* Export to vibe builders */}
          <VibeExportPanel
            brief={brief}
            designMd={designMd}
            sections=""
          />

          {generatedHtml && (
            <div className="border border-[#E5E7EB] rounded overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-[#F9FAFB] border-b border-[#E5E7EB]">
                <div className="flex items-center gap-1.5">
                  <CheckCircle size={11} className="text-green-500" />
                  <span className="text-[11px] font-medium text-[#374151]">Generated ({(generatedHtml.length / 1000).toFixed(1)}K)</span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={handleCopy} className="flex items-center gap-1 px-2 py-1 text-[11px] text-[#6B7280] hover:text-[#111827] hover:bg-white rounded border border-transparent hover:border-[#E5E7EB]">
                    {copied ? <CheckCircle size={10} className="text-green-500" /> : <Copy size={10} />}
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                  <button onClick={handleDownload} className="flex items-center gap-1 px-2 py-1 text-[11px] bg-indigo-600 text-white hover:bg-indigo-700 rounded">
                    <Download size={10} />Download
                  </button>
                  <button onClick={handleGenerate} disabled={generating} className="flex items-center gap-1 px-2 py-1 text-[11px] text-[#6B7280] hover:text-indigo-600 hover:bg-indigo-50 rounded border border-transparent hover:border-indigo-200">
                    <Wand2 size={10} />Redo
                  </button>
                </div>
              </div>
              <iframe srcDoc={generatedHtml} sandbox="allow-scripts allow-same-origin"
                title="Generated page preview" className="w-full border-0 bg-white" style={{ height: '400px' }} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
