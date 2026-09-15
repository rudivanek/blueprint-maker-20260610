// src/lib/jobStore.ts
//
// One long-running job at a time (import, design extraction, HTML generation).
// While a job runs, <ProcessingOverlay /> covers the editor so nothing can be
// clicked, a second job can't start, and closing the tab asks for confirmation.

import { useSyncExternalStore } from 'react';

export type JobKind = 'import' | 'design' | 'generate' | 'brief';

export interface Job {
  id: number;
  kind: JobKind;
  title: string;
  estimate: string;
  status: string;
  startedAt: number;
  cancellable: boolean;
}

let job: Job | null = null;
let nextId = 1;
let cancelFn: (() => void) | undefined;
const cancelled = new Set<number>();
const listeners = new Set<() => void>();

const notify = () => listeners.forEach(l => l());

function onBeforeUnload(e: BeforeUnloadEvent) {
  e.preventDefault();
  e.returnValue = '';
}

export const jobStore = {
  /** Returns the job id, or null if another job is already running. */
  start(opts: { kind: JobKind; title: string; estimate: string; cancel?: () => void }): number | null {
    if (job) return null;
    const id = nextId++;
    cancelFn = opts.cancel;
    job = { id, kind: opts.kind, title: opts.title, estimate: opts.estimate, status: '', startedAt: Date.now(), cancellable: true };
    window.addEventListener('beforeunload', onBeforeUnload);
    notify();
    return id;
  },

  update(id: number, status: string) {
    if (!job || job.id !== id || !status || job.status === status) return;
    job = { ...job, status };
    notify();
  },

  finish(id: number) {
    if (!job || job.id !== id) return;
    job = null;
    cancelFn = undefined;
    window.removeEventListener('beforeunload', onBeforeUnload);
    notify();
  },

  /** Stops waiting. Aborts the request where possible; otherwise the result is ignored. */
  cancel() {
    if (!job) return;
    const id = job.id;
    cancelled.add(id);
    try { cancelFn?.(); } catch { /* ignore */ }
    jobStore.finish(id);
  },

  isCancelled(id: number | null | undefined): boolean {
    return id != null && cancelled.has(id);
  },

  current(): Job | null {
    return job;
  },

  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
};

export function useJob(): Job | null {
  return useSyncExternalStore(jobStore.subscribe, jobStore.current, jobStore.current);
}
