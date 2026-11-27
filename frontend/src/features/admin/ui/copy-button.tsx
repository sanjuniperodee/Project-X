'use client';

import { useState } from 'react';

/** Copies a text or a site path (made absolute with the current origin) and confirms for a moment. */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text.startsWith('/') ? `${window.location.origin}${text}` : text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="h-8 rounded-control border border-line bg-surface px-3 text-[13px] hover:bg-bg"
    >
      {copied ? 'Скопировано' : label}
    </button>
  );
}
