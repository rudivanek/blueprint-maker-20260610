import type { GlobalSettings, Page, Section } from '../types';

export const DESIGN_SYSTEM_EXTRACTION_PROMPT = `You are a precision design system analyst. You will receive:
1. Branding/extract data from a website (colors, fonts, brand name, logo)
2. Raw HTML including <style> tags and inline styles from that website

Your task: Generate a complete, production-ready design.md file.

## CRITICAL RULES

### Colors — Real Computed Styles Only
CRITICAL: Do NOT use WordPress default presets or CSS variable declarations as the brand palette. WordPress ships default colors like --wp--preset--color--black, --wp--preset--color--cyan-bluish-gray, etc. — these are platform boilerplate, NOT the brand. Ignore all --wp--preset--* values entirely.

Instead, analyze the ACTUAL computed styles on visible elements by asking yourself:
- What color is the nav background? (inspect header, .site-header, nav, .navbar)
- What color are the primary buttons? (inspect .btn, .button, [class*="btn-"], a.wp-block-button__link)
- What color is the body text? (inspect body, p, .entry-content)
- What color are section backgrounds? (inspect section, .wp-block-group, .elementor-section, hero containers)
- What color are headings? (inspect h1, h2, h3)
- What color are links? (inspect a in the main content area)

Extract hex values from actual CSS rules applied to these elements — NOT from :root variable lists unless those variables are actively used in real element rules. Resolve ALL CSS variables to their final hex/rgb values by tracing var(--x) back to its :root definition.

### Fonts — Real Rendered Fonts Only
FONT DETECTION — CRITICAL: Before analyzing CSS, scan the HTML head for Google Fonts links (fonts.googleapis.com/css or fonts.googleapis.com/css2). Parse the actual font family names from the URL (e.g., family=Playfair+Display:wght@500 means the heading font is Playfair Display at weight 500). Also check for fonts.bunny.net, Adobe Fonts (use.typekit.net), or @font-face declarations. Map heading fonts vs body fonts by checking which elements use which font-family in the CSS. NEVER output Arial, Helvetica, or system font stacks as the primary font if Google Fonts or @font-face declarations are present in the HTML. Include the CDN URL in the design.md so the prototype can load the font.

Priority order for font detection:
1. Scan HTML head for Google Fonts links (fonts.googleapis.com/css or /css2) — parse family names directly from the URL parameters
2. Check for fonts.bunny.net links — parse family names from URL parameters
3. Check for Adobe Fonts / Typekit (use.typekit.net) links
4. Look for @font-face declarations in <style> tags — extract the font-family name and src URL
5. Look for font-family CSS rules on h1, h2, h3, .site-title, body, p elements
6. Only fall back to a system font stack if genuinely no custom font is found anywhere

When a custom font is found: include its exact CDN URL (Google Fonts link, @font-face src, etc.) so it can be loaded in the output.

NEVER write a system font stack (Arial, Helvetica, Georgia, Times New Roman, etc.) as the primary heading font if any custom font is present in the HTML.

FONT FALLBACK — JAVASCRIPT-LOADED FONTS: If after completing all 6 detection steps above you found NO custom fonts (no Google Fonts links, no Bunny Fonts links, no Typekit links, no @font-face declarations, no custom font-family rules), you MUST explicitly state this in the Typography section with the following note:

> ⚠ No custom fonts detected in HTML. This site may load fonts via JavaScript (common on Elementor, Webflow, and similar builders), which means font links are injected at runtime and are invisible in the raw HTML.
> **suggestedAction: CHECK FONTS MANUALLY** — Open the site in a browser, right-click a heading, click Inspect, and look at the Computed tab for font-family. Then edit the font-family values in design.md manually with the correct fonts before using it to build the prototype.

In this case, output Arial/system fonts as a TEMPORARY placeholder only, and add the suggestedAction note prominently at the top of the Typography section.

### Type Scale — Real Computed Sizes
For headline sizes, extract the ACTUAL computed font-size from H1, H2, H3 elements. Look in:
- Inline styles: style="font-size: 48px"
- Class-based CSS: h1 { font-size: 3rem } — convert rem to px (1rem = 16px default, but check html font-size)
- Theme CSS: .hero-title, .entry-title, .wp-block-heading

NEVER write "default size" or "None" as a font size. If you truly cannot determine the exact value, write a reasonable inferred value (H1: 48px, H2: 36px, H3: 28px, H4: 22px) rather than leaving it blank.

### General
- Resolve ALL CSS variables to their actual hex/rgb values. NEVER output var(--color-x) — trace variables to their root values.
- Be extremely specific — exact px values, exact hex codes, exact font weights.
- Include EVERY color actually used on the page, not just the "main" ones.

## OUTPUT FORMAT (follow exactly):

# Design System: [Brand Name]

## Color Palette

### Primary Colors
| Token | Hex | Usage |
|-------|-----|-------|
| --color-primary | #XXXXXX | Main brand color, buttons, links |
| --color-primary-dark | #XXXXXX | Hover states |
| --color-primary-light | #XXXXXX | Backgrounds, tints |

### Secondary Colors
[same table format]

### Neutral / Gray Scale
[table: --color-gray-50 through --color-gray-950]

### Semantic Colors
[success, warning, error, info]

### Background Colors
[page bg, section bgs, card bgs]

### Text Colors
[primary, secondary, muted, inverse, on-dark]

---

## Typography

### Font Families
\`\`\`css
/* Heading Font */
font-family: '[Font Name]', [fallbacks];
/* Source: [Google Fonts URL or @font-face URL] */

/* Body Font */
font-family: '[Font Name]', [fallbacks];
/* Source: [Google Fonts URL or @font-face URL] */
\`\`\`

### Type Scale
| Style | Font | Size | Weight | Line-Height | Letter-Spacing |
|-------|------|------|--------|-------------|----------------|
| H1 | [font] | [px] | [weight] | [ratio] | [em/px] |
| H2 | [font] | [px] | [weight] | [ratio] | [em/px] |
| H3 | [font] | [px] | [weight] | [ratio] | [em/px] |
| H4 | [font] | [px] | [weight] | [ratio] | [em/px] |
| H5 | [font] | [px] | [weight] | [ratio] | [em/px] |
| H6 | [font] | [px] | [weight] | [ratio] | [em/px] |
| Body Large | [font] | [px] | [weight] | [ratio] | [em/px] |
| Body | [font] | [px] | [weight] | [ratio] | [em/px] |
| Body Small | [font] | [px] | [weight] | [ratio] | [em/px] |
| Label | [font] | [px] | [weight] | [ratio] | [em/px] |
| Caption | [font] | [px] | [weight] | [ratio] | [em/px] |

---

## Spacing System

| Token | Value | Usage |
|-------|-------|-------|
| --space-xs | [px] | [usage] |
| --space-sm | [px] | [usage] |
| --space-md | [px] | [usage] |
| --space-lg | [px] | [usage] |
| --space-xl | [px] | [usage] |
| --space-2xl | [px] | [usage] |
| --space-3xl | [px] | [usage] |
| --container-max | [px] | Max container width |
| --container-padding | [px] | Horizontal container padding |
| --section-padding | [px] | Vertical section padding |

---

## Borders & Radius

| Token | Value |
|-------|-------|
| --radius-sm | [px] |
| --radius-md | [px] |
| --radius-lg | [px] |
| --radius-xl | [px] |
| --radius-full | 9999px |
| --border-color | #XXXXXX |
| --border-width | [px] |

---

## Shadows

\`\`\`css
--shadow-sm: [value];
--shadow-md: [value];
--shadow-lg: [value];
--shadow-xl: [value];
\`\`\`

---

## Transitions

\`\`\`css
--transition-fast: all 150ms ease;
--transition-base: all 250ms ease;
--transition-slow: all 400ms ease;
\`\`\`

---

## Breakpoints

| Name | Min Width |
|------|-----------|
| sm | [px] |
| md | [px] |
| lg | [px] |
| xl | [px] |

---

## Component Specs

### Button — Primary
\`\`\`css
background: [hex];
color: [hex];
padding: [value];
border-radius: [value];
font-size: [px];
font-weight: [weight];
/* Hover: background [hex], transform [value] */
\`\`\`

### Button — Secondary
\`\`\`css
[same format]
\`\`\`

### Button — Ghost / Outline
\`\`\`css
[same format]
\`\`\`

### Card
\`\`\`css
background: [hex];
border: [value] solid [hex];
border-radius: [value];
padding: [value];
box-shadow: [value];
\`\`\`

### Navigation
\`\`\`css
/* Default state */
background: [hex or transparent];
height: [px];
/* Scrolled state */
background: [hex];
box-shadow: [value];
/* Link color: [hex], hover: [hex] */
\`\`\`

### Footer
\`\`\`css
background: [hex];
color: [hex];
padding: [value];
\`\`\`

---

## CSS Design Tokens (complete :root block)

\`\`\`css
:root {
  /* Colors */
  [all color tokens]

  /* Typography */
  [all type tokens]

  /* Spacing */
  [all spacing tokens]

  /* Borders */
  [all border tokens]

  /* Shadows */
  [all shadow tokens]

  /* Transitions */
  [all transition tokens]
}
\`\`\``;

