import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap rounded-control transition-[transform,background-color,box-shadow] duration-150 disabled:opacity-50 disabled:pointer-events-none select-none';

const variants: Record<Variant, string> = {
  primary:
    'bg-accent text-accent-ink border-2 border-[var(--btn-border)] shadow-[var(--btn-shadow)] hover:brightness-95 active:translate-x-px active:translate-y-px active:shadow-none',
  secondary: 'bg-transparent text-ink border-2 border-ink hover:bg-ink hover:text-bg',
  ghost: 'bg-transparent text-ink underline underline-offset-4 decoration-1 hover:decoration-2 px-0!',
};

const sizes: Record<Size, string> = {
  md: 'h-11 px-5 text-[15px]',
  lg: 'h-14 px-7 text-base',
};

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

interface ButtonOwnProps {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: ReactNode;
}

export function Button({
  variant,
  size,
  loading,
  className,
  children,
  disabled,
  ...props
}: ButtonOwnProps & ComponentProps<'button'>) {
  return (
    <button
      type="button"
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass(variant, size, className)}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant,
  size,
  className,
  children,
  ...props
}: Omit<ButtonOwnProps, 'loading'> & ComponentProps<typeof Link>) {
  return (
    <Link {...props} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent', className)}
    />
  );
}
