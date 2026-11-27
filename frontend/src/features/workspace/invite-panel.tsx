'use client';

import { useState } from 'react';
import { plural } from '@/shared/lib/plural';
import { Button } from '@/shared/ui/button';

export function InvitePanel({
  title,
  description,
  url,
  message,
  count,
  accepting,
}: {
  title: string;
  description: string;
  url: string;
  message: string;
  count: number;
  accepting: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="rounded-card border border-line bg-surface p-5" aria-labelledby="invite-title">
      <h2 id="invite-title" className="font-display text-xl font-semibold">
        {title}
      </h2>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">{description}</p>
      {accepting ? (
        <>
          <label htmlFor="invite-url" className="sr-only">
            Ссылка-приглашение
          </label>
          <input
            id="invite-url"
            readOnly
            value={url}
            onFocus={(e) => e.target.select()}
            className="mt-4 h-11 w-full truncate rounded-control border border-line bg-field px-3 text-sm"
          />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => void copy()}>
              {copied ? 'Скопировано' : 'Скопировать'}
            </Button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(message)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center justify-center rounded-control bg-[#25d366] px-4 text-[15px] font-medium text-black hover:brightness-95"
            >
              В WhatsApp
            </a>
          </div>
        </>
      ) : (
        <p className="mt-3 text-[15px]">Приём историй закрыт: материалы уже в вёрстке.</p>
      )}
      <p className="mt-4 text-sm text-muted">{count === 0 ? 'Пока никто не ответил.' : `Уже ${plural(count, ['ответ', 'ответа', 'ответов'])}.`}</p>
    </section>
  );
}
