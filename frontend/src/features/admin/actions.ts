'use server';

import { revalidatePath } from 'next/cache';
import { AddNoteRequest, ChangeStatusRequest } from '@px/contracts';
import { ApiError } from '@/shared/api/core';
import { api } from '@/shared/api/server';

export interface ActionState {
  error: string | null;
  done?: number;
}

/**
 * Server actions of the back office: the admin token never leaves the server.
 * The /admin area itself is protected by Basic Auth in the proxy.
 */
export async function changeStatus(projectId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = ChangeStatusRequest.safeParse({ to: form.get('to'), note: form.get('note') || undefined });
  if (!parsed.success) return { error: 'Выберите новый статус.' };
  try {
    await api.admin.changeStatus(projectId, parsed.data);
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : 'Не удалось сменить статус.' };
  }
  revalidatePath('/admin', 'layout');
  return { error: null, done: Date.now() };
}

export async function addNote(projectId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = AddNoteRequest.safeParse({ text: form.get('text'), author: form.get('author') || undefined });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Напишите заметку.' };
  try {
    await api.admin.addNote(projectId, parsed.data);
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : 'Не удалось сохранить заметку.' };
  }
  revalidatePath(`/admin/orders/${projectId}`);
  return { error: null, done: Date.now() };
}
