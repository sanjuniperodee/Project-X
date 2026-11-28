import { isEditable, type StartVoiceSessionRequest, type VoiceSessionView } from '@px/contracts';
import { AppError, type Logger } from '@px/service-kit';
import { editVariables, interviewVariables } from '../agent/context';
import type { CatalogGateway, ProjectsGateway, VoiceProvider } from './ports';

export interface VoiceServiceDeps {
  projects: ProjectsGateway;
  catalog: CatalogGateway;
  /** Absent: no realtime agent is configured, pages fall back to the scripted interviewer. */
  provider?: VoiceProvider;
  log: Logger;
}

/** Starts voice conversations about a project: checks that the mode fits its state and briefs the agent. */
export class VoiceService {
  constructor(private readonly deps: VoiceServiceDeps) {}

  async startSession({ editKey, mode }: StartVoiceSessionRequest): Promise<VoiceSessionView> {
    const project = await this.deps.projects.project(editKey);
    if (mode === 'interview' && !isEditable(project.status)) {
      throw AppError.conflict('Материалы уже отправлены: анкету больше не изменить');
    }
    if (mode === 'edit' && !(project.status === 'awaiting_approval' && project.layout?.status === 'pending')) {
      throw AppError.conflict('Сейчас нет макета, который ждёт вашего решения');
    }
    if (!this.deps.provider) return { provider: 'browser' };

    const product = await this.deps.catalog.product(project.productId);
    const dynamicVariables = mode === 'interview' ? interviewVariables(product, project) : editVariables(product, project);
    try {
      const credential = await this.deps.provider.startConversation();
      return { provider: 'elevenlabs', ...credential, dynamicVariables };
    } catch (error) {
      // The conversation still happens, on the browser's own speech: a provider outage must not block an order.
      this.deps.log.error({ err: error, projectId: project.id }, 'Voice provider failed, falling back to the browser');
      return { provider: 'browser' };
    }
  }
}
