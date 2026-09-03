import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";

/**
 * Frontend statik dosyalarını aynı-origin'den sunar (build adımı yok; vanilla
 * SPA). `public/` klasöründeki index.html + assets.
 */
export async function staticPlugin(app: FastifyInstance): Promise<void> {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const publicDir = join(currentDir, "../../public");

  await app.register(fastifyStatic, {
    root: publicDir,
    prefix: "/",
    index: ["index.html"],
  });
}
