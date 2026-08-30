#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const fixturePath = resolve(ROOT, 'scripts/atlas/fixtures/golden-retrieval-stability-v1.json');
const reportPath = resolve(ROOT, 'docs/reports/golden-retrieval-stability-proof-v1.json');
const baseUrl = process.env.ATLAS_RETRIEVAL_URL ?? 'http://127.0.0.1:5173';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));

function canonicalIds(payload) {
  const rows = Array.isArray(payload?.packets)
    ? payload.packets
    : Array.isArray(payload?.candidates)
      ? payload.candidates
      : Array.isArray(payload?.results)
        ? payload.results
        : [];
  return rows.map((row) => row.canonicalId ?? row.canonical_id ?? row.packetKey ?? row.packet_key ?? null).filter(Boolean).slice(0, fixture.topK);
}

async function run() {
  const url = `${baseUrl}/api/retrieval/search-unified?q=${encodeURIComponent(fixture.query)}&topK=${fixture.topK}`;
  const runs = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(url, { redirect: 'follow', headers: { accept: 'application/json' } });
    const body = await response.json().catch(() => null);
    const ids = canonicalIds(body);
    runs.push({ status: response.status, ids, checksum: sha256(JSON.stringify(ids)) });
  }

  const expected = fixture.expectedCanonicalIds;
  const exactFixtureMatch = runs.every((run) => JSON.stringify(run.ids) === JSON.stringify(expected));
  const replayIdentical = runs[0].checksum === runs[1].checksum;
  const report = {
    schema: 'atlas.golden-retrieval-stability-proof.v1',
    mode: 'READ_ONLY_CANONICAL_ENDPOINT_REPLAY',
    fixture: {
      path: 'scripts/atlas/fixtures/golden-retrieval-stability-v1.json',
      queryId: fixture.queryId,
      fixtureType: fixture.fixtureType,
      workspaceRevision: fixture.workspaceRevision,
      candidateSnapshotRevision: fixture.candidateSnapshotRevision,
      ordinalMapChecksum: fixture.ordinalMapChecksum,
      expectedCount: expected.length,
      fixtureChecksum: sha256(JSON.stringify(fixture))
    },
    endpoint: url,
    runs,
    exactFixtureMatch,
    replayIdentical,
    humanRelevanceJudgments: false,
    canonicalWrites: false,
    status: exactFixtureMatch && replayIdentical ? 'GOLDEN_STABILITY_REPLAY_PROVEN' : 'GOLDEN_STABILITY_REPLAY_BLOCKED',
    nextGate: exactFixtureMatch && replayIdentical ? 'HUMAN_RELEVANCE_JUDGMENT_SET' : 'RETRIEVAL_ENDPOINT_OR_LINEAGE_RECONCILIATION'
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.status.endsWith('PROVEN') ? 0 : 1;
}

run().catch((error) => {
  console.error(`[GOLDEN STABILITY] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
