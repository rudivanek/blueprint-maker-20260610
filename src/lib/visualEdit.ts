// src/lib/visualEdit.ts
//
// Point-and-click editing of the generated prototype (Preview → "Edit on page").
//
// How it works:
//  - The saved HTML is parsed once; every element in <body> gets a key
//    (data-bpm-k="n"). The preview iframe shows that keyed copy plus a small
//    helper script (EDITOR_SCRIPT) that highlights elements, reports clicks and
//    applies edits live.
//  - The iframe is sandboxed without same-origin access, so it talks to the app
//    only with postMessage. Messages from it are treated as untrusted: text is
//    sanitized before it goes into the saved HTML.
//  - Every edit is applied to the keyed document here as well; the saved HTML
//    is that document without the keys. The fingerprint comment at the end
//    (lib/previewStamp) is kept, so manual edits don't mark the prototype as
//    outdated. An "edited" marker is added so "Generate Fresh" can warn.

export const EDITED_MARKER = '<!-- bpm-edited -->';
const TRAILING_COMMENTS = /(?:\s*<!-- bpm-[a-z]+(?::[a-z0-9]+)? -->)+\s*$/;

export interface Selection {
  key: string;
  tag: string;
  text: string;
  canText: boolean;
  image: { src: string; kind: 'img' | 'background' } | null;
  link: { href: string; text: string; tag: 'a' | 'button' } | null;
  hasParent: boolean;
}

export type EditOp =
  | { type: 'text'; key: string; html: string }
  | { type: 'image'; key: string; src: string }
  | { type: 'link'; key: string; href: string; text: string }
  | { type: 'delete'; key: string }
  | { type: 'replace'; key: string; html: string; css: string; js: string };

export function hasManualEdits(html: string): boolean {
  return html.includes(EDITED_MARKER);
}

function trailing(html: string): string {
  const m = html.match(TRAILING_COMMENTS);
  return m ? m[0].trim() : '';
}

/** Parse the saved HTML and give every body element a key. */
export function keyDocument(html: string): Document {
  const doc = new DOMParser().parseFromString(html.replace(TRAILING_COMMENTS, ''), 'text/html');
  let n = 0;
  doc.body.querySelectorAll('*').forEach(el => el.setAttribute('data-bpm-k', String(++n)));
  return doc;
}

function serialize(doc: Document): string {
  const doctype = doc.doctype ? `<!DOCTYPE ${doc.doctype.name}>` : '<!DOCTYPE html>';
  return `${doctype}\n${doc.documentElement.outerHTML}`;
}

/** The HTML to save: no keys, original trailing comments kept, "edited" marker added. */
export function savedHtml(doc: Document, previousHtml: string): string {
  const copy = doc.cloneNode(true) as Document;
  copy.querySelectorAll('[data-bpm-k]').forEach(el => el.removeAttribute('data-bpm-k'));
  const tail = trailing(previousHtml).replace(EDITED_MARKER, '').trim();
  return `${serialize(copy)}\n${[tail, EDITED_MARKER].filter(Boolean).join('\n')}\n`;
}

/** The keyed HTML + helper script shown in the iframe while editing. */
export function editorFrameHtml(doc: Document, scrollY: number): string {
  const copy = doc.cloneNode(true) as Document;
  const style = copy.createElement('style');
  style.setAttribute('data-bpm-editor', '');
  style.textContent = EDITOR_CSS;
  copy.head.appendChild(style);
  const script = copy.createElement('script');
  script.setAttribute('data-bpm-editor', '');
  script.textContent = `var BPM_START_Y=${Math.max(0, Math.round(scrollY) || 0)};\n${EDITOR_SCRIPT}`;
  copy.body.appendChild(script);
  return serialize(copy);
}

const DROP_TAGS = 'script,style,iframe,object,embed,link,meta,form,input,textarea,select';
const DROP_IN_REPLACEMENT = 'script,style,object,embed,link,meta,base';

/** Clean text-edit HTML coming from the iframe. */
export function sanitizeInline(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  doc.body.querySelectorAll(DROP_TAGS).forEach(el => el.remove());
  doc.body.querySelectorAll('*').forEach(el => {
    for (const a of [...el.attributes]) {
      const name = a.name.toLowerCase();
      if (name.startsWith('on') || name === 'contenteditable' || name === 'data-bpm-sel' || name === 'data-bpm-hover' || name === 'data-bpm-editing') el.removeAttribute(a.name);
      else if ((name === 'href' || name === 'src') && !safeUrl(a.value)) el.removeAttribute(a.name);
    }
  });
  return doc.body.innerHTML;
}

