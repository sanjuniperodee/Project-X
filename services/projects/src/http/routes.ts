import {
  AddNoteRequest,
  AdminProjectQuery,
  CustomerQuery,
  ApproveLayoutRequest,
  ChangeStatusRequest,
  CheckoutRequest,
  ContributionRequest,
  CreateProjectRequest,
  ProjectStatus,
  RequestLayoutChangesRequest,
  SaveStepRequest,
  z,
} from '@px/contracts';
import { parseInput, type FastifyInstance } from '@px/service-kit';
import type { ProjectService } from '../application/project-service';

const EditKeyParams = z.object({ editKey: z.string().min(10).max(64) });
const StepParams = EditKeyParams.extend({ stepId: z.string().min(1).max(64) });
const InviteParams = z.object({ inviteKey: z.string().min(10).max(64) });
const IdParams = z.object({ id: z.uuid() });

/** Customer-facing endpoints. Access is granted by the secret edit key in the URL. */
export function registerOwnerRoutes(app: FastifyInstance, projects: ProjectService) {
  app.post('/projects', async (request, reply) => {
    const body = parseInput(CreateProjectRequest, request.body);
    return reply.status(201).send(await projects.create(body));
  });

  app.get('/projects/:editKey', async (request, reply) => {
    const { editKey } = parseInput(EditKeyParams, request.params);
    reply.header('cache-control', 'no-store');
    return projects.view(editKey);
  });

  app.put('/projects/:editKey/steps/:stepId', async (request) => {
    const { editKey, stepId } = parseInput(StepParams, request.params);
    const { answers } = parseInput(SaveStepRequest, request.body);
    return projects.saveStep(editKey, stepId, answers);
  });

  app.post('/projects/:editKey/submit', async (request) => {
    const { editKey } = parseInput(EditKeyParams, request.params);
    return projects.submit(editKey);
  });

  app.post('/projects/:editKey/layout/approve', async (request) => {
    const { editKey } = parseInput(EditKeyParams, request.params);
    const { version } = parseInput(ApproveLayoutRequest, request.body);
    return projects.approveLayout(editKey, version);
  });

  app.post('/projects/:editKey/layout/changes', async (request) => {
    const { editKey } = parseInput(EditKeyParams, request.params);
    const { version, comment } = parseInput(RequestLayoutChangesRequest, request.body);
    return projects.requestLayoutChanges(editKey, version ?? null, comment);
  });

  app.post('/projects/:editKey/checkout', async (request) => {
    const { editKey } = parseInput(EditKeyParams, request.params);
    const { kind } = parseInput(CheckoutRequest, request.body);
    return projects.checkout(editKey, kind);
  });
}

/** Endpoints for invited friends / relatives / colleagues. */
export function registerInviteRoutes(app: FastifyInstance, projects: ProjectService) {
  app.get('/invites/:inviteKey', async (request) => {
    const { inviteKey } = parseInput(InviteParams, request.params);
    return projects.invite(inviteKey);
  });

  app.get('/invites/:inviteKey/issue', async (request) => {
    const { inviteKey } = parseInput(InviteParams, request.params);
    return projects.issue(inviteKey);
  });

  app.post('/invites/:inviteKey/contributions', async (request, reply) => {
    const { inviteKey } = parseInput(InviteParams, request.params);
    const body = parseInput(ContributionRequest, request.body);
    return reply.status(201).send(await projects.contribute(inviteKey, body));
  });
}

/** Studio back office. Authorisation is enforced by the gateway; these routes are never exposed directly. */
export function registerAdminRoutes(app: FastifyInstance, projects: ProjectService) {
  app.get('/admin/projects', async (request) => {
    return projects.projects(parseInput(AdminProjectQuery, request.query));
  });

  app.get('/admin/stats', async () => projects.stats());

  app.get('/admin/customers', async (request) => projects.customers(parseInput(CustomerQuery, request.query)));

  app.post('/admin/projects/:id/notes', async (request) => {
    const { id } = parseInput(IdParams, request.params);
    const { text, author } = parseInput(AddNoteRequest, request.body);
    return projects.addNote(id, { text, author: author || null });
  });

  app.get('/admin/projects/:id', async (request) => {
    const { id } = parseInput(IdParams, request.params);
    return projects.adminView(id);
  });

  app.post('/admin/projects/:id/status', async (request) => {
    const { id } = parseInput(IdParams, request.params);
    const { to, note } = parseInput(ChangeStatusRequest, request.body);
    return projects.changeStatus(id, to, note ?? null);
  });
}

/** Service-to-service endpoints. The gateway never routes `/internal/*`. */
export function registerInternalRoutes(app: FastifyInstance, projects: ProjectService) {
  app.get('/internal/projects/:id/layout-source', async (request) => {
    const { id } = parseInput(IdParams, request.params);
    return projects.layoutSource(id);
  });
}
