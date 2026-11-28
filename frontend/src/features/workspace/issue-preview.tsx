'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProductId, ProjectPreview, ProjectView } from '@px/contracts';
import { browserApi } from '@/shared/api/browser';
import { ApiError } from '@/shared/api/core';
import { Button } from '@/shared/ui/button';
import { Notice } from '@/shared/ui/notice';
import { LayoutPages } from './layout-pages';

const READ_AS_SPREADS: Record<ProductId, boolean> = { glossy: true, shezhire: true, boardgame: false };
const NOUN: Record<ProductId, string> = { glossy: 'номера', shezhire: 'книги', boardgame: 'игры' };

/**
 * The issue built from the customer's own answers, before they send the materials: what they fill in is what they
 * see. Before the deposit — what it will be and how to unlock it.
 */
export function IssuePreview({ editKey, project }: { editKey: string; project: ProjectView }) {
  const [preview, setPreview] = useState<ProjectPreview | null>(null);
  const [basis, setBasis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const noun = NOUN[project.productId];

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const at = project.updatedAt;
    try {
      setPreview(await browserApi.preview(editKey));
      setBasis(at);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Превью не собралось. Попробуйте ещё раз через минуту.');
    } finally {
      setLoading(false);
    }
  }, [editKey, project.updatedAt]);

  // The first preview builds by itself as soon as the deposit is in.
  useEffect(() => {
    if (project.status !== 'deposit_paid' || started.current) return;
    started.current = true;
    void load();
  }, [project.status, load]);

  if (project.status === 'draft') {
    return (
      <section aria-labelledby="preview-title" className="rounded-card border border-dashed border-line bg-surface p-6">
        <h2 id="preview-title" className="font-display text-2xl font-semibold">
          Превью {noun}
        </h2>
        <p className="mt-2 max-w-[62ch] leading-relaxed text-muted">
          Внесите предоплату, чтобы увидеть превью {noun}: мы соберём страницы из ваших ответов и фото, и вы сможете
          листать их, пока заполняете анкету, — до отправки в работу.
        </p>
      </section>
    );
  }

  const outdated = preview && basis !== project.updatedAt;
  return (
    <section aria-labelledby="preview-title" className="rounded-card border border-line bg-surface p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="preview-title" className="font-display text-2xl font-semibold">
            Превью {noun}
          </h2>
          <p className="mt-1 max-w-[62ch] leading-relaxed text-muted">
            Страницы из ваших ответов и фото — как есть. После отправки в работу тексты отредактируют, а макет пришлём на
            согласование.
          </p>
        </div>
        <Button variant={outdated ? 'primary' : 'secondary'} loading={loading} onClick={() => void load()}>
          {preview ? (outdated ? 'Обновить превью — есть изменения' : 'Обновить превью') : 'Показать превью'}
        </Button>
      </div>
      {error && (
        <div className="mt-4">
          <Notice tone="danger">{error}</Notice>
        </div>
      )}
      {loading && !preview && <p className="mt-6 text-muted">Собираем страницы из ваших ответов… обычно это несколько секунд.</p>}
      {preview && preview.warnings.length > 0 && (
        <div className="mt-5">
          <Notice title={`Чтобы ${noun === 'игры' ? 'игра получилась' : noun === 'книги' ? 'книга получилась' : 'номер получился'} насыщеннее`}>
            <ul className="list-disc space-y-1 pl-5">
              {preview.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </Notice>
        </div>
      )}
      {preview && (
        <div className="mt-6">
          <LayoutPages pages={preview.pages} spreads={READ_AS_SPREADS[project.productId]} />
        </div>
      )}
    </section>
  );
}
