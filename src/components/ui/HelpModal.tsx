import { X } from 'lucide-react';

interface HelpModalProps {
  onClose: () => void;
}

const steps = [
  {
    number: '01',
    title: 'Create Project',
    content: (
      <>
        <p>Click <strong>New Project</strong>, give it a name (e.g., <em>Sales Boost Website</em>), and enter the main website URL (e.g., <code>https://example.com/</code>). This URL becomes the default for all page imports.</p>
      </>
    ),
  },
  {
    number: '02',
    title: 'Extract Design System (once)',
    content: (
      <>
        <p className="mb-2">Go to the <strong>Design</strong> tab. Choose how to get your design system:</p>
        <ul>
          <li><strong>Page URL</strong> — auto-extracts colors, fonts, and spacing from the main URL</li>
          <li><strong>Other URL</strong> — extract from a different site (e.g., use a client's existing brand while importing structure from a competitor)</li>
          <li><strong>Upload .md</strong> — upload a <code>design.md</code> file you already have</li>
        </ul>
        <p className="mt-2">This <code>design.md</code> is shared across <strong>all pages</strong>. You only need to do this once.</p>
      </>
    ),
  },
  {
    number: '03',
    title: 'Build Page 1 (Homepage)',
    content: (
      <>
        <p className="mb-2">Go to the <strong>Sections</strong> tab. You'll see your first page tab (Home). Enter the homepage URL and click <strong>Import Structure</strong> — the app crawls the page and extracts all sections, copy, images, and layout details.</p>
        <ul>
          <li>Review and edit any imported section field</li>
          <li>Reorder, delete, or add sections from templates</li>
          <li>Add <strong>Custom Instructions</strong> for this page (e.g., "Make the hero taller")</li>
        </ul>
      </>
    ),
  },
  {
    number: '04',
    title: 'Add More Pages',
    content: (
      <>
        <p className="mb-2">Click <strong>+ Add Page</strong> to create additional pages. Each page gets:</p>
        <ul>
          <li>Its own <strong>URL field</strong> — import from a different URL independently</li>
          <li>Its own <strong>sections</strong> — completely independent from other pages</li>
          <li>Its own <strong>custom instructions</strong></li>
          <li>Its own optional <strong>screenshot</strong></li>
        </ul>
        <p className="mt-2 text-[#9CA3AF] text-xs">Example: add "Servicios" → <code>https://example.com/servicios/</code>, add "Nosotros" → <code>https://example.com/nosotros/</code></p>
      </>
    ),
  },
  {
    number: '05',
    title: 'Global Custom Instructions (optional)',
    content: (
      <>
        <p className="mb-2">In <strong>Global Settings → Instructions</strong>, add project-wide instructions that apply to all pages:</p>
        <ul>
          <li>"All pages should end with the same CTA banner"</li>
          <li>"Use Inter font instead of system fonts"</li>
          <li>"Add a WhatsApp floating button on every page"</li>
        </ul>
      </>
    ),
  },
  {
    number: '06',
    title: 'Screenshots (optional)',
    content: (
      <>
        <p className="mb-2">Each page has a collapsible <strong>Screenshot</strong> section where you can use the auto-captured screenshot from import or upload your own (.jpg or .png).</p>
        <p>In the <strong>Export</strong> tab, toggle <strong>Include screenshots</strong> to add them to the zip — only for pages that have one.</p>
      </>
    ),
  },
  {
    number: '07',
    title: 'Export',
    content: (
      <>
        <p className="mb-2">Go to the <strong>Export</strong> tab and click <strong>Export Zip</strong>. The download contains:</p>
        <ul>
          <li><code>prompt.txt</code> — universal instructions for the AI tool</li>
          <li><code>design.md</code> — the complete design system</li>
          <li><code>blueprint-[page].md</code> — one blueprint per page</li>
          <li><code>screenshot-[page].jpg</code> — only if screenshots are enabled and available</li>
        </ul>
      </>
    ),
  },
  {
    number: '08',
    title: 'Build in AI Tools',
    content: (
      <>
        <p className="mb-2">Open your preferred AI tool (Bolt.new, Claude, Lovable, Stitch, HyperAgent) and:</p>
        <ol>
          <li>Paste the contents of <code>prompt.txt</code> as your first message</li>
          <li>Attach <code>design.md</code> + the first page's blueprint</li>
          <li>Attach the screenshot if available, then hit send</li>
        </ol>
        <p className="mt-2">For each additional page, send: <em>"Add this page using the same design system and components."</em> and attach the next blueprint.</p>
        <div className="mt-3 pt-3 border-t border-[#E5E7EB]">
          <p className="text-[11px] text-[#9CA3AF] font-medium uppercase tracking-wider mb-1.5">Tips</p>
          <ul className="text-[#9CA3AF] text-xs space-y-1">
            <li>The design system only needs to be extracted once — it's shared across all pages</li>
            <li>Each page can import from a completely different URL</li>
            <li>You can mix imported and manually created pages in the same project</li>
            <li>Layout descriptions are the most important field — more detail = better AI output</li>
            <li>Edit extracted sections before exporting to fix issues or add detail</li>
          </ul>
        </div>
      </>
    ),
  },
];

export function HelpModal({ onClose }: HelpModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[88vh] bg-white border border-[#E5E7EB] shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#E5E7EB] shrink-0">
          <div>
            <h2 className="text-[#111827] font-semibold text-sm">How to Use Blueprint Maker</h2>
            <p className="text-[#9CA3AF] text-xs mt-0.5">From project to AI-ready export in 8 steps</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-[#9CA3AF] hover:text-[#111827] hover:bg-[#F9FAFB] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {steps.map(step => (
            <div key={step.number} className="flex gap-4">
              <div className="shrink-0 w-8 h-8 bg-[#2575FC]/5 border border-[#2575FC]/20 flex items-center justify-center mt-0.5">
                <span className="text-[#2575FC] text-[11px] font-bold">{step.number}</span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-[#111827] text-sm font-semibold mb-1.5">{step.title}</h3>
                <div className="text-[#9CA3AF] text-[13px] leading-relaxed [&_strong]:text-[#111827] [&_strong]:font-medium [&_em]:text-[#111827] [&_code]:text-[#2575FC] [&_code]:bg-[#2575FC]/5 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_ul]:mt-1.5 [&_ul]:space-y-1 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:mt-1.5 [&_ol]:space-y-1 [&_ol]:list-decimal [&_ol]:pl-4">
                  {step.content}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="px-6 py-4 border-t border-[#E5E7EB] shrink-0">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-[#2575FC] hover:bg-[#1a5fe0] text-white text-sm font-semibold rounded-none transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
