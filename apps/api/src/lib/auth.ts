import type { FastifyReply, FastifyRequest } from "fastify";
import { store } from "../repositories/store.js";
import type { UserRole } from "../domain/types.js";

const roleRank: Record<UserRole, number> = {
  viewer: 10,
  moderator: 20,
  admin: 30,
  owner: 40
};

export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = request.headers["x-api-token"];
  if (!token || typeof token !== "string") {
    reply.code(401).send({
      code: "missing_api_token",
      message: "Missing x-api-token",
      error: "Missing x-api-token"
    });
    return;
  }

  const user = store.findUserByToken(token);
  if (!user) {
    reply.code(401).send({
      code: "invalid_api_token",
      message: "Invalid API token",
      error: "Invalid API token"
    });
    return;
  }

  request.user = user;
}

export function requireRole(minRole: UserRole) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const user = request.user;
    if (!user) {
      reply.code(401).send({
        code: "unauthorized",
        message: "Unauthorized",
        error: "Unauthorized"
      });
      return;
    }

    if (roleRank[user.role] < roleRank[minRole]) {
      const message = `Insufficient role. Requires ${minRole}`;
      reply.code(403).send({
        code: "insufficient_role",
        message,
        details: {
          requiredRole: minRole,
          currentRole: user.role
        },
        error: message
      });
    }
  };
}
