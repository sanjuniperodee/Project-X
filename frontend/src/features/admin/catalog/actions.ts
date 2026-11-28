'use server';

import { revalidatePath } from 'next/cache';
import { api } from '@/shared/api/server';
import { ApiError } from '@/shared/api/core';

const message = (error: unknown, fallback: string) => (error instanceof ApiError ? (Object.values(error.fields ?? {})[0] ?? error.message) : fallback);

export async function savePhotos(productId: string, images: string[]): Promise<{ error: string | null }> {
  try {
    await api.admin.catalog.setPhotos(productId, images);
  } catch (error) {
    return { error: message(error, 'Фото не сохранились.') };
  }
  revalidatePath('/admin/catalog');
  return { error: null };
}

export interface SyncState {
  done: string | null;
  skipped: string[];
  error: string | null;
}

/** Our formats → WhatsApp catalog. Each changed product goes to WhatsApp review again. */
export async function syncCatalog(): Promise<SyncState> {
  try {
    const r = await api.admin.catalog.sync();
    revalidatePath('/admin/catalog');
    return { done: `Создано: ${r.created}, изменено: ${r.updated}, удалено: ${r.removed}, без изменений: ${r.unchanged}.`, skipped: r.skipped, error: null };
  } catch (error) {
    return { done: null, skipped: [], error: message(error, 'WhatsApp не ответил. Попробуйте ещё раз.') };
  }
}
