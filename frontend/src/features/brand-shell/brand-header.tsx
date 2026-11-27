import Link from 'next/link';
import type { BrandDefinition } from '@/brands';
import { Container } from '@/shared/ui/container';
import { cn } from '@/shared/lib/cn';

export function BrandHeader({ brand, href }: { brand: BrandDefinition; href: (path: string) => string }) {
  return (
    <header className={brand.chrome.header}>
      <Container wide className="flex h-16 items-center justify-between gap-4 sm:h-20">
        <Link href={href('/')} aria-label={`${brand.name}, на главную`} className="shrink-0">
          <brand.Logo />
        </Link>
        <Link
          href={href('/create')}
          className={cn('text-[15px] font-medium underline-offset-4 hover:underline', 'whitespace-nowrap')}
        >
          {brand.cta}
        </Link>
      </Container>
    </header>
  );
}
