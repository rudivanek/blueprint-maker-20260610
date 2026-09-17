// src/lib/kitFiles.ts
//
// Builder Kit: the files an AI builder needs for ONE page, and when each is ready.
// The kit is a set of independent cards (components/Editor/BuilderKit): make only
// design.md, only the content, or both. Every file can be downloaded on its own as
// soon as it exists, or all together as a ZIP (hooks/useExport).

import type { Page, Project, Section } from '../types';
import { generateBlueprintMd } from './prompts';
import { checkFabrication, factCheckMd } from './pageAssets';
import { comboLabel, combos, promptFileName, type ExportTargets } from './builderPrompts';

export type KitStepId = 'design' | 'content' | 'sections' | 'prompt' | 'preview';

export const KIT_STEP_LABEL: Record<KitStepId, string> = {
  design: 'Design',
  content: 'Content',
  sections: 'Sections',
  prompt: 'Builder prompt',
  preview: 'Quick preview',
};

export interface KitFile {
  name: string;
  /** the card that makes this file */
  step: KitStepId;
  ready: boolean;
  /** one line: what the file is (or why it isn't ready) */
  hint: string;
}

export interface KitInput {
  project: Project;
  page: Page;
  sections: Section[];
  /** screenshot of the original page (kept for this browser session only) */
  screenshot?: string;
}

const has = (s?: string | null) => !!s && !!s.trim();

/** Does the page have content (text or sections)? */
export const hasContent = (page: Page, sections: Section[]) => has(page.copy_md) || sections.length > 0;

/** The page's files. Prompts, README and the ZIP are handled by the Builder prompt card. */
export function kitFiles({ project, page, sections, screenshot }: KitInput): KitFile[] {
  const content = hasContent(page, sections);
  const secs = sections.length > 0;
  return [
    { name: 'design.md', step: 'design', ready: has(project.design_md), hint: 'Colours, fonts, spacing, components' },
    { name: 'copy.md', step: 'content', ready: has(page.copy_md), hint: 'The exact page text' },
    { name: 'images.md', step: 'content', ready: has(page.images_md), hint: 'Image URLs by section' },
    { name: 'site.md', step: 'content', ready: content, hint: 'Navigation, footer, SEO' },
    { name: 'screenshot.jpg', step: 'content', ready: !!screenshot, hint: screenshot ? 'The original page' : 'Only right after an import (this session)' },
    { name: 'blueprint.md', step: 'sections', ready: secs, hint: 'Sections, layout, copy, items, images' },
    { name: 'fact-check.md', step: 'sections', ready: secs && has(page.copy_md), hint: 'Texts not found in copy.md' },
  ];
}

/** site.md: the page's place in the site (navigation, footer, SEO, sources). */
export function siteMd(project: Project, page: Page): string {
  const g = project.globals;
  const nav = g?.nav?.items?.length
    ? g.nav.items.map(i => `| ${i.label} | ${i.url} |`).join('\n')
    : '| Home | / |';
  const sitemap = g?.sitemap?.length
    ? g.sitemap.map(i => `| ${i.pageName} | ${i.url} |`).join('\n')
    : `| ${page.page_name} | /${page.slug === 'index' ? '' : page.slug} |`;
  const socials = g?.footer?.socials?.filter(s => s.platform)?.map(s => `- ${s.platform}${s.url ? `: ${s.url}` : ''}`).join('\n');
  const line = (k: string, v?: string) => `- **${k}:** ${has(v) ? v : '—'}`;

  return `# Site — ${page.page_name}

${line('Site name', g?.siteName || project.name)}
${line('Logo', g?.logoUrl)}
${line('Page address (source)', page.page_url || project.url)}
${line('Design taken from', project.design_url || project.url)}

## SEO
${line('Title', page.seo_title)}
${line('Description', page.seo_description)}
${line('Purpose', page.purpose)}
${line('Primary call to action', page.primary_cta)}

## Navigation${has(g?.nav?.style) ? `\nStyle: ${g.nav.style}` : ''}
| Label | URL |
|-------|-----|
${nav}

## Sitemap
| Page | URL |
|------|-----|
${sitemap}

## Footer${has(g?.footer?.style) ? `\nStyle: ${g.footer.style}` : ''}
${line('Copyright', g?.footer?.copyright)}
${socials ? `\n**Social links**\n${socials}\n` : ''}
## Notes
- Only this page is in the kit. Links to other pages may point to pages that aren't built yet.
${[
    has(g?.responsive) ? `- Responsive behaviour: ${g.responsive}` : '',
    has(g?.imageInstructions) ? `- Images: ${g.imageInstructions}` : '',
    has(g?.globalCustomInstructions) ? `- Site-wide instructions: ${g.globalCustomInstructions}` : '',
    has(page.custom_instructions) ? `- Special instructions for this page: ${page.custom_instructions}` : '',
  ].filter(Boolean).join('\n')}
`;
}

