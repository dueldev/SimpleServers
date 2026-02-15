import { createApiApp } from "./app.js";

async function bootstrap(): Promise<void> {
  const { app, config, adminToken } = await createApiApp();
  await app.listen({ host: config.host, port: config.port });

  app.log.info(`SimpleServers API running at http://${config.host}:${config.port}`);
  app.log.info(`Default owner token: ${adminToken}`);
}

void bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
