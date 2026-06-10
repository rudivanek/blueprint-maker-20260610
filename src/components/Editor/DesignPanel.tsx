import { useState } from 'react';
import type { ReactNode } from 'react';
import { FileText, CreditCard as Edit3, Eye } from 'lucide-react';

interface DesignPanelProps {
  designMd: string;
  onChange: (value: string) => void;
  topSlot?: ReactNode;
}

export function DesignPanel({ designMd, onChange, topSlot }: DesignPanelProps) {
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');

  const isEmpty = !designMd.trim();

  return (
    <div className="flex flex-col h-full">
      {topSlot}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#E5E7EB] shrink-0">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-[#9CA3AF]" />
          <span className="text-[#111827] text-sm font-medium">design.md</span>
          {!isEmpty && <span className="text-[10px] bg-green-100 text-green-700 border border-green-200 px-2 py-0.5">generated</span>}
        </div>
        <div className="flex bg-[#F9FAFB] border border-[#E5E7EB] p-0.5">
          <button
            onClick={() => setMode('edit')}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs transition-all ${mode === 'edit' ? 'bg-white text-[#2575FC] shadow-sm' : 'text-[#9CA3AF] hover:text-[#111827]'}`}
          >
            <Edit3 className="w-3 h-3" /> Edit
          </button>
          <button
            onClick={() => setMode('preview')}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs transition-all ${mode === 'preview' ? 'bg-white text-[#2575FC] shadow-sm' : 'text-[#9CA3AF] hover:text-[#111827]'}`}
          >
            <Eye className="w-3 h-3" /> Preview
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {mode === 'edit' ? (
          <textarea
            value={designMd}
            onChange={e => onChange(e.target.value)}
            placeholder={`# Design System: Your Brand\n\nExtract a design system using the Import panel to populate this file, or write it manually.\n\nThis file will be exported as design.md and used by AI tools to maintain visual consistency.`}
            className="w-full h-full bg-transparent px-4 py-3 text-xs text-[#111827] font-mono leading-relaxed resize-none focus:outline-none placeholder-[#9CA3AF]"
            spellCheck={false}
          />
        ) : (
          <div className="overflow-auto h-full px-4 py-3">
            {isEmpty ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <FileText className="w-8 h-8 text-[#E5E7EB] mb-3" />
                <p className="text-[#9CA3AF] text-sm">No design system yet</p>
                <p className="text-[#9CA3AF] text-xs mt-1">Use the Import panel to generate one</p>
              </div>
            ) : (
              <MarkdownPreview content={designMd} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MarkdownPreview({ content }: { content: string }) {
  const lines = content.split('\n');

  return (
    <div className="font-mono text-xs space-y-1">
      {lines.map((line, i) => {
        if (line.startsWith('# ')) return <h1 key={i} className="text-[#111827] font-bold text-sm mt-3 mb-1">{line.slice(2)}</h1>;
        if (line.startsWith('## ')) return <h2 key={i} className="text-[#2575FC] font-semibold text-xs mt-2 mb-0.5">{line.slice(3)}</h2>;
        if (line.startsWith('### ')) return <h3 key={i} className="text-[#111827] font-medium mt-1">{line.slice(4)}</h3>;
        if (line.startsWith('```')) return <div key={i} className="bg-[#F9FAFB] border border-[#E5E7EB] px-2 py-0.5 text-[#9CA3AF]">{line}</div>;
        if (line.startsWith('|')) return <div key={i} className="text-[#9CA3AF] font-mono">{line}</div>;
        if (line.startsWith('- ')) return <div key={i} className="text-[#111827] pl-2">{line}</div>;
        if (line === '') return <div key={i} className="h-2" />;
        return <div key={i} className="text-[#9CA3AF]">{line}</div>;
      })}
    </div>
  );
}
