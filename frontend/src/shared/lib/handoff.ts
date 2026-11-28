'use client';

import type { Answers, ProductId } from '@px/contracts';

/**
 * What a visitor prepared on a landing before ordering (the Cover Me try-on: name, style, photo),
 * kept in IndexedDB until the project exists and then poured into its questionnaire.
 * Stays on the device; expires after a week.
 */
export interface Handoff {
  productId: ProductId;
  subject?: string;
  answers?: Answers;
  photos?: Array<{ stepId: string; fieldId: string; file: Blob; name: string }>;
  /** One line for the order form: what will be carried over. */
  summary: string;
  savedAt: number;
}

const DB = 'px-handoff';
const STORE = 'handoff';
const KEY = 'current';
const TTL = 7 * 24 * 3600 * 1000;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = work(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function saveHandoff(handoff: Omit<Handoff, 'savedAt'>): Promise<void> {
  await run('readwrite', (store) => store.put({ ...handoff, savedAt: Date.now() }, KEY)).catch(() => undefined);
}

/** The handoff for this product, if there is a fresh one. */
export async function peekHandoff(productId: ProductId): Promise<Handoff | null> {
  const handoff = await run<Handoff | undefined>('readonly', (store) => store.get(KEY)).catch(() => undefined);
  return handoff && handoff.productId === productId && Date.now() - handoff.savedAt < TTL ? handoff : null;
}

export async function clearHandoff(): Promise<void> {
  await run('readwrite', (store) => store.delete(KEY)).catch(() => undefined);
}
