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
  { id: 'projects', num: '02', title: 'Projects' },
  { id: 'create', num: '03', title: 'Create a project: choose a workflow' },
  { id: 'guided', num: '04', title: 'Builder Kit, Guided and Advanced' },
  { id: 'content', num: '05', title: 'Step 1 · Content' },
  { id: 'design', num: '06', title: 'Step 2 · Design system' },
  { id: 'review', num: '07', title: 'Step 3 · Review sections' },
  { id: 'preview', num: '08', title: 'Step 4 · Prototype' },
  { id: 'chat', num: '09', title: 'Describe changes (chat with the AI)' },
  { id: 'edit', num: '10', title: 'Edit on page' },
  { id: 'sync', num: '11', title: 'Staying in sync' },
  { id: 'export', num: '12', title: 'Step 5 · Export' },
  { id: 'pages', num: '13', title: 'More pages and Generate from Brief' },
  { id: 'settings', num: '14', title: 'Settings, keys and usage' },
  { id: 'costs', num: '15', title: 'Costs (approximate)' },
  { id: 'tips', num: '16', title: 'Tips' },
  { id: 'troubleshooting', num: '17', title: 'Troubleshooting' },
];

const workflows = [
  { name: 'Clone a site', asks: 'A website URL', starts: 'Content: import the page, then Design from the same URL' },
  { name: 'Change the design', asks: 'Client site URL + the look of another site or your design.md', starts: 'Content: import the client site, then Design from the other URL or your file' },
  { name: 'Describe it myself', asks: 'A design URL and a description of the page', starts: 'Content: Write it for me' },
  { name: 'Bring my own content', asks: 'A design URL and your text (Markdown)', starts: 'Content: Paste my content → Build Sections' },
  { name: 'Set up manually', asks: 'A name and an optional URL', starts: 'Advanced mode, all options visible' },
];

const steps = [
  { step: '1 · Content', what: 'Get the page text: import a URL, paste your own text, or let the AI write it. Build Sections turns it into sections.' },
  { step: '2 · Design', what: 'Create the design system (colours, fonts, spacing) from a URL, a file or pasted HTML.' },
  { step: '3 · Review', what: 'Check the sections, the fact-check and any [placeholders]. Fix texts, images and layout.' },
  { step: '4 · Prototype', what: 'Generate the HTML prototype, ask for changes, edit it on the page.' },
  { step: '5 · Export', what: 'Download the ZIP for Bolt, Claude, Lovable and others.' },
];

const kitFilesHelp = [
  { file: 'Design → design.md', when: 'From the site, another site, or your own pasted file. Needs nothing else.' },
  { file: 'Content → copy.md · images.md · site.md · screenshot.jpg', when: 'Import a URL, paste your text or let the AI write it. Needs nothing else. The screenshot only exists right after an import, in the same browser session.' },
  { file: 'Sections → blueprint.md · fact-check.md', when: 'Optional. Needs content built into sections (Build Sections).' },
  { file: 'Builder prompt → prompt files · README.md · ZIP', when: 'Needs design or content. The prompt adapts: only design → the builder asks you for the page; only content → the builder chooses the design.' },
  { file: 'Quick preview → prototype.html · changes.md', when: 'Optional. Needs sections and design.' },
];

const badges = [
  { badge: 'Text not built yet (Content)', meaning: 'You pasted or wrote new text but haven’t clicked Build Sections — the next steps still use the previous sections.' },
  { badge: 'In sync · N changes (Prototype)', meaning: 'The prototype matches the sections and the design. N = entries in its change list.' },
  { badge: 'Outdated — update it (Prototype)', meaning: 'Sections or design changed after the prototype was made. Use Update prototype, keep my changes.' },
  { badge: 'Ready / Prototype outdated (Export)', meaning: 'Whether prototype.html in the ZIP shows the current content.' },
];

