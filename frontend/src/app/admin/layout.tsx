import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AdminShell } from '@/features/admin/shell/admin-shell';
import { studioAttention } from '@/features/admin/lib/attention';
import { getScope } from '@/features/admin/scope/scope';
import { api } from '@/shared/api/server';
import { SITE } from '@/shared/config/site';

export const metadata: Metadata = { title: `Студия — ${SITE.name}`, robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const scope = await getScope();
  // Counters in the sidebar; a section that cannot be reached shows none rather than breaking the page.
  const [stats, chats] = await Promise.all([api.admin.stats(scope ?? undefined).catch(() => null), api.admin.conversations.list().catch(() => [])]);
  const attention = stats ? studioAttention(stats.attention) : 0;
  const byProduct = stats?.byProduct ?? [];
  const active = { all: byProduct.reduce((sum, p) => sum + p.active, 0), ...Object.fromEntries(byProduct.map((p) => [p.productId, p.active])) };
  return (
    <AdminShell scope={scope} counts={{ attention, chats: chats.filter((c) => c.mode === 'human').length, active }}>
      {children}
    </AdminShell>
  );
}
