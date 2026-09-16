// src/components/Editor/PreviewPanel.tsx
//
// In-app HTML generation + live preview. Rendered in the MAIN content area
// when the "Preview" tab is active.
//
// - Generate / Regenerate (with feedback) using useGenerateHtml
// - "Edit on page": click an element to edit its text, image or link, or delete
//   it; Undo (lib/visualEdit + VisualEditBar)
// - Text / image / link edits on the page are written back into the sections
//   and copy.md (lib/prototypeSync), so all steps and the export stay in sync
// - Everything else that changes the prototype (AI changes, deleted elements,
//   edits outside the sections) goes into the page's change list (lib/changeLog)
// - "Describe changes" and "Change with AI": a short chat first (lib/changeChat +
//   ChangeChat) — the AI says what it will do, warns, asks up to 4 questions;
//   nothing changes until "Yes, do it" (optional: skip for clear requests)
// - Live iframe preview (sandboxed: the prototype's own scripts run so sliders,
//   tabs etc. work, but without same-origin access to the app)
// - Compare mode: original screenshot side-by-side with the generated HTML
// - Viewport toggle: desktop / tablet / mobile widths
// - Download as standalone .html / copy to clipboard
// - Generated HTML persists per page via onHtmlSaved (Supabase pages.generated_html)

import { useState, useRef, useEffect } from 'react';
import {
  Wand2, Loader2, AlertCircle, Download, Copy, Check, Columns2,
  Monitor, Tablet, Smartphone, RefreshCw, XCircle, MousePointerClick, Undo2, ListChecks, X,
} from 'lucide-react';
import { useGenerateHtml } from '../../hooks/useGenerateHtml';
import { prepareScreenshotForAI } from '../../lib/screenshot';
import { toast } from '../ui/Toast';
import { ding } from '../../lib/ding';
import { jobStore } from '../../lib/jobStore';
import { previewSource, stampHtml, isPreviewOutdated } from '../../lib/previewStamp';
import { chatTurn, buildRequest, readAutoApply, type ChatMessage, type ChatTurn } from '../../lib/changeChat';
import type { CopyQuestion } from '../../lib/copywriter';
import { ChangeChat } from './ChangeChat';
import { VisualEditBar } from './VisualEditBar';
import { changeElement, pageCss, MAX_ELEMENT_CHARS } from '../../lib/elementChange';
import {
  applyEdit, editorFrameHtml, elementContext, elementHtml, hasManualEdits, keyDocument, savedHtml, EDITED_MARKER,
  type EditOp, type Selection,
} from '../../lib/visualEdit';
import { cleanNewText, fieldForEdit, getField, replaceInCopyMd, setField, norm, type FieldKind } from '../../lib/prototypeSync';
import { addChange, describeDelete, describeEdit, readChanges } from '../../lib/changeLog';
import type { GlobalSettings, Page, PrototypeChange, Section, AppSettings } from '../../types';

interface PreviewPanelProps {
  designMd: string;
  globals: GlobalSettings;
  page: Page;
  sections: Section[];
  /** Original page screenshot (data URI or URL) — used for AI reference + compare mode */
  screenshot?: string;
  appSettings: AppSettings;
  onHtmlSaved: (pageId: string, html: string) => void;
  /** Edit on page changed a text / image / link → save it into the section too */
  onSectionSync?: (id: string, updates: Partial<Section>) => void;
  /** used to keep copy.md in sync */
  onPageUpdate?: (updates: Partial<Page>) => void;
}

type Viewport = 'desktop' | 'tablet' | 'mobile';
const VIEWPORT_WIDTHS: Record<Viewport, string> = {
  desktop: '100%',
  tablet: '768px',
  mobile: '390px',
};

