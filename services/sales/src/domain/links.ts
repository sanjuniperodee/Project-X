import type { ProductId } from '@px/contracts';

/**
 * Customer-facing links. The bot never writes URLs itself: every link in its messages comes from here,
 * so it can only point at the studio's own sites.
 */
export class Links {
  constructor(
    private readonly frontendUrl: string,
    private readonly productUrls: Partial<Record<ProductId, string>>,
  ) {}

  /** Brand site root: its own domain when configured, otherwise the hub path. */
  brand(productId: ProductId): string {
    return (this.productUrls[productId] ?? `${this.frontendUrl.replace(/\/$/, '')}/${productId}`).replace(/\/$/, '');
  }

  workspace(productId: ProductId, editKey: string) {
    return `${this.brand(productId)}/p/${editKey}`;
  }

  invite(productId: ProductId, inviteKey: string) {
    return `${this.brand(productId)}/invite/${inviteKey}`;
  }

  /** Every URL the bot is allowed to send starts with one of these. */
  allowedOrigins(): string[] {
    const urls = [this.frontendUrl, ...Object.values(this.productUrls)].filter(Boolean) as string[];
    return [...new Set(urls.map((u) => new URL(u).origin))];
  }
}

/** Drops any URL that does not point at our sites (the model may echo a link a customer sent). */
export function stripForeignLinks(text: string, allowed: string[]): string {
  return text.replace(/https?:\/\/[^\s)]+/g, (url) => {
    try {
      return allowed.includes(new URL(url).origin) ? url : '[ссылка удалена]';
    } catch {
      return '[ссылка удалена]';
    }
  });
}
