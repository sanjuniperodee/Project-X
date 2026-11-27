import Link from 'next/link';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { SITE } from '@/shared/config/site';
import { Container } from '@/shared/ui/container';

export const metadata: Metadata = { title: `Заказы — ${SITE.name}`, robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface">
        <Container wide className="flex h-16 items-center justify-between">
          <Link href="/admin" className="font-semibold">
            {SITE.name}: заказы
          </Link>
          <Link href="/" className="text-sm text-muted underline-offset-4 hover:underline">
            Сайт
          </Link>
        </Container>
      </header>
      <Container wide className="py-8">
        {children}
      </Container>
    </div>
  );
}
