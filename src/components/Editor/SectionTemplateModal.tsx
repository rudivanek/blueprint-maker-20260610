import { X } from 'lucide-react';
import { SECTION_TEMPLATES } from '../../types';

interface SectionTemplateModalProps {
  onSelect: (template: string) => void;
  onClose: () => void;
}

const templateMeta: Record<string, { icon: string; desc: string; color: string }> = {
  'Hero (Split)': { icon: 'H', desc: '2-col with image + text', color: '#2575FC' },
  'Hero (Centered)': { icon: 'H', desc: 'Full-width centered text', color: '#2575FC' },
  'Features Grid': { icon: 'F', desc: '3-col feature cards', color: '#0e9f6e' },
  'CTA Banner': { icon: 'C', desc: 'Full-width colored CTA', color: '#e3a008' },
  'Testimonials': { icon: 'T', desc: 'Quote cards grid', color: '#7e3af2' },
  'FAQ': { icon: '?', desc: 'Accordion Q&A', color: '#e02424' },
  'Team': { icon: 'P', desc: 'Team member cards', color: '#0e9f6e' },
  'Pricing': { icon: '$', desc: 'Comparison pricing cards', color: '#e3a008' },
  'Contact': { icon: '@', desc: 'Form + info sidebar', color: '#0694a2' },
  'Stats': { icon: '#', desc: 'Key numbers row', color: '#6366f1' },
  'Logo Bar': { icon: 'L', desc: 'Client logo strip', color: '#6b7280' },
  'Content (50/50)': { icon: '/', desc: 'Text + image split', color: '#3b82f6' },
};

export function SectionTemplateModal({ onSelect, onClose }: SectionTemplateModalProps) {
  const templates = Object.keys(SECTION_TEMPLATES);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white border border-[#E5E7EB] w-full max-w-lg shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E7EB]">
          <div>
            <h2 className="text-[#111827] font-semibold text-sm">Add Section</h2>
            <p className="text-[#9CA3AF] text-xs mt-0.5">Choose a template or start blank</p>
          </div>
          <button onClick={onClose} className="text-[#9CA3AF] hover:text-[#111827] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 overflow-auto max-h-[60vh]">
          <div className="grid grid-cols-2 gap-2 mb-3">
            <button
              onClick={() => onSelect('blank')}
              className="flex items-center gap-3 p-3 bg-white hover:bg-[#F9FAFB] border border-dashed border-[#E5E7EB] hover:border-[#2575FC] transition-all text-left"
            >
              <div className="w-8 h-8 border border-[#E5E7EB] flex items-center justify-center text-[#9CA3AF] text-sm font-bold shrink-0">+</div>
              <div>
                <p className="text-[#111827] text-xs font-medium">Blank Section</p>
                <p className="text-[#9CA3AF] text-[11px]">Start from scratch</p>
              </div>
            </button>
          </div>

          <p className="text-[10px] text-[#9CA3AF] font-medium uppercase tracking-wider mb-2 mt-4 px-1">Templates</p>
          <div className="grid grid-cols-2 gap-2">
            {templates.map(name => {
              const meta = templateMeta[name] || { icon: name[0], desc: name, color: '#6b7280' };
              return (
                <button
                  key={name}
                  onClick={() => onSelect(name)}
                  className="flex items-center gap-3 p-3 bg-white hover:bg-[#F9FAFB] border border-[#E5E7EB] hover:border-[#2575FC] transition-all text-left group"
                >
                  <div
                    className="w-8 h-8 flex items-center justify-center text-xs font-bold shrink-0"
                    style={{ backgroundColor: `${meta.color}10`, color: meta.color }}
                  >
                    {meta.icon}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[#111827] text-xs font-medium truncate">{name}</p>
                    <p className="text-[#9CA3AF] text-[11px] truncate">{meta.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
