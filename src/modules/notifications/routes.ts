import type { FastifyInstance } from "fastify";
import { z } from "zod/v3";
import { ok } from "../../lib/response.js";
import { requireAuth } from "../../middleware/authenticate.js";
import type { AuthProvider } from "../auth/index.js";
import { setNoStore } from "../auth/cookies.js";
import { listNotifications, markNotificationRead } from "./service.js";

const listQuerySchema = z
  .object({ limit: z.coerce.number().int().min(1).max(50).default(20) })
  .strict();

const idParamsSchema = z.object({ id: z.string().trim().min(1).max(128) }).strict();

export async function notificationRoutes(
  app: FastifyInstance,
  opts: { authProvider: AuthProvider },
): Promise<void> {
  app.get(
    "/notifications",
    { preHandler: [requireAuth(opts.authProvider)] },
    async (request, reply) => {
      setNoStore(reply);
      const { limit } = listQuerySchema.parse(request.query);
      return reply.send(ok(await listNotifications(request.authUser!.id, limit)));
    },
  );

  app.post<{ Params: { id: string } }>(
    "/notifications/:id/read",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          additionalProperties: false,
          properties: { id: { type: "string", minLength: 1, maxLength: 128 } },
        },
        body: { type: "object", additionalProperties: false, properties: {} },
      },
      preHandler: [requireAuth(opts.authProvider)],
    },
    async (request, reply) => {
      setNoStore(reply);
      const { id } = idParamsSchema.parse(request.params);
      return reply.send(ok({ notification: await markNotificationRead(request.authUser!.id, id) }));
    },
  );
}
