'use server';

import { revalidatePath } from 'next/cache';
import { ChangeStatusRequest } from '@px/contracts';
import { api } from '@/shared/api/server';
import { ApiError } from '@/shared/api/core';

export interface ChangeStatusState {
  error: string | null;
}

/**
 * Server action: the admin token never leaves the server.
 * The /admin area itself is protected by Basic Auth in the proxy.
 */
export async function changeStatus(projectId: string, _prev: ChangeStatusState, form: FormData): Promise<ChangeStatusState> {
  const parsed = ChangeStatusRequest.safeParse({ to: form.get('to'), note: form.get('note') || undefined });
  if (!parsed.success) return { error: 'Выберите новый статус.' };
  try {
    await api.admin.changeStatus(projectId, parsed.data);
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : 'Не удалось сменить статус.' };
  }
  revalidatePath(`/admin/${projectId}`);
  revalidatePath('/admin');
  return { error: null };
}
