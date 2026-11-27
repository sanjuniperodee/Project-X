import { randomBytes } from 'node:crypto';

/**
 * Unguessable capability keys (144 bits). Owning the edit link means owning the project,
 * the invite link only lets people add contributions — like sharing links in Google Docs.
 */
export function generateKey(): string {
  return randomBytes(18).toString('base64url');
}
