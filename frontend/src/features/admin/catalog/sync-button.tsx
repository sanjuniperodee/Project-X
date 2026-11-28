'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/shared/ui/button';
import { Notice } from '@/shared/ui/notice';
import { syncCatalog, type SyncState } from './actions';

export function SyncButton({ disabled }: { disabled: boolean }) {
  const [state, setState] = useState<SyncState | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      <div>
        <Button disabled={disabled} loading={pending} onClick={() => start(async () => setState(await syncCatalog()))}>
          Синхронизировать с WhatsApp
        </Button>
      </div>
      {state?.done && <Notice tone="success">{state.done}</Notice>}
      {state && state.skipped.length > 0 && <Notice tone="info" title="Пропущено">{state.skipped.join('; ')}</Notice>}
      {state?.error && <Notice tone="danger">{state.error}</Notice>}
    </div>
  );
}
