// src/hooks/usePreviewHeight.ts
//
// Height of the prototype preview (Prototype step + Advanced → Preview).
// Default: 80% of the window (at least 600 px). The user drags the handle
// under the preview to change it; the choice is remembered in this browser.
// Double-click on the handle → back to the default.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';

const KEY = 'bpm_preview_height';
const MIN = 320;
const MAX = 4000;

export const defaultPreviewHeight = () =>
  Math.max(600, Math.round((typeof window !== 'undefined' ? window.innerHeight : 800) * 0.8));

const clamp = (n: number) => Math.min(MAX, Math.max(MIN, Math.round(n)));

function readSaved(): number | null {
  try {
    const n = Number(localStorage.getItem(KEY));
    return Number.isFinite(n) && n >= MIN ? clamp(n) : null;
  } catch { return null; }
}

function save(n: number | null) {
  try {
    if (n === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, String(n));
  } catch { /* storage blocked — height just isn't remembered */ }
}

export function usePreviewHeight() {
  const [saved, setSaved] = useState<number | null>(readSaved);
  const [fallback, setFallback] = useState(defaultPreviewHeight);
  const [resizing, setResizing] = useState(false);
  const drag = useRef<{ y: number; h: number } | null>(null);
  const height = saved ?? fallback;

  // The default follows the window size until the user picks a height
  useEffect(() => {
    const onResize = () => setFallback(defaultPreviewHeight());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, h: height };
    setResizing(true);
  }, [height]);

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    if (!drag.current) return;
    setSaved(clamp(drag.current.h + e.clientY - drag.current.y));
  }, []);

  const onPointerUp = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    if (!drag.current) return;
    drag.current = null;
    setResizing(false);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    setSaved(h => { if (h !== null) save(h); return h; });
  }, []);

  const reset = useCallback(() => { save(null); setSaved(null); }, []);

  /** Arrow keys on the focused handle: ±40 px (±200 with Shift) */
  const onKeyDown = useCallback((e: ReactKeyboardEvent<HTMLElement>) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const step = (e.shiftKey ? 200 : 40) * (e.key === 'ArrowDown' ? 1 : -1);
    const n = clamp(height + step);
    save(n);
    setSaved(n);
  }, [height]);

  return {
    height,
    resizing,
    handleProps: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onDoubleClick: reset, onKeyDown },
  };
}
