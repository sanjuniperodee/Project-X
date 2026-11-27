import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AdminShell } from '@/features/admin/shell/admin-shell';
import { api } from '@/shared/api/server';
import { SITE } from '@/shared/config/site';

export const metadata: Metadata = { title: `Студия — ${SITE.name}`, robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Counters in the sidebar; a section that cannot be reached shows none rather than breaking the page.
  const [stats, chats] = await Promise.all([api.admin.stats().catch(() => null), api.admin.conversations.list().catch(() => [])]);
  const a = stats?.attention;
  const attention = a ? a.unpaid + a.handoff + a.toPrint + a.toShip + a.deadlineSoon : 0;
  return <AdminShell counts={{ attention, chats: chats.filter((c) => c.mode === 'human').length }}>{children}</AdminShell>;
}
