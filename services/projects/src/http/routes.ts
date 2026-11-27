import {
  ChangeStatusRequest,
  CheckoutRequest,
  ContributionRequest,
  CreateProjectRequest,
  ProjectStatus,
  SaveStepRequest,
  z,
} from '@px/contracts';
import { parseInput, type FastifyInstance } from '@px/service-kit';
import type { ProjectService } from '../application/project-service';

const EditKeyParams = z.object({ editKey: z.string().min(10).max(64) });
const StepParams = EditKeyParams.extend({ stepId: z.string().min(1).max(64) });
const InviteParams = z.object({ inviteKey: z.string().min(10).max(64) });
const IdParams = z.object({ id: z.uuid() });
const ListQuery = z.object({
  status: ProjectStatus.optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
});

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

  app.post('/invites/:inviteKey/contributions', async (request, reply) => {
    const { inviteKey } = parseInput(InviteParams, request.params);
    const body = parseInput(ContributionRequest, request.body);
    return reply.status(201).send(await projects.contribute(inviteKey, body));
  });
}

/** Studio back office. Authorisation is enforced by the gateway; these routes are never exposed directly. */
export function registerAdminRoutes(app: FastifyInstance, projects: ProjectService) {
  app.get('/admin/projects', async (request) => {
    const query = parseInput(ListQuery, request.query);
    return { items: await projects.list(query) };
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
