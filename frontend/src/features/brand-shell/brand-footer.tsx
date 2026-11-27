import Link from 'next/link';
import type { BrandDefinition } from '@/brands';
import { SITE } from '@/shared/config/site';
import { Container } from '@/shared/ui/container';

export function BrandFooter({ brand }: { brand: BrandDefinition }) {
  const year = new Date().getFullYear();
  return (
    <footer className={brand.chrome.footer}>
      <Container wide className="flex flex-col gap-6 py-10 text-sm sm:flex-row sm:items-center sm:justify-between">
        <brand.Logo />
        <div className="flex flex-col gap-1 sm:items-end">
          <p>
            {brand.name} — проект студии{' '}
            <Link href="/" className="underline underline-offset-4">
              {SITE.name}
            </Link>
            , {SITE.city}
          </p>
          <p className="opacity-70">
            WhatsApp {SITE.whatsapp}. © {year}
          </p>
        </div>
      </Container>
    </footer>
  );
}
