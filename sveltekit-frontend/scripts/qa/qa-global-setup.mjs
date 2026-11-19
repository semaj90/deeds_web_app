/**
 * Playwright global setup for the QA sweep. Runs after webServer is ready and refuses to
 * continue unless the server on QA_PORT answers as the Parent Atlas app. A bare open port
 * (another project, or a stale process) must fail the run before any test is analysed.
 */
import { probeParentAtlasServer } from './active-server-manifest.mjs';

export default async function globalSetup() {
  const port = Number(process.env.QA_PORT ?? 5173);
  const probe = await probeParentAtlasServer(port);
  if (!probe.ok) {
    throw new Error(`QA_SERVER_NOT_PARENT_ATLAS: port ${port} ${probe.reason}. Stop the owner and rerun.`);
  }
}
