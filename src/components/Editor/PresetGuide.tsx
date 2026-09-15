// src/components/Editor/PresetGuide.tsx
//
// Step 4 — "next steps" checklist for the workflow chosen in the New Project
// wizard. Each step can be ticked automatically from project data and has a
// button that jumps to the right panel.

import { useState } from 'react';
import { CheckCircle, Circle, ChevronDown, ChevronUp, Compass, ArrowRight } from 'lucide-react';
import { PRESETS, getPreset, guideSteps, type GuideStepId } from '../../lib/presets';
import type { ProjectPreset } from '../../types';

interface PresetGuideProps {
  projectId: string;
  preset: ProjectPreset | '' | undefined;
  designUrl?: string;
  done: Partial<Record<GuideStepId, boolean>>;
  onGo: (step: GuideStepId) => void;
  onChangePreset: (preset: ProjectPreset) => void;
}

const storeKey = (id: string) => `bpm_guide_collapsed_${id}`;

export function PresetGuide({ projectId, preset, designUrl, done, onGo, onChangePreset }: PresetGuideProps) {
  const def = getPreset(preset);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(storeKey(projectId)) === '1'; } catch { return false; }
  });
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem(storeKey(projectId), next ? '1' : '0'); } catch { /* ignore */ }
  };

  const picker = (
    <select
      value={def?.id ?? ''}
      onChange={e => e.target.value && onChangePreset(e.target.value as ProjectPreset)}
      className="text-[11px] bg-white border border-[#E5E7EB] px-1.5 py-1 text-[#111827] focus:outline-none focus:border-[#2575FC]"
    >
      {!def && <option value="">Choose a workflow…</option>}
      {PRESETS.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
    </select>
  );

  // Older projects (no preset) and "Set up manually": just offer the picker.
  if (!def || def.id === 'manual') {
    return (
      <div className="flex items-center justify-between gap-3 bg-[#F9FAFB] border border-[#E5E7EB] px-4 py-2 mb-4">
        <span className="flex items-center gap-2 text-xs text-[#6B7280]">
          <Compass className="w-3.5 h-3.5 text-[#9CA3AF]" />
          {def ? 'Manual setup — all options visible.' : 'Pick a workflow to get step-by-step guidance.'}
        </span>
        {picker}
      </div>
    );
  }

  const steps = guideSteps(def, !designUrl && def.id === 'restyle');
  const next = steps.find(s => !done[s.id]);
  const doneCount = steps.filter(s => done[s.id]).length;

  return (
    <div className="bg-white border border-[#2575FC]/30 mb-4">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        <button onClick={toggle} className="flex items-center gap-2 min-w-0 text-left">
          <Compass className="w-4 h-4 text-[#2575FC] shrink-0" />
          <span className="text-sm font-medium text-[#111827] truncate">{def.title}</span>
          <span className="text-[10px] text-[#9CA3AF] shrink-0">{doneCount}/{steps.length}</span>
          {collapsed ? <ChevronDown className="w-3.5 h-3.5 text-[#9CA3AF] shrink-0" /> : <ChevronUp className="w-3.5 h-3.5 text-[#9CA3AF] shrink-0" />}
        </button>
        {picker}
      </div>

      {!collapsed && (
        <ol className="border-t border-[#E5E7EB] px-4 py-3 space-y-2">
          {steps.map((s, i) => {
            const isDone = !!done[s.id];
            const isNext = next?.id === s.id;
            return (
              <li key={s.id} className="flex items-start gap-2.5">
                {isDone
                  ? <CheckCircle className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                  : <Circle className={`w-4 h-4 shrink-0 mt-0.5 ${isNext ? 'text-[#2575FC]' : 'text-[#D1D5DB]'}`} />}
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-medium ${isDone ? 'text-[#9CA3AF] line-through' : 'text-[#111827]'}`}>
                    {i + 1}. {s.label}
                  </p>
                  <p className="text-[11px] text-[#9CA3AF] leading-snug break-words">{s.hint}</p>
                </div>
                <button
                  onClick={() => onGo(s.id)}
                  className={`flex items-center gap-1 text-[11px] px-2 py-1 border shrink-0 transition-colors ${isNext ? 'bg-[#2575FC] border-[#2575FC] text-white hover:bg-[#1a5fe0]' : 'border-[#E5E7EB] text-[#6B7280] hover:border-[#2575FC] hover:text-[#2575FC]'}`}
                >
                  Go <ArrowRight className="w-3 h-3" />
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
