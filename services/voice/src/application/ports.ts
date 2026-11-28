import type { Product, ProductId, ProjectView } from '@px/contracts';

export interface ProjectsGateway {
  /** The owner's view of a project, by its edit key. */
  project(editKey: string): Promise<ProjectView>;
}

export interface CatalogGateway {
  product(id: ProductId): Promise<Product>;
}

/** A realtime voice agent the browser connects to directly. */
export interface VoiceProvider {
  /** Short-lived credential for one conversation: a WebRTC token or a signed WebSocket URL. */
  startConversation(): Promise<{ conversationToken: string } | { signedUrl: string }>;
}