/** Text content of a kit .md file (screenshot is binary and handled by the caller). */
export function kitFileText(name: string, { project, page, sections }: KitInput): string {
  switch (name) {
    case 'copy.md': return page.copy_md ?? '';
    case 'images.md': return page.images_md ?? '';
    case 'site.md': return siteMd(project, page);
    case 'design.md': return project.design_md ?? '';
    case 'blueprint.md': return generateBlueprintMd(project.globals, page, sections);
    case 'fact-check.md': return factCheckMd(page.page_name, checkFabrication(sections, page.copy_md ?? ''));
    default: return '';
  }
}

/** Screenshot as a Blob (data URI, raw base64 or URL). */
export async function screenshotBlob(data: string): Promise<Blob | null> {
  try {
    const src = data.startsWith('data:') || data.startsWith('http') ? data : `data:image/jpeg;base64,${data}`;
    const r = await fetch(src);
    return r.ok ? await r.blob() : null;
  } catch {
    return null;
  }
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function saveText(text: string, filename: string) {
  const type = filename.endsWith('.html') ? 'text/html' : filename.endsWith('.md') ? 'text/markdown' : 'text/plain';
  saveBlob(new Blob([text], { type: `${type};charset=utf-8` }), filename);
}

/** README.md of the Builder Kit ZIP. `files` = the files that are in it. */
export function kitReadme(project: Project, page: Page, targets: ExportTargets, files: string[]): string {
  const list = combos(targets);
  const has = (n: string) => files.includes(n);
  return `# ${project.name} — Builder Kit

Made with Sharpen.Studio Blueprint Maker · ${new Date().toISOString().slice(0, 10)}
Page: ${page.page_name}${page.page_url || project.url ? ` (${page.page_url || project.url})` : ''}

## How to use it
1. Open your AI builder (${list.map(c => comboLabel(c.tool, c.output)).join(', ')}).
2. Paste the matching prompt file as your FIRST message:
${list.map(c => `   - ${promptFileName(c.tool, c.output)} → ${comboLabel(c.tool, c.output)}`).join('\n')}
3. Attach these files to the same message (or upload them to the project / knowledge):
${['blueprint.md', 'copy.md', 'design.md', 'site.md', 'images.md', 'screenshot.jpg', 'prototype.html', 'changes.md'].filter(has).map(n => `   - ${n}`).join('\n')}
${has('copy.md') || has('blueprint.md')
    ? '4. Send, let it build, then check every section against ' + (has('blueprint.md') ? 'blueprint.md.' : 'copy.md.')
    : '4. This kit has no page content: add a short description of the page (or paste your texts) below the prompt, then send.'}

## Files
${[
    ['blueprint.md', 'Sections in order: layout rules, copy, items and images per section'],
    ['copy.md', 'The exact page text — used word for word'],
    ['design.md', 'Design system: colours, fonts (Google Fonts link), sizes, spacing, components'],
    ['site.md', 'Site name, navigation, footer, social links, SEO title / description'],
    ['images.md', 'Real image URLs, grouped by section'],
    ['fact-check.md', 'Texts in the blueprint that are not in copy.md — check them (not for the builder)'],
    ['screenshot.jpg', 'The original page — a guide for the look, not for texts'],
    ['prototype.html', 'Quick preview made in the app — open it in a browser'],
    ['changes.md', 'Changes approved on the preview'],
  ].filter(([n]) => has(n)).map(([n, d]) => `- ${n} — ${d}`).join('\n')}
${list.map(c => `- ${promptFileName(c.tool, c.output)} — first message for ${comboLabel(c.tool, c.output)}`).join('\n')}
`;
}
