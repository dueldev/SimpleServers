import "fastify";
import type { UserRecord } from "../domain/types.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: UserRecord;
  }
}
