'use server';

import { revalidatePath } from 'next/cache';
import { api } from '@/shared/api/server';
import { ApiError } from '@/shared/api/core';

export interface KaspiFormState {
  step: 'phone' | 'code';
  processId: string | null;
  error: string | null;
  done: boolean;
}

const message = (error: unknown, fallback: string) =>
  error instanceof ApiError ? (Object.values(error.fields ?? {})[0] ?? error.message) : fallback;

/** Two steps in one form: phone → SMS code from Kaspi → session saved by the payments service. */
export async function connectKaspi(prev: KaspiFormState, form: FormData): Promise<KaspiFormState> {
  try {
    if (prev.step === 'phone') {
      const { processId } = await api.admin.kaspi.requestCode(String(form.get('phone') ?? ''));
      return { step: 'code', processId, error: null, done: false };
    }
    await api.admin.kaspi.verify(prev.processId ?? '', String(form.get('otp') ?? ''));
    revalidatePath('/admin/settings');
    return { step: 'phone', processId: null, error: null, done: true };
  } catch (error) {
    return { ...prev, error: message(error, 'Kaspi не ответил. Попробуйте ещё раз.'), done: false };
  }
}

export async function disconnectKaspi() {
  await api.admin.kaspi.disconnect();
  revalidatePath('/admin/settings');
}

export interface QrState {
  image: string | null;
  seconds: number;
  error: string | null;
}

/** QR to link the studio number: WhatsApp → Связанные устройства → Привязать устройство. */
export async function whatsappQr(): Promise<QrState> {
  try {
    const qr = await api.admin.whatsapp.qr();
    return { image: qr.image, seconds: qr.seconds, error: null };
  } catch (error) {
    return { image: null, seconds: 0, error: message(error, 'Шлюз WhatsApp не ответил.') };
  }
}

export async function whatsappLogout() {
  await api.admin.whatsapp.logout();
  revalidatePath('/admin/settings');
}

export interface TrialState {
  messages: { author: 'customer' | 'bot'; text: string }[];
  actions: string[];
  error: string | null;
}

/** One more customer message in the trial dialog; the bot answers on the real model, nothing is ordered or billed. */
export async function trySeller(prev: TrialState, form: FormData): Promise<TrialState> {
  if (form.get('reset')) return { messages: [], actions: [], error: null };
  const text = String(form.get('text') ?? '').trim();
  if (!text) return prev;
  const messages = [...prev.messages, { author: 'customer' as const, text }];
  try {
    const r = await api.admin.sellerTrial(messages);
    return { messages: r.reply ? [...messages, { author: 'bot', text: r.reply }] : messages, actions: [...prev.actions, ...r.actions], error: null };
  } catch (error) {
    return { ...prev, error: message(error, 'Бот не ответил.') };
  }
}
