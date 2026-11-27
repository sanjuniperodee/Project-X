import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { SettingsStore } from '../application/ports';
import type { Database } from './db/client';
import { settings } from './db/schema';

/**
 * Settings in the payments DB, encrypted with AES-256-GCM (`v1.<iv>.<tag>.<data>`, base64url) under SETTINGS_SECRET.
 * A database dump alone does not reveal the cashier session.
 */
export class EncryptedSettingsStore implements SettingsStore {
  private readonly key: Buffer;

  constructor(
    private readonly db: Database,
    secret: string,
  ) {
    if (secret.length < 32) throw new Error('SETTINGS_SECRET must be at least 32 characters');
    this.key = createHash('sha256').update(`px-payments-settings:${secret}`).digest();
  }

  async get(key: string): Promise<string | null> {
    const [row] = await this.db.select().from(settings).where(eq(settings.key, key)).limit(1);
    return row ? this.decrypt(row.value) : null;
  }

  async set(key: string, value: string | null): Promise<void> {
    if (value === null) {
      await this.db.delete(settings).where(eq(settings.key, key));
      return;
    }
    const sealed = this.encrypt(value);
    await this.db
      .insert(settings)
      .values({ key, value: sealed })
      .onConflictDoUpdate({ target: settings.key, set: { value: sealed, updatedAt: new Date() } });
  }

  private encrypt(plain: string) {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
    return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
  }

  /** null when the value was sealed with another secret: the setting has to be entered again. */
  private decrypt(value: string): string | null {
    const [v, iv, tag, data] = value.split('.');
    if (v !== 'v1' || !iv || !tag || data === undefined) return null;
    try {
      const d = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
      d.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([d.update(Buffer.from(data, 'base64url')), d.final()]).toString('utf8');
    } catch {
      return null;
    }
  }
}
