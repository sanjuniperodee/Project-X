'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { voiceReturnKey } from './ui/studio';

/**
 * Payment pages return to the workspace. When the customer left for the payment from the
 * voice studio, this sends them back there, so the conversation ends with the layout.
 */
export function VoiceReturn({ editKey, voiceHref }: { editKey: string; voiceHref: string }) {
  const router = useRouter();
  useEffect(() => {
    const key = voiceReturnKey(editKey);
    let flagged = false;
    try {
      flagged = sessionStorage.getItem(key) === '1';
      if (flagged) sessionStorage.removeItem(key);
    } catch {
      // Storage is blocked: the workspace shows the payment result itself.
    }
    if (flagged) router.replace(voiceHref);
  }, [editKey, voiceHref, router]);
  return null;
}
