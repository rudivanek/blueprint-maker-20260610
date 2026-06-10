import { useState, useCallback } from 'react';
import { ChevronDown, ChevronRight, Trash2, GripVertical, Plus, X } from 'lucide-react';
import type { Section, SectionItem, SectionImage, LayoutContract } from '../../types';
import { DEFAULT_COPY, DEFAULT_LAYOUT_CONTRACT } from '../../types';

interface SectionCardProps {
  section: Section;
  onUpdate: (updates: Partial<Section>) => void;
  onDelete: () => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}

function ColorSwatch({ hex, onChange }: { hex: string; onChange: (hex: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative w-8 h-8 overflow-hidden border border-[#E5E7EB] cursor-pointer shrink-0">
        <div className="absolute inset-0" style={{ backgroundColor: hex }} />
        <input
          type="color"
          value={hex.startsWith('#') ? hex : '#ffffff'}
          onChange={e => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
        />
      </div>
      <input
        type="text"
        value={hex}
        onChange={e => onChange(e.target.value)}
        className="flex-1 bg-white border border-[#E5E7EB] rounded-none px-2 py-1.5 text-xs text-[#111827] font-mono focus:outline-none focus:border-[#2575FC] transition-all"
        placeholder="#ffffff"
      />
    </div>
  );
}

const CONTRACT_FIELDS: { key: keyof LayoutContract; label: string; placeholder: string; multiline?: boolean }[] = [
  { key: 'section_role', label: 'Section Role', placeholder: "E.g. 'Primary hero — first impression, above the fold'" },
  { key: 'desktop_layout', label: 'Desktop Layout', placeholder: "E.g. '1280px container, 2-col grid (1fr 1fr): left = text, right = image'" },
  { key: 'mobile_layout', label: 'Mobile Layout', placeholder: "E.g. 'Single column: image above text, full-width, padding halves'" },
  { key: 'column_structure', label: 'Column Structure', placeholder: "E.g. '3 equal columns (repeat(3,1fr), 32px gap)'" },
  { key: 'content_position', label: 'Content Position', placeholder: "E.g. 'Left column, vertically centered, 48px left padding'" },
  { key: 'image_position', label: 'Image Position', placeholder: "E.g. 'Right column, full-height, object-fit cover, no border-radius'" },
  { key: 'card_or_grid_structure', label: 'Card / Grid Structure', placeholder: "E.g. '3-col card grid; each card: image → title → body → link. Write N/A if no cards.'" },
  { key: 'alignment_rules', label: 'Alignment Rules', placeholder: "E.g. 'Text left-aligned inside columns, 80px top/bottom padding'" },
  { key: 'spacing_density', label: 'Spacing Density', placeholder: "compact | normal | generous" },
  { key: 'must_preserve', label: 'Must Preserve', placeholder: "What must NEVER change. E.g. '3-col grid stays 3 cols on desktop. Image stays right.'", multiline: true },
  { key: 'allowed_simplifications', label: 'Allowed Simplifications', placeholder: "E.g. 'Font stack can differ. Shadow can simplify. Hover states can be omitted.'" },
  { key: 'do_not_do', label: 'Do Not Do', placeholder: "Explicit AI mistakes to forbid. E.g. 'Do not center all content. Do not convert grid to list.'", multiline: true },
];

interface ContractEditorProps {
  contract: LayoutContract;
  onUpdate: (lc: LayoutContract) => void;
  fieldClass: string;
}

function ContractEditor({ contract, onUpdate, fieldClass }: ContractEditorProps) {
  const updateField = (key: keyof LayoutContract, value: string) => {
    onUpdate({ ...contract, [key]: value });
  };

  const hasAnyValue = Object.values(contract).some(v => v && v.trim());

  return (
    <div className="space-y-3">
      <div className="bg-[#EFF6FF] border border-blue-200 px-3 py-2.5">
        <p className="text-[11px] text-blue-700 leading-relaxed">
          The Layout Contract is the authoritative structural spec. AI builders must follow it exactly — columns, image placement, grid structure, and mobile behavior override all other instincts.
        </p>
      </div>
      {!hasAnyValue && (
        <p className="text-[11px] text-amber-600 px-1">No contract yet. Import a page to auto-generate, or fill in manually.</p>
      )}
      {CONTRACT_FIELDS.map(({ key, label, placeholder, multiline }) => (
        <div key={key}>
          <label className="text-[10px] text-[#9CA3AF] font-medium uppercase tracking-wider mb-1 block">{label}</label>
          {multiline ? (
            <textarea
              value={contract[key] || ''}
              onChange={e => updateField(key, e.target.value)}
              className={`${fieldClass} min-h-[60px]`}
              placeholder={placeholder}
              rows={3}
            />
          ) : (
            <input
              type="text"
              value={contract[key] || ''}
              onChange={e => updateField(key, e.target.value)}
              className={fieldClass}
              placeholder={placeholder}
            />
          )}
        </div>
      ))}
    </div>
  );
}

const SECTION_TYPES = [
  'Hero (Split)', 'Hero (Centered)', 'Features Grid', 'CTA Banner',
  'Testimonials', 'FAQ', 'Team', 'Pricing', 'Contact', 'Stats',
  'Logo Bar', 'Gallery', 'Content (50/50)', 'Content (Full)', 'Nav', 'Footer', 'Custom',
];

export function SectionCard({ section, onUpdate, onDelete, dragHandleProps }: SectionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'contract' | 'layout' | 'copy' | 'items' | 'images'>('contract');

  const updateCopy = useCallback((field: string, value: string) => {
    onUpdate({ copy: { ...section.copy, [field]: value } });
  }, [section.copy, onUpdate]);

  const addItem = () => {
    onUpdate({ items: [...section.items, { title: '', description: '', icon: '', image: '', link: '' }] });
  };

  const updateItem = (i: number, field: string, value: string) => {
    const updated = section.items.map((item, idx) => idx === i ? { ...item, [field]: value } : item);
    onUpdate({ items: updated });
  };

  const removeItem = (i: number) => {
    onUpdate({ items: section.items.filter((_, idx) => idx !== i) });
  };

  const addImage = () => {
    onUpdate({ images: [...section.images, { src: '', alt: '', width: '', height: '', position: '' }] });
  };

  const updateImage = (i: number, field: string, value: string) => {
    const updated = section.images.map((img, idx) => idx === i ? { ...img, [field]: value } : img);
    onUpdate({ images: updated });
  };

  const removeImage = (i: number) => {
    onUpdate({ images: section.images.filter((_, idx) => idx !== i) });
  };

  const typeColor: Record<string, string> = {
    'Hero (Split)': '#2a6dd9', 'Hero (Centered)': '#2a6dd9',
    'Features Grid': '#0e9f6e', 'CTA Banner': '#e3a008',
    'Testimonials': '#7e3af2', 'FAQ': '#e02424',
    'Team': '#0e9f6e', 'Pricing': '#e3a008',
    'Contact': '#0694a2', 'Stats': '#6366f1',
    'Logo Bar': '#6b7280', 'Gallery': '#ec4899',
    'Content (50/50)': '#3b82f6', 'Content (Full)': '#3b82f6',
    'Nav': '#6b7280', 'Footer': '#6b7280', 'Custom': '#6b7280',
  };
  const color = typeColor[section.section_type] || '#6b7280';

  const fieldClass = "w-full bg-white border border-[#E5E7EB] rounded-none px-3 py-2 text-sm text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:border-[#2575FC] transition-all resize-none";

  return (
    <div className="bg-white border border-[#E5E7EB] overflow-hidden group/card">
      <div className="flex items-center gap-3 px-4 py-3">
        <div {...dragHandleProps} className="text-[#9CA3AF] hover:text-[#2575FC] cursor-grab active:cursor-grabbing transition-colors shrink-0">
          <GripVertical className="w-4 h-4" />
        </div>

        <div className="w-3 h-3 shrink-0 border border-[#E5E7EB]" style={{ backgroundColor: section.background_hex || '#F9FAFB' }} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[#111827] text-sm font-medium truncate">{section.section_name || 'Untitled Section'}</span>
            <span className="text-[10px] font-medium px-1.5 py-0.5 shrink-0" style={{ backgroundColor: `${color}15`, color }}>
              {section.section_type}
            </span>
          </div>
          {!expanded && (
            <p className="text-[#9CA3AF] text-xs truncate mt-0.5">
              {section.layout_contract?.desktop_layout
                ? section.layout_contract.desktop_layout.slice(0, 90) + '...'
                : section.layout_description
                  ? section.layout_description.slice(0, 90) + '...'
                  : <span className="text-amber-500 text-xs">No layout contract — import or fill manually</span>
              }
            </p>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onDelete}
            className="opacity-0 group-hover/card:opacity-100 w-7 h-7 flex items-center justify-center text-[#9CA3AF] hover:text-red-500 hover:bg-red-50 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-7 h-7 flex items-center justify-center text-[#9CA3AF] hover:text-[#2575FC] hover:bg-[#F9FAFB] transition-all"
          >
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-[#E5E7EB] px-4 pt-4 pb-5">
          {/* Name + Type row */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-[10px] text-[#9CA3AF] font-medium uppercase tracking-wider mb-1.5 block">Section Name</label>
              <input
                type="text"
                value={section.section_name}
                onChange={e => onUpdate({ section_name: e.target.value })}
                className={fieldClass}
                placeholder="e.g. Hero"
              />
            </div>
            <div>
              <label className="text-[10px] text-white/40 font-medium uppercase tracking-wider mb-1.5 block">Type</label>
              <select
                value={section.section_type}
                onChange={e => onUpdate({ section_type: e.target.value })}
                className={`${fieldClass} cursor-pointer`}
              >
                {SECTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {/* Background + Headline Size */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-[10px] text-[#9CA3AF] font-medium uppercase tracking-wider mb-1.5 block">Background</label>
              <ColorSwatch hex={section.background_hex} onChange={hex => onUpdate({ background_hex: hex })} />
            </div>
            <div>
              <label className="text-[10px] text-[#9CA3AF] font-medium uppercase tracking-wider mb-1.5 block">Headline Size</label>
              <input
                type="text"
                value={section.headline_size}
                onChange={e => onUpdate({ headline_size: e.target.value })}
                className={fieldClass}
                placeholder="48px"
              />
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-4 border-b border-[#E5E7EB] pb-0">
            {(['contract', 'layout', 'copy', 'items', 'images'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-2 text-xs font-medium capitalize transition-colors border-b-2 -mb-px ${activeTab === tab ? 'text-[#2575FC] border-[#2575FC]' : 'text-[#9CA3AF] border-transparent hover:text-[#111827]'}`}
              >
                {tab === 'contract' ? (
                  <span className="flex items-center gap-1">
                    Contract
                    {section.layout_contract?.desktop_layout && <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />}
                  </span>
                ) : tab}
                {tab === 'items' && section.items.length > 0 && (
                  <span className="ml-1 bg-[#F9FAFB] border border-[#E5E7EB] text-[#9CA3AF] px-1.5 text-[10px]">{section.items.length}</span>
                )}
                {tab === 'images' && section.images.length > 0 && (
                  <span className="ml-1 bg-[#F9FAFB] border border-[#E5E7EB] text-[#9CA3AF] px-1.5 text-[10px]">{section.images.length}</span>
                )}
              </button>
            ))}
          </div>

          {activeTab === 'contract' && (
            <ContractEditor
              contract={section.layout_contract || DEFAULT_LAYOUT_CONTRACT}
              onUpdate={lc => onUpdate({ layout_contract: lc })}
              fieldClass={fieldClass}
            />
          )}

          {activeTab === 'layout' && (
            <div className="space-y-4">
              <div>
                <label className="text-[10px] text-[#9CA3AF] font-medium uppercase tracking-wider mb-1.5 block">Layout Variant</label>
                <input
                  type="text"
                  value={section.layout_variant}
                  onChange={e => onUpdate({ layout_variant: e.target.value })}
                  className={fieldClass}
                  placeholder="e.g. 2-col image-right, 3-col grid, full-width centered"
                />
              </div>
              <div>
                <label className="text-[10px] text-[#9CA3AF] font-medium uppercase tracking-wider mb-1.5 flex items-center gap-2 block">
                  Layout Description
                  <span className="text-[#2575FC] normal-case font-normal">detail</span>
                </label>
                <textarea
                  value={section.layout_description}
                  onChange={e => onUpdate({ layout_description: e.target.value })}
                  className={`${fieldClass} min-h-[120px]`}
                  placeholder="Describe the exact layout in detail: column structure, element positions, sizes, colors, spacing. The more detail, the better the AI output."
                  rows={6}
                />
              </div>
              <div>
                <label className="text-[10px] text-[#9CA3AF] font-medium uppercase tracking-wider mb-1.5 block">Notes</label>
                <textarea
                  value={section.notes}
                  onChange={e => onUpdate({ notes: e.target.value })}
                  className={`${fieldClass} min-h-[60px]`}
                  placeholder="Animations, interactions, special behaviors..."
                  rows={3}
                />
              </div>
            </div>
          )}

          {activeTab === 'copy' && (
            <div className="space-y-3">
              {[
                { field: 'headline', label: 'Headline', multiline: false },
                { field: 'subheadline', label: 'Subheadline', multiline: false },
                { field: 'body', label: 'Body Copy', multiline: true },
                { field: 'cta_text', label: 'CTA Text', multiline: false },
                { field: 'cta_url', label: 'CTA URL', multiline: false },
              ].map(({ field, label, multiline }) => (
                <div key={field}>
                  <label className="text-[10px] text-[#9CA3AF] font-medium uppercase tracking-wider mb-1.5 block">{label}</label>
                  {multiline ? (
                    <textarea
                      value={(section.copy as Record<string, string>)[field] || ''}
                      onChange={e => updateCopy(field, e.target.value)}
                      className={`${fieldClass} min-h-[80px]`}
                      rows={3}
                    />
                  ) : (
                    <input
                      type="text"
                      value={(section.copy as Record<string, string>)[field] || ''}
                      onChange={e => updateCopy(field, e.target.value)}
                      className={fieldClass}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {activeTab === 'items' && (
            <div className="space-y-3">
              {section.items.map((item, i) => (
                <div key={i} className="bg-[#F9FAFB] border border-[#E5E7EB] p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-[#9CA3AF] font-medium">Item {i + 1}</span>
                    <button onClick={() => removeItem(i)} className="text-[#9CA3AF] hover:text-red-500 transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="space-y-2">
                    {[
                      { f: 'title', p: 'Title' },
                      { f: 'description', p: 'Description' },
                      { f: 'icon', p: 'Icon (class or name)' },
                      { f: 'image', p: 'Image URL' },
                      { f: 'link', p: 'Link URL' },
                    ].map(({ f, p }) => (
                      <input key={f} type="text" value={(item as Record<string, string>)[f] || ''} onChange={e => updateItem(i, f, e.target.value)}
                        className="w-full bg-white border border-[#E5E7EB] rounded-none px-2.5 py-1.5 text-xs text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:border-[#2575FC] transition-all"
                        placeholder={p}
                      />
                    ))}
                  </div>
                </div>
              ))}
              <button onClick={addItem} className="w-full flex items-center justify-center gap-2 py-2 border border-dashed border-[#E5E7EB] hover:border-[#2575FC] text-[#9CA3AF] hover:text-[#2575FC] text-xs transition-all">
                <Plus className="w-3.5 h-3.5" /> Add Item
              </button>
            </div>
          )}

          {activeTab === 'images' && (
            <div className="space-y-3">
              {section.images.map((img, i) => (
                <div key={i} className="bg-[#F9FAFB] border border-[#E5E7EB] p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-[#9CA3AF] font-medium">Image {i + 1}</span>
                    <button onClick={() => removeImage(i)} className="text-[#9CA3AF] hover:text-red-500 transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="space-y-2">
                    {[
                      { f: 'src', p: 'Image URL' },
                      { f: 'alt', p: 'Alt text' },
                      { f: 'width', p: 'Width (e.g. 800px)' },
                      { f: 'height', p: 'Height (e.g. 600px)' },
                      { f: 'position', p: 'Position in layout (e.g. right-column)' },
                    ].map(({ f, p }) => (
                      <input key={f} type="text" value={(img as Record<string, string>)[f] || ''} onChange={e => updateImage(i, f, e.target.value)}
                        className="w-full bg-white border border-[#E5E7EB] rounded-none px-2.5 py-1.5 text-xs text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:border-[#2575FC] transition-all"
                        placeholder={p}
                      />
                    ))}
                  </div>
                </div>
              ))}
              <button onClick={addImage} className="w-full flex items-center justify-center gap-2 py-2 border border-dashed border-[#E5E7EB] hover:border-[#2575FC] text-[#9CA3AF] hover:text-[#2575FC] text-xs transition-all">
                <Plus className="w-3.5 h-3.5" /> Add Image
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
