#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';

const fixturePath = process.argv[2] ?? new URL('../../examples/residency-cagra-selector-v1.json', import.meta.url);
const raw = fs.readFileSync(fixturePath, 'utf8');
const fixture = JSON.parse(raw);

const expected = fixture.expected;
const all = [...expected.HOT, ...expected.WARM, ...expected.COLD];

if (new Set(all).size !== all.length) {
  throw new Error('Fixture contains duplicate resource refs across residency classes');
}

const probabilityByAction = new Map(
  fixture.nextActionProbabilities.map((x) => [x.action, x.probability])
);

for (const [action, probability] of probabilityByAction) {
  if (!(probability >= 0 && probability <= 1)) {
    throw new Error(`Invalid probability for ${action}`);
  }
}

const canonical = JSON.stringify({
  query: fixture.query,
  HOT: [...expected.HOT].sort(),
  WARM: [...expected.WARM].sort(),
  COLD: [...expected.COLD].sort(),
  probabilities: [...fixture.nextActionProbabilities]
    .sort((a, b) => a.action.localeCompare(b.action))
});

const checksum = crypto.createHash('sha256').update(canonical).digest('hex');

console.log(JSON.stringify({
  schema: 'parent-atlas.residency-scheduler-proof-receipt.v1',
  status: 'RESIDENCY_FIXTURE_DETERMINISTIC',
  query: fixture.query,
  counts: {
    hot: expected.HOT.length,
    warm: expected.WARM.length,
    cold: expected.COLD.length
  },
  maxConcurrentEvidenceBranches: 3,
  cpuWorkerProfiles: 4,
  maxConcurrentGpuJobs: 1,
  semanticLogicalVotes: 1,
  fusionOwner: 'SEARCH_RUNTIME',
  fixtureChecksum: checksum,
  writes: false
}, null, 2));
