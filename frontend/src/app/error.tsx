'use client';

import { Button } from '@/shared/ui/button';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[60dvh] max-w-xl flex-col justify-center gap-5 px-6 py-20">
      <h1 className="font-display text-4xl font-semibold">Страница не загрузилась</h1>
      <p className="leading-relaxed text-muted">
        Сервер не ответил вовремя. Обычно помогает обновить страницу через минуту.
        {error.digest && <span className="mt-2 block text-sm">Код ошибки: {error.digest}</span>}
      </p>
      <div>
        <Button onClick={reset}>Обновить страницу</Button>
      </div>
    </main>
  );
}
