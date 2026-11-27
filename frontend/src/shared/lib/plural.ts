const rules = new Intl.PluralRules('ru-RU');

/** plural(3, ['история', 'истории', 'историй']) → "3 истории" */
export function plural(n: number, [one, few, many]: [string, string, string]): string {
  const form = rules.select(n);
  return `${n} ${form === 'one' ? one : form === 'few' ? few : many}`;
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso),
  );
}
