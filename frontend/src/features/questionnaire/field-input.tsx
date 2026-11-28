'use client';

import type { Field, LeafField } from '@px/contracts';
import { cn } from '@/shared/lib/cn';
import { describedBy as describe, FieldShell, Input, Select, Textarea } from '@/shared/ui/form';
import { PhotosField } from './photos-field';
import { asItems, asMedia, asString, asStrings, emptyItem, scopeErrors, type Errors, type Values } from './values';

interface FieldInputProps<F> {
  field: F;
  value: unknown;
  onChange: (value: unknown) => void;
  /** Errors relative to this field: '' for the field itself, 'players.0.name' style for nested. */
  errors: Errors;
  /** DOM id prefix, unique per form. */
  idPrefix: string;
}

/** Renders any questionnaire field from its catalog definition. */
export function FieldInput({ field, ...props }: FieldInputProps<Field>) {
  if (field.type === 'list') return <ListInput field={field} {...props} />;
  return <LeafInput field={field} {...props} />;
}

function LeafInput({ field, value, onChange, errors, idPrefix }: FieldInputProps<LeafField>) {
  const id = `${idPrefix}-${field.id}`;
  const error = errors[''];
  const aria = { 'aria-invalid': Boolean(error), 'aria-describedby': describe(id, field.hint, error) };
  const shell = { id, label: field.label, hint: field.hint, error, required: field.required };

  switch (field.type) {
    case 'text':
      return (
        <FieldShell {...shell}>
          <Input id={id} value={asString(value)} placeholder={field.placeholder} maxLength={field.maxLength} onChange={(e) => onChange(e.target.value)} {...aria} />
        </FieldShell>
      );
    case 'textarea':
      return (
        <FieldShell {...shell}>
          <Textarea
            id={id}
            value={asString(value)}
            placeholder={field.placeholder}
            maxLength={field.maxLength}
            rows={field.rows}
            onChange={(e) => onChange(e.target.value)}
            {...aria}
          />
        </FieldShell>
      );
    case 'date':
      return (
        <FieldShell {...shell}>
          <Input id={id} type="date" value={asString(value)} onChange={(e) => onChange(e.target.value)} className="max-w-60" {...aria} />
        </FieldShell>
      );
    case 'select':
      return (
        <FieldShell {...shell}>
          <Select id={id} value={asString(value)} onChange={(e) => onChange(e.target.value)} {...aria}>
            <option value="">Выберите</option>
            {field.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </FieldShell>
      );
    case 'choice': {
      const selected = field.multiple ? asStrings(value) : [asString(value)];
      const toggle = (v: string) =>
        onChange(field.multiple ? (selected.includes(v) ? selected.filter((s) => s !== v) : [...selected, v]) : v);
      return (
        <FieldShell {...shell} as="fieldset">
          {field.multiple && field.ordered && (
            <p className="mb-3 text-sm text-muted">Отмечайте по порядку: номер рядом — место рубрики в номере. Снимите отметку, чтобы поменять порядок.</p>
          )}
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3" {...aria}>
            {field.options.map((o) => {
              const checked = selected.includes(o.value);
              return (
                <label
                  key={o.value}
                  className={cn(
                    'flex cursor-pointer gap-3 rounded-card border-2 p-4 transition-colors',
                    checked ? 'border-ink bg-surface' : 'border-ink/20 hover:border-ink/50',
                  )}
                >
                  <input
                    type={field.multiple ? 'checkbox' : 'radio'}
                    name={id}
                    value={o.value}
                    checked={checked}
                    onChange={() => toggle(o.value)}
                    className="mt-1 size-4 shrink-0 accent-[var(--c-ink)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{o.label}</span>
                    {o.description && <span className="mt-0.5 block text-sm leading-relaxed text-muted">{o.description}</span>}
                  </span>
                  {/* Ordered choices: the pick order is the order in the issue, so show it. */}
                  {field.multiple && field.ordered && checked && (
                    <span
                      aria-label={`${selected.indexOf(o.value) + 1}-я по порядку`}
                      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-semibold text-bg tabular-nums"
                    >
                      {selected.indexOf(o.value) + 1}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </FieldShell>
      );
    }
    case 'photos':
      return (
        <FieldShell {...shell} as="fieldset">
          <PhotosField id={id} value={asMedia(value)} max={field.max} onChange={onChange} describedBy={describe(id, field.hint, error)} />
        </FieldShell>
      );
  }
}

function ListInput({ field, value, onChange, errors, idPrefix }: FieldInputProps<Extract<Field, { type: 'list' }>>) {
  const items = asItems(value);
  const id = `${idPrefix}-${field.id}`;
  const update = (index: number, key: string, v: unknown) =>
    onChange(items.map((item, i) => (i === index ? { ...item, [key]: v } : item)));
  const remove = (index: number) => onChange(items.filter((_, i) => i !== index));
  const add = () => onChange([...items, emptyItem(field.fields)]);

  return (
    <FieldShell id={id} label={field.label} hint={field.hint} error={errors['']} required={field.required} as="fieldset">
      <ol className="flex flex-col gap-4">
        {items.map((item: Values, index) => (
          <li key={index} className="rounded-card border border-line bg-surface p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-4">
              <p className="font-semibold">
                {field.itemLabel} {index + 1}
              </p>
              <button type="button" onClick={() => remove(index)} className="text-sm text-muted underline underline-offset-4 hover:text-danger">
                Удалить
              </button>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              {field.fields.map((leaf) => (
                <div key={leaf.id} className={cn((leaf.type === 'textarea' || leaf.type === 'photos' || leaf.type === 'choice') && 'md:col-span-2')}>
                  <LeafInput
                    field={leaf}
                    value={item[leaf.id]}
                    onChange={(v) => update(index, leaf.id, v)}
                    errors={leafErrors(errors, `${index}.${leaf.id}`)}
                    idPrefix={`${id}-${index}`}
                  />
                </div>
              ))}
            </div>
          </li>
        ))}
      </ol>
      {items.length < field.max && (
        <button
          type="button"
          onClick={add}
          className="self-start rounded-control border-2 border-dashed border-line px-4 py-2.5 font-medium transition-colors hover:border-ink"
        >
          + {field.addLabel}
        </button>
      )}
    </FieldShell>
  );
}

/** Errors for a nested leaf: its own error under '' plus anything deeper. */
function leafErrors(errors: Errors, path: string): Errors {
  const scoped = scopeErrors(errors, path);
  if (errors[path]) scoped[''] = errors[path];
  return scoped;
}

/** Errors for a top-level field of a step. */
export function fieldErrors(errors: Errors, fieldId: string): Errors {
  return leafErrors(errors, fieldId);
}
