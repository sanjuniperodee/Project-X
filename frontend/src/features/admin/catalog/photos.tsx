'use client';

import { useState, useTransition } from 'react';
import { browserApi } from '@/shared/api/browser';
import { ApiError } from '@/shared/api/core';
import { Notice } from '@/shared/ui/notice';
import { savePhotos } from './actions';

/** Photos of one product for the WhatsApp catalog (shared by all its formats): JPEG, PNG or WebP, up to 10. */
export function CatalogPhotos({ productId, images: initial }: { productId: string; images: string[] }) {
  const [images, setImages] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = (next: string[]) =>
    start(async () => {
      setError(null);
      const r = await savePhotos(productId, next);
      if (r.error) setError(r.error);
      else setImages(next);
    });

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const uploaded: string[] = [];
    for (const file of Array.from(files).slice(0, 10 - images.length)) {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
        setError('WhatsApp принимает только JPEG, PNG или WebP.');
        continue;
      }
      try {
        uploaded.push((await browserApi.upload(file)).url);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Фото не загрузилось.');
      }
    }
    if (uploaded.length) save([...images, ...uploaded]);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {images.map((url) => (
          <div key={url} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element -- uploaded photo served by media */}
            <img src={url} alt="" width={96} height={96} className="size-24 rounded-control border border-line object-cover" />
            <button
              type="button"
              aria-label="Убрать фото"
              onClick={() => save(images.filter((x) => x !== url))}
              className="absolute right-1 top-1 rounded-full bg-surface/90 px-1.5 text-xs shadow"
            >
              ✕
            </button>
          </div>
        ))}
        {images.length < 10 && (
          <label className="flex size-24 cursor-pointer items-center justify-center rounded-control border border-dashed border-line text-center text-xs text-muted hover:bg-bg">
            {pending ? 'Сохраняю…' : '+ фото'}
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => void add(e.target.files)} />
          </label>
        )}
      </div>
      {error && <Notice tone="danger">{error}</Notice>}
    </div>
  );
}
