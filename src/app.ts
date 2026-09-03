import type { IncomingMessage, ServerResponse } from "node:http";
import Fastify from "fastify";
import { loadEnv, type Env } from "./config/env.js";
import { loggerOptions } from "./lib/logger.js";
import { tenantContextMiddleware } from "./middleware/tenant-context.js";
import {
  JwtAuthProvider,
  OidcSocialTokenVerifier,
  parseAudienceList,
  SocialAuthService,
  type SocialTokenVerifier,
} from "./modules/auth/index.js";
import { authRoutes } from "./modules/auth/routes.js";
import { assessmentAdminRoutes, assessmentStudentRoutes } from "./modules/assessments/index.js";
import { assignmentAdminRoutes, assignmentStudentRoutes } from "./modules/assignments/index.js";
import { branchAdminRoutes } from "./modules/branches/index.js";
import { classAdminRoutes } from "./modules/classes/index.js";
import { contentAdminRoutes } from "./modules/contents/index.js";
import { entitlementRoutes } from "./modules/entitlements/index.js";
import { billingRoutes } from "./modules/billing/index.js";
import { gamificationStudentRoutes } from "./modules/gamification/index.js";
import { onboardingRoutes } from "./modules/onboarding/index.js";
import { studentLearningRoutes } from "./modules/student-learning/index.js";
import { healthRoutes } from "./modules/health/routes.js";
import { mediaAdminRoutes } from "./modules/media/index.js";
import { progressStudentRoutes } from "./modules/progress/index.js";
import { pilotRoutes } from "./modules/pilot/index.js";
import { questionAdminRoutes } from "./modules/questions/index.js";
import { questionStudentRoutes } from "./modules/questions/student-routes.js";
import { sessionAdminRoutes } from "./modules/sessions/admin-routes.js";
import { sessionStudentRoutes } from "./modules/sessions/student-routes.js";
import { studentAdminRoutes } from "./modules/students/index.js";
import { teacherAdminRoutes } from "./modules/teachers/index.js";
import { templateAdminRoutes } from "./modules/templates/index.js";
import { tenantAdminRoutes } from "./modules/tenant/index.js";
import { userAdminRoutes } from "./modules/users/index.js";
import { corsPlugin } from "./plugins/cors.js";
import { errorHandlerPlugin } from "./plugins/error-handler.js";
import { staticPlugin } from "./plugins/static.js";
import { securityPlugin } from "./plugins/security.js";

export async function buildApp(
  env: Env,
  options: { socialTokenVerifier?: SocialTokenVerifier } = {},
) {
  const app = Fastify({
    logger: loggerOptions(env),
    bodyLimit: env.BODY_LIMIT_BYTES,
    connectionTimeout: env.CONNECTION_TIMEOUT_MS,
    requestTimeout: env.REQUEST_TIMEOUT_MS,
    keepAliveTimeout: env.KEEP_ALIVE_TIMEOUT_MS,
    return503OnClosing: true,
  });
  const authProvider = new JwtAuthProvider({
    jwtSecret: env.JWT_SECRET,
    accessTtlSeconds: env.JWT_ACCESS_TTL_SECONDS,
    refreshTtlSeconds: env.JWT_REFRESH_TTL_SECONDS,
  });
  const socialTokenVerifier =
    options.socialTokenVerifier ??
    new OidcSocialTokenVerifier({
      googleAudiences: parseAudienceList(env.GOOGLE_OIDC_CLIENT_IDS),
      appleAudiences: parseAudienceList(env.APPLE_OIDC_CLIENT_IDS),
    });
  const socialAuthService = new SocialAuthService(socialTokenVerifier, authProvider);

  await securityPlugin(app, env);
  await errorHandlerPlugin(app);
  // Call the wrapper in the root context so its CORS hook covers every route.
  // (Registering this non-fastify-plugin wrapper would encapsulate the hook.)
  await corsPlugin(app, env);
  await app.register(tenantContextMiddleware);
  await app.register(healthRoutes);
  await app.register(authRoutes, { authProvider, socialAuthService });
  await app.register(tenantAdminRoutes, { authProvider });
  await app.register(userAdminRoutes, { authProvider });
  await app.register(studentAdminRoutes, { authProvider });
  await app.register(teacherAdminRoutes, { authProvider });
  await app.register(branchAdminRoutes, { authProvider });
  await app.register(classAdminRoutes, { authProvider });
  await app.register(contentAdminRoutes, { authProvider });
  await app.register(questionAdminRoutes, { authProvider });
  await app.register(questionStudentRoutes, { authProvider });
  await app.register(sessionAdminRoutes, { authProvider });
  await app.register(sessionStudentRoutes, { authProvider });
  await app.register(templateAdminRoutes, { authProvider });
  await app.register(mediaAdminRoutes, { authProvider });
  await app.register(assignmentAdminRoutes, { authProvider });
  await app.register(assignmentStudentRoutes, { authProvider });
  await app.register(assessmentAdminRoutes, { authProvider });
  await app.register(assessmentStudentRoutes, { authProvider });
  await app.register(progressStudentRoutes, { authProvider });
  await app.register(entitlementRoutes, { authProvider });
  await app.register(billingRoutes, { authProvider, env });
  await app.register(pilotRoutes, { authProvider, env });
  await app.register(gamificationStudentRoutes, { authProvider });
  await app.register(onboardingRoutes, { authProvider });
  await app.register(studentLearningRoutes, { authProvider });
  await app.register(staticPlugin);
  return app;
}

// Vercel discovers src/app.ts as a Node Function entrypoint. Keep the
// application factory named-exported for the local server and tests, while
// exposing a lazy default handler for Vercel so the process never calls
// listen() during a function invocation.
let vercelAppPromise: ReturnType<typeof buildApp> | undefined;

export default async function vercelHandler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const appPromise = (vercelAppPromise ??= (async () => {
    const app = await buildApp(loadEnv());
    await app.ready();
    return app;
  })());
  const app = await appPromise;
  app.server.emit("request", request, response);
}
