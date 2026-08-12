import { useSyncExternalStore } from 'react';

export interface CommsDraft {
  to?: string;
  subject: string;
  body: string;
}

let pending: CommsDraft | null = null;
const ls = new Set<() => void>();

export function queueCommsDraft(d: CommsDraft): void {
  pending = d;
  ls.forEach((l) => l());
}

/** Consume and clear the pending draft. */
export function consumeCommsDraft(): CommsDraft | null {
  const d = pending;
  pending = null;
  return d;
}

function sub(l: () => void): () => void {
  ls.add(l);
  return () => ls.delete(l);
}
function get(): CommsDraft | null { return pending; }

export function useCommsDraft(): CommsDraft | null {
  return useSyncExternalStore(sub, get, get);
}
