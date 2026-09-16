// src/components/ui/ModelSelect.tsx
//
// Dropdown for a project's AI model (lib/models). Models the server doesn't
// allow (ai-proxy status) or whose provider has no key are shown disabled.

import { MODEL_OPTIONS, modelInfo } from '../../lib/models';
import type { KeyStatus } from '../../lib/aiProxy';

interface ModelSelectProps {
  value: string;
  onChange: (id: string) => void;
  status: KeyStatus | null;
  compact?: boolean;
  disabled?: boolean;
  id?: string;
}

export function ModelSelect({ value, onChange, status, compact, disabled, id }: ModelSelectProps) {
  const current = modelInfo(value);
  const reason = (m: (typeof MODEL_OPTIONS)[number]): string => {
    if (!status) return '';
    const allowed = m.provider === 'openai' ? status.models.openai : status.models.anthropic;
    if (!allowed.includes(m.id)) return 'not enabled on the server';
    const hasKey = m.provider === 'openai' ? status.keys.openai.set : status.keys.anthropic.set;
    return hasKey ? '' : `no ${m.provider === 'openai' ? 'OpenAI' : 'Anthropic'} key`;
  };
  return (
    <select
      id={id}
      value={current.id}
      disabled={disabled}
      onChange={e => onChange(e.target.value)}
      title={`${current.label} — ${current.note} · $${current.input} / $${current.output} per million tokens (in / out)`}
      aria-label="AI model"
      className={`bg-white border border-[#E5E7EB] text-[#111827] focus:outline-none focus:border-[#2575FC] disabled:opacity-50 ${compact ? 'text-xs px-2 py-1.5 max-w-[190px]' : 'w-full text-sm px-3 py-2'}`}
    >
      {MODEL_OPTIONS.map(m => {
        const why = reason(m);
        return (
          <option key={m.id} value={m.id} disabled={!!why && m.id !== current.id}>
            {compact ? m.label : `${m.label} — ${m.note} ($${m.input} / $${m.output})`}{why ? ` (${why})` : ''}
          </option>
        );
      })}
    </select>
  );
}
