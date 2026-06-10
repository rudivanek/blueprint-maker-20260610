// vibePrompt.ts
// Assembles optimised prompts for Lovable, Bolt, Replit, v0, and generic vibe-coders
// from a creative brief + design.md + optional blueprint sections.
//
// Research-backed format per platform:
//  Lovable  — section-by-section modular approach, aesthetic buzzwords, CSS vars
//  Bolt     — complete page, tech stack declaration, Tailwind + shadcn references
//  Replit   — goal + features + stack + UI style (clear structured spec)
//  v0       — component-focused, Tailwind + shadcn, single-component style
//  Generic  — universal structured brief (Purpose → Stack → Sections → Design)

export type VibeTarget = 'lovable' | 'bolt' | 'replit' | 'v0' | 'generic';

export interface VibePromptArgs {
  brief: string;
  designMd: string;
  sections?: string; // optional: section names/descriptions from blueprint
}

// ─── helpers ────────────────────────────────────────────────────────────────

function extractColors(designMd: string): string {
  const lines = designMd.split('\n');
  const colors: string[] = [];
  for (const line of lines) {
    const m = line.match(/\|\s*--[\w-]+\s*\|\s*(#[0-9a-fA-F]{3,8})\s*\|/);
    if (m) colors.push(m[1]);
  }
  return [...new Set(colors)].slice(0, 8).join(', ');
}

function extractFonts(designMd: string): string {
  const m = designMd.match(/font-family:\s*['"]?([^'",;\n]+)/gi) || [];
  return m.map(s => s.replace(/font-family:\s*['"]?/i, '').replace(/['",]/g, '').trim())
    .filter((v, i, a) => a.indexOf(v) === i).slice(0, 2).join(' + ') || 'Inter, system-ui';
}

function extractSectionList(sections: string): string {
  if (!sections.trim()) return '';
  return sections.split('\n').filter(l => l.trim()).map(l => `- ${l.trim()}`).join('\n');
}

function colorBlock(designMd: string): string {
  const colors = extractColors(designMd);
  if (!colors) return '';
  return `\nBrand colors: ${colors}`;
}

function fontBlock(designMd: string): string {
  const fonts = extractFonts(designMd);
  return `\nTypography: ${fonts}`;
}

// ─── platform formatters ────────────────────────────────────────────────────

function lovablePrompt({ brief, designMd, sections }: VibePromptArgs): string {
  const colors = extractColors(designMd);
  const fonts = extractFonts(designMd);
  const sectionList = sections ? extractSectionList(sections) : '';

  return `Build a modern, production-quality React landing page with the following spec:

## Brief
${brief}

## Tech Stack
- React + TypeScript
- Tailwind CSS for all styling
- Framer Motion for scroll animations and hover effects
- shadcn/ui components where appropriate
- Lucide React for icons

## Design System
${colors ? `Colors (use as CSS custom properties in :root):\n${extractColors(designMd).split(', ').map((c, i) => `  --color-${i === 0 ? 'primary' : i === 1 ? 'secondary' : i === 2 ? 'accent' : 'neutral-' + i}: ${c};`).join('\n')}` : ''}
${fonts ? `Fonts: import ${fonts} from Google Fonts` : ''}
${designMd.includes('--radius') ? 'Border radius: use rounded-xl for cards, rounded-full for buttons and badges' : ''}

## Aesthetic Direction
Sophisticated, editorial, minimal. Clean whitespace. Smooth scroll-triggered fade-ins. Hover micro-interactions on all interactive elements. Professional photography placeholders sized realistically (use placehold.co with descriptive labels).

## Page Sections (build each as a separate component)
${sectionList || '- Hero (full viewport, bold headline, CTA)\n- Features / Benefits grid\n- Social proof / Testimonials\n- CTA Banner\n- Footer'}

## Rules
- Each section is its own React component in /components
- Mobile-first responsive (sm: md: lg: breakpoints)
- No hardcoded colors — use CSS variables or Tailwind config
- Real copy that fits the brief — no lorem ipsum
- Smooth anchor scroll navigation
- Add subtle entrance animations (fadeInUp, staggered children)
`.trim();
}

function boltPrompt({ brief, designMd, sections }: VibePromptArgs): string {
  const colors = extractColors(designMd);
  const fonts = extractFonts(designMd);
  const sectionList = sections ? extractSectionList(sections) : '';

  return `Create a complete, responsive landing page with the following specification:

# Project Brief
${brief}

# Technical Requirements
- React 18 + TypeScript + Vite
- Tailwind CSS (utility-first, no custom CSS files)
- shadcn/ui component library
- Framer Motion for animations
- Lucide React icons
- Google Fonts: ${fonts}

# Design Tokens
${colors ? `Primary palette: ${colors}` : ''}
- Spacing: 4px base grid (Tailwind spacing scale)
- Border radius: 8px cards, 6px inputs, 9999px pills
- Shadows: subtle (shadow-sm to shadow-lg only)

# Page Architecture
${sectionList || `
- <Navbar> — sticky, transparent-to-white on scroll, logo + nav links + CTA button
- <Hero> — full viewport height, bold H1, subtext, primary + secondary CTAs, hero image/visual
- <Features> — 3-column grid of feature cards with icons
- <Testimonials> — carousel or grid with quote + attribution
- <CTA> — centered banner with headline and button
- <Footer> — multi-column with links, social icons, copyright`}

# Quality Requirements
- Pixel-perfect Tailwind — no inline styles
- All images: placehold.co/[W]x[H]/[hex]/ffffff?text=[Label]
- Real, compelling copy — no lorem ipsum
- Fully mobile responsive
- Smooth CSS transitions on all interactive elements (transition-all duration-200)
- Accessible: proper aria labels, semantic HTML, keyboard navigation

Generate the complete project structure with all components.
`.trim();
}

function replitPrompt({ brief, designMd, sections }: VibePromptArgs): string {
  const colors = extractColors(designMd);
  const fonts = extractFonts(designMd);
  const sectionList = sections ? extractSectionList(sections) : '';

  return `# Project Goal
Build a responsive, production-quality landing page.

# Brief
${brief}

# Tech Stack
- React + TypeScript
- Tailwind CSS
- Framer Motion (animations)
- Lucide React (icons)
- Google Fonts: ${fonts || 'Inter'}

# Design Specifications
${colors ? `Brand colors: ${colors}` : ''}
${fonts ? `Fonts: ${fonts}` : ''}
- Clean, minimal aesthetic with generous whitespace
- Smooth scroll animations (Intersection Observer or Framer Motion)
- Mobile-first responsive design

# Features & Pages
## Main Landing Page
${sectionList || `1. Navigation bar (sticky, with smooth scroll links and CTA button)
2. Hero section (full-screen, compelling headline, subheadline, CTA buttons)
3. Benefits/Features section (icon grid or card layout)
4. Social proof section (testimonials or stats)
5. Call-to-action banner
6. Footer (links, social icons, copyright)`}

# Code Quality Requirements
- Component-based architecture (one file per section)
- No hardcoded hex values — use CSS custom properties
- All placeholder images: placehold.co with descriptive labels
- Real copy matching the brief — no lorem ipsum
- Keyboard accessible, semantic HTML5

Start by creating the project structure, then build each section component.
`.trim();
}

function v0Prompt({ brief, designMd, sections }: VibePromptArgs): string {
  const colors = extractColors(designMd);
  const fonts = extractFonts(designMd);
  const sectionList = sections ? extractSectionList(sections) : '';

  return `Create a complete landing page using React, Tailwind CSS, and shadcn/ui components.

Brief: ${brief}

Design requirements:
- Typography: ${fonts || 'Inter for body, a display serif for headings'}
${colors ? `- Brand colors: ${colors}` : '- Clean blue/white palette, professional'}
- Style: sophisticated, minimal, editorial with smooth micro-interactions
- Mobile responsive with sm/md/lg breakpoints

Page sections:
${sectionList || `1. Sticky navigation with logo, links, and CTA button
2. Hero — full viewport, large H1, subtitle, two CTA buttons, hero visual
3. Features — 3-col grid, icon + title + description cards
4. Testimonials — 3 quotes with attribution
5. CTA banner — centered, dark background, headline + button
6. Footer — columns with links, social icons, copyright`}

Technical:
- Use shadcn/ui Card, Button, Badge components throughout
- Lucide React icons only
- All images: placehold.co/[dimensions]/[color]/ffffff?text=[description]
- Framer Motion for entrance animations (fadeInUp, stagger)
- Real copy that fits the brief — no placeholders in text content
- Export as a single page component with sub-components for each section
`.trim();
}

function genericPrompt({ brief, designMd, sections }: VibePromptArgs): string {
  const colors = extractColors(designMd);
  const fonts = extractFonts(designMd);
  const sectionList = sections ? extractSectionList(sections) : '';

  return `## Purpose
${brief}

## Tech Stack
React + TypeScript + Tailwind CSS + Framer Motion + shadcn/ui

## Design System
${colors ? `Colors: ${colors}` : ''}
${fonts ? `Fonts: ${fonts}` : ''}
- Minimal, editorial aesthetic
- Generous whitespace
- Smooth scroll animations
- Hover micro-interactions

## Page Sections
${sectionList || `- Hero (full viewport, bold headline, CTA)
- Features / Benefits (3-column grid)
- Social proof (testimonials)  
- CTA Banner
- Footer`}

## Requirements
- Component-based (one component per section)
- Mobile-first responsive
- Real copy, no lorem ipsum
- placehold.co for all images
- Accessible semantic HTML
- CSS custom properties for all colors
`.trim();
}

// ─── main export ────────────────────────────────────────────────────────────

export function buildVibePrompt(target: VibeTarget, args: VibePromptArgs): string {
  switch (target) {
    case 'lovable':  return lovablePrompt(args);
    case 'bolt':     return boltPrompt(args);
    case 'replit':   return replitPrompt(args);
    case 'v0':       return v0Prompt(args);
    case 'generic':  return genericPrompt(args);
    default:         return genericPrompt(args);
  }
}

export const VIBE_TARGETS: { id: VibeTarget; label: string; url: string; color: string; description: string }[] = [
  { id: 'lovable',  label: 'Lovable',  url: 'https://lovable.dev',  color: '#FF5C5C', description: 'React + modular components' },
  { id: 'bolt',     label: 'Bolt',     url: 'https://bolt.new',     color: '#8B5CF6', description: 'Full project with Vite' },
  { id: 'replit',   label: 'Replit',   url: 'https://replit.com',   color: '#F26207', description: 'Structured spec format' },
  { id: 'v0',       label: 'v0',       url: 'https://v0.dev',       color: '#000000', description: 'shadcn/ui components' },
  { id: 'generic',  label: 'Any',      url: '',                     color: '#6B7280', description: 'Works with any AI builder' },
];
