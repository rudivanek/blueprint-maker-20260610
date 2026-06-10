import type { AppSettings } from '../types';

const SETTINGS_KEY = 'sharpen_studio_settings';

export const DEFAULT_SETTINGS: AppSettings = {
  firecrawlApiKey: '',
  anthropicApiKey: '',
  openaiApiKey: '',
  aiProvider: 'anthropic',
  defaultImageInstructions: 'Use https://placehold.co/[width]x[height]/[bg-hex]/[text-hex] for missing images.',
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function maskApiKey(key: string): string {
  if (!key || key.length < 8) return key;
  return key.slice(0, 8) + '...' + key.slice(-4);
}
