import { AppError } from '@px/service-kit';

/** Cashier session issued by kaspi-pos after the SMS login; sent as X-Token-SN / X-Vtoken-Secret / X-Profile-Id. */
export interface KaspiSession {
  tokenSn: string;
  vtokenSecret: string;
  profileId: number;
  orgName: string;
  phone: string;
  connectedAt: string;
}

/** Where the current cashier session lives (encrypted settings in the payments DB, or fixed env values). */
export interface KaspiSessionSource {
  session(): Promise<KaspiSession | null>;
}

const TIMEOUT_MS = { auth: 20_000, write: 15_000, read: 8_000 } as const;
export type KaspiCallKind = keyof typeof TIMEOUT_MS;

/** HTTP client of kaspi-pos-automation (github.com/tapter-dev/kaspi-pos-automation, docs/API.md). */
export class KaspiPosClient {
  private readonly fetch: typeof fetch;

  constructor(
    private readonly apiUrl: string,
    private readonly sessions: KaspiSessionSource,
    fetchImpl?: typeof fetch,
  ) {
    this.fetch = fetchImpl ?? ((...args) => fetch(...args));
  }

  /** `session: false` for the login calls made before a cashier exists. */
  async call(path: string, kind: KaspiCallKind, options: { json?: unknown; method?: 'GET' | 'POST'; session?: false | KaspiSession } = {}): Promise<unknown> {
    const headers: Record<string, string> = {};
    if (options.session !== false) {
      const session = options.session ?? (await this.sessions.session());
      if (!session) throw new AppError('unavailable', 'Оплата Kaspi временно недоступна: кассир не подключён');
      headers['X-Token-SN'] = session.tokenSn;
      headers['X-Vtoken-Secret'] = session.vtokenSecret;
      if (session.profileId > 0) headers['X-Profile-Id'] = String(session.profileId);
    }
    if (options.json !== undefined) headers['Content-Type'] = 'application/json';
    let res: Response;
    try {
      res = await this.fetch(`${this.apiUrl.replace(/\/+$/, '')}${path}`, {
        method: options.method ?? (options.json === undefined ? 'GET' : 'POST'),
        headers,
        body: options.json === undefined ? undefined : JSON.stringify(options.json),
        signal: AbortSignal.timeout(TIMEOUT_MS[kind]),
      });
    } catch (error) {
      throw new AppError('unavailable', `Kaspi временно недоступен (${(error as Error).message})`);
    }
    const text = await res.text();
    if (res.status === 401 && options.session !== false) {
      throw new AppError('unavailable', 'Оплата Kaspi временно недоступна: сессия кассира истекла, подключите кассира заново в /admin');
    }
    if (!res.ok) {
      throw new AppError('unavailable', `Kaspi временно недоступен (kaspi-pos ${res.status}: ${text.replace(/\s+/g, ' ').slice(0, 160)})`);
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new AppError('unavailable', 'Kaspi временно недоступен (ответ не JSON)');
    }
  }
}
