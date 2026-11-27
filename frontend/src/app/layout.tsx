import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { SITE } from '@/shared/config/site';
import { fontVariables } from '@/shared/ui/fonts';
import './globals.css';

export const metadata: Metadata = {
  title: { default: `${SITE.name} — персональные подарки`, template: `%s` },
  description: SITE.description,
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" className={fontVariables}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