const costs = [
  { task: 'Import a page', cost: '1 scrape + ~$0.20' },
  { task: 'Design system', cost: '1 scrape + ~$0.10–0.20' },
  { task: 'Write it for me (questions + copy)', cost: '~$0.01 + ~$0.05' },
  { task: 'Build Sections from your own text', cost: '~$0.05' },
  { task: 'Generate / Update prototype, Describe changes', cost: '~$0.25–0.40 (2–4 minutes)' },
  { task: 'Chat reply before a change', cost: '~$0.01 per message' },
  { task: 'Change with AI (one element)', cost: '~$0.02–0.08 (10–40 seconds)' },
  { task: 'Edit on page, sync, versions, export', cost: 'Free (no AI)' },
  { task: 'Builder Kit (import + design, no preview)', cost: '2 scrapes + ~$0.35' },
  { task: 'Note', cost: 'Costs above are for Claude Sonnet 4.6. Sonnet 5 costs about ⅔ of that, Opus 5 about 1.7×, Fable 5.1 about 3.3×. The app shows the estimate for the project’s model.' },
];

const troubleshooting = [
  { problem: '"No … key on the server"', solution: 'Add the key in Settings.' },
  { problem: '"Daily limit reached"', solution: 'Wait until tomorrow (UTC) or raise DAILY_CALL_LIMIT.' },
  { problem: '"Could not reach the AI proxy"', solution: 'The ai-proxy function is not deployed.' },
  { problem: '"CSS looks incomplete"', solution: 'The site blocks or hides its stylesheets; check the screenshot-based colours.' },
  { problem: 'Fonts marked as substitutes', solution: "The original font isn't on Google Fonts; the closest match is used." },
  { problem: 'Review shows many "texts not in the original page"', solution: 'New text was written or pasted but not built: go back to Content and click Build Sections.' },
  { problem: 'The prototype still shows old content', solution: 'It is outdated: click Update prototype, keep my changes in the amber bar.' },
  { problem: 'A change only affected one slide / card', solution: 'Only that element was selected. Click Parent to select the whole group, then ask again.' },
  { problem: 'An AI change looks wrong', solution: 'Click Undo, or restore an earlier version from Versions.' },
  { problem: 'An edit on the page didn’t reach the sections', solution: 'Older prototypes have no marks; the text must appear only once on the page. Generate a new prototype to get exact syncing.' },
];

const tips = [
  'Extract the design system once; it is shared across all pages.',
  'Check the fact-check box and the [placeholders] before sending anything to a client.',
  'Layout descriptions are the most important field: more detail gives better output.',
  'Fix small texts with Edit on page (free) instead of Describe changes (≈ $0.30).',
  'Select the smallest element that contains what you want to change, then use Change with AI.',
  'Tell the AI what you mean in the chat before clicking Yes, do it — replies cost about a cent.',
  'For Elementor sites, leave "WordPress site" unticked.',
  'Look at Settings → Usage to see what each project cost.',
];

