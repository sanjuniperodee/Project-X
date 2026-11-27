import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export function Container({ children, className, wide }: { children: ReactNode; className?: string; wide?: boolean }) {
  return <div className={cn('mx-auto w-full px-4 sm:px-6 lg:px-10', wide ? 'max-w-[1440px]' : 'max-w-6xl', className)}>{children}</div>;
}
