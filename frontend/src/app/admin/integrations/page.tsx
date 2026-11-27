import { permanentRedirect } from 'next/navigation';

/** The section was renamed to «Настройки». */
export default function LegacyIntegrationsPage() {
  permanentRedirect('/admin/settings');
}
