// src/lib/builderPrompts.ts
//
// prompt-<tool>-<output>.txt for the export ZIP: how an AI builder should
// rebuild the approved site. Export → "Build with" (tools) × "Output"
// (React + Tailwind and/or a single HTML file) — one prompt per combination.


export type BuilderId = 'bolt' | 'lovable' | 'replit' | 'v0' | 'claude' | 'chat';
export type OutputId = 'react' | 'html';

export const BUILDERS: { id: BuilderId; label: string; hint: string }[] = [
  { id: 'bolt', label: 'Bolt', hint: 'bolt.new' },
  { id: 'lovable', label: 'Lovable', hint: 'lovable.dev' },
  { id: 'replit', label: 'Replit', hint: 'Replit Agent' },
  { id: 'v0', label: 'v0', hint: 'v0.dev' },
  { id: 'claude', label: 'Claude Code / Cursor', hint: 'Coding agent in your own project folder' },
  { id: 'chat', label: 'Any AI chat', hint: 'Claude, ChatGPT, Gemini … in the browser' },
];

export const OUTPUTS: { id: OutputId; label: string; hint: string }[] = [
  { id: 'react', label: 'React + Tailwind', hint: 'A real project — best when the site will be developed further (v0: Next.js)' },
  { id: 'html', label: 'Single HTML file', hint: 'One self-contained file — quick to host, hand over or move to WordPress' },
];

export interface ExportTargets { tools: BuilderId[]; outputs: OutputId[] }

const TOOLS_KEY = 'bpm_export_tools';
const OUTPUTS_KEY = 'bpm_export_outputs';

function readList<T extends string>(key: string, allowed: readonly T[], fallback: T[]): T[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? '[]');
    const ok = Array.isArray(raw) ? allowed.filter(a => raw.includes(a)) : [];
    return ok.length ? ok : fallback;
  } catch {
    return fallback;
  }
}

export function readTargets(): ExportTargets {
  return {
    tools: readList(TOOLS_KEY, BUILDERS.map(b => b.id), ['bolt']),
    outputs: readList(OUTPUTS_KEY, OUTPUTS.map(o => o.id), ['react']),
  };
}

export function saveTargets(t: ExportTargets) {
  try {
    localStorage.setItem(TOOLS_KEY, JSON.stringify(t.tools));
    localStorage.setItem(OUTPUTS_KEY, JSON.stringify(t.outputs));
  } catch { /* ignore */ }
}

/** every chosen tool × every chosen output */
export function combos(t: ExportTargets): { tool: BuilderId; output: OutputId }[] {
  const tools = BUILDERS.map(b => b.id).filter(id => t.tools.includes(id));
  const outputs = OUTPUTS.map(o => o.id).filter(id => t.outputs.includes(id));
  return tools.flatMap(tool => outputs.map(output => ({ tool, output })));
}

export const promptFileName = (tool: BuilderId, output: OutputId) => `prompt-${tool}-${output}.txt`;

export const comboLabel = (tool: BuilderId, output: OutputId) =>
  `${BUILDERS.find(b => b.id === tool)?.label ?? tool} · ${OUTPUTS.find(o => o.id === output)?.label ?? output}`;

export interface PackageInfo {
  projectName: string;
  hasDesign: boolean;
  hasPrototype: boolean;
  hasChanges: boolean;
  hasCopy: boolean;
  hasImages: boolean;
  hasScreenshots: boolean;
  /** page names in order (first = start page) */
  pages: string[];
}

function filesBlock(p: PackageInfo): string {
  const multi = p.pages.length > 1;
  const f = (base: string, ext: string) => (multi ? `${base}-<page>.${ext}` : `${base}.${ext}`);
  const list: string[] = [];
  if (p.hasPrototype) list.push(`**${f('prototype', 'html')}** — the design the client APPROVED: look, layout, spacing, colours and working widgets. Read its HTML, CSS and JavaScript and match it closely.`);
  if (p.hasChanges) list.push(`**${f('changes', 'md')}** — changes approved after the blueprint was written. Keep every one of them.`);
  list.push(`**${f('blueprint', 'md')}** — page structure: sections in order, layout contract, copy, items and images per section.`);
  if (p.hasCopy) list.push(`**${f('copy', 'md')}** — the exact page text. Use it word for word.`);
  if (p.hasImages) list.push(`**${f('images', 'md')}** — real image URLs grouped by section. Use them.`);
  if (p.hasDesign) list.push('**design.md** — design tokens: colours, fonts (with the Google Fonts link), sizes, spacing, components.');
  if (p.hasScreenshots) list.push(`**${f('screenshot', 'jpg')}** — screenshot of the original page, for reference only.`);
  return `## Attached files (when they disagree, the higher one wins)
${list.map((l, i) => `${i + 1}. ${l}`).join('\n')}

If you can't read attached .md / .html files, ask me to paste their content.`;
}

