'use client';

import {
  ProjectPreview,
  CheckoutResponse,
  CreateProjectResponse,
  PaymentView,
  ProjectView,
  UploadResponse,
  VoiceSessionView,
  z,
  type Answers,
  type CreateProjectRequestInput,
  type PaymentKind,
  type StepAnswers,
  type VoiceMode,
} from '@px/contracts';
import { request } from './core';

/**
 * Browser-side client. Calls the same-origin `/api/*` route, which streams
 * to the gateway — so the browser never needs to know internal addresses.
 */
const call = <S extends z.ZodType>(path: string, schema: S, init?: Parameters<typeof request>[2]) =>
  request(`/api${path}`, schema, init);

const key = encodeURIComponent;

export const browserApi = {
  createProject: (body: CreateProjectRequestInput) =>
    call('/projects', CreateProjectResponse, { method: 'POST', body }),

  project: (editKey: string) => call(`/projects/${key(editKey)}`, ProjectView),

  /** Starts a voice conversation: which provider to use and its credential. */
  voiceSession: (editKey: string, mode: VoiceMode) => call('/voice/sessions', VoiceSessionView, { method: 'POST', body: { editKey, mode } }),

  saveStep: (editKey: string, stepId: string, answers: StepAnswers) =>
    call(`/projects/${key(editKey)}/steps/${key(stepId)}`, ProjectView, { method: 'PUT', body: { answers } }),

  /** The issue from the current answers (after the deposit, before the submit). Renders, so it may take a few seconds. */
  preview: (editKey: string) => call(`/projects/${key(editKey)}/preview`, ProjectPreview, { method: 'POST' }),

  /** Takes the questionnaire back once after the submit (until a layout is approved). */
  reopen: (editKey: string) => call(`/projects/${key(editKey)}/reopen`, ProjectView, { method: 'POST' }),

  submit: (editKey: string) => call(`/projects/${key(editKey)}/submit`, ProjectView, { method: 'POST' }),

  approveLayout: (editKey: string, version: number) =>
    call(`/projects/${key(editKey)}/layout/approve`, ProjectView, { method: 'POST', body: { version } }),

  requestLayoutChanges: (editKey: string, body: { version?: number; comment: string }) =>
    call(`/projects/${key(editKey)}/layout/changes`, ProjectView, { method: 'POST', body }),

  checkout: (editKey: string, kind: PaymentKind) =>
    call(`/projects/${key(editKey)}/checkout`, CheckoutResponse, { method: 'POST', body: { kind } }),

  contribute: (inviteKey: string, body: { authorName: string; answers: Answers }) =>
    call(`/invites/${key(inviteKey)}/contributions`, z.object({ id: z.string() }), { method: 'POST', body }),

  payment: (paymentId: string) => call(`/payments/${key(paymentId)}`, PaymentView),

  confirmMockPayment: (paymentId: string, outcome: 'success' | 'fail') =>
    call(`/payments/${key(paymentId)}/mock/confirm`, PaymentView, { method: 'POST', body: { outcome } }),

  upload: (file: File, signal?: AbortSignal) => {
    const form = new FormData();
    form.append('file', file);
    return call('/media/uploads', UploadResponse, { method: 'POST', body: form, signal });
  },
};
