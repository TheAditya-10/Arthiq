import type { FastifyInstance, FastifyReply } from "fastify";
import { loginSchema, registerSchema } from "@arthiq/validation";

import { AuthError, login, logout, refresh, register } from "../services/auth.service.js";
import { findUserById } from "../repositories/user.repository.js";

const REFRESH_COOKIE = "arthiq_refresh_token";
const isMobileClient = (request: { headers: Record<string, unknown> }) =>
  request.headers["x-client"] === "mobile";

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const authAttemptRateLimit = { rateLimit: { max: 10, timeWindow: "1 minute" } };

  app.post("/auth/register", { config: authAttemptRateLimit }, async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid input",
            details: parsed.error.issues,
          },
        });
    }
    try {
      const result = await register(app.prisma, parsed.data, request.headers["user-agent"]);
      return sendAuthResult(request, reply, result, 201);
    } catch (err) {
      return handleAuthError(err, reply);
    }
  });

  app.post("/auth/login", { config: authAttemptRateLimit }, async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid input",
            details: parsed.error.issues,
          },
        });
    }
    try {
      const result = await login(app.prisma, parsed.data, request.headers["user-agent"]);
      return sendAuthResult(request, reply, result, 200);
    } catch (err) {
      return handleAuthError(err, reply);
    }
  });

  app.post("/auth/refresh", async (request, reply) => {
    const presented = extractRefreshToken(request);
    if (!presented) {
      return reply
        .status(401)
        .send({ error: { code: "UNAUTHORIZED", message: "Missing refresh token" } });
    }
    try {
      const result = await refresh(app.prisma, presented, request.headers["user-agent"]);
      return sendAuthResult(request, reply, result, 200);
    } catch (err) {
      return handleAuthError(err, reply);
    }
  });

  app.post("/auth/logout", async (request, reply) => {
    const presented = extractRefreshToken(request);
    if (presented) {
      await logout(app.prisma, presented);
    }
    reply.clearCookie(REFRESH_COOKIE, { path: "/" });
    return reply.status(204).send();
  });

  app.get("/auth/me", { preHandler: app.requireAuth }, async (request, reply) => {
    const user = await findUserById(app.prisma, request.userId!);
    if (!user) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "User not found" } });
    }
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      timezone: user.timezone,
    };
  });

  function extractRefreshToken(request: {
    cookies?: Record<string, string | undefined>;
    body?: unknown;
  }) {
    if (request.cookies?.[REFRESH_COOKIE]) return request.cookies[REFRESH_COOKIE];
    const body = request.body as { refreshToken?: string } | undefined;
    return body?.refreshToken;
  }

  function sendAuthResult(
    request: { headers: Record<string, unknown> },
    reply: FastifyReply,
    result: Awaited<ReturnType<typeof login>>,
    status: number,
  ) {
    if (isMobileClient(request)) {
      // Mobile has no shared cookie jar with a browser — return the refresh
      // token in the body; it stores it in Android Keystore-backed storage.
      return reply.status(status).send({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user: result.user,
      });
    }
    reply.setCookie(REFRESH_COOKIE, result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
    return reply.status(status).send({ accessToken: result.accessToken, user: result.user });
  }

  function handleAuthError(err: unknown, reply: FastifyReply) {
    if (err instanceof AuthError) {
      return reply
        .status(err.statusCode)
        .send({ error: { code: "AUTH_ERROR", message: err.message } });
    }
    throw err;
  }
}
