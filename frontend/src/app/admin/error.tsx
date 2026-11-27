'use client';

/** A section of the back office failed: say what happened and offer a retry, keep the sidebar. */
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="max-w-xl rounded-card border border-line bg-surface p-5">
      <h1 className="text-[16px] font-semibold">Раздел не загрузился</h1>
      <p className="mt-1 text-muted">
        Один из сервисов не ответил или ответил неожиданно. Остальные разделы работают. Попробуйте ещё раз; если не помогает,
        передайте разработчику код ниже.
      </p>
      {error.digest && <p className="mt-3 font-mono text-[12px] text-muted">{error.digest}</p>}
      <button type="button" onClick={reset} className="mt-4 h-8 rounded-control bg-ink px-3 text-white hover:bg-ink/90">
        Повторить
      </button>
    </div>
  );
}
