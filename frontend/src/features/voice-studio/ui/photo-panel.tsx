'use client';

import { useRef } from 'react';
import type { MediaRef } from '@px/contracts';
import { Icon, PillButton } from './parts';

/** Drop zone for one photos field, opened by the assistant or by the photo button. */
export function PhotoPanel({
  label,
  hint,
  photos,
  max,
  uploading,
  problem,
  onFiles,
  onClose,
}: {
  label: string;
  hint?: string;
  photos: MediaRef[];
  max: number;
  uploading: number;
  problem: string | null;
  onFiles: (files: File[]) => void;
  onClose: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <section
      aria-label={`Фотографии: ${label}`}
      className="voice-rise absolute inset-x-3 bottom-24 z-20 mx-auto flex max-w-xl flex-col gap-4 rounded-card border border-line bg-[#120a22]/90 p-5 backdrop-blur-xl sm:bottom-28"
    >
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl leading-tight italic">{label}</h2>
          {hint && <p className="mt-1 text-sm leading-snug text-muted">{hint}</p>}
        </div>
        <button type="button" onClick={onClose} aria-label="Закрыть окно с фото" className="grid size-9 shrink-0 place-items-center rounded-full border border-line hover:bg-white/15">
          {Icon.close}
        </button>
      </header>

      <button
        type="button"
        onClick={() => input.current?.click()}
        className="flex min-h-28 flex-col items-center justify-center gap-1 rounded-[14px] border border-dashed border-white/35 px-4 py-5 text-center transition-colors hover:border-white hover:bg-white/5"
      >
        <span className="text-[15px] font-semibold">Перетащите фото сюда или нажмите</span>
        <span className="text-sm text-muted">
          {photos.length} из {max}
          {uploading > 0 && ` · загружается ${uploading}`}
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          onFiles([...(event.target.files ?? [])]);
          event.target.value = '';
        }}
      />

      {photos.length > 0 && (
        <ul className="flex gap-2 overflow-x-auto pb-1">
          {photos.map((photo) => (
            <li key={photo.id} className="size-16 shrink-0 overflow-hidden rounded-[10px] bg-white/10">
              {/* eslint-disable-next-line @next/next/no-img-element -- uploaded by this person, served by our media service */}
              <img src={photo.url} alt="" className="size-full object-cover" loading="lazy" />
            </li>
          ))}
        </ul>
      )}
      {problem && (
        <p role="alert" className="text-sm text-[#ff9db0]">
          {problem}
        </p>
      )}
      <PillButton tone="solid" onClick={onClose} className="h-11 self-end px-6">
        Готово
      </PillButton>
    </section>
  );
}
