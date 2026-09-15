// src/components/Settings/ServerKeysCard.tsx
//
// Step 5 — API keys are saved on the server (ai-proxy / user_api_keys) and
// never come back to the browser. Only "set / not set" and the last 4
// characters are shown.

import { useState } from 'react';
import { Key, Loader2, Check, AlertCircle, ShieldCheck, Trash2 } from 'lucide-react';
import { saveKeys, type KeyProvider, type KeyStatus } from '../../lib/aiProxy';

const FIELDS: { id: KeyProvider; label: string; placeholder: string; href: string }[] = [
  { id: 'firecrawl', label: 'Firecrawl API Key', placeholder: 'fc-...', href: 'https://firecrawl.dev' },
  { id: 'anthropic', label: 'Anthropic API Key', placeholder: 'sk-ant-...', href: 'https://console.anthropic.com' },
  { id: 'openai', label: 'OpenAI API Key', placeholder: 'sk-...', href: 'https://platform.openai.com/api-keys' },
];

const fieldClass = "w-full bg-white border border-[#E5E7EB] rounded-none px-3 py-2.5 text-sm text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:border-[#2575FC] transition-all font-mono";

interface Props {
  status: KeyStatus | null;
  loadError: string | null;
}

export function ServerKeysCard({ status, loadError }: Props) {
  const [drafts, setDrafts] = useState<Record<KeyProvider, string>>({ anthropic: '', openai: '', firecrawl: '' });
  const [busy, setBusy] = useState<KeyProvider | null>(null);
  const [msg, setMsg] = useState<{ id: KeyProvider; ok: boolean; text: string } | null>(null);

  const run = async (id: KeyProvider, value: string) => {
    setBusy(id);
    setMsg(null);
    try {
      await saveKeys({ [id]: value });
      setDrafts(d => ({ ...d, [id]: '' }));
      setMsg({ id, ok: true, text: value ? 'Saved on the server.' : 'Removed.' });
    } catch (e) {
      setMsg({ id, ok: false, text: e instanceof Error ? e.message : 'Could not save' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="bg-white border border-[#E5E7EB] mb-4">
      <div className="px-5 py-4 border-b border-[#E5E7EB] flex items-center gap-2.5">
        <Key className="w-4 h-4 text-[#9CA3AF]" />
        <h2 className="text-[#111827] font-medium text-sm">API Keys</h2>
      </div>
      <div className="p-5 space-y-5">
        <div className="bg-[#EFF6FF] border border-blue-200 px-3 py-2.5 flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
          <p className="text-blue-700 text-xs leading-relaxed">
            Keys are stored on the server and used only by the app's AI proxy. They are never sent back to the browser.
            Your own key is used first; if you have none, the studio key (set on the server) is used.
          </p>
        </div>

        {status?.migrated?.length ? (
          <div className="bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-700">
            Moved your {status.migrated.join(', ')} key{status.migrated.length > 1 ? 's' : ''} from this browser to the server and removed {status.migrated.length > 1 ? 'them' : 'it'} from the browser.
          </div>
        ) : null}

        {loadError && (
          <div className="bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>Could not reach the AI proxy: {loadError}. Is the <code>ai-proxy</code> function deployed?</span>
          </div>
        )}

        {FIELDS.map(f => {
          const k = status?.keys[f.id];
          const draft = drafts[f.id];
          return (
            <div key={f.id}>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs text-[#111827] font-medium">{f.label}</label>
                <a href={f.href} target="_blank" rel="noopener noreferrer" className="text-[10px] text-[#2575FC] hover:underline">Get key</a>
              </div>

              <div className="flex items-center justify-between gap-2 mb-2 text-[11px]">
                {!status ? (
                  <span className="text-[#9CA3AF] flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Checking…</span>
                ) : k?.source === 'user' ? (
                  <span className="text-green-700 flex items-center gap-1"><Check className="w-3 h-3" /> Your key is saved (…{k.last4})</span>
                ) : k?.source === 'server' ? (
                  <span className="text-green-700 flex items-center gap-1"><Check className="w-3 h-3" /> Using the studio key</span>
                ) : (
                  <span className="text-amber-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Not set</span>
                )}
                {k?.source === 'user' && (
                  <button
                    type="button"
                    onClick={() => run(f.id, '')}
                    disabled={busy !== null}
                    className="flex items-center gap-1 text-[#9CA3AF] hover:text-red-500 disabled:opacity-40"
                  >
                    <Trash2 className="w-3 h-3" /> Remove
                  </button>
                )}
              </div>

              <div className="flex gap-2">
                <input
                  type="password"
                  autoComplete="off"
                  value={draft}
                  onChange={e => setDrafts(d => ({ ...d, [f.id]: e.target.value }))}
                  placeholder={k?.source === 'user' ? 'Paste a new key to replace it' : f.placeholder}
                  className={fieldClass}
                />
                <button
                  type="button"
                  onClick={() => run(f.id, draft.trim())}
                  disabled={!draft.trim() || busy !== null}
                  className="shrink-0 px-4 bg-[#2575FC] hover:bg-[#1a5fe0] text-white text-xs font-medium disabled:opacity-40 flex items-center gap-1.5"
                >
                  {busy === f.id && <Loader2 className="w-3 h-3 animate-spin" />}
                  Save
                </button>
              </div>
              {msg?.id === f.id && (
                <p className={`text-[11px] mt-1 ${msg.ok ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