export function safeUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  return !(u.startsWith('javascript:') || u.startsWith('vbscript:') || (u.startsWith('data:') && !u.startsWith('data:image/')));
}

/** Apply an edit to the keyed document. Returns false when nothing changed. */
export function applyEdit(doc: Document, op: EditOp): boolean {
  const el = doc.querySelector(`[data-bpm-k="${CSS.escape(op.key)}"]`);
  if (!el) return false;
  switch (op.type) {
    case 'text': {
      const clean = sanitizeInline(op.html);
      if (el.innerHTML === clean) return false;
      el.innerHTML = clean;
      // keep keys on elements the text edit created, so they stay selectable
      let max = 0;
      doc.querySelectorAll('[data-bpm-k]').forEach(e => { max = Math.max(max, Number(e.getAttribute('data-bpm-k')) || 0); });
      el.querySelectorAll('*:not([data-bpm-k])').forEach(e => e.setAttribute('data-bpm-k', String(++max)));
      return true;
    }
    case 'image': {
      if (!safeUrl(op.src) || !op.src.trim()) return false;
      const src = op.src.trim();
      if (el.tagName === 'IMG') {
        el.setAttribute('src', src);
        el.removeAttribute('srcset');
        el.removeAttribute('sizes');
        el.closest('picture')?.querySelectorAll('source').forEach(s => s.remove());
      } else {
        const style = el.getAttribute('style') ?? '';
        if (!/background(-image)?\s*:[^;]*url\(/i.test(style)) return false;
        el.setAttribute('style', style.replace(/url\((['"]?)[^'")]*\1\)/i, `url('${src.replace(/'/g, '%27')}')`));
      }
      return true;
    }
    case 'link': {
      if (el.tagName === 'A') {
        if (op.href.trim() && safeUrl(op.href)) el.setAttribute('href', op.href.trim());
      }
      if (op.text.trim() && el.children.length === 0) el.textContent = op.text.trim();
      return true;
    }
    case 'delete':
      el.remove();
      return true;
    case 'replace': {
      const nodes = parseReplacement(doc, op.html);
      if (!nodes) return false;
      el.replaceWith(...nodes);
      if (op.css.trim()) {
        const style = doc.createElement('style');
        style.setAttribute('data-bpm-ai', '');
        style.textContent = op.css.replace(/<\/style/gi, '<\\/style');
        doc.head.appendChild(style);
      }
      if (op.js.trim()) {
        const script = doc.createElement('script');
        script.setAttribute('data-bpm-ai', '');
        script.textContent = `(function(){function run(){try{\n${op.js.replace(/<\/script/gi, '<\\/script')}\n}catch(e){console.error(e)}}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();})();`;
        doc.body.appendChild(script);
      }
      let max = 0;
      doc.querySelectorAll('[data-bpm-k]').forEach(e => { max = Math.max(max, Number(e.getAttribute('data-bpm-k')) || 0); });
      doc.body.querySelectorAll('*:not([data-bpm-k])').forEach(e => e.setAttribute('data-bpm-k', String(++max)));
      return true;
    }
  }
}

/** The element's HTML without editor keys (what the AI gets). */
export function elementHtml(doc: Document, key: string): string {
  const el = doc.querySelector(`[data-bpm-k="${CSS.escape(key)}"]`);
  if (!el) return '';
  const copy = el.cloneNode(true) as Element;
  copy.removeAttribute('data-bpm-k');
  copy.querySelectorAll('[data-bpm-k]').forEach(e => e.removeAttribute('data-bpm-k'));
  return copy.outerHTML;
}

/** Short description of the selected element and where it sits (for the AI chat). */
export function elementContext(doc: Document, key: string): string {
  const el = doc.querySelector(`[data-bpm-k="${CSS.escape(key)}"]`);
  if (!el) return '';
  const desc = (e: Element) => `<${e.tagName.toLowerCase()}${e.className ? ` class="${String(e.className).trim().slice(0, 60)}"` : ''}>`;
  const lines: string[] = [];
  const parent = el.parentElement;
  if (parent && parent !== doc.body) {
    const same = [...parent.children].filter(c => c.tagName === el.tagName && c.className === el.className).length;
    lines.push(`Inside: ${desc(parent)} which holds ${parent.children.length} element(s)${same > 1 ? `, ${same} of them like the selected one (e.g. slides/cards/items)` : ''}.`);
  }
  lines.push(`Contains: ${el.querySelectorAll('img').length} image(s), ${el.children.length} direct child element(s).`);
  const html = elementHtml(doc, key).replace(/\s+/g, ' ');
  lines.push(`HTML (start): ${html.slice(0, 2500)}${html.length > 2500 ? ' …' : ''}`);
  return lines.join('\n');
}

/** Cleaned nodes for an AI replacement, or null when it isn't a safe element-level fragment. */
function parseReplacement(doc: Document, html: string): Node[] | null {
  if (/<\s*(html|head|body)[\s>]/i.test(html)) return null;
  const tpl = doc.createElement('template');
  tpl.innerHTML = html;
  const frag = tpl.content;
  frag.querySelectorAll(DROP_IN_REPLACEMENT).forEach(el => el.remove());
  frag.querySelectorAll('*').forEach(el => {
    for (const a of [...el.attributes]) {
      const name = a.name.toLowerCase();
      if (name.startsWith('on') || /^data-bpm-(k|sel|hover|editing)$/.test(name)) el.removeAttribute(a.name);
      else if ((name === 'href' || name === 'src' || name === 'action' || name === 'formaction') && !safeUrl(a.value)) el.removeAttribute(a.name);
    }
  });
  const nodes = [...frag.childNodes].filter(n => n.nodeType === 1 || (n.nodeType === 3 && n.textContent?.trim()));
  if (!nodes.some(n => n.nodeType === 1)) return null;
  return nodes.map(n => doc.importNode(n, true));
}

const EDITOR_CSS = `
[data-bpm-hover]{outline:2px dashed #2575FC !important;outline-offset:2px !important;cursor:pointer !important}
[data-bpm-sel]{outline:2px solid #2575FC !important;outline-offset:2px !important;box-shadow:0 0 0 6px rgba(37,117,252,.15) !important}
[data-bpm-editing]{outline:2px solid #F59E0B !important;outline-offset:2px !important;cursor:text !important;box-shadow:0 0 0 6px rgba(245,158,11,.18) !important}
`;

// Runs inside the preview iframe (edit mode only). Plain ES2017, no imports.
const EDITOR_SCRIPT = String.raw`(function(){
  var INLINE = /^(A|SPAN|STRONG|EM|B|I|U|S|BR|SMALL|SUP|SUB|MARK|CODE|ABBR|TIME|LABEL)$/;
  var sel = null, hover = null, editing = null, before = '';
  function send(m){ parent.postMessage(Object.assign({ bpm: 1 }, m), '*'); }
  function keyed(el){ while (el && el.nodeType === 1 && !el.hasAttribute('data-bpm-k')) el = el.parentElement; return el && el.nodeType === 1 ? el : null; }
  function all(key){ return document.querySelectorAll('[data-bpm-k="' + key + '"]'); }
  function canText(el){
    if (!el.textContent.trim()) return false;
    var kids = el.querySelectorAll('*');
    for (var i = 0; i < kids.length; i++) if (!INLINE.test(kids[i].tagName)) return false;
    return !/^(HTML|BODY|UL|OL|TABLE|TBODY|THEAD|TR|SELECT)$/.test(el.tagName);
  }
  function bgUrl(el){ var s = el.getAttribute('style') || ''; var m = s.match(/url\((['"]?)([^'")]*)\1\)/i); return /background/i.test(s) && m ? m[2] : ''; }
  function info(el){
    var img = null;
    if (el.tagName === 'IMG') img = { src: el.getAttribute('src') || '', kind: 'img' };
    else if (bgUrl(el)) img = { src: bgUrl(el), kind: 'background' };
    var link = null;
    if (el.tagName === 'A') link = { href: el.getAttribute('href') || '', text: el.children.length ? '' : el.textContent.trim(), tag: 'a' };
    else if (el.tagName === 'BUTTON') link = { href: '', text: el.children.length ? '' : el.textContent.trim(), tag: 'button' };
    return { type: 'select', key: el.getAttribute('data-bpm-k'), tag: el.tagName.toLowerCase(),
      text: (el.textContent || el.getAttribute('alt') || '').replace(/\s+/g, ' ').trim().slice(0, 80),
      canText: canText(el), image: img, link: link, hasParent: !!keyed(el.parentElement) };
  }
  function clearAttr(name){ var l = document.querySelectorAll('[' + name + ']'); for (var i = 0; i < l.length; i++) l[i].removeAttribute(name); }
  function select(el){
    stopEditing(true);
    clearAttr('data-bpm-sel');
    sel = el;
    if (!el) { send({ type: 'deselect' }); return; }
    el.setAttribute('data-bpm-sel', '');
    send(info(el));
  }
  function startEditing(){
    if (!sel || !canText(sel)) return;
    editing = sel; before = sel.innerHTML;
    sel.removeAttribute('data-bpm-sel');
    sel.setAttribute('data-bpm-editing', '');
    sel.setAttribute('contenteditable', 'true');
    sel.focus();
    try { var r = document.createRange(); r.selectNodeContents(sel); var s = getSelection(); s.removeAllRanges(); s.addRange(r); } catch (e) {}
    send({ type: 'editing', on: true });
  }
  function stopEditing(save){
    if (!editing) return;
    var el = editing; editing = null;
    el.removeAttribute('contenteditable');
    el.removeAttribute('data-bpm-editing');
    if (save && el.innerHTML !== before) {
      var key = el.getAttribute('data-bpm-k'), html = el.innerHTML, l = all(key);
      for (var i = 0; i < l.length; i++) if (l[i] !== el) l[i].innerHTML = html;
      send({ type: 'text', key: key, html: html });
    } else if (!save) el.innerHTML = before;
    if (sel === el) el.setAttribute('data-bpm-sel', '');
    send({ type: 'editing', on: false });
  }
  document.addEventListener('mouseover', function(e){
    if (editing) return;
    var el = keyed(e.target);
    if (hover && hover !== el) hover.removeAttribute('data-bpm-hover');
    hover = el;
    if (el && el !== sel) el.setAttribute('data-bpm-hover', '');
  }, true);
  document.addEventListener('mouseout', function(e){ if (hover && e.target === hover) { hover.removeAttribute('data-bpm-hover'); hover = null; } }, true);
  document.addEventListener('click', function(e){
    if (editing && editing.contains(e.target)) { e.preventDefault(); return; }
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    if (editing) stopEditing(true);
    var el = keyed(e.target);
    if (el) { el.removeAttribute('data-bpm-hover'); select(el); }
  }, true);
  document.addEventListener('dblclick', function(e){
    if (editing) return;
    e.preventDefault(); e.stopPropagation();
    var el = keyed(e.target);
    if (el && el !== sel) select(el);
    startEditing();
  }, true);
  document.addEventListener('submit', function(e){ e.preventDefault(); }, true);
  document.addEventListener('keydown', function(e){
    if (editing) {
      if (e.key === 'Escape') { e.preventDefault(); stopEditing(false); }
      else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); stopEditing(true); }
      return;
    }
    if (e.key === 'Escape') select(null);
    else if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); send({ type: 'requestDelete' }); }
  }, true);
  document.addEventListener('focusout', function(e){ if (editing && e.target === editing) stopEditing(true); }, true);
  var t = null;
  window.addEventListener('scroll', function(){ if (t) return; t = setTimeout(function(){ t = null; send({ type: 'scroll', y: window.scrollY }); }, 200); }, { passive: true });
  window.addEventListener('message', function(e){
    if (e.source !== parent) return;
    var m = e.data || {}; if (!m.bpm) return;
    if (m.type === 'editText') startEditing();
    else if (m.type === 'deselect') select(null);
    else if (m.type === 'selectParent' && sel) { var p = keyed(sel.parentElement); if (p) select(p); }
    else if (m.type === 'apply' && sel) {
      var l = all(m.op.key), i;
      if (m.op.type === 'delete') { for (i = 0; i < l.length; i++) l[i].remove(); sel = null; send({ type: 'deselect' }); }
      else if (m.op.type === 'image') {
        for (i = 0; i < l.length; i++) {
          if (l[i].tagName === 'IMG') { l[i].setAttribute('src', m.op.src); l[i].removeAttribute('srcset'); }
          else l[i].setAttribute('style', (l[i].getAttribute('style') || '').replace(/url\((['"]?)[^'")]*\1\)/i, "url('" + m.op.src.replace(/'/g, '%27') + "')"));
        }
        send(info(sel));
      }
      else if (m.op.type === 'link') {
        for (i = 0; i < l.length; i++) {
          if (l[i].tagName === 'A' && m.op.href) l[i].setAttribute('href', m.op.href);
          if (m.op.text && !l[i].children.length) l[i].textContent = m.op.text;
        }
        send(info(sel));
      }
    }
  });
  if (BPM_START_Y) { var go = function(){ window.scrollTo(0, BPM_START_Y); }; go(); window.addEventListener('load', go); setTimeout(go, 300); }
  send({ type: 'ready' });
})();`;