const RULES_COMMON = `- Build every section from the blueprint, in the same order. Don't add or drop sections.
- Use the texts word for word. Never invent facts, numbers, names, prices, reviews or awards.
- Keep any [placeholder] exactly as written and visible — the client fills them in later.
- Everything interactive must really work: navigation and mobile menu, sliders / carousels (arrows, dots, swipe), galleries with lightbox, tabs, accordions / FAQ, sticky header, smooth scrolling, forms (validation + a thank-you message; no backend unless I ask).
- Responsive: desktop, tablet and mobile (main breakpoint 768px). No horizontal scrolling.
- Take colours, fonts and spacing from design.md / prototype.html — no default theme colours. Load the fonts from the Google Fonts link in design.md.
- Use the real image URLs. Only if an image is missing, use a neutral placeholder of the right size.
- Accessible: semantic HTML, one h1, alt texts, visible focus, keyboard support, good contrast.`;

const RULES_REACT = `## Rules
${RULES_COMMON}
- Rebuild the prototype in this stack's idiomatic way (components, not one big file) — it must LOOK and BEHAVE the same, the code doesn't have to be the same.`;

const RULES_HTML = `## Rules
${RULES_COMMON}
- ONE self-contained file: index.html with all CSS in one <style> in the head and all JavaScript in one <script> just before </body>.
- No frameworks, no build step, no npm packages, no CSS frameworks, no jQuery. Plain, modern HTML, CSS and JavaScript. Only external resources: Google Fonts and the image URLs.
- Put the design tokens from design.md in :root CSS variables and use them everywhere.
- JavaScript: wrap it in DOMContentLoaded, connect widgets with data-attributes, keep it compact. All content must still be visible if JavaScript doesn't run.
- If prototype.html is attached, it already follows these rules — start from it and improve it rather than starting over.`;

function pagesBlock(p: PackageInfo, output: OutputId): string {
  if (p.pages.length <= 1) return '';
  return `
## More pages
This site has ${p.pages.length} pages: ${p.pages.join(', ')}. Build "${p.pages[0]}" first. Then, for each further page, I'll send its files with: "Add this page using the same design system and components."${output === 'html'
    ? ' Each page becomes its own .html file (index.html, about.html, …) with the same header, footer, navigation and styles; link the pages to each other.'
    : ' Share header, footer, navigation and components between pages; every page gets its own route.'}`;
}

const TOOL_NAME: Record<BuilderId, string> = {
  bolt: 'Bolt', lovable: 'Lovable', replit: 'Replit', v0: 'v0', claude: 'Claude Code / Cursor', chat: 'AI chat',
};