export function PreviewPanel({ designMd, globals, page, sections, screenshot, appSettings, onHtmlSaved, onSectionSync, onPageUpdate }: PreviewPanelProps) {
  const [html, setHtml] = useState<string>(page.generated_html || '');
  const [feedback, setFeedback] = useState('');
  const [compare, setCompare] = useState(false);
  const [viewport, setViewport] = useState<Viewport>('desktop');
  const [copied, setCopied] = useState(false);
  const [localStatus, setLocalStatus] = useState('');
  // Chat with the AI about the current change (null = none open)
  const [chat, setChat] = useState<ChatState | null>(null);
  const chatAbort = useRef<AbortController | null>(null);
  const lastKey = `bpm_lastchange_${page.id}`;
  const [lastRequest, setLastRequest] = useState(() => {
    try { return localStorage.getItem(lastKey) ?? ''; } catch { return ''; }
  });
  const saveLastRequest = (v: string) => {
    setLastRequest(v);
    try { if (v) localStorage.setItem(lastKey, v); else localStorage.removeItem(lastKey); } catch { /* ignore */ }
  };

  const gen = useGenerateHtml(appSettings.aiProvider ?? 'anthropic');

  // ── Edit on page ──
  const [editMode, setEditMode] = useState(false);
  const [frameDoc, setFrameDoc] = useState('');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [editingText, setEditingText] = useState(false);
  const selectionRef = useRef<Selection | null>(null);
  selectionRef.current = selection;
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const docRef = useRef<Document | null>(null);
  const htmlRef = useRef(html);
  htmlRef.current = html;
  const scrollRef = useRef(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSave = useRef<string | null>(null);

  const flushSave = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    if (pendingSave.current !== null) {
      onHtmlSaved(page.id, pendingSave.current);
      pendingSave.current = null;
    }
  };
  const scheduleSave = (next: string) => {
    pendingSave.current = next;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushSave, 700);
  };
  const flushRef = useRef(flushSave);
  flushRef.current = flushSave;
  useEffect(() => () => flushRef.current(), []);

  const pushHistory = (entry: HistoryEntry) => setHistory(h => [...h.slice(-19), entry]);

  // Latest sections / copy.md including our own write-backs (props arrive a moment later)
  const sectionsRef = useRef(sections);
  useEffect(() => { sectionsRef.current = sections; }, [sections]);
  const copyMdRef = useRef(page.copy_md ?? '');
  useEffect(() => { copyMdRef.current = page.copy_md ?? ''; }, [page.copy_md]);

  /** Before an edit: which section fields does it touch, and their old values */
  const syncTargets = (doc: Document, op: EditOp): SyncTarget[] => {
    if (!onSectionSync || (op.type !== 'text' && op.type !== 'image' && op.type !== 'link')) return [];
    const el = doc.querySelector(`[data-bpm-k="${CSS.escape(op.key)}"]`);
    if (!el) return [];
    const list: { kind: FieldKind; old: string }[] = [];
    if (op.type === 'text') list.push({ kind: 'text', old: el.textContent ?? '' });
    if (op.type === 'image') {
      const src = el.tagName === 'IMG' ? el.getAttribute('src') ?? '' : ((el.getAttribute('style') ?? '').match(/url\((['"]?)([^'")]*)\1\)/i)?.[2] ?? '');
      list.push({ kind: 'src', old: src });
    }
    if (op.type === 'link') {
      if (el.tagName === 'A') list.push({ kind: 'href', old: el.getAttribute('href') ?? '' });
      if (el.children.length === 0) list.push({ kind: 'text', old: el.textContent ?? '' });
    }
    return list
      .map(t => ({ ...t, el, ref: fieldForEdit(el, t.kind, t.old, sectionsRef.current) }))
      .filter((t): t is SyncTarget => t.ref !== null);
  };

  /** After the edit: save changed values into the sections + copy.md. Returns true when something was synced. */
  const syncBack = (targets: SyncTarget[], op: EditOp): boolean => {
    if (!onSectionSync || targets.length === 0) return false;
    let list = sectionsRef.current;
    let copyMd = copyMdRef.current;
    const touched = new Set<string>();
    for (const t of targets) {
      const section = list.find(s => s.id === t.ref.sectionId);
      if (!section) continue;
      const oldValue = getField(section, t.ref.path);
      let value: string;
      if (t.kind === 'text') value = cleanNewText(t.el.textContent ?? '', t.old, oldValue);
      else if (t.kind === 'src') value = op.type === 'image' ? op.src.trim() : oldValue;
      else value = op.type === 'link' && op.href.trim() ? op.href.trim() : oldValue;
      if (value === oldValue || (t.kind === 'text' && norm(value) === norm(oldValue))) continue;
      const patch = setField(section, t.ref.path, value);
      list = list.map(s => (s.id === section.id ? { ...s, ...patch } : s));
      touched.add(section.id);
      if (t.kind === 'text') copyMd = replaceInCopyMd(copyMd, oldValue, value) ?? copyMd;
    }
    if (touched.size === 0) return false;
    sectionsRef.current = list;
    for (const id of touched) {
      const s = list.find(x => x.id === id)!;
      onSectionSync(id, { copy: s.copy, items: s.items, images: s.images });
    }
    if (copyMd !== copyMdRef.current) {
      copyMdRef.current = copyMd;
      onPageUpdate?.({ copy_md: copyMd });
    }
    return true;
  };

  // ── Change list (pages.prototype_changes) ──
  const [changes, setChanges] = useState<PrototypeChange[]>(() => readChanges(page));
  const changesRef = useRef(changes);
  useEffect(() => {
    const list = readChanges(page);
    changesRef.current = list;
    setChanges(list);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.prototype_changes]);
  const saveChanges = (list: PrototypeChange[]) => {
    changesRef.current = list;
    setChanges(list);
    onPageUpdate?.({ prototype_changes: list });
  };
  const recordChange = (entry: Omit<PrototypeChange, 'id' | 'at'>) => {
    if (!onPageUpdate) return;
    saveChanges(addChange(changesRef.current, entry));
  };

  /** Undo: put the sections / copy.md back the way they were before the edit */
  const restoreChanges = (entry: HistoryEntry) => {
    if (entry.changes && JSON.stringify(entry.changes) !== JSON.stringify(changesRef.current)) saveChanges(entry.changes);
  };
  const restoreSections = (entry: HistoryEntry) => {
    if (!entry.sections || !onSectionSync) { restoreChanges(entry); return; }
    const cur = sectionsRef.current;
    for (const old of entry.sections) {
      const now = cur.find(s => s.id === old.id);
      if (!now) continue;
      const pick = (s: Section) => JSON.stringify([s.copy, s.items, s.images]);
      if (pick(now) !== pick(old)) onSectionSync(old.id, { copy: old.copy, items: old.items, images: old.images });
    }
    sectionsRef.current = cur.map(s => entry.sections!.find(o => o.id === s.id) ?? s);
    restoreChanges(entry);
    if (entry.copyMd !== undefined && entry.copyMd !== copyMdRef.current) {
      copyMdRef.current = entry.copyMd;
      onPageUpdate?.({ copy_md: entry.copyMd });
    }
  };

  const loadIntoEditor = (source: string) => {
    const doc = keyDocument(source);
    docRef.current = doc;
    setFrameDoc(editorFrameHtml(doc, scrollRef.current));
    setSelection(null);
    setEditingText(false);
  };

  const startEditing = () => {
    if (!htmlRef.current) return;
    scrollRef.current = 0;
    setCompare(false);
    loadIntoEditor(htmlRef.current);
    setEditMode(true);
  };

  const stopEditing = () => {
    if (chat?.mode === 'element') closeChat();
    flushSave();
    setEditMode(false);
    setSelection(null);
    setEditingText(false);
    docRef.current = null;
  };

  const post = (msg: Record<string, unknown>) =>
    iframeRef.current?.contentWindow?.postMessage({ bpm: 1, ...msg }, '*');

  const commitEdit = (op: EditOp, live: boolean) => {
    const doc = docRef.current;
    if (!doc) return;
    const prev = htmlRef.current;
    const beforeSections = sectionsRef.current;
    const beforeCopyMd = copyMdRef.current;
    const wasCurrent = !isPreviewOutdated(prev, previewSource(designMd, globals, beforeSections));
    const beforeChanges = changesRef.current;
    const targets = syncTargets(doc, op);
    const before = describeElement(doc, op.key);
    if (!applyEdit(doc, op)) return;
    let next = savedHtml(doc, prev);
    const synced = syncBack(targets, op);
    // the prototype already shows the change → keep it "current" for the updated sections
    if (synced && wasCurrent) next = stampHtml(next, previewSource(designMd, globals, sectionsRef.current));
    pushHistory({ html: prev, changes: beforeChanges, ...(synced ? { sections: beforeSections, copyMd: beforeCopyMd } : {}) });
    // not part of the sections → remember it in the change list
    if (!synced && before && op.type !== 'replace') {
      const after = describeElement(doc, op.key);
      const base = { kind: 'edit' as const, sectionId: before.sectionId, target: before.label };
      if (op.type === 'delete') recordChange({ ...base, request: describeDelete(before.label) });
      else if (op.type === 'text' && after) recordChange({ ...base, request: describeEdit('Text', before.text, after.text), what: 'Text', from: before.text, to: after.text });
      else if (op.type === 'image' && after) recordChange({ ...base, request: describeEdit('Image', before.src, after.src) });
      else if (op.type === 'link' && after) recordChange({ ...base, request: describeEdit('Link', `${before.text} (${before.href})`, `${after.text} (${after.href})`) });
    }
    htmlRef.current = next;
    setHtml(next);
    scheduleSave(next);
    if (live) post({ type: 'apply', op });
  };
  const commitRef = useRef(commitEdit);
  commitRef.current = commitEdit;

  // ── Chat before a change (page: Describe changes · element: Change with AI) ──
  const closeChat = () => {
    chatAbort.current?.abort();
    chatAbort.current = null;
    setChat(null);
  };

  const runTurn = async (base: ChatState, messages: ChatMessage[]) => {
    chatAbort.current?.abort();
    const ctrl = new AbortController();
    chatAbort.current = ctrl;
    setChat({ ...base, messages, turn: null, busy: true });
    let turn: ChatTurn;
    try {
      turn = await chatTurn(
        appSettings.aiProvider ?? 'anthropic',
        base.mode === 'page'
          ? { kind: 'page', sections }
          : { kind: 'element', label: base.label ?? '', context: base.context ?? '' },
        messages,
        ctrl.signal,
      );
    } catch {
      if (ctrl.signal.aborted) return;
      turn = { reply: 'I couldn’t check this request right now. Click “Yes, do it” to apply it as written, or send your message again.', warning: '', questions: [], clear: false };
    }
    if (chatAbort.current !== ctrl) return;
    chatAbort.current = null;
    const next: ChatState = { ...base, messages: [...messages, { role: 'ai', text: turn.reply }], turn, busy: false };
    setChat(next);
    if (turn.clear && readAutoApply()) confirmChat(next, [], {});
  };

  const confirmChat = (state: ChatState, qs: CopyQuestion[], answers: Record<string, string>) => {
    const request = buildRequest(state.messages, qs, answers);
    const plan = [...state.messages].reverse().find(m => m.role === 'ai')?.text ?? '';
    const first = state.messages.find(m => m.role === 'user')?.text ?? '';
    if (state.mode === 'page') void runGenerate(true, request, plan, first);
    else if (state.key) void runElementChange(state.key, request, plan, { label: state.label ?? '', first });
  };

  // Selecting the surrounding element (e.g. after "click Parent") keeps the chat going.
  const prevSelKey = useRef<string | null>(null);
  useEffect(() => {
    const prevKey = prevSelKey.current;
    prevSelKey.current = selection?.key ?? null;
    const c = chat;
    if (!c || c.mode !== 'element' || !selection || selection.key === c.key || c.busy) {
      if (c && c.mode === 'element' && !selection) closeChat();
      return;
    }
    const doc = docRef.current;
    const oldEl = doc?.querySelector(`[data-bpm-k="${CSS.escape(c.key ?? '')}"]`);
    const newEl = doc?.querySelector(`[data-bpm-k="${CSS.escape(selection.key)}"]`);
    if (doc && oldEl && newEl && newEl.contains(oldEl) && prevKey !== selection.key) {
      const label = selectionLabel(selection);
      void runTurn(
        { ...c, key: selection.key, label, context: elementContext(doc, selection.key) },
        [...c.messages, { role: 'user', text: `(I have now selected the surrounding element instead: ${label}.)` }],
      );
    } else {
      closeChat();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection?.key]);

  const runElementChange = async (key: string, request: string, plan = '', meta?: { label: string; first: string }) => {
    const doc = docRef.current;
    if (!doc) return;
    const current = elementHtml(doc, key);
    if (!current) return;
    const controller = new AbortController();
    const jobId = jobStore.start({
      kind: 'generate',
      title: plan ? `Changing: ${plan.length > 90 ? `${plan.slice(0, 90)}…` : plan}` : 'Changing the selected element…',
      estimate: 'Usually 10–40 seconds',
      cancel: () => controller.abort(),
    });
    if (jobId === null) return;
    try {
      const change = await changeElement(
        appSettings.aiProvider ?? 'anthropic',
        { request, elementHtml: current, pageCss: pageCss(doc), designMd },
        controller.signal,
        chars => jobStore.update(jobId, `Writing… ${(chars / 1000).toFixed(1)}K characters`),
      );
      if (jobStore.isCancelled(jobId)) return;
      const before = htmlRef.current;
      const target = describeElement(doc, key);
      commitEdit({ type: 'replace', key, ...change }, false);
      if (htmlRef.current === before) {
        toast('The AI answer could not be used — please try again or rephrase.', 'error');
        return;
      }
      recordChange({ kind: 'ai-element', sectionId: target?.sectionId, target: meta?.label || target?.label, request: meta?.first || request, plan });
      closeChat();
      loadIntoEditor(htmlRef.current); // reload so new scripts run
      ding();
      toast('Element changed. Not right? Click Undo.', 'success');
    } catch (e) {
      if (!jobStore.isCancelled(jobId) && (e as Error).name !== 'AbortError') {
        toast(e instanceof Error ? e.message : 'Could not change the element', 'error');
      }
    } finally {
      jobStore.finish(jobId);
    }
  };

  const handleElementAI = (request: string) => {
    const sel = selectionRef.current;
    const doc = docRef.current;
    if (!sel || !doc || !hasKey) return;
    if (elementHtml(doc, sel.key).length > MAX_ELEMENT_CHARS) {
      toast('This element is too large for a quick change — select a smaller part, or use Describe changes.', 'warning');
      return;
    }
    void runTurn(
      { mode: 'element', key: sel.key, label: selectionLabel(sel), context: elementContext(doc, sel.key), messages: [], turn: null, busy: false },
      [{ role: 'user', text: request }],
    );
  };

  const undo = () => {
    const entry = history[history.length - 1];
    if (entry === undefined) return;
    const prev = entry.html;
    setHistory(h => h.slice(0, -1));
    restoreSections(entry);
    htmlRef.current = prev;
    setHtml(prev);
    scheduleSave(prev);
    if (editMode) loadIntoEditor(prev);
  };

  // Messages from the editor script inside the preview (untrusted: only used to edit the prototype)
  useEffect(() => {
    if (!editMode) return;
    const onMessage = (e: MessageEvent) => {
      if (!iframeRef.current || e.source !== iframeRef.current.contentWindow) return;
      const m = e.data as Record<string, unknown> | null;
      if (!m || m.bpm !== 1 || typeof m.type !== 'string') return;
      switch (m.type) {
        case 'select': {
          const { type: _t, bpm: _b, ...rest } = m;
          void _t; void _b;
          setSelection(rest as unknown as Selection);
          break;
        }
        case 'deselect': setSelection(null); break;
        case 'editing': setEditingText(m.on === true); break;
        case 'scroll': scrollRef.current = Number(m.y) || 0; break;
        case 'text':
          if (typeof m.key === 'string' && typeof m.html === 'string') commitRef.current({ type: 'text', key: m.key, html: m.html }, false);
          break;
        case 'requestDelete':
          if (selectionRef.current) commitRef.current({ type: 'delete', key: selectionRef.current.key }, true);
          break;
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [editMode]);

  const activeAIKey = appSettings.aiProvider === 'openai' ? appSettings.openaiApiKey : appSettings.anthropicApiKey;
  const hasKey = !!activeAIKey;
  const hasSections = sections.length > 0;
  // The saved prototype was built from older sections / an older design
  const source = previewSource(designMd, globals, sections);
  const outdated = isPreviewOutdated(html, source);

  // Blocking overlay (lib/jobStore): live status ("Generating... 28.2K characters"), Cancel aborts.
  const jobRef = useRef<number | null>(null);
  useEffect(() => {
    if (jobRef.current !== null) jobStore.update(jobRef.current, localStatus || gen.status);
  }, [localStatus, gen.status]);

  const runGenerate = async (isRegenerate: boolean, request = '', plan = '', label = '') => {
    if (!hasKey || !hasSections) return;
    const n = changesRef.current.length;
    if (!isRegenerate && (hasManualEdits(htmlRef.current) || n > 0) &&
        !window.confirm(`Generate Fresh builds a new prototype from the sections, the design${n ? ` and your ${n} recorded change${n === 1 ? '' : 's'} — the AI rebuilds them, so details can look a little different` : ''}. The current prototype is replaced (you can Undo afterwards). Continue?`)) return;
    if (editMode) stopEditing();
    const jobId = jobStore.start({
      kind: 'generate',
      title: isRegenerate
        ? (plan ? `Applying: ${plan.length > 90 ? `${plan.slice(0, 90)}…` : plan}` : 'Applying your changes…')
        : 'Generating the prototype…',
      estimate: 'Usually 2–4 minutes',
      cancel: gen.cancel,
    });
    if (jobId === null) return;
    jobRef.current = jobId;
    try {
      await generateNow(isRegenerate, jobId, request, label, plan);
    } finally {
      jobStore.finish(jobId);
      jobRef.current = null;
    }
  };

  // "Apply Changes": the AI replies first (chat); nothing changes until "Yes, do it".
  const handleApply = () => {
    const request = feedback.trim();
    if (!request || !hasKey || !hasSections) return;
    void runTurn({ mode: 'page', messages: [], turn: null, busy: false }, [{ role: 'user', text: request }]);
  };

  const generateNow = async (isRegenerate: boolean, jobId: number, request: string, label = '', plan = '') => {
    // Prepare screenshot slices as visual reference (best effort)
    let slices: string[] = [];
    if (screenshot) {
      setLocalStatus('Preparing screenshot reference...');
      slices = await prepareScreenshotForAI(screenshot, 4);
    }
    setLocalStatus('');
    if (jobStore.isCancelled(jobId)) return;

    const result = await gen.generate({
      designMd,
      globals,
      page,
      sections,
      screenshots: slices,
      previousHtml: isRegenerate && html ? html : undefined,
      feedback: isRegenerate && request.trim() ? request.trim() : undefined,
    });

    if (result && !jobStore.isCancelled(jobId)) {
      const keepMarker = isRegenerate && hasManualEdits(htmlRef.current);
      const stamped = stampHtml(result.html, source) + (keepMarker ? `${EDITED_MARKER}\n` : '');
      if (htmlRef.current) pushHistory({ html: htmlRef.current, changes: changesRef.current });
      if (isRegenerate) recordChange({ kind: 'ai-page', request: (label || request).trim(), plan });
      htmlRef.current = stamped;
      setHtml(stamped);
      onHtmlSaved(page.id, stamped);
      setFeedback('');
      if (isRegenerate) closeChat();
      saveLastRequest(isRegenerate ? (label || request).trim() : '');
      ding();
      if (result.truncated) {
        toast('Output hit the token limit — bottom sections may be missing. Try regenerating or simplify the blueprint.', 'warning');
      } else {
        toast(isRegenerate ? 'Prototype updated.' : 'Prototype generated.', 'success');
      }
    }
  };

  const handleDownload = () => {
    if (!html) return;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(page.slug || page.page_name || 'page').replace(/^\//, '').replace(/\s+/g, '-').toLowerCase() || 'page'}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopy = async () => {
    if (!html) return;
    try {
      await navigator.clipboard.writeText(html);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast('Copy failed — use Download instead.', 'error');
    }
  };

  const isBusy = gen.generating || !!localStatus;
  const screenshotSrc = screenshot
    ? (screenshot.startsWith('data:') || screenshot.startsWith('http')
        ? screenshot
        : `data:image/jpeg;base64,${screenshot}`)
    : '';

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="border-b border-[#E5E7EB] bg-white px-4 py-3 shrink-0 space-y-2.5 max-h-[55%] overflow-y-auto">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => runGenerate(false)}
            disabled={!hasKey || !hasSections || isBusy}
            className="flex items-center gap-2 px-4 py-2 bg-[#2575FC] hover:bg-[#1a5fe0] text-white text-sm font-medium rounded-none transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {gen.generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            {outdated ? 'Generate new prototype' : html ? 'Generate Fresh' : 'Generate HTML'}
          </button>

          {gen.generating && (
            <button
              onClick={gen.cancel}
              className="flex items-center gap-1.5 px-3 py-2 border border-[#E5E7EB] hover:border-red-400 text-xs text-[#9CA3AF] hover:text-red-500 transition-all"
            >
              <XCircle className="w-3.5 h-3.5" /> Cancel
            </button>
          )}

          {html && !editMode && (
            <button
              onClick={startEditing}
              disabled={isBusy}
              title="Click elements in the preview to edit text, images and links"
              className="flex items-center gap-1.5 px-3 py-2 border border-[#E5E7EB] hover:border-[#2575FC] text-sm text-[#111827] font-medium transition-all disabled:opacity-40"
            >
              <MousePointerClick className="w-4 h-4 text-[#2575FC]" /> Edit on page
            </button>
          )}
          {!editMode && history.length > 0 && (
            <button
              onClick={undo}
              disabled={isBusy}
              title="Undo the last change to the prototype"
              className="flex items-center gap-1.5 px-3 py-2 border border-[#E5E7EB] hover:border-[#2575FC] text-xs text-[#6B7280] hover:text-[#111827] transition-all disabled:opacity-40"
            >
              <Undo2 className="w-3.5 h-3.5" /> Undo
            </button>
          )}

          <div className="flex-1" />

          {/* Viewport toggle */}
          <div className="flex border border-[#E5E7EB]">
            {([
              { id: 'desktop' as Viewport, icon: Monitor },
              { id: 'tablet' as Viewport, icon: Tablet },
              { id: 'mobile' as Viewport, icon: Smartphone },
            ]).map(({ id, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setViewport(id)}
                disabled={!html}
                title={id}
                className={`p-2 transition-colors disabled:opacity-30 ${viewport === id ? 'bg-[#2575FC]/10 text-[#2575FC]' : 'text-[#9CA3AF] hover:text-[#111827]'}`}
              >
                <Icon className="w-4 h-4" />
              </button>
            ))}
          </div>

          {screenshot && (
            <button
              onClick={() => setCompare(v => !v)}
              disabled={!html || editMode}
              className={`flex items-center gap-1.5 px-3 py-2 border text-xs font-medium transition-all disabled:opacity-30 ${compare ? 'bg-[#2575FC]/10 border-[#2575FC] text-[#2575FC]' : 'border-[#E5E7EB] text-[#9CA3AF] hover:text-[#111827] hover:border-[#2575FC]'}`}
              title="Compare with original screenshot"
            >
              <Columns2 className="w-3.5 h-3.5" /> Compare
            </button>
          )}

          <button
            onClick={handleCopy}
            disabled={!html}
            className="flex items-center gap-1.5 px-3 py-2 border border-[#E5E7EB] hover:border-[#2575FC] text-xs text-[#9CA3AF] hover:text-[#111827] font-medium transition-all disabled:opacity-30"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>

          <button
            onClick={handleDownload}
            disabled={!html}
            className="flex items-center gap-1.5 px-3 py-2 border border-[#E5E7EB] hover:border-[#2575FC] text-xs text-[#9CA3AF] hover:text-[#111827] font-medium transition-all disabled:opacity-30"
          >
            <Download className="w-3.5 h-3.5" /> Download .html
          </button>
        </div>

        {outdated && !isBusy && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-amber-700 text-xs">
              <b>This prototype is outdated.</b> It was made before the sections or the design changed, so it still shows the previous content. Click <b>Generate new prototype</b> to build it again (2–4 minutes, ≈ $0.30).
            </p>
          </div>
        )}

        {editMode && (
          <VisualEditBar
            selection={selection}
            editingText={editingText}
            canUndo={history.length > 0}
            onEditText={() => post({ type: 'editText' })}
            onImage={src => selection && commitEdit({ type: 'image', key: selection.key, src }, true)}
            onLink={(href, text) => selection && commitEdit({ type: 'link', key: selection.key, href, text }, true)}
            onDelete={() => selection && commitEdit({ type: 'delete', key: selection.key }, true)}
            onParent={() => post({ type: 'selectParent' })}
            onDeselect={() => post({ type: 'deselect' })}
            onUndo={undo}
            onDone={stopEditing}
            onAI={hasKey ? handleElementAI : undefined}
          >
            {chat?.mode === 'element' && chat.key === selection?.key && (
              <ChangeChat
                title={`Change ${chat.label ?? 'this element'} with AI`}
                messages={chat.messages}
                turn={chat.turn}
                busy={chat.busy || isBusy}
                onReply={text => void runTurn(chat, [...chat.messages, { role: 'user', text }])}
                onConfirm={(qs, answers) => confirmChat(chat, qs, answers)}
                onCancel={closeChat}
              />
            )}
          </VisualEditBar>
        )}

        {/* Feedback / regenerate row */}
        {html && !editMode && changes.length > 0 && (
          <details className="border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-1.5 text-xs">
            <summary className="cursor-pointer text-[#374151] flex items-center gap-1.5 select-none">
              <ListChecks className="w-3.5 h-3.5 text-[#2575FC]" />
              <b>Recorded changes ({changes.length})</b>
              <span className="text-[#9CA3AF]">— kept when the prototype is rebuilt, and included in the export</span>
            </summary>
            <ul className="mt-1.5 mb-1 space-y-1 max-h-40 overflow-y-auto">
              {changes.map(c => (
                <li key={c.id} className="flex items-start gap-2 text-[#374151]">
                  <span className="shrink-0 text-[10px] px-1 py-0.5 bg-white border border-[#E5E7EB] text-[#6B7280]">
                    {c.kind === 'ai-page' ? 'AI · page' : c.kind === 'ai-element' ? 'AI · element' : 'Edit'}
                  </span>
                  <span className="flex-1 min-w-0" title={c.plan || c.request}>
                    {c.target && <span className="text-[#6B7280]">{c.target}: </span>}{c.request}
                  </span>
                  <button
                    type="button"
                    onClick={() => saveChanges(changesRef.current.filter(x => x.id !== c.id))}
                    title="Remove from the list (the prototype itself doesn't change)"
                    className="p-0.5 text-[#9CA3AF] hover:text-red-500 shrink-0"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
        {html && !editMode && lastRequest && !chat && (
          <p className="text-[11px] text-[#6B7280] truncate" title={lastRequest}>
            <span className="font-medium text-[#374151]">Last change applied:</span> {lastRequest}
          </p>
        )}
        {html && !editMode && (
          <div className="flex items-start gap-2">
            <textarea
              value={feedback}
              onChange={e => { setFeedback(e.target.value); if (chat?.mode === 'page') closeChat(); }}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && feedback.trim() && !isBusy) { e.preventDefault(); handleApply(); } }}
              rows={2}
              placeholder='Describe changes, e.g. "Make the hero taller, turn the gallery into a slider, lighter gray for section 3 background"'
              disabled={isBusy}
              className="flex-1 bg-white border border-[#E5E7EB] rounded-none px-3 py-2 text-sm text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:border-[#2575FC] transition-all disabled:opacity-50 resize-y leading-snug"
            />
            <button
              onClick={handleApply}
              disabled={!feedback.trim() || isBusy || chat?.mode === 'page'}
              title="Ctrl/⌘ + Enter"
              className="flex items-center gap-1.5 px-4 py-2 bg-[#F9FAFB] hover:bg-white border border-[#E5E7EB] hover:border-[#2575FC] text-sm text-[#111827] font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Apply Changes
            </button>
          </div>
        )}
        {html && !editMode && chat?.mode === 'page' && (
          <ChangeChat
            title="Before the page is rebuilt (2–4 minutes, ≈ $0.30)"
            messages={chat.messages}
            turn={chat.turn}
            busy={chat.busy || isBusy}
            onReply={text => void runTurn(chat, [...chat.messages, { role: 'user', text }])}
            onConfirm={(qs, answers) => confirmChat(chat, qs, answers)}
            onCancel={closeChat}
          />
        )}

        {/* Status / errors */}
        {(isBusy || gen.status || gen.error) && (
          <div className="flex items-center gap-2 bg-[#F9FAFB] border border-[#E5E7EB] px-3 py-2">
            {isBusy && <Loader2 className="w-3.5 h-3.5 text-[#2575FC] animate-spin shrink-0" />}
            {gen.error && !isBusy && <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
            <p className={`text-xs truncate ${gen.error && !isBusy ? 'text-red-600' : 'text-[#9CA3AF]'}`}>
              {localStatus || gen.error || gen.status}
            </p>
          </div>
        )}

        {!hasKey && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-amber-700 text-xs">
              Add your {appSettings.aiProvider === 'openai' ? 'OpenAI' : 'Anthropic'} API key in Settings to generate HTML.
            </p>
          </div>
        )}
        {hasKey && !hasSections && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-amber-700 text-xs">
              This page has no sections yet — import a URL or add sections first.
            </p>
          </div>
        )}
      </div>

      {/* Canvas */}
      <div className="flex-1 overflow-hidden bg-[#F0F1F3]">
        {!html ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="w-12 h-12 border border-[#E5E7EB] bg-white flex items-center justify-center mb-4">
              <Wand2 className="w-5 h-5 text-[#9CA3AF]" />
            </div>
            <h3 className="text-[#9CA3AF] font-medium mb-1">No prototype yet</h3>
            <p className="text-[#9CA3AF] text-sm max-w-md">
              Generate a standalone HTML prototype from this page's design system and blueprint.
              The result renders here and can be downloaded as a single .html file.
            </p>
          </div>
        ) : compare && screenshotSrc ? (
          <div className="grid grid-cols-2 gap-px bg-[#E5E7EB] h-full">
            <div className="bg-white overflow-auto">
              <div className="sticky top-0 z-10 bg-[#F9FAFB] border-b border-[#E5E7EB] px-3 py-1.5 text-[10px] font-medium text-[#9CA3AF] uppercase tracking-wider">Original</div>
              <img src={screenshotSrc} alt="Original page" className="w-full" />
            </div>
            <div className="bg-white overflow-hidden flex flex-col">
              <div className="bg-[#F9FAFB] border-b border-[#E5E7EB] px-3 py-1.5 text-[10px] font-medium text-[#9CA3AF] uppercase tracking-wider shrink-0">Generated</div>
              <iframe
                title="Generated prototype"
                srcDoc={html}
                sandbox="allow-scripts"
                className="w-full flex-1 border-0 bg-white"
              />
            </div>
          </div>
        ) : (
          <div className="h-full flex justify-center overflow-hidden py-0">
            <iframe
              ref={iframeRef}
              title="Generated prototype"
              srcDoc={editMode ? frameDoc : html}
              sandbox="allow-scripts"
              style={{ width: VIEWPORT_WIDTHS[viewport], maxWidth: '100%' }}
              className="h-full border-0 bg-white shadow-sm transition-all"
            />
          </div>
        )}
      </div>
    </div>
  );
}

interface ChatState {
  mode: 'page' | 'element';
  /** element mode: the selected element */
  key?: string;
  label?: string;
  context?: string;
  messages: ChatMessage[];
  turn: ChatTurn | null;
  busy: boolean;
}

function selectionLabel(sel: Selection): string {
  return `<${sel.tag}>${sel.text ? ` "${sel.text.slice(0, 40)}"` : ''}`;
}

interface HistoryEntry {
  html: string;
  /** change list before this step (Undo restores it) */
  changes?: PrototypeChange[];
  /** sections before a synced edit (Undo restores them) */
  sections?: Section[];
  copyMd?: string;
}

interface SyncTarget {
  kind: FieldKind;
  old: string;
  el: Element;
  ref: NonNullable<ReturnType<typeof fieldForEdit>>;
}

/** What an element is (for the change list), read from the keyed document. */
function describeElement(doc: Document, key: string): { label: string; sectionId?: string; text: string; src: string; href: string } | null {
  const el = doc.querySelector(`[data-bpm-k="${CSS.escape(key)}"]`);
  if (!el) return null;
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  const src = el.tagName === 'IMG'
    ? el.getAttribute('src') ?? ''
    : ((el.getAttribute('style') ?? '').match(/url\((['"]?)([^'")]*)\1\)/i)?.[2] ?? '');
  const alt = el.getAttribute('alt') ?? '';
  const shown = text || alt;
  return {
    label: `<${el.tagName.toLowerCase()}>${shown ? ` "${shown.slice(0, 40)}${shown.length > 40 ? '…' : ''}"` : ''}`,
    sectionId: el.closest('[data-bpm-s]')?.getAttribute('data-bpm-s') ?? undefined,
    text,
    src,
    href: el.getAttribute('href') ?? '',
  };
}
