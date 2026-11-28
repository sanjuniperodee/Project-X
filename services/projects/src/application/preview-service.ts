import { isEditable, templateDraft, type LayoutPreviewPagesRequest, type ProjectPreview } from '@px/contracts';
import { AppError } from '@px/service-kit';
import type { ProjectService } from './project-service';
import type { CatalogGateway } from './ports';

/** Layout service, private network: page previews of the current answers. */
export interface LayoutPreviewGateway {
  previewPages(request: LayoutPreviewPagesRequest): Promise<Omit<ProjectPreview, 'generatedAt'>>;
}

/** Previews stay valid until the project changes; a burst of clicks renders once. */
interface Cached {
  updatedAt: string;
  preview: Promise<ProjectPreview>;
}

/**
 * The issue as it will look, before the materials go to the editors: the customer pays the deposit, fills in the
 * questionnaire and sees the pages built from their own answers (texts as written — the model edits them after the
 * submit). Before the deposit there is nothing to show: rendering costs the studio server time.
 */
export class PreviewService {
  private readonly cache = new Map<string, Cached>();

  constructor(
    private readonly projects: ProjectService,
    private readonly catalog: CatalogGateway,
    private readonly layout: LayoutPreviewGateway,
  ) {}

  async preview(editKey: string): Promise<ProjectPreview> {
    const project = await this.projects.view(editKey);
    if (project.status === 'draft') throw AppError.conflict('Внесите предоплату, чтобы увидеть превью номера');
    if (!isEditable(project.status)) throw AppError.conflict('Материалы уже в редакции — макет появится в кабинете');

    const cached = this.cache.get(project.id);
    if (cached && cached.updatedAt === project.updatedAt) return cached.preview;

    const preview = (async () => {
      const [source, product] = await Promise.all([this.projects.layoutSource(project.id), this.catalog.product(project.productId)]);
      const draft = templateDraft({ product, subject: source.subject, answers: source.answers, contributions: source.contributions });
      const result = await this.layout.previewPages({ source, draft });
      return { ...result, generatedAt: new Date().toISOString() };
    })();
    this.cache.set(project.id, { updatedAt: project.updatedAt, preview });
    preview.catch(() => this.cache.delete(project.id));
    if (this.cache.size > 500) this.cache.delete(this.cache.keys().next().value!);
    return preview;
  }
}
