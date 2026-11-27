import { KaspiCashier } from '@/features/admin/integrations/kaspi-cashier';
import { SellerTrial } from '@/features/admin/integrations/seller-trial';
import { WhatsAppConnection } from '@/features/admin/integrations/whatsapp';
import { api } from '@/shared/api/server';

export const dynamic = 'force-dynamic';

export default async function IntegrationsPage() {
  const [kaspi, whatsapp] = await Promise.all([api.admin.kaspi.status(), api.admin.whatsapp.status()]);
  return (
    <div className="flex max-w-2xl flex-col gap-12">
      <h1 className="font-display text-2xl font-semibold">Интеграции</h1>
      <section aria-labelledby="kaspi-title" className="flex flex-col gap-4">
        <h2 id="kaspi-title" className="text-lg font-semibold">
          Касса Kaspi Pay
        </h2>
        <KaspiCashier status={kaspi} />
      </section>
      <section aria-labelledby="wa-title" className="flex flex-col gap-4">
        <h2 id="wa-title" className="text-lg font-semibold">
          WhatsApp студии
        </h2>
        <WhatsAppConnection status={whatsapp} />
      </section>
      {whatsapp.botEnabled && (
        <section aria-labelledby="trial-title" className="flex flex-col gap-4">
          <h2 id="trial-title" className="text-lg font-semibold">
            Проверить ИИ-продажника
          </h2>
          <p className="text-muted">Настоящая модель и цены каталога. Заказы и счета в пробном режиме не создаются.</p>
          <SellerTrial />
        </section>
      )}
    </div>
  );
}
