#!/usr/bin/env tsx

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { applyParentAtlasAgenticReceiptProjectionV1 } from '../../src/lib/server/atlas/tournament/parent-atlas-agentic-receipt-projection-v1.js';
import { loadParentAtlasTournamentSnapshotV1 } from '../../src/lib/server/atlas/tournament/parent-atlas-tournament-receipt-aggregator-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SVELTEKIT_ROOT = path.resolve(HERE, '../..');
const REPO_ROOT = path.resolve(SVELTEKIT_ROOT, '..');
const OUTPUT = path.resolve(REPO_ROOT, 'docs/reports/parent-atlas-tournament-progress-v1.json');

const base = await loadParentAtlasTournamentSnapshotV1(REPO_ROOT);
const snapshot = await applyParentAtlasAgenticReceiptProjectionV1(REPO_ROOT, base);
await mkdir(path.dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
	schema: snapshot.schema,
	status: snapshot.progress.remainingGates.length === 0 ? 'TOURNAMENT_PROVEN' : 'TOURNAMENT_IN_PROGRESS',
	proofProgressPct: snapshot.progress.proofProgressPct,
	currentPhase: snapshot.progress.currentPhase,
	currentGate: snapshot.progress.currentGate,
	blockedGates: snapshot.progress.blockedGates,
	remainingGateCount: snapshot.progress.remainingGates.length,
	acceptedReceiptCount: snapshot.sources.filter((item) => item.accepted).length,
	agenticTelemetry: snapshot.agenticTelemetry,
	output: path.relative(REPO_ROOT, OUTPUT).replaceAll('\\', '/')
}, null, 2));