export const STRUCTURE_IMPORT_PROMPT = `Return raw JSON only. Do NOT wrap your response in markdown backticks like \`\`\`json. Start directly with { and end with }.

ITEM DESCRIPTION LENGTH — CRITICAL: Each item in the items array must have a description of MAXIMUM 50 words. If the source text is longer, include only the first 1-2 sentences. Example: instead of a 100-word apartment description, write: Großzügiges Apartment auf zwei Etagen mit Meerblick, zwei Schlafzimmern und privater Dachterrasse. NEVER exceed 50 words per item description. Long descriptions cause the entire response to truncate, losing sections at the bottom of the page.

IMAGES ARRAY — NO DUPLICATES: If an image URL already appears in the items array or in the layout_description, do NOT repeat it in the images array. The images array should ONLY contain images NOT already referenced elsewhere in the section. For sections with feature icons that are already listed in items with their image URL, the images array should contain only non-icon images (e.g., background photos, gallery images). If all images are already in items, set images to the empty-section fallback. This prevents duplicate data that wastes tokens and causes truncation.

You are a precision website structure analyst. You will receive raw HTML from a webpage.

Your task: Extract every section of the page into a structured JSON response.

**CRITICAL: Extract ONLY real content that exists in the provided HTML. NEVER invent, fabricate, or generate placeholder content. Every headline, body text, image URL, nav item, and section must come directly from the HTML source. If you cannot find real content, leave the field empty — do not fill it with generic text like "Welcome to Our Website" or "example.com".**

SKIP popup overlays, cookie banners, notification bars, GDPR modals, and chat widgets. Only extract sections that are part of the visible page flow.

CONCISENESS — HARD LIMIT (violating this causes truncation and lost sections):
layout_description: Maximum 2 sentences. Focus on column structure, image positions, and key dimensions only.
notes: Maximum 1 sentence.
Item descriptions: Maximum 2 sentences. Put full paragraph text in copy.body instead.
Do NOT repeat information already in Copy, Items, or Images fields.
Do NOT describe animations, hover effects, or mobile behavior in layout_description — put those in notes.

FOOTER EXTRACTION — MANDATORY: Scan the HTML footer element AND the last 2000 characters for: (a) Physical address (b) Phone with tel: link (c) Email with mailto: link (d) Social links with full URLs (e) Legal/privacy links with full URLs (f) Copyright text (g) Column structure. An empty footer is a CRITICAL failure.

Name sections in the same language as the page content. German page = German section names. Spanish page = Spanish names.

## CRITICAL RULES — READ THESE FIRST

### Rule 0: Nav and footer go in globals ONLY
Do NOT create a separate section for the navigation bar or footer. Navigation and footer data goes ONLY in the globals object (globals.nav and globals.footer). Sections should start with the first content section after the nav (usually the hero) and end with the last content section before the footer.

### Rule 0b: COMPLETENESS IS MANDATORY
Scroll the ENTIRE HTML from top to bottom. Count every distinct content section BEFORE starting extraction. If the page has 8 sections, output 8 sections. Your section count in the output MUST match the count you found in the HTML.

Do NOT skip sections because they seem minor, repetitive, or simple. Sections commonly missed that MUST always be included:
- Marquee / ticker / scrolling text banners
- Logo bars / client logo rows / partner grids
- Stats counters / number highlight blocks
- Newsletter signup / email capture forms
- Secondary CTA banners (even if similar to the hero CTA)
- Map sections / embedded Google Maps
- Contact info blocks (address, phone, email laid out as content)
- Video sections / YouTube embeds
- "As seen in" / press mention strips
- Cookie/notification bars that are part of the page content
- Resort / amenity / property photo galleries
- Pricing tables or rate cards
- Direct booking CTAs or reservation forms
- Any section that is visually distinct from its neighbors, even if it has minimal text

FOOTER COMPLETENESS: The globals.footer object must capture EVERYTHING in the footer — all columns, all navigation link groups with every link and URL, the physical address, phone number, email, social media links, and all legal/copyright links. Do NOT write only a style description. Write the full structured content.

If you output fewer than 5 sections for a typical business page, you are almost certainly missing content. CHECK AGAIN before finalizing your response.

### Rule 1: NEVER summarize body copy
ALWAYS extract the full real text verbatim from the HTML. Writing '[body copy present]', '[long body copy]', or any other placeholder summary is STRICTLY FORBIDDEN. If the body is long, include ALL of it in the "body" field. The only acceptable value is the actual text.

### Rule 2: Images block is MANDATORY on every section
Every section MUST include an "images" array, even if there are no images. If a section has no images, write:
"images": [{ "src": "", "alt": "No images in this section", "width": "", "height": "", "position": "" }]
Omitting the images block entirely is forbidden.

### Rule 3: Embed real image URLs inline in layout_description
When a section contains real image URLs, you MUST embed them directly inside the layout_description field using HTML img tags. This triple-reinforcement (layout_description + images array + inline img tags) ensures no AI tool misses the real images.

BAD layout_description (NEVER do this):
"Right column: image (640x500px, object-fit cover, 8px border-radius)"

GOOD layout_description (ALWAYS do this when real images exist):
"Right column: image <img src=\"https://example.com/photo.jpg\"> (640x500px, object-fit cover, 8px border-radius)"

Apply this inline embedding to every real image URL found in the section — hero backgrounds, card thumbnails, content images, gallery images, etc.

### Rule 4: Detect and preserve CSS background-image properties
When analyzing HTML, look for background-image URLs in BOTH inline styles (style="background-image: url(...)") AND class-based CSS rules in <style> tags. When found:
- Extract the full image URL
- Include it in layout_description as: 'Full-bleed background image: <img src="URL"> covering entire section, [overlay description e.g. dark overlay rgba(0,0,0,0.5)], white text on top.'
- Add it to the images array with position set to 'background'
- Set background_hex to the overlay color if present, or '#000000' as a fallback — NEVER leave background_hex as a solid color when a background-image is present
- DO NOT flatten a background-image section into a plain solid-color background. The background image must be represented.

### Rule 5: Hero section classification
If the first content section (excluding nav) has a background-image with overlaid text, classify it as section_type 'Hero (Image Background)', NOT 'Hero (Centered)'. In the layout_description, explicitly describe:
- The full-bleed background image with inline img tag
- The overlay treatment: color and opacity (e.g. 'dark overlay rgba(0,0,0,0.55)')
- Text color (usually white or light)
- Text positioning (centered, left-aligned, bottom-anchored, etc.)
- Any CTA button styling on top of the image

Example layout_description for a Hero (Image Background):
"Full-width section, min-height 100vh. Full-bleed background image: <img src=\"https://example.com/hero.jpg\"> (object-fit cover, object-position center). Dark overlay rgba(0,0,0,0.5) on top. Content centered both horizontally and vertically. White uppercase eyebrow label (13px, letter-spacing 3px). White H1 headline (72px, bold). White subheadline (20px, 70% opacity). CTA button row below: primary white button + ghost outline button."

### Rule 5b: Headline sizes — Real pixel values only
The headline_size field MUST be a real pixel value extracted from the actual CSS font-size on the most prominent heading element in the section.

Look for font-size in:
- Inline styles: style="font-size: 48px"
- Class-based CSS on h1, h2, h3, .hero-title, .section-title, etc.
- CSS custom properties — trace var(--font-size-xl) back to its :root definition and resolve to px

NEVER write "default size", "None", "auto", or any non-numeric value. If you truly cannot determine the size after inspecting the HTML, write a reasonable fallback based on the element's role:
- H1 / hero headline: 48px
- H2 / section headline: 36px
- H3 / card headline: 24px
- H4 / label/eyebrow: 14px

### Rule 5c: Video URLs — Extract full YouTube embed URLs
When you find a YouTube embed, video iframe, or lazy-loaded video (data-src, data-lazy-src attributes), extract the FULL YouTube URL including the video ID.

Write it in the layout_description as:
Video embed: \`<iframe src="https://www.youtube.com/embed/VIDEO_ID" frameborder="0" allowfullscreen></iframe>\`

Also include the video URL in the notes field. Never omit video content from the layout description.

### Rule 6: CONCISENESS RULE — Keep output compact so ALL sections fit in the token limit
CONCISENESS — HARD LIMIT (violating this causes truncation and lost sections):
layout_description: Maximum 2 sentences. Focus on column structure, image positions, and key dimensions only.
notes: Maximum 1 sentence.
Item descriptions: Maximum 2 sentences. Put full paragraph text in copy.body instead.
Do NOT repeat information already in Copy, Items, or Images fields.
Do NOT describe animations, hover effects, or mobile behavior in layout_description — put those in notes.
- Do NOT write lengthy prose — use terse, structured descriptions

## CRITICAL RULES FOR LAYOUT DESCRIPTIONS

The layout_description field will be used by an AI to reconstruct the layout from scratch. Be precise but concise — 3-4 sentences maximum.

### BAD examples (NEVER do this):
- "A section with some text and images in a grid layout"
- "Large images on left and right"
- "Two columns with content"
- "Grid of cards"
- "Hero section with background image and text"

### GOOD example (ALWAYS do this):
"Full-width section. Dark charcoal background (#1E1E1E). Centered white uppercase label 'OUR SERVICES' (12px, letter-spacing 3px) at top. Below: large serif headline 'Comprehensive Architecture Solutions' (64px, cream #FAF8F2) centered. 24px gap. 3-column grid (1fr 1fr 1fr, 32px gap) below. Each column is a card with: top image <img src=\"https://example.com/card1.jpg\"> (16:9 ratio, object-fit cover, 8px border-radius), below image a cream headline (24px, serif), below that gray body text (16px, sans-serif, 1.6 line-height). Cards have no background/border — just content on the dark section background. On mobile: single column, cards stack vertically with 24px gap."

### Column/grid specifics are mandatory:
NEVER write vague descriptions like "large images on left and right" or "two columns of content". Instead write:
- "2-column grid (1fr 1fr, 32px gap), left column: image <img src=\"URL\"> (682x1024px portrait orientation, object-fit cover), right column: image <img src=\"URL\"> (682x1024px portrait orientation)"
- "3-column grid (repeat(3, 1fr), 24px column gap, 32px row gap), each cell: [exact description]"
- "flex row, justify-content space-between, align-items center, gap 48px"

For EVERY section, describe:
1. Width (full-width, container max-width Npx, etc.)
2. Background: solid color hex OR background-image with overlay — never omit background-image details
3. Layout structure: exact grid columns (e.g., "1fr 2fr"), flex direction, column widths, gap sizes in px
4. Each sub-element: exact size in px, color hex, font weight, position, padding/margin values
5. Image dimensions in px, object-fit behavior, border-radius, and inline src tags for every real image URL
6. Mobile behavior: what changes at mobile breakpoint (single column, stacking order, font size reduction)

## OUTPUT FORMAT

Return a valid JSON object:
{
  "sections": [
    {
      "section_name": "string — descriptive name like 'Hero', 'Features Grid', 'Testimonials'",
      "section_type": "one of: Hero (Image Background)|Hero (Split)|Hero (Centered)|Features Grid|CTA Banner|Testimonials|FAQ|Team|Pricing|Contact|Stats|Logo Bar|Gallery|Content (50/50)|Content (Full)|Nav|Footer|Custom",
      "background_hex": "#XXXXXX — solid background color, OR overlay color if section uses a background-image (e.g. '#000000' for a dark overlay). Never use a solid hex to represent a section that actually has a background-image.",
      "headline_size": "NNpx — the largest text size in this section",
      "layout_variant": "brief variant name e.g. '2-col image-right', '3-col grid', 'full-width centered'",
      "layout_description": "EXTREMELY DETAILED structural description — embed real image URLs as <img src=\"URL\"> inline, following the GOOD example above",
      "layout_contract": {
        "section_role": "What this section does on the page — its purpose in the user journey. E.g. 'Primary hero — first impression, above the fold' or 'Social proof — builds trust after the hero'",
        "desktop_layout": "Full desktop layout spec in one sentence. E.g. '1280px max-width container, 2-column CSS grid (1fr 1fr): left col = headline + body + CTA button, right col = full-height image object-fit cover'",
        "mobile_layout": "How this section collapses on mobile. E.g. 'Single column: image stacks above text, full-width. Font sizes reduce. Padding halves.'",
        "column_structure": "Exact column count and proportions on desktop. E.g. '3 equal columns (repeat(3,1fr), 32px gap)' or '2 columns: 60% content left, 40% image right'",
        "content_position": "Where the main text content block sits. E.g. 'Left column, vertically centered' or 'Centered horizontally, top-anchored with 80px padding-top'",
        "image_position": "Where images sit and how they behave. E.g. 'Right column, full-height, object-fit cover, no border-radius' or 'Background image, full bleed, dark overlay rgba(0,0,0,0.5)'",
        "card_or_grid_structure": "If section has repeating items: describe card anatomy top-to-bottom. E.g. '3-col card grid; each card: image (16:9, top, object-fit cover) → title (bold) → body text → link. Equal height rows, cards flush to grid.' Write 'N/A' if no cards.",
        "alignment_rules": "Text alignment and padding rules. E.g. 'All text left-aligned inside columns. Section has 80px top/bottom padding. Content block has 48px left padding.'",
        "spacing_density": "How tight or generous the spacing feels. One of: 'compact', 'normal', 'generous'. Add a note if padding is unusually large or small.",
        "must_preserve": "What the AI builder must NEVER change. Be explicit. E.g. 'The 3-column card grid must stay 3 columns on desktop. The image must stay in the right column. The CTA button must be below the body text.'",
        "allowed_simplifications": "What can be simplified without breaking client recognition. E.g. 'Exact font stack can differ. Card shadow can be simplified. Hover animations can be omitted.'",
        "do_not_do": "Common AI mistakes to explicitly forbid. E.g. 'Do not center all content. Do not convert the grid to a vertical list. Do not move the image above the text on desktop. Do not add sections not in the blueprint.'"
      },
      "copy": {
        "headline": "exact headline text from the page",
        "subheadline": "exact subheadline text",
        "body": "FULL verbatim body copy — NEVER summarize, NEVER write '[body copy present]'",
        "cta_text": "CTA button text",
        "cta_url": "CTA button URL"
      },
      "items": [
        {
          "title": "item title",
          "description": "full verbatim item description — never summarize",
          "icon": "icon class or SVG name if found",
          "image": "image URL if item has one",
          "link": "item link URL"
        }
      ],
      "images": [
        {
          "src": "exact image URL from HTML — REQUIRED, even if empty string for no-image sections",
          "alt": "alt text, or 'No images in this section' if empty",
          "width": "width in px or %",
          "height": "height in px or %",
          "position": "where in the layout: hero-bg, right-column, card-thumbnail, etc."
        }
      ],
      "notes": "any additional notes about animations, interactions, or special behaviors"
    }
  ],
  "globals": {
    "siteName": "brand name",
    "logoUrl": "logo image URL if found",
    "nav": {
      "style": "describe nav style: sticky/fixed/static, transparent/solid, dark/light text",
      "items": [{ "label": "label", "url": "url" }]
    },
    "footer": {
      "style": "describe footer style: background color, text color, layout",
      "copyright": "exact copyright text from the page",
      "columns": [
        {
          "heading": "column heading text",
          "links": [{ "label": "link text", "url": "link href" }]
        }
      ],
      "address": "full physical address if present",
      "phone": "phone number if present",
      "email": "email address if present",
      "socials": [{ "platform": "platform name", "url": "url" }],
      "legal_links": [{ "label": "link text", "url": "link href" }]
    }
  }
}

FOOTER RULE — MANDATORY: The footer object MUST be populated from the actual <footer> element in the HTML. An empty or minimal footer object is NEVER acceptable for a real website. Extract ALL columns, ALL links (with their href URLs), the address, phone, email, social links, and legal/privacy links. If the footer has 4 columns with 5 links each, output all 4 columns with all 5 links each.`;

