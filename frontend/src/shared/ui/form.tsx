import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../lib/cn';

const control =
  'w-full bg-field text-ink border border-line px-4 text-base placeholder:text-muted/70 transition-colors focus:outline-2 focus:outline-[var(--focus)] focus:outline-offset-0 aria-[invalid=true]:border-danger';

export function FieldShell({
  id,
  label,
  hint,
  error,
  required,
  children,
  as = 'div',
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  as?: 'div' | 'fieldset';
}) {
  const Tag = as;
  const LabelTag = as === 'fieldset' ? 'legend' : 'label';
  return (
    <Tag className="flex min-w-0 flex-col gap-2">
      <LabelTag {...(as === 'div' ? { htmlFor: id } : {})} className="text-[15px] font-medium leading-snug">
        {label}
        {!required && <span className="ml-1.5 font-normal text-muted">необязательно</span>}
      </LabelTag>
      {hint && (
        <p id={`${id}-hint`} className="-mt-1 text-sm leading-relaxed text-muted">
          {hint}
        </p>
      )}
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </Tag>
  );
}

export function describedBy(id: string, hint?: string, error?: string) {
  return [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
}

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input {...props} className={cn(control, 'h-12 rounded-control', className)} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea {...props} className={cn(control, 'resize-y rounded-card py-3 leading-relaxed', className)} />;
}

export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <select {...props} className={cn(control, 'h-12 rounded-control appearance-none bg-[length:12px] bg-[right_1rem_center] bg-no-repeat pr-10', className)}
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%23777' stroke-width='1.6'/%3E%3C/svg%3E\")" }}
    >
      {children}
    </select>
  );
}
