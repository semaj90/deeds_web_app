#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

dotenv.config({ path: path.join(REPO_ROOT, '.env') });
dotenv.config({ path: path.join(REPO_ROOT, '.env.local') });

const REPORTS_DIR = path.join(REPO_ROOT, 'docs', 'reports');
const REPORT_JSON = path.join(REPORTS_DIR, 'task-semantic-packet-workflow-latest.json');
const REPORT_MD = path.join(REPORTS_DIR, 'task-semantic-packet-workflow-latest.md');

function parseTaskId(argv: string[]): number {
  const taskArg = argv.find((arg) => arg.startsWith('--taskId='))?.split('=')[1] ?? argv[2];
  const parsed = Number(taskArg ?? '1');
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 1;
}

function isDryRun(argv: string[]): boolean {
  return argv.includes('--dry-run') || argv.includes('--dry') || argv.includes('--preview');
}

function renderMarkdown(report: Record<string, unknown>) {
  const packet = report.packet as Record<string, unknown>;
  return [
    '# Task Semantic Packet Workflow',
    '',
    `- taskId: ${report.taskId}`,
    `- packetId: ${packet?.packetId ?? ''}`,
    `- queueId: ${packet?.queueId ?? ''}`,
    `- qdrantPointId: ${packet?.qdrantPointId ?? ''}`,
    `- featureId: ${packet?.featureId ?? ''}`,
    `- clusterId: ${packet?.clusterId ?? ''}`,
    `- centroidId: ${packet?.centroidId ?? ''}`,
    `- cached: ${report.cached ? 'yes' : 'no'}`,
    '',
    '## Next Action',
    '',
    `- ${packet?.nextAction ?? ''}`,
    '',
  ].join('\n');
}

async function main() {
  const taskId = parseTaskId(process.argv);
  const dryRun = isDryRun(process.argv);

  if (dryRun) {
    const report = {
      generatedAt: new Date().toISOString(),
      taskId,
      dryRun: true,
      packet: {
        taskId,
        packetId: `preview:${taskId}`,
        queueId: null,
        qdrantPointId: `preview:qdrant:${taskId}`,
        featureId: null,
        clusterId: null,
        centroidId: null,
        nextAction: 'Dry-run preview only; real lifecycle skipped.',
        summary: 'Dry-run preview only; no LLM, embedding, Qdrant, or Redis writes were performed.',
      },
    };
    await fs.mkdir(REPORTS_DIR, { recursive: true });
    await fs.writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await fs.writeFile(REPORT_MD, `${renderMarkdown(report)}\n`, 'utf8');
    console.log(`Wrote ${REPORT_JSON}`);
    console.log(`Wrote ${REPORT_MD}`);
    console.log(JSON.stringify({ taskId, dryRun: true, packetId: report.packet.packetId }, null, 2));
    return;
  }

  const { runTaskSemanticPacketLifecycle } = await import('../../src/lib/server/tasks/semantic-packets.ts');
  const packet = await runTaskSemanticPacketLifecycle(taskId);
  const report = {
    generatedAt: new Date().toISOString(),
    taskId,
    packet,
    cached: packet.cached ?? null,
  };

  await fs.mkdir(REPORTS_DIR, { recursive: true });
  await fs.writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(REPORT_MD, `${renderMarkdown(report)}\n`, 'utf8');

  console.log(`Wrote ${REPORT_JSON}`);
  console.log(`Wrote ${REPORT_MD}`);
  console.log(JSON.stringify({
    taskId,
    packetId: packet.packetId,
    queueId: packet.queueId,
    qdrantPointId: packet.qdrantPointId,
    featureId: packet.featureId,
    clusterId: packet.clusterId,
    cached: Boolean(packet.cached),
  }, null, 2));
}

main().catch((error) => {
  console.error('Task semantic packet workflow failed:', error?.message ?? error);
  process.exit(1);
});
