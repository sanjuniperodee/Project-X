import type { ComponentType } from 'react';
import type { Product, ProductId } from '@px/contracts';

export interface LandingProps {
  product: Product;
  /** Builds a link inside this brand (works on the hub path and on the brand's own domain). */
  href: (path: string) => string;
}

/**
 * Presentation of one product. Business data (prices, questionnaire) comes from
 * the catalog service; everything about look and words lives here.
 */
export interface BrandDefinition {
  id: ProductId;
  name: string;
  metadata: { title: string; description: string };
  Logo: ComponentType<{ className?: string }>;
  Landing: ComponentType<LandingProps>;
  /** Optional widget for the voice studio, fed by the live answers (`useStudioAnswers`). */
  VoicePreview?: ComponentType;
  /** Short call to action used in the header and final blocks. */
  cta: string;
  /** Classes for the site chrome, so app pages wear the brand too. */
  chrome: { header: string; footer: string };
  copy: {
    subjectLabel: string;
    subjectPlaceholder: string;
    subjectHint: string;
    createTitle: string;
    createLead: string;
    workspaceTitle: (subject: string) => string;
    submitLabel: string;
    submitHint: string;
    /** Message pre-filled in WhatsApp when sharing the invite link. */
    inviteMessage: (subject: string, link: string) => string;
    contributionThanks: string;
    /** Heading above the AI draft's cards (cover lines, relatives, game deck). */
    draftCardsTitle: string;
  };
}
