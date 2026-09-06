#!/usr/bin/env node
/** Build a deterministic, read-only cohort proposal from the newest origin receipt. */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const oldPath = path.join(root, 'docs/reports/current-source-projection-cohort-v1.json');
const originPath = path.join(root, 'docs/reports/graphify-lifecycle-entrypoint-v1.json');
const outPath = path.join(root, 'docs/reports/fresh-origin-bounded-cohort-plan-v1.json');
const arg = process.argv.find((value) => value.startsWith('--limit='));
const limit = Math.max(1, Math.min(15, Number(arg?.split('=')[1] ?? 5)));
const read = async (file) => JSON.parse(await readFile(file, 'utf8'));
const historical = await read(oldPath);
const origin = await read(originPath);
const originByRef = new Map((origin.sourceBindings ?? []).map((row) => [String(row.sourceRef).replaceAll('\\', '/'), row]));
const refs = (historical.cohort ?? []).map((row) => String(row.relativePath ?? '').replaceAll('\\', '/')).filter(Boolean).sort();
const selected = refs.map((sourceRef) => originByRef.get(sourceRef)).filter(Boolean).slice(0, limit).map((row) => ({ sourceRef: row.sourceRef, sourceRevision: row.sourceRevision, contentHash: row.contentDigest, byteLength: row.byteLength, workspaceRevision: row.workspaceRevision }));
const material = selected.map((row) => `${row.sourceRef}\0${row.sourceRevision}\0${row.contentHash}\0${row.byteLength}\0${row.workspaceRevision}`).join('\n');
const selectionChecksum = `sha256:${createHash('sha256').update(material, 'utf8').digest('hex')}`;
const report = { schema: 'atlas.fresh-origin-bounded-cohort-plan.v1', status: selected.length ? 'PLAN_ONLY_REQUIRES_EXPLICIT_AUTHORIZATION' : 'NO_INTERSECTION', historicalInput: 'docs/reports/current-source-projection-cohort-v1.json', originInput: 'docs/reports/graphify-lifecycle-entrypoint-v1.json', originWorkspaceRevision: origin.workspaceRevision ?? null, historicalRefCount: refs.length, selectedCount: selected.length, limit, selectionChecksum, rows: selected, writes: { sourceSelection: false, postgres: false, graphify: false, qdrant: false, neo4j: false, cache: false, modelCalls: false }, authorizationRequired: true, nextGate: 'READ_ONLY_COHORT_REPLAY_WITH_FRESH_ORIGIN_INPUT' };
await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ report: path.relative(root, outPath).replaceAll('\\', '/'), status: report.status, selectedCount: report.selectedCount, originWorkspaceRevision: report.originWorkspaceRevision, authorizationRequired: true }, null, 2));
