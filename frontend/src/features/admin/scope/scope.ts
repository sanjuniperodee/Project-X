import 'server-only';
import { cookies } from 'next/headers';
import { parseScope, SCOPE_COOKIE, type Scope } from './projects';

/** The project the studio member chose in the sidebar (kept in a cookie), or `null` for all projects. */
export async function getScope(): Promise<Scope> {
  return parseScope((await cookies()).get(SCOPE_COOKIE)?.value);
}
