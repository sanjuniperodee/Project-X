import type { SVGProps } from 'react';

/** Line icons of the back office, 20×20, drawn on a 24 grid with a 1.7 stroke. */
function icon(paths: React.ReactNode) {
  return function Icon(props: SVGProps<SVGSVGElement>) {
    return (
      <svg aria-hidden viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}>
        {paths}
      </svg>
    );
  };
}

export const Icons = {
  overview: icon(
    <>
      <rect x="3.5" y="3.5" width="7" height="8" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="5" rx="1.5" />
      <rect x="13.5" y="11.5" width="7" height="9" rx="1.5" />
      <rect x="3.5" y="14.5" width="7" height="6" rx="1.5" />
    </>,
  ),
  orders: icon(
    <>
      <path d="M4 7.5 12 3.5l8 4v9l-8 4-8-4z" />
      <path d="m4 7.5 8 4 8-4M12 11.5v9" />
    </>,
  ),
  customers: icon(
    <>
      <circle cx="9" cy="8.5" r="3.5" />
      <path d="M2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5" />
      <path d="M16 5.2a3.5 3.5 0 0 1 0 6.6M18.2 14.8c1.8.7 3 2.5 3.3 5.2" />
    </>,
  ),
  chats: icon(<path d="M20.5 11.5a8 8 0 0 1-11.7 7.1L4 20l1.3-4.3A8 8 0 1 1 20.5 11.5Z" />),
  catalog: icon(
    <>
      <path d="M4 9.5 5.5 4h13L20 9.5" />
      <path d="M4 9.5h16v1a3 3 0 0 1-5.3 1.9A3 3 0 0 1 12 13.5a3 3 0 0 1-2.7-1.1A3 3 0 0 1 4 10.5z" />
      <path d="M5.5 13.2V20h13v-6.8" />
    </>,
  ),
  settings: icon(
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </>,
  ),
  usage: icon(
    <>
      <path d="M12 3.5 14 9l5.5 2-5.5 2-2 5.5-2-5.5L4.5 11 10 9z" />
      <path d="M19 3.5v3M17.5 5h3" />
    </>,
  ),
  search: icon(
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </>,
  ),
  external: icon(<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />),
  chevrons: icon(<path d="m8 9 4-4 4 4M8 15l4 4 4-4" />),
  check: icon(<path d="m5 12.5 4.5 4.5L19 7.5" />),
  table: icon(
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10" />
    </>,
  ),
  board: icon(
    <>
      <rect x="3.5" y="4.5" width="5" height="15" rx="1.5" />
      <rect x="10" y="4.5" width="5" height="10" rx="1.5" />
      <rect x="16.5" y="4.5" width="4" height="7" rx="1.5" />
    </>,
  ),
  whatsapp: icon(
    <>
      <path d="M20.5 11.5a8 8 0 0 1-11.7 7.1L4 20l1.3-4.3A8 8 0 1 1 20.5 11.5Z" />
      <path d="M9 8.5c0 3.5 2.5 6 6 6l1-1.5-2-1-1 .8a4 4 0 0 1-2.3-2.3l.8-1-1-2z" />
    </>,
  ),
  arrowUp: icon(<path d="M12 19V5M6 11l6-6 6 6" />),
  arrowDown: icon(<path d="M12 5v14M6 13l6 6 6-6" />),
};