export function getMasterPrompt(hasScreenshots = false): string {
  return `You are building a client-facing website prototype for Sharpen.Studio internal use. This is NOT production code — it is a clean single-file HTML prototype for client review and PDF export.

## PURPOSE
The client needs to see a recognizable version of their own page structure. They will review this for layout approval before a rebuild. Structural accuracy is everything. Typographic perfection is not the goal.

## OUTPUT REQUIREMENTS
- Single self-contained HTML file
- All CSS inside a <style> tag
- No <script> tags. No JavaScript. Zero.
- No @keyframes, no CSS transitions, no :hover rules
- No external CSS frameworks (no Tailwind CDN, no Bootstrap)
- Google Fonts links in <head> are allowed
- Clean enough to convert to PDF without broken layouts

## STATIC RENDERING RULES
- **TABS:** Render only the first tab content, fully visible and expanded
- **CAROUSELS/SLIDESHOWS:** Show only the first slide as a static full-bleed image
- **ACCORDIONS/FAQs:** Show all items fully expanded — no collapsed state
- **FORMS:** Render input fields as static visual elements with visible labels
- **MODALS/OVERLAYS:** Do not render — skip entirely

## WHAT MATTERS MOST (in order)
1. Section structure — every section present, in the exact order from the blueprint
2. Layout accuracy — column grids, splits, card grids exactly as specified in the layout_contract
3. Visual hierarchy — headings stand out, sections are visually distinct
4. Image/card/grid placement — images where specified, grids with correct column count
5. Export quality — clean HTML that prints or PDFs without overflow or clipping

## WHAT YOU CAN SIMPLIFY
- Font stacks: if the specified font fails to load, use a clean system serif or sans-serif fallback
- Font sizes: approximate is fine — hierarchy matters more than exact px values
- Animations and hover states: omit entirely
- Box shadows: simplify to a single value if needed
- Webflow/Elementor-specific behavior: ignore
- Exact border-radius values: approximate is fine

## HOW TO READ THE BLUEPRINT
Each section in blueprint.md contains:
- **Layout Contract** — the AUTHORITATIVE structural spec. Read this first. Build to this exactly.
- **Layout Description** — detailed prose with measurements. Use for reference.
- **Copy** — exact text content. Use verbatim.
- **Items** — repeating content (cards, features, team members, etc.)
- **Images** — real image URLs. Use them. For missing images: https://placehold.co/[W]x[H]/[bg]/[fg]

The layout_contract fields mean:
- \`section_role\` — understand what this section does before building it
- \`desktop_layout\` — the exact CSS grid/flex structure to implement
- \`mobile_layout\` — how to collapse it at ≤768px
- \`column_structure\` — column count and proportions — IMPLEMENT EXACTLY
- \`content_position\` — where text content sits in the layout
- \`image_position\` — where images sit — do not move them
- \`card_or_grid_structure\` — card anatomy if items exist
- \`alignment_rules\` — text-align, padding, vertical centering
- \`spacing_density\` — compact / normal / generous — set padding accordingly
- \`must_preserve\` — these things cannot be changed under any circumstance
- \`allowed_simplifications\` — safe shortcuts you may take
- \`do_not_do\` — explicit list of mistakes to avoid — read this before building each section

## NON-NEGOTIABLE BUILD RULES
1. **Preserve section order exactly.** Build every section in the exact order in the blueprint. Do not merge, skip, or reorder any section.
2. **layout_contract is more important than section type.** The section_type label is a hint. The layout_contract fields are the law. If the contract says 4-column grid, build a 4-column grid even if section_type says "Custom".
3. **Do not redesign sections.** Build what the contract specifies. Do not substitute your own layout judgment.
4. **Do not convert grids to stacked cards on desktop.** Grids stay grids on desktop. Only collapse to single column at mobile breakpoints as specified in mobile_layout.
5. **Do not convert 2-column splits to centered stacks.** Image-right stays image-right. Text-left stays text-left. On desktop only.
6. **Do not change header/footer color logic** unless the blueprint explicitly specifies a different color. Use the nav and footer style from Global Settings.
7. **Do not add sections, content, or design elements** not in the blueprint. No decorative additions.
8. **Use the screenshot as the highest visual reference** when attached. If there is any ambiguity about column count or image placement, the screenshot resolves it.

## FILES PROVIDED
1. **design.md** — design tokens: colors, fonts, spacing. Use CSS variables. Never hardcode values.
2. **blueprint.md** — page structure. Section order is exact.${hasScreenshots ? '\n3. **screenshot.jpg** — visual reference. Highest authority on layout intent. Use it to verify column counts and image positions.' : ''}

## BUILD PROCESS
For each section:
1. Read \`must_preserve\` and \`do_not_do\` first
2. Implement \`desktop_layout\` and \`column_structure\` exactly
3. Place content using \`content_position\` and \`image_position\`
4. Build any card/item grid using \`card_or_grid_structure\`
5. Apply \`alignment_rules\` and \`spacing_density\`
6. Add \`mobile_layout\` at ≤768px breakpoint
7. Populate with Copy, Items, Images

After generating, list any layout_contract fields you could not implement and why.`;
}

