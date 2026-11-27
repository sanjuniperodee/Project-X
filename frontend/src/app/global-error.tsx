'use client';

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ru">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: 32 }}>
        <h1>Что-то пошло не так</h1>
        <p>Страница не загрузилась. Обновите её или попробуйте через минуту.</p>
        <button type="button" onClick={reset}>
          Обновить
        </button>
      </body>
    </html>
  );
}
