import { KaspiCashier } from '@/features/admin/integrations/kaspi-cashier';
import { SellerTrial } from '@/features/admin/integrations/seller-trial';
import { WhatsAppConnection } from '@/features/admin/integrations/whatsapp';
import { PageHeader } from '@/features/admin/ui/page-header';
import { Panel } from '@/features/admin/ui/panel';
import { api } from '@/shared/api/server';

export const dynamic = 'force-dynamic';

export default async function IntegrationsPage() {
  const [kaspi, whatsapp] = await Promise.all([api.admin.kaspi.status(), api.admin.whatsapp.status()]);
  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <PageHeader title="Настройки" description="Касса, номер WhatsApp и ИИ-продажник" />
      <Panel title="Касса Kaspi Pay">
        <KaspiCashier status={kaspi} />
      </Panel>
      <Panel title="WhatsApp студии">
        <WhatsAppConnection status={whatsapp} />
      </Panel>
      {whatsapp.botEnabled && (
        <Panel title="Проверить ИИ-продажника">
          <p className="mb-4 text-muted">Настоящая модель и цены каталога. Заказы и счета в пробном режиме не создаются.</p>
          <SellerTrial />
        </Panel>
      )}
    </div>
  );
}
