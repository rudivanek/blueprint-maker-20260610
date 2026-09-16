// src/lib/interactivePrompt.ts
//
// The in-app prototype (Preview / Prototype step) is a working web page:
// sliders slide, tabs switch, accordions open, the mobile menu opens.
// The master and scratch prompts in lib/prompts are written for a static,
// no-JavaScript page (that version is still used for the export ZIP's
// prompt.txt). makeInteractive() turns them into the interactive version
// used for in-app generation only.

const STATIC_LINES: [string, string][] = [
  ['- No <script> tags. No JavaScript. Zero.\n', '- Interactive parts must WORK: write small plain JavaScript in ONE <script> tag just before </body> (see INTERACTIVE WIDGETS)\n'],
  ['- No @keyframes, no CSS transitions, no :hover rules\n', '- Subtle CSS transitions, :hover states and @keyframes are allowed — keep them tasteful\n'],
  ['- Animations and hover states: omit entirely\n', '- Animations and hover states: keep them subtle; never let them hide content\n'],
  ['4. Do not add JavaScript or animations\n', '4. Make every interactive widget work (see INTERACTIVE WIDGETS)\n'],
  ['- Clean enough to convert to PDF without broken layouts\n', '- Everything must still be readable if JavaScript does not run (first slide / first tab visible by default)\n'],
];

const STATIC_BLOCK = /## STATIC RENDERING RULES[\s\S]*?(?=\n## )/;

export const INTERACTIVE_WIDGETS = `## INTERACTIVE WIDGETS — THEY MUST WORK
This prototype is shown in a live browser preview. Whenever the blueprint, the screenshot or the reviewer's requested changes contain an interactive element, build it so it really works — never draw a picture of a widget with dead buttons.

Covers (not limited to):
- **Sliders / carousels / testimonial sliders:** all slides present; prev/next arrows and dots work; swipe/drag on touch; loops; optional autoplay (5 s, pauses on hover). Use a CSS scroll-snap track or transform: translateX.
- **Galleries:** grid of all images; click opens a lightbox with prev/next, Esc and click-outside to close.
- **Moving strips / marquees / logo tickers:** continuous CSS @keyframes animation, duplicated content for a seamless loop, pause on hover.
- **Tabs:** clicking a tab shows its panel; first tab active by default.
- **Accordions / FAQs:** click to open and close; first item open by default.
- **Mobile menu:** hamburger at ≤768px opens and closes the navigation.
- **Sticky / shrinking header, smooth scrolling to #anchors, back-to-top button.**
- **Number counters:** count up when scrolled into view (IntersectionObserver).
- **Reveal-on-scroll:** subtle fade/slide-in (IntersectionObserver); content must be visible if JS fails.
- **Modals / popups:** only when the blueprint or the reviewer asks; open from their button, close with ×, Esc and click-outside.
- **Video embeds, maps:** use a real <iframe> embed when a URL is given, otherwise a clearly labeled placeholder.
- **Forms:** real inputs with labels; on submit, prevent the default and show a short "Thank you" message.

Technical rules:
- Plain JavaScript only, all in ONE <script> tag right before </body>. No external libraries (no jQuery, Swiper, Slick, GSAP, Alpine, CDNs).
- Wrap everything in document.addEventListener('DOMContentLoaded', …). Use data-attributes to connect buttons and panels, so several widgets of the same kind work on one page.
- Do not use localStorage, sessionStorage, cookies, alert(), confirm() or prompt() — the preview blocks them.
- Buttons are <button type="button"> with aria-labels; widgets work with the keyboard.
- Without JavaScript the page must still show all content: first slide, first tab and all text visible.
- Keep the script compact — shared helper functions instead of repeating code per widget.`;

export function makeInteractive(prompt: string): string {
  let out = prompt;
  for (const [from, to] of STATIC_LINES) out = out.split(from).join(to);
  if (STATIC_BLOCK.test(out)) return out.replace(STATIC_BLOCK, INTERACTIVE_WIDGETS + '\n');
  return `${out}\n\n${INTERACTIVE_WIDGETS}`;
}
