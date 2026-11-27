'use client';

import { useEffect, useRef, useState } from 'react';
import { ALLOWED_IMAGE_TYPES, MAX_UPLOAD_BYTES, type MediaRef } from '@px/contracts';
import { browserApi } from '@/shared/api/browser';
import { ApiError } from '@/shared/api/core';
import { plural } from '@/shared/lib/plural';
import { Spinner } from '@/shared/ui/button';

interface Pending {
  key: string;
  name: string;
}

const CONCURRENCY = 3;

/**
 * Uploads photos to the media service as soon as they are picked and stores
 * only references ({id, url}) in the answers.
 */
export function PhotosField({
  id,
  value,
  max,
  onChange,
  describedBy,
}: {
  id: string;
  value: MediaRef[];
  max: number;
  onChange: (next: MediaRef[]) => void;
  describedBy?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  // Uploads finish out of order; keep the latest list in a ref so none are lost.
  const current = useRef(value);
  useEffect(() => {
    current.current = value;
  }, [value]);

  const remaining = max - value.length - pending.length;

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const picked = Array.from(files);
    const accepted = picked.slice(0, Math.max(0, remaining));
    const issues: string[] = [];
    if (picked.length > accepted.length) issues.push(`Можно добавить ещё ${plural(Math.max(0, remaining), ['фото', 'фото', 'фото'])}.`);

    const valid = accepted.filter((file) => {
      if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type) && !/\.(heic|heif)$/i.test(file.name)) {
        issues.push(`${file.name}: подходят только JPG, PNG, WEBP и HEIC.`);
        return false;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        issues.push(`${file.name}: файл больше 15 МБ.`);
        return false;
      }
      return true;
    });

    setProblems(issues);
    const queue = valid.map((file, i) => ({ file, key: `${Date.now()}-${i}` }));
    setPending((p) => [...p, ...queue.map(({ key, file }) => ({ key, name: file.name }))]);
    if (inputRef.current) inputRef.current.value = '';

    const worker = async () => {
      while (queue.length) {
        const { file, key } = queue.shift()!;
        try {
          const uploaded = await browserApi.upload(file);
          const next = [...current.current, { id: uploaded.id, url: uploaded.url }];
          current.current = next;
          onChange(next);
        } catch (error) {
          setProblems((p) => [...p, `${file.name}: ${error instanceof ApiError ? error.message : 'не загрузилось.'}`]);
        } finally {
          setPending((p) => p.filter((x) => x.key !== key));
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  }

  const remove = (mediaId: string) => onChange(value.filter((m) => m.id !== mediaId));

  return (
    <div className="flex flex-col gap-3">
      {(value.length > 0 || pending.length > 0) && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
          {value.map((media, i) => (
            <li key={media.id} className="group relative aspect-square overflow-hidden rounded-control bg-field">
              {/* eslint-disable-next-line @next/next/no-img-element -- user uploads served by the media service */}
              <img src={media.url} alt={`Фото ${i + 1}`} className="size-full object-cover" loading="lazy" />
              <button
                type="button"
                onClick={() => remove(media.id)}
                className="absolute top-1.5 right-1.5 flex size-8 items-center justify-center rounded-full bg-black/70 text-white opacity-90 hover:bg-black"
                aria-label={`Удалить фото ${i + 1}`}
              >
                ×
              </button>
            </li>
          ))}
          {pending.map((p) => (
            <li
              key={p.key}
              className="flex aspect-square flex-col items-center justify-center gap-2 rounded-control border border-dashed border-line p-2 text-center text-xs text-muted"
            >
              <Spinner />
              <span className="line-clamp-2 break-all">{p.name}</span>
            </li>
          ))}
        </ul>
      )}

      {remaining > 0 && (
        <label
          htmlFor={id}
          className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-card border-2 border-dashed border-line px-4 py-5 text-center transition-colors hover:border-ink focus-within:border-ink"
        >
          <span className="font-medium">Выбрать фото</span>
          <span className="text-sm text-muted">
            {value.length === 0 ? `До ${plural(max, ['фото', 'фото', 'фото'])}` : `Можно ещё ${remaining}`}, JPG, PNG или HEIC
          </span>
          <input
            ref={inputRef}
            id={id}
            type="file"
            accept={[...ALLOWED_IMAGE_TYPES, '.heic', '.heif'].join(',')}
            multiple={max > 1}
            className="sr-only"
            aria-describedby={describedBy}
            onChange={(e) => void onFiles(e.target.files)}
          />
        </label>
      )}

      {problems.length > 0 && (
        <ul className="space-y-1 text-sm text-danger" role="alert">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
