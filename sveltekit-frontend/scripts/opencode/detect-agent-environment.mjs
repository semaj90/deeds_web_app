#!/usr/bin/env node

import { PATHS } from './task-registry-helpers.mjs';
import { writeAgentEnvironmentReport } from './environment-detector.mjs';

async function main() {
  const report = await writeAgentEnvironmentReport({
    json: PATHS.agentEnvironmentJson,
    md: PATHS.agentEnvironmentMd,
  });

  console.log(JSON.stringify({
    ok: true,
    surface: report.surface,
    shell: report.workspace.shell,
    vscode: report.vscode.detected,
    opencode: report.opencode.detected,
    codex: report.codex.detected,
    reportJson: PATHS.agentEnvironmentJson,
    reportMd: PATHS.agentEnvironmentMd,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
