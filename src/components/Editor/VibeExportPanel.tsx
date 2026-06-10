import React, { useState } from 'react';
import { Copy, ExternalLink, CheckCircle, Wand2, ChevronDown, ChevronUp, Zap } from 'lucide-react';
import { buildVibePrompt, VIBE_TARGETS, VibeTarget } from '../../lib/vibePrompt';

interface VibeExportPanelProps {
  brief: string;
  designMd: string;
  sections?: string;
}

export function VibeExportPanel({ brief, designMd, sections }: VibeExportPanelProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<VibeTarget>('lovable');
  const [copied, setCopied] = useState<VibeTarget | null>(null);
  const [preview, setPreview] = useState(false);

  const canExport = brief.trim().length > 10;

  const handleCopy = async (target: VibeTarget) => {
    const prompt = buildVibePrompt(target, { brief, designMd, sections });
    await navigator.clipboard.writeText(prompt);
    setCopied(target);
    setTimeout(() => setCopied(null), 2500);
  };

  const handleOpenPlatform = (target: VibeTarget) => {
    const t = VIBE_TARGETS.find(t => t.id === target);
    if (t?.url) window.open(t.url, '_blank');
  };

  const currentPrompt = buildVibePrompt(selected, { brief, designMd, sections });

  return (
    <div className="bg-white border border-[#E5E7EB] mb-4">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-500" />
          <span className="text-[#111827] text-sm font-medium">Export to Vibe Builder</span>
          <span className="text-[10px] px-1.5 py-0.5 bg-amber-50 text-amber-600 font-medium rounded">Lovable · Bolt · Replit · v0</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-[#9CA3AF]" /> : <ChevronDown className="w-4 h-4 text-[#9CA3AF]" />}
      </button>

      {open && (
        <div className="border-t border-[#E5E7EB] px-4 py-4 space-y-4">
          <p className="text-[11px] text-[#6B7280] leading-relaxed">
            Assembles an optimised prompt for each platform using your brief + design.md.
            Copy it, open the platform, paste — and let their AI do the rendering.
          </p>

          {!canExport && (
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-700">
              <Wand2 size={11} />
              Fill in the Creative Brief above first (min 10 characters)
            </div>
          )}

          {/* Platform grid */}
          <div className="grid grid-cols-5 gap-1.5">
            {VIBE_TARGETS.map(t => (
              <button
                key={t.id}
                onClick={() => setSelected(t.id)}
                className={`flex flex-col items-center gap-1 py-2 px-1 rounded-lg border transition-all ${
                  selected === t.id
                    ? 'border-2 bg-white shadow-sm'
                    : 'border-[#E5E7EB] bg-[#F9FAFB] hover:bg-white'
                }`}
                style={selected === t.id ? { borderColor: t.color } : {}}
              >
                <span
                  className="text-[11px] font-bold"
                  style={{ color: t.color }}
                >
                  {t.label}
                </span>
                <span className="text-[9px] text-[#9CA3AF] text-center leading-tight hidden sm:block">
                  {t.description.split(' ').slice(0, 2).join(' ')}
                </span>
              </button>
            ))}
          </div>

          {/* Selected platform description */}
          {(() => {
            const t = VIBE_TARGETS.find(t => t.id === selected)!;
            return (
              <div className="flex items-center justify-between px-3 py-2 bg-[#F9FAFB] rounded-lg border border-[#E5E7EB]">
                <div>
                  <span className="text-[12px] font-semibold" style={{ color: t.color }}>{t.label}</span>
                  <span className="text-[11px] text-[#6B7280] ml-2">{t.description}</span>
                </div>
                <span className="text-[10px] text-[#9CA3AF]">{currentPrompt.length.toLocaleString()} chars</span>
              </div>
            );
          })()}

          {/* Prompt preview toggle */}
          <button
            onClick={() => setPreview(v => !v)}
            className="w-full flex items-center justify-between text-[11px] text-[#6B7280] hover:text-[#111827] transition-colors"
          >
            <span>Preview prompt</span>
            {preview ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>

          {preview && (
            <pre className="text-[10px] font-mono text-[#374151] bg-[#F9FAFB] border border-[#E5E7EB] rounded p-3 max-h-48 overflow-y-auto whitespace-pre-wrap leading-relaxed">
              {currentPrompt}
            </pre>
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => handleCopy(selected)}
              disabled={!canExport}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded font-semibold text-[13px] transition-all ${
                !canExport
                  ? 'bg-[#F3F4F6] text-[#9CA3AF] cursor-not-allowed'
                  : copied === selected
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-amber-500 text-white hover:bg-amber-600'
              }`}
            >
              {copied === selected
                ? <><CheckCircle size={13} />Copied!</>
                : <><Copy size={13} />Copy {VIBE_TARGETS.find(t => t.id === selected)?.label} Prompt</>
              }
            </button>

            {VIBE_TARGETS.find(t => t.id === selected)?.url && (
              <button
                onClick={() => handleOpenPlatform(selected)}
                className="flex items-center gap-1.5 px-3 py-2.5 text-[12px] font-medium text-[#6B7280] hover:text-[#111827] border border-[#E5E7EB] hover:border-[#9CA3AF] rounded transition-all"
                title={`Open ${VIBE_TARGETS.find(t => t.id === selected)?.label}`}
              >
                <ExternalLink size={13} />
                Open
              </button>
            )}
          </div>

          {/* One-click for all platforms */}
          <div className="pt-1 border-t border-[#E5E7EB]">
            <p className="text-[10px] text-[#9CA3AF] mb-2">Or copy for a specific platform:</p>
            <div className="flex flex-wrap gap-1.5">
              {VIBE_TARGETS.filter(t => t.id !== selected).map(t => (
                <button
                  key={t.id}
                  onClick={() => handleCopy(t.id)}
                  disabled={!canExport}
                  className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded border transition-all ${
                    !canExport
                      ? 'border-[#E5E7EB] text-[#9CA3AF] cursor-not-allowed'
                      : copied === t.id
                      ? 'bg-green-50 text-green-700 border-green-200'
                      : 'border-[#E5E7EB] text-[#6B7280] hover:bg-[#F9FAFB] hover:text-[#111827]'
                  }`}
                >
                  {copied === t.id ? <CheckCircle size={10} /> : <Copy size={10} />}
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