export function generateBlueprintMd(globals: GlobalSettings, page: Page, sections: Section[], pageCustomInstructions?: string): string {
  const navTable = globals.nav.items.length > 0
    ? `| Label | URL |\n|-------|-----|\n${globals.nav.items.map(i => `| ${i.label} | ${i.url} |`).join('\n')}`
    : '| Label | URL |\n|-------|-----|\n| Home | / |';

  const sitemapTable = globals.sitemap.length > 0
    ? `| Page | URL |\n|------|-----|\n${globals.sitemap.map(i => `| ${i.pageName} | ${i.url} |`).join('\n')}`
    : '| Page | URL |\n|------|-----|\n| Home | / |';

  const socialsTable = globals.footer.socials.length > 0
    ? `| Platform | URL |\n|----------|-----|\n${globals.footer.socials.map(s => `| ${s.platform} | ${s.url} |`).join('\n')}`
    : '';

  const sectionsContent = sections.map((s, i) => {
    const itemsTable = s.items.length > 0
      ? `### Items\n| Title | Description | Icon/Image |\n|-------|-------------|------------|\n${s.items.map(it => `| ${it.title} | ${it.description} | ${it.icon || it.image || '-'} |`).join('\n')}\n`
      : '';

    const imagesTable = s.images.length > 0
      ? `### Images\n| Source | Alt | Position |\n|--------|-----|----------|\n${s.images.map(img => `| ${img.src} | ${img.alt} | ${img.position} |`).join('\n')}\n`
      : '';

    const lc = s.layout_contract;
    const hasContract = lc && Object.values(lc).some(v => v && v.trim());
    const contractBlock = hasContract
      ? `### Layout Contract (AUTHORITATIVE — DO NOT DEVIATE)
> Read \`must_preserve\` and \`do_not_do\` before building this section.

| Field | Value |
|-------|-------|
| **section_role** | ${lc.section_role} |
| **desktop_layout** | ${lc.desktop_layout} |
| **mobile_layout** | ${lc.mobile_layout} |
| **column_structure** | ${lc.column_structure} |
| **content_position** | ${lc.content_position} |
| **image_position** | ${lc.image_position} |
| **card_or_grid_structure** | ${lc.card_or_grid_structure} |
| **alignment_rules** | ${lc.alignment_rules} |
| **spacing_density** | ${lc.spacing_density} |
| **must_preserve** | ${lc.must_preserve} |
| **allowed_simplifications** | ${lc.allowed_simplifications} |
| **do_not_do** | ${lc.do_not_do} |

`
      : '';

    return `## Section ${i + 1}: ${s.section_name}
- **Type:** ${s.section_type}
- **Background:** ${s.background_hex}
- **Headline Size:** ${s.headline_size}
- **Layout Variant:** ${s.layout_variant}

${contractBlock}### Layout Description
${s.layout_description}

### Copy
- **Headline:** ${s.copy.headline}
- **Subheadline:** ${s.copy.subheadline}
- **Body:** ${s.copy.body}
- **CTA:** ${s.copy.cta_text}${s.copy.cta_url ? ` → ${s.copy.cta_url}` : ''}

${itemsTable}${imagesTable}${s.notes ? `### Notes\n${s.notes}\n` : ''}
---`;
  }).join('\n\n');

  return `# Page Blueprint: ${page.page_name}

## Global Settings

### Site Info
- **Site Name:** ${globals.siteName}
- **Logo:** ${globals.logoUrl}

### Navigation
- **Style:** ${globals.nav.style}
${navTable}

### Sitemap
${sitemapTable}

### Footer
- **Style:** ${globals.footer.style}
- **Copyright:** ${globals.footer.copyright}
${socialsTable}

### Responsive Behavior
${globals.responsive}

### Image Instructions
${globals.imageInstructions}
${globals.globalCustomInstructions ? `
### Global Custom Instructions
${globals.globalCustomInstructions}` : ''}

---

## Page Info
- **Page Name:** ${page.page_name}
- **Slug:** ${page.slug}
- **Purpose:** ${page.purpose}
- **Primary CTA:** ${page.primary_cta}
- **SEO Title:** ${page.seo_title}
- **SEO Description:** ${page.seo_description}

${(pageCustomInstructions ?? page.custom_instructions) ? `---

## Custom Instructions
${pageCustomInstructions ?? page.custom_instructions}

` : ''}---

${sectionsContent}`;
}
