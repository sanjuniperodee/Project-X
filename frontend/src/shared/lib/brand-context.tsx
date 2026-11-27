'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { ProductId } from '@px/contracts';
import { joinPath } from './brand-routing';

interface BrandContextValue {
  brand: ProductId;
  base: string;
  href: (path: string) => string;
}

const BrandContext = createContext<BrandContextValue | null>(null);

export function BrandProvider({ brand, base, children }: { brand: ProductId; base: string; children: ReactNode }) {
  const value = useMemo(() => ({ brand, base, href: (path: string) => joinPath(base, path) }), [brand, base]);
  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

export function useBrand(): BrandContextValue {
  const value = useContext(BrandContext);
  if (!value) throw new Error('useBrand must be used inside <BrandProvider>');
  return value;
}
