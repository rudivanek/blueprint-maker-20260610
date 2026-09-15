import { Printer } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { Header } from '../components/Layout/Header';
import { APP_VERSION } from '../lib/version';

interface HelpPageProps {
  user: User | null;
  onSignOut: () => void;
}

const sections = [
  { id: 'overview', num: '01', title: 'Overview' },
  { id: 'create', num: '02', title: 'Create a project: choose a workflow' },
  { id: 'design', num: '03', title: 'Design system (once per project)' },
  { id: 'build', num: '04', title: 'Build a page' },
  { id: 'pages', num: '05', title: 'More pages' },
  { id: 'brief', num: '06', title: 'Generate from Brief' },
  { id: 'preview', num: '07', title: 'Preview (HTML prototype)' },
  { id: 'export', num: '08', title: 'Export' },
  { id: 'settings', num: '09', title: 'Settings, keys and usage' },
  { id: 'costs', num: '10', title: 'Costs (approximate)' },
  { id: 'tips', num: '11', title: 'Tips' },
  { id: 'troubleshooting', num: '12', title: 'Troubleshooting' },
];

const workflows = [
  { name: 'Clone a site', asks: 'A website URL', starts: 'Import, then Design (Page URL)' },
  { name: 'Change the design', asks: 'Client site URL + look from another site or your design.md', starts: 'Import (client site), then Design (Other URL or your file)' },
  { name: 'Describe it myself', asks: 'A design URL and a description of the page', starts: 'Design, then Generate from Brief' },
  { name: 'Bring my own content', asks: 'A design URL and your text (Markdown)', starts: 'Import → Paste my content → Build Sections' },
  { name: 'Set up manually', asks: 'A name and an optional URL', starts: 'All options are visible' },
];

const costs = [
  { task: 'Import a page', cost: '1 scrape + ~$0.20' },
  { task: 'Design system', cost: '1 scrape + ~$0.10–0.20' },
  { task: 'Generate preview', cost: '~$0.25–0.40' },
  { task: 'Build Sections from your own text', cost: '~$0.05' },
];

const troubleshooting = [
  { problem: '"No … key on the server"', solution: 'Add the key in Settings.' },
  { problem: '"Daily limit reached"', solution: 'Wait until tomorrow (UTC) or raise DAILY_CALL_LIMIT.' },
  { problem: '"Could not reach the AI proxy"', solution: 'The ai-proxy function is not deployed.' },
  { problem: '"CSS looks incomplete"', solution: 'The site blocks or hides its stylesheets; check the screenshot-based colours.' },
  { problem: 'Fonts marked as substitutes', solution: "The original font isn't on Google Fonts; the closest match is used." },
];

const tips = [
  'Extract the design system once; it is shared across all pages.',
  'Check the fact-check box before sending anything to a client.',
  'Layout descriptions are the most important field: more detail gives better output.',
  'For Elementor sites, leave "WordPress site" unticked.',
  'If a page comes out cut off, use compact re-import or Apply Changes.',
  'Look at Settings → Usage to see what each project cost.',
];

