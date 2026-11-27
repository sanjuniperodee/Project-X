'use client';

import { useEffect, useState, useTransition } from 'react';
import type { WhatsAppStatus } from '@px/contracts';
import { Button } from '@/shared/ui/button';
import { Notice } from '@/shared/ui/notice';
import { whatsappLogout, whatsappQr, type QrState } from './actions';

/** Studio WhatsApp number: link by QR, see who is linked, unlink. */
export function WhatsAppConnection({ status }: { status: WhatsAppStatus }) {
  const [qr, setQr] = useState<QrState | null>(null);
  const [pending, start] = useTransition();

  // A QR lives ~30 s: refresh it while it is on screen and the number is not linked yet.
  useEffect(() => {
    if (!qr?.image) return;
    const timer = setTimeout(() => start(async () => setQr(await whatsappQr())), Math.max(10, qr.seconds - 5) * 1000);
    return () => clearTimeout(timer);
  }, [qr]);

  if (!status.enabled) return <p className="text-muted">WhatsApp не настроен на этом сервере (нет шлюза GOWA).</p>;
  if (!status.reachable) return <Notice tone="danger">{status.problem ?? 'Шлюз WhatsApp не отвечает.'}</Notice>;

  if (status.loggedIn) {
    return (
      <div className="flex flex-col gap-4">
        <Notice tone="success" title={`Номер ${status.phone ? `+${status.phone}` : ''} подключён`}>
          {status.botEnabled ? 'ИИ-продажник отвечает клиентам и шлёт уведомления о заказах.' : 'Уведомления о заказах уходят, ИИ-продажник выключен.'}
        </Notice>
        <form action={whatsappLogout}>
          <Button type="submit" variant="secondary">
            Отвязать номер
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="leading-relaxed text-muted">
        На телефоне студии: WhatsApp → «Связанные устройства» → «Привязать устройство» и отсканируйте QR.
      </p>
      {qr?.image && (
        // eslint-disable-next-line @next/next/no-img-element -- data URL from the gateway
        <img src={qr.image} alt="QR для привязки WhatsApp" width={264} height={264} className="rounded-control border border-line bg-white p-2" />
      )}
      {qr?.error && <Notice tone="danger">{qr.error}</Notice>}
      <div className="flex gap-3">
        <Button loading={pending} onClick={() => start(async () => setQr(await whatsappQr()))}>
          {qr?.image ? 'Обновить QR' : 'Показать QR'}
        </Button>
        {qr?.image && (
          <Button variant="secondary" onClick={() => window.location.reload()}>
            Я отсканировал
          </Button>
        )}
      </div>
    </div>
  );
}
