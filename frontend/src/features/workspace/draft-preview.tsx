import type { Draft } from '@px/contracts';

/** The AI-assembled content draft the designer works from. */
export function DraftPreview({ draft, cardsTitle }: { draft: Draft; cardsTitle: string }) {
  return (
    <section aria-labelledby="draft-title" className="rounded-card border-2 border-ink bg-surface p-6 sm:p-10">
      <p className="text-sm text-muted">Черновик текстов, по нему верстаем макет</p>
      <h2 id="draft-title" className="mt-3 font-display text-4xl leading-tight font-semibold sm:text-5xl">
        {draft.title}
      </h2>
      <p className="mt-4 max-w-[60ch] text-lg leading-relaxed">{draft.lead}</p>
      <div className="mt-10 grid gap-10 lg:grid-cols-2">
        {draft.sections.map((section) => (
          <article key={section.heading}>
            <h3 className="font-display text-2xl font-semibold">{section.heading}</h3>
            <p className="mt-3 leading-relaxed whitespace-pre-line text-ink/85">{section.body}</p>
          </article>
        ))}
      </div>
      {draft.cards.length > 0 && (
        <>
          <h3 className="mt-12 font-display text-2xl font-semibold">{cardsTitle}</h3>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {draft.cards.map((card, i) => (
              <li key={`${card.title}-${i}`} className="rounded-card border border-line p-4">
                <p className="font-semibold">{card.title}</p>
                <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{card.text}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