export function HelpPage({ user, onSignOut }: HelpPageProps) {
  return (
    <div className="min-h-screen bg-white flex flex-col" style={{ ['--app-version' as string]: APP_VERSION }}>
      <Header
        user={user}
        onSignOut={onSignOut}
        breadcrumbs={[
          { label: 'Projects', href: '/' },
          { label: 'Help' },
        ]}
      />

      <div className="flex-1 flex justify-center px-6 py-10">
        <div className="w-full max-w-[820px]">
          {/* Title block */}
          <div className="help-print-header mb-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-[#111827] tracking-tight">Blueprint Maker — User Guide</h1>
                <p className="text-sm text-[#6B7280] mt-1">Version {APP_VERSION}</p>
              </div>
              <button
                onClick={() => window.print()}
                className="help-no-print shrink-0 flex items-center gap-2 px-4 py-2 border border-[#E5E7EB] text-[#111827] text-sm font-medium hover:bg-[#F9FAFB] hover:border-[#2575FC] transition-colors"
              >
                <Printer className="w-4 h-4" />
                Print / Save as PDF
              </button>
            </div>
          </div>

          <div className="flex gap-10">
            {/* Sticky TOC */}
            <nav className="help-no-print hidden lg:block w-52 shrink-0">
              <div className="sticky top-6">
                <p className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-3">Contents</p>
                <ul className="space-y-1.5">
                  {sections.map(s => (
                    <li key={s.id}>
                      <a
                        href={`#${s.id}`}
                        className="block text-xs text-[#6B7280] hover:text-[#2575FC] transition-colors leading-relaxed"
                      >
                        <span className="text-[#9CA3AF] mr-1.5">{s.num}</span>
                        {s.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </nav>

            {/* Main content */}
            <div className="flex-1 min-w-0 space-y-10">
              {/* 01 Overview */}
              <section id="overview" className="help-section">
                <StepHeader num="01" title="Overview" />
                <div className="help-body">
                  <p>Blueprint Maker turns a website (or your own text) into an AI-ready package: <code>design.md</code> (design system), <code>blueprint.md</code> (page structure), <code>copy.md</code> (exact texts), <code>images.md</code> (real image URLs), a fact-check and a master prompt. You can generate an HTML prototype inside the app or take the ZIP to Bolt, Claude, Lovable, etc.</p>
                </div>
              </section>

              {/* 02 Create a project */}
              <section id="create" className="help-section">
                <StepHeader num="02" title="Create a project: choose a workflow" />
                <div className="help-body">
                  <p>Click <strong>New Project</strong>. First choose what you want to do:</p>
                  <table className="help-table">
                    <thead>
                      <tr>
                        <th>Workflow</th>
                        <th>What the app asks for</th>
                        <th>Where you start</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workflows.map(w => (
                        <tr key={w.name}>
                          <td><strong>{w.name}</strong></td>
                          <td>{w.asks}</td>
                          <td>{w.starts}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p>Presets create a first page called "Home". The guide box at the top of the editor lists the next steps, ticks them off automatically (design.md, sections, preview), and has Go buttons. You can collapse it or change the workflow from its dropdown.</p>
                </div>
              </section>

              {/* 03 Design system */}
              <section id="design" className="help-section">
                <StepHeader num="03" title="Design system (once per project)" />
                <div className="help-body">
                  <p>Design tab → <strong>Design Source</strong>: Page URL, Other URL, Upload <code>.md</code>, or Paste HTML. The app reads the site's real stylesheets and measures colours, fonts, sizes and spacing. A summary box shows what was measured (amber when something looks incomplete). Colours the stylesheets don't contain are marked "(inferred)". <code>design.md</code> includes a font plan: the Google Fonts link to use and substitutes for fonts that aren't on Google Fonts. <code>design.md</code> is shared by all pages, and you can edit it in the Design tab.</p>
                </div>
              </section>

              {/* 04 Build a page */}
              <section id="build" className="help-section">
                <StepHeader num="04" title="Build a page" />
                <div className="help-body">
                  <p>Sections tab → <strong>Import Structure</strong>:</p>
                  <ul>
                    <li><strong>From URL</strong>: the app scrapes the page (text, images, full-page screenshot) and extracts every section with its layout and copy. Tick "WordPress site" only for non-Elementor WordPress pages.</li>
                    <li><strong>Paste my content</strong>: paste your own text; each <code>#</code> or <code>##</code> heading starts a section. No scrape is used.</li>
                  </ul>
                  <p>The import also saves <code>copy.md</code> (all visible text, in order, grouped by section) and <code>images.md</code> (real image URLs grouped by section). If a long import gets cut off, the app keeps the complete sections and offers Re-import (compact mode). After importing, review and edit sections, reorder or delete them, add sections from templates, and add Custom Instructions for the page.</p>
                </div>
              </section>

              {/* 05 More pages */}
              <section id="pages" className="help-section">
                <StepHeader num="05" title="More pages" />
                <div className="help-body">
                  <p><strong>+ Add Page</strong> creates another page with its own URL, sections, custom instructions, <code>copy.md</code>, <code>images.md</code> and optional screenshot. <strong>Global Settings</strong> holds the site name, logo, navigation, footer and project-wide instructions.</p>
                </div>
              </section>

              {/* 06 Generate from Brief */}
              <section id="brief" className="help-section">
                <StepHeader num="06" title="Generate from Brief" />
                <div className="help-body">
                  <p>Write a creative brief and generate a full HTML page directly. It uses the project's <code>design.md</code> automatically, or a different <code>.md</code> you upload. You can also copy ready-made prompts for vibe builders.</p>
                </div>
              </section>

              {/* 07 Preview */}
              <section id="preview" className="help-section">
                <StepHeader num="07" title="Preview (HTML prototype)" />
                <div className="help-body">
                  <p>Preview tab → <strong>Generate HTML</strong> builds a standalone prototype from <code>design.md</code> + blueprint + <code>copy.md</code> + <code>images.md</code> (+ screenshot). A full page usually takes 2–4 minutes. If the answer gets cut off, the app automatically asks the AI to continue, up to 2 times. Use the feedback field + <strong>Apply Changes</strong> for targeted edits, <strong>Compare</strong> to check against the screenshot, and <strong>Download .html</strong> to save it. The generated HTML is saved with the page.</p>
                </div>
              </section>

              {/* 08 Export */}
              <section id="export" className="help-section">
                <StepHeader num="08" title="Export" />
                <div className="help-body">
                  <p>Export tab → <strong>Export Package</strong> (<code>.zip</code>) contains: <code>prompt.txt</code> (master prompt), <code>design.md</code>, <code>blueprint-[page].md</code>, <code>copy-[page].md</code>, <code>images-[page].md</code>, <code>fact-check-[page].md</code>, and screenshots if enabled. The fact-check box lists texts and numbers in the blueprint that don't appear on the original page, so check them before using the prototype. <code>copy.md</code> and <code>images.md</code> can also be downloaded separately. How to use the ZIP in an AI tool:</p>
                  <ol>
                    <li>Paste <code>prompt.txt</code> as the first message.</li>
                    <li>Attach <code>design.md</code> + the first blueprint + <code>copy.md</code> + <code>images.md</code> (+ screenshot).</li>
                    <li>For each further page: "Add this page using the same design system and components" + its files.</li>
                  </ol>
                </div>
              </section>

              {/* 09 Settings */}
              <section id="settings" className="help-section">
                <StepHeader num="09" title="Settings, keys and usage" />
                <div className="help-body">
                  <p>API keys (Firecrawl, Anthropic, OpenAI) are saved on the server, never in the browser. You only see "Your key is saved (…last 4 characters)". Your own key is used first. If you have none, the studio key is used, if one is set. Usage shows AI calls, scrapes, tokens and estimated cost by day, project or task, plus failed or cut-off calls. Limits: 300 calls per user per day; allowed models are Claude Sonnet 4.6 and GPT-4.1. AI Provider: choose Anthropic or OpenAI.</p>
                </div>
              </section>

              {/* 10 Costs */}
              <section id="costs" className="help-section">
                <StepHeader num="10" title="Costs (approximate)" />
                <div className="help-body">
                  <table className="help-table">
                    <thead>
                      <tr>
                        <th>Task</th>
                        <th>Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {costs.map(c => (
                        <tr key={c.task}>
                          <td><strong>{c.task}</strong></td>
                          <td>{c.cost}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* 11 Tips */}
              <section id="tips" className="help-section">
                <StepHeader num="11" title="Tips" />
                <div className="help-body">
                  <ul>
                    {tips.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </div>
              </section>

              {/* 12 Troubleshooting */}
              <section id="troubleshooting" className="help-section">
                <StepHeader num="12" title="Troubleshooting" />
                <div className="help-body">
                  <table className="help-table">
                    <thead>
                      <tr>
                        <th>Problem</th>
                        <th>Solution</th>
                      </tr>
                    </thead>
                    <tbody>
                      {troubleshooting.map(t => (
                        <tr key={t.problem}>
                          <td><strong>{t.problem}</strong></td>
                          <td>{t.solution}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StepHeader({ num, title }: { num: string; title: string }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <div className="shrink-0 w-8 h-8 bg-[#2575FC]/5 border border-[#2575FC]/20 flex items-center justify-center">
        <span className="text-[#2575FC] text-[11px] font-bold">{num}</span>
      </div>
      <h2 className="text-[#111827] text-base font-semibold">{title}</h2>
    </div>
  );
}
