import type { FastifyInstance } from "fastify";
import { ok } from "../../lib/response.js";
import { requireAuth } from "../../middleware/authenticate.js";
import { requirePlatformRole } from "../../middleware/require-platform.js";
import type { AuthProvider } from "../auth/index.js";
import { setNoStore } from "../auth/cookies.js";
import {
  applyAdminSupportAction,
  createSupportTicket,
  getSupportTicketDetail,
  listAdminSupportTickets,
  listUserSupportTickets,
  replyToSupportTicket,
} from "./service.js";
import {
  createSupportTicketSchema,
  supportAdminActionSchema,
  supportIdParamsSchema,
  supportListQuerySchema,
  supportMessageSchema,
} from "./schemas.js";

export async function supportRoutes(
  app: FastifyInstance,
  opts: { authProvider: AuthProvider },
): Promise<void> {
  const authenticated = [requireAuth(opts.authProvider)];
  const superAdmin = [requireAuth(opts.authProvider), requirePlatformRole(["SUPER_ADMIN"])];

  app.get("/support/tickets", { preHandler: authenticated }, async (request, reply) => {
    setNoStore(reply);
    const query = supportListQuerySchema.parse(request.query);
    return reply.send(ok(await listUserSupportTickets({ userId: request.authUser!.id, ...query })));
  });

  app.post("/support/tickets", { preHandler: authenticated }, async (request, reply) => {
    setNoStore(reply);
    const input = createSupportTicketSchema.parse(request.body);
    return reply.code(201).send(ok(await createSupportTicket(request.authUser!.id, input)));
  });

  app.get<{ Params: { id: string } }>(
    "/support/tickets/:id",
    { preHandler: authenticated },
    async (request, reply) => {
      setNoStore(reply);
      const { id } = supportIdParamsSchema.parse(request.params);
      return reply.send(
        ok(
          await getSupportTicketDetail({
            actorUserId: request.authUser!.id,
            ticketId: id,
            isSuperAdmin: false,
          }),
        ),
      );
    },
  );

  app.post<{ Params: { id: string } }>(
    "/support/tickets/:id/messages",
    { preHandler: authenticated },
    async (request, reply) => {
      setNoStore(reply);
      const { id } = supportIdParamsSchema.parse(request.params);
      const { body } = supportMessageSchema.parse(request.body);
      return reply
        .code(201)
        .send(ok(await replyToSupportTicket({ userId: request.authUser!.id, ticketId: id, body })));
    },
  );

  app.get("/admin/support/tickets", { preHandler: superAdmin }, async (request, reply) => {
    setNoStore(reply);
    const query = supportListQuerySchema.parse(request.query);
    return reply.send(
      ok(await listAdminSupportTickets({ actorUserId: request.authUser!.id, ...query })),
    );
  });

  app.get<{ Params: { id: string } }>(
    "/admin/support/tickets/:id",
    { preHandler: superAdmin },
    async (request, reply) => {
      setNoStore(reply);
      const { id } = supportIdParamsSchema.parse(request.params);
      return reply.send(
        ok(
          await getSupportTicketDetail({
            actorUserId: request.authUser!.id,
            ticketId: id,
            isSuperAdmin: true,
          }),
        ),
      );
    },
  );

  app.post<{ Params: { id: string } }>(
    "/admin/support/tickets/:id/actions",
    { preHandler: superAdmin },
    async (request, reply) => {
      setNoStore(reply);
      const { id } = supportIdParamsSchema.parse(request.params);
      const action = supportAdminActionSchema.parse(request.body);
      return reply.send(
        ok(
          await applyAdminSupportAction({
            actorUserId: request.authUser!.id,
            ticketId: id,
            action,
          }),
        ),
      );
    },
  );
}
