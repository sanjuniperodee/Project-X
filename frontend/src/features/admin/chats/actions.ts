'use server';

import { revalidatePath } from 'next/cache';
import { api } from '@/shared/api/server';
import { ApiError } from '@/shared/api/core';

export interface ReplyState {
  error: string | null;
}

/** Studio reply from /admin: goes out from the studio number, the bot pauses in this chat. */
export async function replyInChat(id: string, _prev: ReplyState, form: FormData): Promise<ReplyState> {
  const text = String(form.get('text') ?? '').trim();
  if (!text) return { error: 'Напишите сообщение.' };
  try {
    await api.admin.conversations.reply(id, text);
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : 'Сообщение не ушло.' };
  }
  revalidatePath(`/admin/chats/${id}`);
  return { error: null };
}

export async function setChatMode(id: string, mode: 'bot' | 'human') {
  await api.admin.conversations.mode(id, mode);
  revalidatePath(`/admin/chats/${id}`);
  revalidatePath('/admin/chats');
}