const REACT: Record<BuilderId, { stack: string; how: string }> = {
  bolt: {
    stack: `- Vite + React + TypeScript
- Tailwind CSS (theme colours and fonts from design.md in tailwind.config)
- lucide-react for icons; no other UI library needed
- One component per section in src/components/sections/, shared Header / Footer in src/components/`,
    how: 'Build the complete page in one go — every section, fully styled and working. Then run it and fix anything that doesn\'t match prototype.html.',
  },
  lovable: {
    stack: `- React + TypeScript + Vite
- Tailwind CSS with the colours and fonts from design.md as theme tokens (index.css variables)
- shadcn/ui only where it fits the design (accordion, tabs, dialog, carousel); restyle it to match
- lucide-react for icons`,
    how: 'Start with the layout: header / navigation, hero and footer. Then build the remaining sections in blueprint order, one component per section. Keep going until every section exists — don\'t stop after the first ones. Finish by checking mobile and every interactive part.',
  },
  replit: {
    stack: `- React + Vite + TypeScript
- Tailwind CSS (colours and fonts from design.md)
- lucide-react for icons; static front end only, no database`,
    how: 'Goal: a responsive, working marketing website that looks and behaves exactly like prototype.html. Build the whole page — every blueprint section, working navigation, mobile menu and all widgets — run it, and check it against prototype.html before you finish.',
  },
  v0: {
    stack: `- Next.js (App Router) + TypeScript
- Tailwind CSS with the colours and fonts from design.md
- shadcn/ui where it fits (accordion, tabs, carousel, dialog), restyled to match the design
- lucide-react for icons; fonts via next/font or the Google Fonts link`,
    how: 'Build app/page.tsx from one component per section (components/sections/…), plus shared header and footer. Every section must be complete — no "…rest of the page" shortcuts.',
  },
  claude: {
    stack: `- Vite + React + TypeScript + Tailwind CSS (unless this folder already has a project — then use its stack)
- lucide-react for icons
- One component per section, shared layout components`,
    how: `1. Put the attached files in ./docs/ and read ALL of them before writing code.
2. Make a short plan: sections → components, design tokens → Tailwind theme.
3. Build section by section. After each one, compare it with docs/prototype.html.
4. Run the dev server and the build; fix errors and warnings.
5. Finish with a checklist: every blueprint section present, texts identical to copy.md, every widget works, mobile OK.`,
  },
  chat: {
    stack: `- Vite + React + TypeScript
- Tailwind CSS (colours and fonts from design.md)
- lucide-react for icons`,
    how: 'Give me the complete project: the file tree first, then every file in full (package.json, tailwind config, main.tsx, App.tsx, one component per section). No "…" placeholders in the code. If the answer gets too long, stop at a file boundary and continue when I say "continue".',
  },
};

const HTML_HOW: Record<BuilderId, string> = {
  bolt: 'Create a plain static site — just index.html, no Vite/React project. Build the complete page in one go, open the preview and fix anything that doesn\'t match prototype.html.',
  lovable: 'Deliver the page as ONE self-contained HTML file (index.html) — plain HTML, CSS and JavaScript, no React components. If the project needs an entry point, put the complete file in public/index.html and make the app show it unchanged. Build every section; don\'t stop after the first ones.',
  replit: 'Create a static HTML project with just index.html (no framework, no server code). Build the complete page, run it and check it against prototype.html.',
  v0: 'Deliver the page as ONE self-contained HTML file (index.html) — plain HTML, CSS and JavaScript, no React or Next.js components. Output the complete file.',
  claude: 'Write ./index.html (put the attached files in ./docs/ and read all of them first). Build section by section, compare each with docs/prototype.html, then open the file in a browser and check mobile and every widget',
  chat: 'Reply with the complete index.html in ONE code block — no explanations, no "…" shortcuts. If it gets too long, stop at the end of a section and continue when I say "continue".',
};

/** The prompt for one tool and one output type. */
export function buildBuilderPrompt(tool: BuilderId, output: OutputId, p: PackageInfo): string {
  const name = TOOL_NAME[tool];
  const intro = output === 'html'
    ? `Build it as ONE self-contained, production-quality HTML file.`
    : `Build it as a real, working, production-quality ${tool === 'v0' ? 'Next.js' : 'React'} website.`;
  const stack = output === 'html'
    ? `## Output
- index.html — HTML5, CSS in one <style>, vanilla JavaScript in one <script>
- Google Fonts link from design.md; image URLs from images.md / prototype.html`
    : `## Stack
${REACT[tool].stack}`;
  return `# Build the website "${p.projectName}" (${name} · ${output === 'html' ? 'single HTML file' : tool === 'v0' ? 'Next.js + Tailwind' : 'React + Tailwind'})

A client approved ${p.hasPrototype ? 'the attached HTML prototype' : 'the attached blueprint and design'}. ${intro}

${filesBlock(p)}

${stack}

${output === 'html' ? RULES_HTML : RULES_REACT}

## How to work
${output === 'html' ? HTML_HOW[tool] : REACT[tool].how}
${pagesBlock(p, output)}
`;
}

/** README lines: which prompt for which tool. */
export function readmePromptLines(t: ExportTargets): string {
  return combos(t).map(c => `- ${promptFileName(c.tool, c.output)} — first message for ${comboLabel(c.tool, c.output)}`).join('\n');
}




