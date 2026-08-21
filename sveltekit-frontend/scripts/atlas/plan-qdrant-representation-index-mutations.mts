#!/usr/bin/env npx tsx
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { buildQdrantRepresentationMutationPlanV1 } from '../../src/lib/server/atlas/qdrant/qdrant-representation-index-mutation-plan-v1.js';
import type { QdrantSchemaDriftV1 } from '../../src/lib/server/atlas/qdrant/qdrant-representation-index-plan-v1.js';

const inputArg = process.argv.find((arg) => arg.startsWith('--input='));
const outputArg = process.argv.find((arg) => arg.startsWith('--output='));
const INPUT = resolve(inputArg?.split('=')[1] ?? 'docs/reports/qdrant-representation-index-audit.json');
const OUTPUT = resolve(outputArg?.split('=')[1] ?? 'docs/reports/qdrant-representation-index-mutation-plan.json');

async function main(): Promise<void> {
  const audit = JSON.parse(await readFile(INPUT, 'utf8')) as { drift?: QdrantSchemaDriftV1; mutations?: { qdrantWritesAttempted?: boolean } };
  if (!audit.drift) throw new Error('QDRANT_AUDIT_DRIFT_MISSING');
  if (audit.mutations?.qdrantWritesAttempted !== false) {
    throw new Error('QDRANT_AUDIT_NOT_PROVEN_READ_ONLY');
  }

  const plan = buildQdrantRepresentationMutationPlanV1(audit.drift);
  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(plan, null, 2));

  if (plan.blockers.length > 0) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
