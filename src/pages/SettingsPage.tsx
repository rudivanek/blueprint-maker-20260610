import { useState } from 'react';
import { Save, Check, Bot } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { Header } from '../components/Layout/Header';
import { loadSettings, saveSettings } from '../lib/settings';
import { ServerKeysCard } from '../components/Settings/ServerKeysCard';
import { UsageCard } from '../components/Settings/UsageCard';
import { useKeyStatus } from '../hooks/useKeyStatus';
import type { AppSettings, AIProvider } from '../types';

interface SettingsPageProps {
  user: User;
  onSignOut: () => void;
}

const fieldClass = "w-full bg-white border border-[#E5E7EB] rounded-none px-3 py-2.5 text-sm text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:border-[#2575FC] transition-all";

export function SettingsPage({ user, onSignOut }: SettingsPageProps) {
  const [settings, setSettings] = useState<AppSettings>(loadSettings());
  const [saved, setSaved] = useState(false);
  const keys = useKeyStatus();

  // Keys are saved separately (on the server); this only saves preferences.
  const handleSave = () => {
    saveSettings({ ...settings, firecrawlApiKey: '', anthropicApiKey: '', openaiApiKey: '' });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Header user={user} onSignOut={onSignOut} breadcrumbs={[{ label: 'Projects', href: '/' }, { label: 'Settings' }]} />

      <div className="flex-1 overflow-auto">
        <div className="max-w-xl mx-auto px-6 py-8">
          <div className="mb-8">
            <h1 className="text-sm font-semibold text-[#111827] mb-1">Settings</h1>
            <p className="text-[#9CA3AF] text-sm">API keys, usage and preferences</p>
          </div>

          <ServerKeysCard status={keys.status} loadError={keys.error} />

          <UsageCard status={keys.status} />

          {/* AI Provider */}
          <div className="bg-white border border-[#E5E7EB] mb-4">
            <div className="px-5 py-4 border-b border-[#E5E7EB] flex items-center gap-2.5">
              <Bot className="w-4 h-4 text-[#9CA3AF]" />
              <h2 className="text-[#111827] font-medium text-sm">AI Provider</h2>
            </div>
            <div className="p-5">
              <label className="text-xs text-[#111827] font-medium mb-2 block">Active Provider</label>
              <div className="grid grid-cols-2 gap-2">
                {(['anthropic', 'openai'] as AIProvider[]).map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setSettings(s => ({ ...s, aiProvider: p }))}
                    className={`flex flex-col gap-0.5 px-4 py-3 border text-left transition-all rounded-none ${
                      settings.aiProvider === p
                        ? 'bg-[#2575FC]/5 border-[#2575FC] text-[#111827]'
                        : 'bg-white border-[#E5E7EB] text-[#9CA3AF] hover:border-[#2575FC] hover:text-[#111827]'
                    }`}
                  >
                    <span className="text-sm font-medium">
                      {p === 'anthropic' ? 'Anthropic' : 'OpenAI'}
                    </span>
                    <span className="text-[11px] opacity-70">
                      {p === 'anthropic' ? 'Claude Sonnet 4.6' : 'GPT-4.1'}
                    </span>
                  </button>
                ))}
              </div>
              <p className="text-[#9CA3AF] text-xs mt-2.5">
                The selected provider will be used for design system extraction and structure analysis.
              </p>
            </div>
          </div>

          {/* Preferences */}
          <div className="bg-white border border-[#E5E7EB] mb-4">
            <div className="px-5 py-4 border-b border-[#E5E7EB]">
              <h2 className="text-[#111827] font-medium text-sm">Preferences</h2>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs text-[#111827] font-medium mb-1.5 block">Default Image Instructions</label>
                <textarea
                  value={settings.defaultImageInstructions}
                  onChange={e => setSettings(s => ({ ...s, defaultImageInstructions: e.target.value }))}
                  className={`${fieldClass} resize-none`}
                  rows={3}
                  placeholder="Instructions for handling placeholder images..."
                />
              </div>
            </div>
          </div>

          {/* Account */}
          <div className="bg-white border border-[#E5E7EB] mb-6">
            <div className="px-5 py-4 border-b border-[#E5E7EB]">
              <h2 className="text-[#111827] font-medium text-sm">Account</h2>
            </div>
            <div className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[#111827] text-sm">{user.email}</p>
                  <p className="text-[#9CA3AF] text-xs mt-0.5">Signed in</p>
                </div>
                <button
                  onClick={onSignOut}
                  className="text-red-500 hover:text-red-700 text-sm font-medium transition-colors"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>

          <button
            onClick={handleSave}
            className="w-full flex items-center justify-center gap-2 bg-[#2575FC] hover:bg-[#1a5fe0] text-white text-sm font-medium py-3 rounded-none transition-colors"
          >
            {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saved ? 'Saved!' : 'Save Preferences'}
          </button>
        </div>
      </div>
    </div>
  );
}

