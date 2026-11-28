'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { parseScope, SCOPE_COOKIE } from './projects';

/**
 * Switches the back office to one project or to all of them, then opens `returnTo`
 * (the same section; a page of one order or customer falls back to its list).
 */
export async function switchScope(value: string, returnTo: string): Promise<void> {
  const scope = parseScope(value);
  const jar = await cookies();
  if (scope) jar.set(SCOPE_COOKIE, scope, { path: '/admin', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  else jar.delete({ name: SCOPE_COOKIE, path: '/admin' });
  redirect(safeReturn(returnTo));
}

function safeReturn(path: string): string {
  if (!path.startsWith('/admin')) return '/admin';
  const [pathname, search = ''] = path.split('?');
  const section = pathname!.split('/').slice(0, 3).join('/');
  // One order or customer belongs to one project: after a switch its list is the useful page.
  const detail = /^\/admin\/(orders|customers|chats)\/[^/]+/.test(pathname!);
  const params = new URLSearchParams(search);
  params.delete('productId');
  params.delete('offset');
  const query = params.toString();
  return detail ? section : `${pathname}${query ? `?${query}` : ''}`;
}
