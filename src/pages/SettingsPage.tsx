import { useState } from 'react';
import { Key, Save, Eye, EyeOff, Check, AlertCircle, Bot } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { Header } from '../components/Layout/Header';
import { loadSettings, saveSettings, maskApiKey } from '../lib/settings';
import type { AppSettings, AIProvider } from '../types';

interface SettingsPageProps {
  user: User;
  onSignOut: () => void;
}

const fieldClass = "w-full bg-white border border-[#E5E7EB] rounded-none px-3 py-2.5 text-sm text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:border-[#2575FC] transition-all";

export function SettingsPage({ user, onSignOut }: SettingsPageProps) {
  const [settings, setSettings] = useState<AppSettings>(loadSettings());
  const [showFirecrawl, setShowFirecrawl] = useState(false);
  const [showAnthropic, setShowAnthropic] = useState(false);
  const [showOpenAI, setShowOpenAI] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const maskedFirecrawl = settings.firecrawlApiKey ? maskApiKey(settings.firecrawlApiKey) : '';
  const maskedAnthropic = settings.anthropicApiKey ? maskApiKey(settings.anthropicApiKey) : '';
  const maskedOpenAI = settings.openaiApiKey ? maskApiKey(settings.openaiApiKey) : '';

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Header user={user} onSignOut={onSignOut} breadcrumbs={[{ label: 'Projects', href: '/' }, { label: 'Settings' }]} />

      <div className="flex-1 overflow-auto">
        <div className="max-w-xl mx-auto px-6 py-8">
          <div className="mb-8">
            <h1 className="text-sm font-semibold text-[#111827] mb-1">Settings</h1>
            <p className="text-[#9CA3AF] text-sm">Configure your API keys and preferences</p>
          </div>

          {/* API Keys */}
          <div className="bg-white border border-[#E5E7EB] mb-4">
            <div className="px-5 py-4 border-b border-[#E5E7EB] flex items-center gap-2.5">
              <Key className="w-4 h-4 text-[#9CA3AF]" />
              <h2 className="text-[#111827] font-medium text-sm">API Keys</h2>
            </div>
            <div className="p-5 space-y-5">
              <div className="bg-[#EFF6FF] border border-blue-200 px-3 py-2.5">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                  <p className="text-blue-700 text-xs">API keys are stored in your browser's local storage and never sent to our servers. They are only used to make direct API calls.</p>
                </div>
              </div>

              {/* Firecrawl */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs text-[#111827] font-medium">Firecrawl API Key</label>
                  <a href="https://firecrawl.dev" target="_blank" rel="noopener noreferrer" className="text-[10px] text-[#2575FC] hover:underline">Get key</a>
                </div>
                <div className="relative">
                  <input
                    type={showFirecrawl ? 'text' : 'password'}
                    value={settings.firecrawlApiKey}
                    onChange={e => setSettings(s => ({ ...s, firecrawlApiKey: e.target.value }))}
                    placeholder="fc-..."
                    className={`${fieldClass} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowFirecrawl(!showFirecrawl)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#111827] transition-colors"
                  >
                    {showFirecrawl ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {settings.firecrawlApiKey && !showFirecrawl && (
                  <p className="text-[#9CA3AF] text-xs mt-1 font-mono">{maskedFirecrawl}</p>
                )}
                <p className="text-[#9CA3AF] text-xs mt-1">Used for web scraping and screenshot capture</p>
              </div>

              {/* Anthropic */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs text-[#111827] font-medium">Anthropic API Key</label>
                  <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="text-[10px] text-[#2575FC] hover:underline">Get key</a>
                </div>
                <div className="relative">
                  <input
                    type={showAnthropic ? 'text' : 'password'}
                    value={settings.anthropicApiKey}
                    onChange={e => setSettings(s => ({ ...s, anthropicApiKey: e.target.value }))}
                    placeholder="sk-ant-..."
                    className={`${fieldClass} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowAnthropic(!showAnthropic)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#111827] transition-colors"
                  >
                    {showAnthropic ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {settings.anthropicApiKey && !showAnthropic && (
                  <p className="text-[#9CA3AF] text-xs mt-1 font-mono">{maskedAnthropic}</p>
                )}
                <p className="text-[#9CA3AF] text-xs mt-1">Used when AI provider is set to Anthropic (Claude Sonnet)</p>
              </div>

              {/* OpenAI */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs text-[#111827] font-medium">OpenAI API Key</label>
                  <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-[10px] text-[#2575FC] hover:underline">Get key</a>
                </div>
                <div className="relative">
                  <input
                    type={showOpenAI ? 'text' : 'password'}
                    value={settings.openaiApiKey}
                    onChange={e => setSettings(s => ({ ...s, openaiApiKey: e.target.value }))}
                    placeholder="sk-..."
                    className={`${fieldClass} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowOpenAI(!showOpenAI)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#111827] transition-colors"
                  >
                    {showOpenAI ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {settings.openaiApiKey && !showOpenAI && (
                  <p className="text-[#9CA3AF] text-xs mt-1 font-mono">{maskedOpenAI}</p>
                )}
                <p className="text-[#9CA3AF] text-xs mt-1">Used when AI provider is set to OpenAI (GPT-4.1)</p>
              </div>
            </div>
          </div>

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
            {saved ? 'Saved!' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
