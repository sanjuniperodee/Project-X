'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { RequestLayoutChangesRequest, type ProductId, type ProjectView } from '@px/contracts';
import { browserApi } from '@/shared/api/browser';
import { ApiError } from '@/shared/api/core';
import { buttonClass, Button, Spinner } from '@/shared/ui/button';
import { FieldShell, Textarea } from '@/shared/ui/form';
import { Notice } from '@/shared/ui/notice';
import { LayoutPages } from './layout-pages';

/** Card sheets and boards are separate prints; books and magazines are read as spreads. */
const READ_AS_SPREADS: Record<ProductId, boolean> = { glossy: true, shezhire: true, boardgame: false };

const POLL_INTERVAL = 6000;
const POLL_ATTEMPTS = 60;

/**
 * The layout in the customer's workspace: page previews, PDF, and the decision —
 * «Согласовать» (the balance payment opens) or «Нужны правки» (the layout is rebuilt).
 */
export function LayoutReview({
  editKey,
  project,
  onChange,
}: {
  editKey: string;
  project: ProjectView;
  onChange: (project: ProjectView) => void;
}) {
  const router = useRouter();
  const { layout, design, status } = project;
  const deciding = status === 'awaiting_approval' && layout?.status === 'pending';
  const waitingForAutomaticLayout = status === 'in_design' && design.mode === 'auto';

  // The layout arrives asynchronously (AI draft → layout service → projects): poll while it is being made.
  const [attempts, setAttempts] = useState(0);
  useEffect(() => {
    if (!waitingForAutomaticLayout || attempts >= POLL_ATTEMPTS) return;
    const t = setTimeout(() => {
      setAttempts((a) => a + 1);
      router.refresh();
    }, POLL_INTERVAL);
    return () => clearTimeout(t);
  }, [waitingForAutomaticLayout, attempts, router]);

  if (status === 'in_design') {
    return (
      <section aria-labelledby="layout-title" className="rounded-card border-2 border-ink bg-surface p-6 sm:p-8">
        <h2 id="layout-title" className="font-display text-2xl font-semibold">
          Макет
        </h2>
        {layout?.status === 'changes_requested' && layout.feedback && (
          <p className="mt-3 max-w-[60ch] leading-relaxed text-muted">Ваши правки к версии {layout.version}: «{layout.feedback}»</p>
        )}
        <div className="mt-5">
          {design.mode === 'auto' ? (
            <p className="flex items-center gap-3 text-[15px]" role="status">
              <Spinner />
              {layout ? 'Вносим правки и пересобираем макет.' : 'Верстаем макет по вашим материалам.'} Обычно это занимает несколько минут — страница обновится сама.
            </p>
          ) : (
            <Notice title="Макет доделывает дизайнер студии">
              Мы напишем в WhatsApp, как только новая версия будет готова. Обычно это занимает 1–2 рабочих дня.
            </Notice>
          )}
        </div>
      </section>
    );
  }

  if (!layout || layout.status === 'discarded') return null;

  return (
    <section id="layout" aria-labelledby="layout-title" className="scroll-mt-6 rounded-card border-2 border-ink bg-surface p-5 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted">Версия {layout.version}</p>
          <h2 id="layout-title" className="mt-1 font-display text-3xl font-semibold">
            {deciding ? 'Макет готов' : layout.status === 'approved' ? 'Макет согласован' : 'Макет'}
          </h2>
          {deciding && (
            <p className="mt-2 max-w-[62ch] leading-relaxed text-muted">
              Пролистайте все страницы. Если всё нравится — согласуйте, и откроется оплата остатка. Если нет — опишите правки, и мы
              пересоберём макет.
            </p>
          )}
        </div>
        <a href={layout.pdfUrl} target="_blank" rel="noreferrer" className={buttonClass('secondary')}>
          Открыть PDF
        </a>
      </div>

      <div className="mt-6">
        <LayoutPages pages={layout.pages} spreads={READ_AS_SPREADS[project.productId]} />
      </div>

      {deciding && <Decision editKey={editKey} project={project} onChange={onChange} />}
      {status === 'awaiting_approval' && layout.status === 'approved' && (
        <div className="mt-6">
          <Notice tone="success" title="Спасибо, макет согласован">
            Осталось оплатить остаток — после оплаты отправим заказ в печать.
          </Notice>
        </div>
      )}
    </section>
  );
}

function Decision({ editKey, project, onChange }: { editKey: string; project: ProjectView; onChange: (project: ProjectView) => void }) {
  const version = project.layout!.version;
  const [mode, setMode] = useState<'idle' | 'changes'>('idle');
  const [comment, setComment] = useState('');
  const [pending, setPending] = useState<'approve' | 'changes' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const roundsLeft = project.design.mode === 'auto' ? Math.max(0, project.design.revisionsLimit - project.design.revisionsUsed) : 0;

  async function run(action: 'approve' | 'changes') {
    setError(null);
    if (action === 'changes') {
      const parsed = RequestLayoutChangesRequest.safeParse({ version, comment });
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? 'Опишите правки');
        return;
      }
    }
    setPending(action);
    try {
      const updated =
        action === 'approve'
          ? await browserApi.approveLayout(editKey, version)
          : await browserApi.requestLayoutChanges(editKey, { version, comment });
      onChange(updated);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не получилось отправить. Проверьте интернет и попробуйте ещё раз.');
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="mt-8 border-t border-line pt-6">
      {mode === 'idle' ? (
        <div className="flex flex-wrap gap-3">
          <Button size="lg" loading={pending === 'approve'} onClick={() => void run('approve')}>
            Согласовать макет
          </Button>
          <Button size="lg" variant="secondary" onClick={() => setMode('changes')}>
            Нужны правки
          </Button>
        </div>
      ) : (
        <form
          className="flex max-w-2xl flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run('changes');
          }}
        >
          <FieldShell id="layout-changes" label="Что поправить" hint="Укажите страницу и что изменить: текст, имя, дату или фото." required>
            <Textarea
              id="layout-changes"
              rows={5}
              maxLength={2000}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Стр. 4: в имени опечатка, правильно «Әсел». На обложке хочется заголовок посмелее."
              autoFocus
            />
          </FieldShell>
          <p className="text-sm leading-relaxed text-muted">
            {roundsLeft > 0
              ? `Новая версия будет готова через несколько минут. Автоматических кругов правок осталось: ${roundsLeft}, дальше макет доработает дизайнер.`
              : 'Эти правки внесёт дизайнер студии вручную — обычно это 1–2 рабочих дня.'}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" size="lg" loading={pending === 'changes'}>
              Отправить правки
            </Button>
            <Button variant="ghost" onClick={() => setMode('idle')}>
              Отмена
            </Button>
          </div>
        </form>
      )}
      {error && (
        <div className="mt-4">
          <Notice tone="danger">{error}</Notice>
        </div>
      )}
    </div>
  );
}
