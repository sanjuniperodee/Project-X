import type { KaspiCashierStatus } from '@px/contracts';
import { AppError } from '@px/service-kit';
import type { KaspiCashier } from '../providers/kaspi/kaspi-cashier';
import type { KaspiSession, KaspiSessionSource } from '../providers/kaspi/kaspi-pos-client';
import type { SettingsStore } from './ports';

const KEY = 'kaspi.session';
const CACHE_MS = 30_000;

/**
 * The Kaspi Pay cashier of the studio: connected from /admin by SMS, kept encrypted in the payments DB,
 * so an expired session is fixed by the studio without a deploy. A session from the environment is the fallback.
 */
export class CashierService implements KaspiSessionSource {
  private cached: { at: number; session: KaspiSession | null } | null = null;

  constructor(
    private readonly store: SettingsStore,
    private readonly cashier: KaspiCashier | null,
    private readonly fallback: KaspiSession | null = null,
  ) {}

  async session(): Promise<KaspiSession | null> {
    if (this.cached && Date.now() - this.cached.at < CACHE_MS) return this.cached.session;
    const raw = await this.store.get(KEY);
    const session = raw ? (JSON.parse(raw) as KaspiSession) : this.fallback;
    this.cached = { at: Date.now(), session };
    return session;
  }

  async status(): Promise<KaspiCashierStatus> {
    if (!this.cashier) {
      return { enabled: false, connected: false, active: null, source: null, orgName: null, phone: null, connectedAt: null };
    }
    this.cached = null;
    const stored = await this.store.get(KEY);
    const session = await this.session();
    return {
      enabled: true,
      connected: !!session,
      active: session ? await this.cashier.active(session) : null,
      source: session ? (stored ? 'settings' : 'env') : null,
      orgName: session?.orgName || null,
      phone: session?.phone ? maskPhone(session.phone) : null,
      connectedAt: session?.connectedAt || null,
    };
  }

  async requestCode(phone: string) {
    return this.require().requestCode(phone);
  }

  async verify(processId: string, otp: string): Promise<KaspiCashierStatus> {
    const session = await this.require().verify(processId, otp);
    await this.store.set(KEY, JSON.stringify(session));
    this.cached = null;
    return this.status();
  }

  async disconnect(): Promise<KaspiCashierStatus> {
    await this.store.set(KEY, null);
    this.cached = null;
    return this.status();
  }

  private require(): KaspiCashier {
    if (!this.cashier) throw AppError.conflict('Оплата идёт не через Kaspi (PAYMENT_PROVIDER)');
    return this.cashier;
  }
}

function maskPhone(phone: string) {
  const d = phone.replace(/\D/g, '');
  return d.length >= 10 ? `+${d.slice(0, d.length - 7)} *** ** ${d.slice(-2)}` : phone;
}
