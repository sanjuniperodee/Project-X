'use client';

import { useActionState, useEffect, useRef } from 'react';
import type { ProjectNote } from '@px/contracts';
import { addNote, type ActionState } from '../actions';
import { formatDateTime } from '../lib/format';

/** Internal notes of the team: calls, agreements, reminders. The customer never sees them. */
export function Notes({ projectId, notes }: { projectId: string; notes: ProjectNote[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(addNote.bind(null, projectId), { error: null });
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.done) form.current?.reset();
  }, [state.done]);

  return (
    <div className="flex flex-col gap-3">
      <form ref={form} action={action} className="flex flex-col gap-2">
        <textarea
          name="text"
          rows={3}
          required
          maxLength={2000}
          placeholder="Например: созвонились, фото пришлёт до пятницы"
          aria-label="Заметка"
          className="resize-y rounded-control border border-line bg-surface px-2.5 py-2 placeholder:text-muted"
        />
        <div className="flex gap-2">
          <input name="author" placeholder="Кто пишет" maxLength={60} aria-label="Автор" className="h-8 min-w-0 flex-1 rounded-control border border-line bg-surface px-2.5 placeholder:text-muted" />
          <button type="submit" disabled={pending} className="h-8 rounded-control border border-line bg-surface px-3 hover:bg-bg disabled:opacity-50">
            Добавить
          </button>
        </div>
        {state.error && (
          <p role="alert" className="text-[13px] text-danger">
            {state.error}
          </p>
        )}
      </form>
      {notes.length > 0 && (
        <ol className="flex flex-col divide-y divide-line">
          {notes.map((note) => (
            <li key={note.id} className="py-2.5 first:pt-0">
              <p className="text-[12px] text-muted">
                {note.author ? `${note.author} · ` : ''}
                {formatDateTime(note.createdAt)}
              </p>
              <p className="mt-0.5 whitespace-pre-line">{note.text}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