export function HelpPage({ user, onSignOut }: HelpPageProps) {
  return (
    <div className="min-h-screen bg-white flex flex-col" style={{ ['--app-version' as string]: JSON.stringify(APP_VERSION) }}>
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
              <section id="overview" className="help-section">
                <StepHeader num="01" title="Overview" />
                <div className="help-body">
                  <p>New projects open in <strong>Builder Kit</strong>: four short steps that give you only the files an AI builder needs (chapter 4). Guided and Advanced still offer the full prototype workflow.</p>
                  <p>Blueprint Maker turns a website, your own text or a short description into an AI-ready package: <code>design.md</code> (design system), <code>blueprint.md</code> (page structure), <code>copy.md</code> (exact texts), <code>images.md</code> (real image URLs), a fact-check, a master prompt — and a working HTML prototype you can refine inside the app. Take the ZIP to Bolt, Claude, Lovable, etc.</p>
                </div>
              </section>

              <section id="projects" className="help-section">
                <StepHeader num="02" title="Projects" />
                <div className="help-body">
                  <p>The Projects page shows a card per project with a thumbnail of the first page. Hover a card for its buttons: <strong>Rename</strong> (pencil — or double-click the name; Enter saves, Esc cancels), <strong>Duplicate</strong> (copies pages, sections, design, texts and prototypes as "(copy)") and <strong>Delete</strong> (asks first; cannot be undone).</p>
                </div>
              </section>

              <section id="create" className="help-section">
                <StepHeader num="03" title="Create a project: choose a workflow" />
                <div className="help-body">
                  <p>Click <strong>New Project</strong>, choose what you want to do and the <strong>AI model</strong> for the project:</p>
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
                  <p>Workflows create a first page called "Home" and open in Guided mode.</p>
                </div>
              </section>

              <section id="guided" className="help-section">
                <StepHeader num="04" title="Builder Kit, Guided and Advanced" />
                <div className="help-body">
                  <p>Switch at the top right; the choice is remembered per project in this browser. <strong>Builder Kit</strong> is the default for new projects (Set up manually starts in Advanced); older projects keep the mode they had.</p>
                  <p><strong>Builder Kit</strong> — one page, independent cards you use in any order: make only <code>design.md</code>, only the content, or both. <strong>What do you need?</strong> (in the New Project dialog and at the top of the kit) only decides which cards open first. Every file can be downloaded on its own as soon as it exists — from the <em>Kit files</em> row at the top or on its card. <strong>Download all (.zip)</strong> in Builder prompt contains only the files that exist. The optional <strong>Quick preview</strong> (≈ $0.30) adds <code>prototype.html</code> and <code>changes.md</code>, and the builder then follows it.</p>
                  <table className="help-table">
                    <thead>
                      <tr>
                        <th>Card → files</th>
                        <th>What it needs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {kitFilesHelp.map(k => (
                        <tr key={k.file}>
                          <td><strong>{k.file}</strong></td>
                          <td>{k.when}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p><strong>Guided</strong> walks you through five steps including the prototype; <strong>Advanced</strong> shows every tool at once (Sections, Design, Preview, Export tabs).</p>
                  <table className="help-table">
                    <thead>
                      <tr>
                        <th>Step</th>
                        <th>What you do</th>
                      </tr>
                    </thead>
                    <tbody>
                      {steps.map(s => (
                        <tr key={s.step}>
                          <td><strong>{s.step}</strong></td>
                          <td>{s.what}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p>A step opens when the steps before it are done. Small status labels on the step bar show what needs attention:</p>
                  <table className="help-table">
                    <thead>
                      <tr>
                        <th>Label</th>
                        <th>Meaning</th>
                      </tr>
                    </thead>
                    <tbody>
                      {badges.map(b => (
                        <tr key={b.badge}>
                          <td><strong>{b.badge}</strong></td>
                          <td>{b.meaning}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p>While the AI works, a window covers the editor with live status, elapsed time and <strong>Cancel</strong> — so nothing is started twice. Don’t close the tab during that time. In Advanced mode, a green / amber dot on the Preview tab shows whether the prototype is in sync.</p>
                </div>
              </section>

              <section id="content" className="help-section">
                <StepHeader num="05" title="Step 1 · Content" />
                <div className="help-body">
                  <ul>
                    <li><strong>From URL</strong>: the app scrapes the page (text, images, full-page screenshot) and extracts every section with its layout and copy. Tick "WordPress site" only for non-Elementor WordPress pages.</li>
                    <li><strong>Paste my content</strong>: paste your own text; each <code>#</code> or <code>##</code> heading starts a section. Then click <strong>Build Sections</strong>.</li>
                    <li><strong>Write it for me</strong>: describe the page (e.g. "high-end coffee shop in New York"), pick language and page type. The AI may ask up to 4 quick questions with clickable answers, then writes the copy. Missing facts (phone, address, prices) become <code>[placeholders]</code> — nothing is invented. Edit the text, then click <strong>Build Sections</strong>.</li>
                  </ul>
                  <p>Safety nets: new text that isn’t built yet shows an amber note and a blue Build Sections button, and <strong>Next</strong> asks first. Importing or building again asks before it replaces the current sections. The content box shows where the current content came from ("Imported from …", "Your own text", "Written by AI"). The import also saves <code>copy.md</code> and <code>images.md</code>; if a long import gets cut off, the complete sections are kept and a compact re-import is offered.</p>
                </div>
              </section>

              <section id="design" className="help-section">
                <StepHeader num="06" title="Step 2 · Design system" />
                <div className="help-body">
                  <p>Choose Page URL, Other URL, Upload <code>.md</code> or Paste HTML. The app reads the site's real stylesheets and measures colours, fonts, sizes and spacing; colours not found in the stylesheets are marked "(inferred)". <code>design.md</code> includes a font plan (Google Fonts link and substitutes). It is shared by all pages and can be edited. Changing it later marks prototypes as outdated.</p>
                </div>
              </section>

              <section id="review" className="help-section">
                <StepHeader num="07" title="Step 3 · Review sections" />
                <div className="help-body">
                  <p>Check each section: texts, items, images and the layout description. The fact-check lists texts that aren't in the original page (or in the written copy), and <code>[placeholders]</code> are listed so you can fill them in. Text, image and link changes here are written straight into the prototype and <code>copy.md</code> (no AI, no cost). Layout changes or added / removed items make the prototype outdated.</p>
                </div>
              </section>

              <section id="preview" className="help-section">
                <StepHeader num="08" title="Step 4 · Prototype" />
                <div className="help-body">
                  <p><strong>Generate HTML</strong> builds a standalone prototype from the design, the blueprint, <code>copy.md</code> and <code>images.md</code> (+ screenshot). It takes 2–4 minutes; if the answer gets cut off, the app continues automatically. Sliders, galleries, tabs, accordions, the mobile menu etc. really work in the preview.</p>
                  <ul>
                    <li><strong>Describe changes</strong>: change the whole page with a chat (next chapter).</li>
                    <li><strong>Edit on page</strong>: click elements to edit or change them (chapter 10).</li>
                    <li><strong>Versions</strong>, <strong>Undo</strong>, <strong>Recorded changes</strong>: see chapter 11.</li>
                    <li><strong>Compare</strong> (with the screenshot), desktop / tablet / mobile widths, <strong>Copy</strong> and <strong>Download .html</strong>.</li>
                    <li><strong>Preview height</strong>: drag the bar under the preview to make it taller or shorter (or focus it and use the arrow keys). The height is remembered; double-click the bar to reset it.</li>
                    <li><strong>Generate Fresh</strong> builds a completely new prototype (asks first; the current one is saved under Versions).</li>
                  </ul>
                </div>
              </section>

              <section id="chat" className="help-section">
                <StepHeader num="09" title="Describe changes (chat with the AI)" />
                <div className="help-body">
                  <p>Type what you want ("turn the gallery into a slider") and click <strong>Apply Changes</strong>. Nothing changes yet — the AI replies first:</p>
                  <ul>
                    <li>what it understood and what it will do (it also answers questions like "do you understand?"),</li>
                    <li>an amber warning when something doesn’t fit,</li>
                    <li>up to 4 questions with clickable answers ("Let the AI decide", "Other…").</li>
                  </ul>
                  <p>Correct it in the reply box (<strong>Send</strong>) as often as needed, then click <strong>Yes, do it</strong> (or Ctrl/⌘ + Enter). <strong>Skip questions — just apply</strong> and <strong>Cancel</strong> are there too. Tick <strong>Don't ask for clear requests</strong> to apply clear requests right away; unclear ones always wait. The progress window shows the agreed plan.</p>
                </div>
              </section>

              <section id="edit" className="help-section">
                <StepHeader num="10" title="Edit on page" />
                <div className="help-body">
                  <p>Click <strong>Edit on page</strong>, then click any element in the preview (blue outline). Links and buttons don't fire while editing. The bar above shows what is selected:</p>
                  <ul>
                    <li><strong>Edit text</strong> or double-click: type in the page. Enter saves, Shift + Enter new line, Esc cancels.</li>
                    <li><strong>Image</strong>: paste a new image URL. <strong>Link / button</strong>: change the label and the link.</li>
                    <li><strong>Delete</strong> (or the Delete key). Deleting a whole section asks whether to delete it from the blueprint too.</li>
                    <li><strong>Parent</strong>: select the element around it (e.g. the whole card or gallery).</li>
                    <li><strong>Change with AI</strong>: describe a change for just this element ("make this a slider with autoplay"). The same chat appears first — if you selected only one slide, it tells you to click Parent. Only this element is sent to the AI, so it takes seconds and a few cents.</li>
                    <li><strong>Undo</strong> (last 20 steps) and <strong>Done</strong>.</li>
                  </ul>
                  <p>Edits are saved automatically.</p>
                </div>
              </section>

              <section id="sync" className="help-section">
                <StepHeader num="11" title="Staying in sync" />
                <div className="help-body">
                  <p>The sections, <code>copy.md</code>, the prototype and the export stay in step automatically:</p>
                  <ul>
                    <li><strong>Page → sections</strong>: texts, images, links and deletions you make on the prototype are written into the matching section fields and <code>copy.md</code>. Undo reverts both.</li>
                    <li><strong>Sections → page</strong>: text, image and link changes in Review are written into the prototype.</li>
                    <li><strong>Recorded changes</strong>: everything that isn't a section field (AI changes, Describe changes, other edits) is listed per page. The list goes into the blueprint, so a rebuild and AI builders keep these changes. × removes an entry.</li>
                    <li><strong>Outdated</strong>: after layout or design changes the amber bar offers <strong>Update prototype, keep my changes</strong> — the prototype is brought up to date while layout, widgets and recorded changes stay.</li>
                    <li><strong>Versions</strong>: before the prototype is replaced (Generate Fresh, Update, AI changes, the first edit of each Edit on page session, restore) the current one is saved. The last 10 per page are kept; <strong>Restore</strong> brings one back.</li>
                  </ul>
                  <p>Prototypes generated before this feature have no invisible marks; syncing then works where a text appears only once on the page.</p>
                </div>
              </section>

              <section id="export" className="help-section">
                <StepHeader num="12" title="Step 5 · Export" />
                <div className="help-body">
                  <p>First choose your tools under <strong>Build with</strong> (Bolt, Lovable, Replit, v0, Claude Code, Cursor, Claude, Any AI chat — Claude builds the page as an artifact with a live preview; Claude Code and Cursor save the rules in the project so they apply to every later request) and the <strong>Output</strong>: <strong>React + Tailwind</strong> (a real project — best when the site will be developed further; v0 uses Next.js) and/or a <strong>Single HTML file</strong> (one self-contained file — quick to host, hand over or move to WordPress). Several of each are fine: the ZIP gets one first-message prompt per combination, e.g. <code>prompt-bolt-react.txt</code>, <code>prompt-lovable-html.txt</code>. Every prompt asks for a working site that matches the prototype, with the texts word for word. <strong>Export Package</strong> (<code>.zip</code>) contains those prompts, <code>design.md</code>, <code>blueprint-[page].md</code>, <code>copy-[page].md</code>, <code>images-[page].md</code>, <code>fact-check-[page].md</code>, <code>prototype-[page].html</code> (the approved prototype with all changes), <code>changes-[page].md</code> (the change list) and screenshots if enabled. The panel warns when a page's prototype is outdated. How to use the ZIP in an AI tool:</p>
                  <ol>
                    <li>Paste the matching <code>prompt-&lt;tool&gt;-&lt;output&gt;.txt</code> as the first message.</li>
                    <li>Attach <code>design.md</code>, the blueprint, <code>copy.md</code>, <code>images.md</code>, <code>prototype.html</code> and <code>changes.md</code> (+ screenshot).</li>
                    <li>For each further page: "Add this page using the same design system and components" + its files.</li>
                  </ol>
                </div>
              </section>

              <section id="pages" className="help-section">
                <StepHeader num="13" title="More pages and Generate from Brief" />
                <div className="help-body">
                  <p><strong>+ Add Page</strong> creates another page with its own URL, sections, custom instructions, texts, prototype and screenshot; the design is shared. <strong>Global Settings</strong> (Advanced) holds site name, logo, navigation, footer and project-wide instructions. <strong>Generate from Brief</strong> (Advanced) builds a page directly from a creative brief with the project's <code>design.md</code>, and offers prompts for vibe builders.</p>
                </div>
              </section>

              <section id="settings" className="help-section">
                <StepHeader num="14" title="Settings, keys and usage" />
                <div className="help-body">
                  <p>API keys (Firecrawl, Anthropic, OpenAI) are saved on the server, never in the browser; you only see the last 4 characters. Your own key is used first, otherwise the studio key. Usage shows AI calls, scrapes, tokens and estimated cost by day, project or task, plus failed or cut-off calls. Limits: 300 calls per user per day. <strong>AI model</strong>: every project has its own — Claude Sonnet 5 (default for new projects), Claude Opus 5, Claude Fable 5.1, Claude Sonnet 4.6 or GPT-4.1. Choose it when you create a project or in the editor header; Settings sets the default for new projects. Older projects use Claude Sonnet 4.6 until you change them. Models the server doesn't allow, or without a key, are greyed out.</p>
                </div>
              </section>

              <section id="costs" className="help-section">
                <StepHeader num="15" title="Costs (approximate)" />
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

              <section id="tips" className="help-section">
                <StepHeader num="16" title="Tips" />
                <div className="help-body">
                  <ul>
                    {tips.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </div>
              </section>

              <section id="troubleshooting" className="help-section">
                <StepHeader num="17" title="Troubleshooting" />
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
