import { useState, useCallback } from 'react';
import { ChevronDown, ChevronRight, Plus, X } from 'lucide-react';
import type { GlobalSettings, NavItem, SitemapItem, SocialLink } from '../../types';

interface GlobalSettingsPanelProps {
  globals: GlobalSettings;
  onUpdate: (globals: GlobalSettings) => void;
}

const fieldClass = "w-full bg-white border border-[#E5E7EB] rounded-none px-3 py-2 text-sm text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:border-[#2575FC] transition-all";
const labelClass = "text-[10px] text-[#9CA3AF] font-medium uppercase tracking-wider mb-1.5 block";

export function GlobalSettingsPanel({ globals, onUpdate }: GlobalSettingsPanelProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'site' | 'nav' | 'sitemap' | 'footer' | 'responsive' | 'instructions'>('site');

  const update = useCallback((patch: Partial<GlobalSettings>) => {
    onUpdate({ ...globals, ...patch });
  }, [globals, onUpdate]);

  const addNavItem = () => update({ nav: { ...globals.nav, items: [...globals.nav.items, { label: '', url: '' }] } });
  const updateNavItem = (i: number, field: keyof NavItem, value: string) => {
    const items = globals.nav.items.map((item, idx) => idx === i ? { ...item, [field]: value } : item);
    update({ nav: { ...globals.nav, items } });
  };
  const removeNavItem = (i: number) => update({ nav: { ...globals.nav, items: globals.nav.items.filter((_, idx) => idx !== i) } });

  const addSitemapItem = () => update({ sitemap: [...globals.sitemap, { pageName: '', url: '' }] });
  const updateSitemapItem = (i: number, field: keyof SitemapItem, value: string) => {
    const items = globals.sitemap.map((item, idx) => idx === i ? { ...item, [field]: value } : item);
    update({ sitemap: items });
  };
  const removeSitemapItem = (i: number) => update({ sitemap: globals.sitemap.filter((_, idx) => idx !== i) });

  const addSocial = () => update({ footer: { ...globals.footer, socials: [...globals.footer.socials, { platform: '', url: '' }] } });
  const updateSocial = (i: number, field: keyof SocialLink, value: string) => {
    const socials = globals.footer.socials.map((s, idx) => idx === i ? { ...s, [field]: value } : s);
    update({ footer: { ...globals.footer, socials } });
  };
  const removeSocial = (i: number) => update({ footer: { ...globals.footer, socials: globals.footer.socials.filter((_, idx) => idx !== i) } });

  const tabs = ['site', 'nav', 'sitemap', 'footer', 'responsive', 'instructions'] as const;

  return (
    <div className="bg-white border border-[#E5E7EB] mb-4">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <div>
          <span className="text-[#111827] font-medium text-sm">Global Settings</span>
          <span className="text-[#9CA3AF] text-xs ml-2">{globals.siteName || 'No site name set'}</span>
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-[#9CA3AF]" /> : <ChevronRight className="w-4 h-4 text-[#9CA3AF]" />}
      </button>

      {open && (
        <div className="border-t border-[#E5E7EB] px-5 pt-4 pb-5">
          <div className="flex gap-1 mb-4 border-b border-[#E5E7EB] pb-0">
            {tabs.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-2 text-xs font-medium capitalize transition-colors border-b-2 -mb-px ${activeTab === tab ? 'text-[#2575FC] border-[#2575FC]' : 'text-[#9CA3AF] border-transparent hover:text-[#111827]'}`}
              >
                {tab}
              </button>
            ))}
          </div>

          {activeTab === 'site' && (
            <div className="space-y-3">
              <div>
                <label className={labelClass}>Site Name</label>
                <input type="text" value={globals.siteName} onChange={e => update({ siteName: e.target.value })} className={fieldClass} placeholder="Acme Corporation" />
              </div>
              <div>
                <label className={labelClass}>Logo URL</label>
                <input type="text" value={globals.logoUrl} onChange={e => update({ logoUrl: e.target.value })} className={fieldClass} placeholder="https://example.com/logo.svg" />
              </div>
              <div>
                <label className={labelClass}>Image Instructions</label>
                <textarea value={globals.imageInstructions} onChange={e => update({ imageInstructions: e.target.value })} className={`${fieldClass} min-h-[80px] resize-none`} rows={3} placeholder="Instructions for handling missing or placeholder images..." />
              </div>
            </div>
          )}

          {activeTab === 'nav' && (
            <div className="space-y-3">
              <div>
                <label className={labelClass}>Nav Style</label>
                <input type="text" value={globals.nav.style} onChange={e => update({ nav: { ...globals.nav, style: e.target.value } })} className={fieldClass} placeholder="e.g. sticky transparent, dark text, white bg on scroll" />
              </div>
              <div>
                <label className={labelClass}>Nav Items</label>
                <div className="space-y-2">
                  {globals.nav.items.map((item, i) => (
                    <div key={i} className="flex gap-2">
                      <input type="text" value={item.label} onChange={e => updateNavItem(i, 'label', e.target.value)} className={`${fieldClass} flex-1`} placeholder="Label" />
                      <input type="text" value={item.url} onChange={e => updateNavItem(i, 'url', e.target.value)} className={`${fieldClass} flex-1`} placeholder="URL" />
                      <button onClick={() => removeNavItem(i)} className="text-[#9CA3AF] hover:text-red-500 transition-colors px-1">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <button onClick={addNavItem} className="flex items-center gap-1.5 text-xs text-[#9CA3AF] hover:text-[#2575FC] transition-colors py-1">
                    <Plus className="w-3.5 h-3.5" /> Add nav item
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'sitemap' && (
            <div className="space-y-2">
              <label className={labelClass}>Sitemap Pages</label>
              {globals.sitemap.map((item, i) => (
                <div key={i} className="flex gap-2">
                  <input type="text" value={item.pageName} onChange={e => updateSitemapItem(i, 'pageName', e.target.value)} className={`${fieldClass} flex-1`} placeholder="Page Name" />
                  <input type="text" value={item.url} onChange={e => updateSitemapItem(i, 'url', e.target.value)} className={`${fieldClass} flex-1`} placeholder="/url" />
                  <button onClick={() => removeSitemapItem(i)} className="text-[#9CA3AF] hover:text-red-500 transition-colors px-1">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button onClick={addSitemapItem} className="flex items-center gap-1.5 text-xs text-[#9CA3AF] hover:text-[#2575FC] transition-colors py-1">
                <Plus className="w-3.5 h-3.5" /> Add page
              </button>
            </div>
          )}

          {activeTab === 'footer' && (
            <div className="space-y-3">
              <div>
                <label className={labelClass}>Footer Style</label>
                <input type="text" value={globals.footer.style} onChange={e => update({ footer: { ...globals.footer, style: e.target.value } })} className={fieldClass} placeholder="e.g. dark background, 4-col layout" />
              </div>
              <div>
                <label className={labelClass}>Copyright</label>
                <input type="text" value={globals.footer.copyright} onChange={e => update({ footer: { ...globals.footer, copyright: e.target.value } })} className={fieldClass} placeholder="© 2025 Company Name" />
              </div>
              <div>
                <label className={labelClass}>Social Links</label>
                <div className="space-y-2">
                  {globals.footer.socials.map((s, i) => (
                    <div key={i} className="flex gap-2">
                      <input type="text" value={s.platform} onChange={e => updateSocial(i, 'platform', e.target.value)} className={`${fieldClass} flex-1`} placeholder="Platform" />
                      <input type="text" value={s.url} onChange={e => updateSocial(i, 'url', e.target.value)} className={`${fieldClass} flex-1`} placeholder="URL" />
                      <button onClick={() => removeSocial(i)} className="text-[#9CA3AF] hover:text-red-500 transition-colors px-1">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <button onClick={addSocial} className="flex items-center gap-1.5 text-xs text-[#9CA3AF] hover:text-[#2575FC] transition-colors py-1">
                    <Plus className="w-3.5 h-3.5" /> Add social
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'responsive' && (
            <div>
              <label className={labelClass}>Responsive Behavior Notes</label>
              <textarea value={globals.responsive} onChange={e => update({ responsive: e.target.value })} className={`${fieldClass} min-h-[120px] resize-none`} rows={5}
                placeholder="Describe mobile, tablet, and desktop behavior. E.g. Mobile: hamburger nav, single-column stacking. Tablet: 2-col grids. Desktop: full layout."
              />
            </div>
          )}

          {activeTab === 'instructions' && (
            <div>
              <label className={labelClass}>Global Custom Instructions</label>
              <p className="text-[10px] text-white/30 mb-2">Applied to every page in this project. E.g. "All pages should end with the same CTA banner", "Use Inter font throughout".</p>
              <textarea
                value={globals.globalCustomInstructions ?? ''}
                onChange={e => update({ globalCustomInstructions: e.target.value })}
                className={`${fieldClass} min-h-[140px] resize-none`}
                rows={6}
                placeholder="Enter instructions that apply to all pages..."
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
