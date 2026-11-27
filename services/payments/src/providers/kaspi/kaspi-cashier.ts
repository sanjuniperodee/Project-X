import { AppError } from '@px/service-kit';
import type { KaspiPosClient, KaspiSession } from './kaspi-pos-client';
import { kaspiPhone } from './kaspi-protocol';

const record = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

/**
 * Cashier login of kaspi-pos: init → SMS to the cashier phone → code. Kaspi keeps one session per cashier,
 * so Project X has its own Kaspi Pay cashier account and its own kaspi-pos instance.
 */
export class KaspiCashier {
  constructor(private readonly client: KaspiPosClient) {}

  async requestCode(rawPhone: string): Promise<{ processId: string }> {
    const phone = kaspiPhone(rawPhone);
    if (!phone) throw AppError.validation({ phone: 'Номер кассира Kaspi Pay: мобильный номер Казахстана' });
    const init = record(await this.client.call('/api/auth/init', 'auth', { method: 'POST', session: false }));
    const processId = String(init?.processId ?? record(init?.data)?.processId ?? '');
    if (!processId) throw new AppError('unavailable', 'kaspi-pos не начал вход (нет processId)');
    await this.client.call('/api/auth/send-phone', 'auth', { json: { phoneNumber: phone, processId }, session: false });
    return { processId };
  }

  async verify(processId: string, otp: string): Promise<KaspiSession> {
    const res = record(await this.client.call('/api/auth/verify-otp', 'auth', { json: { processId, otp }, session: false }));
    const view = record(res?.view);
    if (view?.code === 'KPEnterLoginPassword' || view?.code === 'KPMobileCall') {
      throw AppError.conflict(`Kaspi просит подтвердить вход в приложении Kaspi Pay (${String(view.code)}). Подтвердите и повторите`);
    }
    const data = record(res?.data) ?? res;
    const tokenSn = String(data?.tokenSN ?? '');
    const vtokenSecret = String(data?.vtokenSecret ?? '');
    if (!tokenSn || !vtokenSecret) throw AppError.validation({ otp: 'Неверный код из SMS' });
    return {
      tokenSn,
      vtokenSecret,
      profileId: Number(data?.profileId ?? 0),
      orgName: String(data?.orgName ?? ''),
      phone: String(data?.phone ?? ''),
      connectedAt: new Date().toISOString(),
    };
  }

  /** null: kaspi-pos is unreachable, so it is unknown whether the session still works. */
  async active(session: KaspiSession): Promise<boolean | null> {
    try {
      return record(await this.client.call('/api/session/check', 'read', { session }))?.active === true;
    } catch (error) {
      return error instanceof AppError && /истекла/.test(error.message) ? false : null;
    }
  }
}
