// src/components/Settings/UsageCard.tsx
//
// Step 5 — usage from the api_usage table (everything that went through
// ai-proxy): calls, tokens, estimated cost, scrapes, by day / project / task.

import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Loader2, AlertCircle } from 'lucide-react';
import { getUsage, type KeyStatus, type UsageRow } from '../../lib/aiProxy';
import { costFor, formatCost, formatTokens } from '../../lib/usage';
import { supabase } from '../../lib/supabase';

const PURPOSE_LABELS: Record<string, string> = {
  'design-system': 'Design system',
  'design-from-html': 'Design from HTML',
  'wp-extract': 'WordPress extract',
  'structure-import': 'Import structure',
  'content-import': 'Import my content',
  'generate-html': 'Generate preview',
  'regenerate-html': 'Regenerate preview',
  'brief-html': 'Generate from brief',
  'scrape-design': 'Scrape (design)',
  'scrape-structure': 'Scrape (structure)',
};

type Group = 'day' | 'project' | 'purpose';

interface Agg { key: string; calls: number; scrapes: number; input: number; output: number; cost: number; problems: number }

export function UsageCard({ status }: { status: KeyStatus | null }) {
  const [days, setDays] = useState(30);
  const [group, setGroup] = useState<Group>('day');
  const [rows, setRows] = useState<UsageRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    setRows(null);
    setError(null);
    getUsage(days)
      .then(r => { if (alive) setRows(r); })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; };
  }, [days]);

  useEffect(() => {
    const ids = [...new Set((rows ?? []).map(r => r.project_id).filter(Boolean))] as string[];
    if (!ids.length) return;
    supabase.from('projects').select('id,name').in('id', ids).then(({ data }) => {
      setProjectNames(Object.fromEntries((data ?? []).map(p => [p.id, p.name])));
    });
  }, [rows]);

  const { total, groups } = useMemo(() => {
    const map = new Map<string, Agg>();
    const total: Agg = { key: 'total', calls: 0, scrapes: 0, input: 0, output: 0, cost: 0, problems: 0 };
    for (const r of rows ?? []) {
      const key = group === 'day'
        ? r.created_at.slice(0, 10)
        : group === 'project'
          ? (r.project_id ? projectNames[r.project_id] ?? 'Deleted / unknown project' : 'No project')
          : PURPOSE_LABELS[r.purpose] ?? r.purpose;
      const a = map.get(key) ?? { key, calls: 0, scrapes: 0, input: 0, output: 0, cost: 0, problems: 0 };
      const cost = r.provider === 'firecrawl' ? 0 : costFor(r.model, r.input_tokens, r.output_tokens);
      for (const t of [a, total]) {
        if (r.provider === 'firecrawl') t.scrapes += r.credits > 0 ? 1 : 0;
        else t.calls += 1;
        t.input += r.input_tokens;
        t.output += r.output_tokens;
        t.cost += cost;
        if (r.status !== 'ok') t.problems += 1;
      }
      map.set(key, a);
    }
    const groups = [...map.values()].sort((a, b) => (group === 'day' ? b.key.localeCompare(a.key) : b.cost - a.cost));
    return { total, groups };
  }, [rows, group, projectNames]);

  const recentProblems = (rows ?? []).filter(r => r.status !== 'ok').slice(0, 5);

  return (
    <div className="bg-white border border-[#E5E7EB] mb-4">
      <div className="px-5 py-4 border-b border-[#E5E7EB] flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <BarChart3 className="w-4 h-4 text-[#9CA3AF]" />
          <h2 className="text-[#111827] font-medium text-sm">Usage</h2>
        </div>
        <select value={days} onChange={e => setDays(Number(e.target.value))} className="text-xs border border-[#E5E7EB] px-2 py-1 bg-white">
          <option value={1}>Today</option>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      <div className="p-5 space-y-4">
        {status && (
          <p className="text-[11px] text-[#6B7280]">
            Today: {status.today.calls} of {status.today.limit} calls used (AI + scrapes). Allowed models: {[...status.models.anthropic, ...status.models.openai].join(', ')}.
          </p>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}
          </div>
        )}
        {!rows && !error && <p className="text-xs text-[#9CA3AF] flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Loading…</p>}

        {rows && (
          <>
            <div className="grid grid-cols-4 gap-2">
              {[
                ['AI calls', String(total.calls)],
                ['Scrapes', String(total.scrapes)],
                ['Tokens in / out', `${formatTokens(total.input)} / ${formatTokens(total.output)}`],
                ['Est. AI cost', formatCost(total.cost)],
              ].map(([label, value]) => (
                <div key={label} className="border border-[#E5E7EB] px-3 py-2">
                  <p className="text-[10px] text-[#9CA3AF] uppercase tracking-wider">{label}</p>
                  <p className="text-sm font-medium text-[#111827] mt-0.5">{value}</p>
                </div>
              ))}
            </div>

            <div className="flex gap-1">
              {(['day', 'project', 'purpose'] as Group[]).map(g => (
                <button
                  key={g}
                  onClick={() => setGroup(g)}
                  className={`text-[11px] px-2.5 py-1 border ${group === g ? 'border-[#2575FC] text-[#2575FC] bg-[#2575FC]/5' : 'border-[#E5E7EB] text-[#6B7280]'}`}
                >
                  By {g === 'purpose' ? 'task' : g}
                </button>
              ))}
            </div>

            {groups.length === 0 ? (
              <p className="text-xs text-[#9CA3AF]">No calls in this period.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[10px] text-[#9CA3AF] uppercase tracking-wider">
                    <th className="py-1 font-medium">{group === 'purpose' ? 'Task' : group === 'day' ? 'Day' : 'Project'}</th>
                    <th className="py-1 font-medium text-right">AI</th>
                    <th className="py-1 font-medium text-right">Scrapes</th>
                    <th className="py-1 font-medium text-right">Tokens</th>
                    <th className="py-1 font-medium text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map(a => (
                    <tr key={a.key} className="border-t border-[#F3F4F6]">
                      <td className="py-1.5 pr-2 text-[#111827] truncate max-w-[180px]">
                        {a.key}
                        {a.problems > 0 && <span className="ml-1 text-amber-600">({a.problems} failed/cut off)</span>}
                      </td>
                      <td className="py-1.5 text-right">{a.calls}</td>
                      <td className="py-1.5 text-right">{a.scrapes}</td>
                      <td className="py-1.5 text-right">{formatTokens(a.input + a.output)}</td>
                      <td className="py-1.5 text-right">{formatCost(a.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {recentProblems.length > 0 && (
              <div>
                <p className="text-[10px] text-[#9CA3AF] uppercase tracking-wider mb-1">Recent problems</p>
                <ul className="space-y-1">
                  {recentProblems.map((r, i) => (
                    <li key={i} className="text-[11px] text-[#6B7280] break-words">
                      {new Date(r.created_at).toLocaleString()} · {PURPOSE_LABELS[r.purpose] ?? r.purpose} · <span className="text-amber-700">{r.status}</span>{r.error ? ` — ${r.error}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-[10px] text-[#9CA3AF]">Cost is an estimate from list prices. Calls still marked "started" were interrupted before finishing.</p>
          </>
        )}
      </div>
    </div>
  );
}


