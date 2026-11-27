import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-5 px-6">
      <h1 className="font-display text-4xl font-semibold">Такой страницы нет</h1>
      <p className="leading-relaxed text-muted">
        Возможно, ссылка устарела или в ней опечатка. Если это ссылка на ваш проект, проверьте, что скопировали её полностью.
      </p>
      <Link href="/" className="underline underline-offset-4">
        Перейти на главную
      </Link>
    </main>
  );
}
