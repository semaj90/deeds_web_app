#!/usr/bin/env node
/**
 * AFC-PROOF-01a live proof — runs the real observeHelperCapabilitySnapshotV1
 * (which makes a real HTTP probe to the live :8081 embedding executor,
 * confirmed running this session) plus the 6 fixture queries against the
 * real registry/keyword-recognition/eligibility pipeline. Complements the
 * unit-test suite (which uses a hand-built snapshot for determinism) with
 * one genuinely live run.
 *
 * Read-only: one HTTP GET to the already-running embedding executor's
 * /health endpoint. No Postgres/Qdrant/Valkey/Neo4j/RabbitMQ writes.
 *
 * Usage: cd sveltekit-frontend && npx tsx ../scripts/atlas/afc-helper-eligibility-live-proof-v1.mjs
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FRONTEND_ROOT = path.join(REPO_ROOT, 'sveltekit-frontend');
const AFC = path.join(FRONTEND_ROOT, 'src/lib/server/atlas/agentic-file-compiler');

const { buildDefaultHelperRegistryV1 } = await import(pathToFileURL(path.join(AFC, 'helper-registry-v1.ts')).href);
const { observeHelperCapabilitySnapshotV1 } = await import(pathToFileURL(path.join(AFC, 'helper-capability-snapshot-v1.ts')).href);
const { recognizeKeywordsV1, DEFAULT_KEYWORD_VOCABULARY_V1, DEFAULT_VOCABULARY_REVISION_V1 } = await import(pathToFileURL(path.join(AFC, 'keyword-recognition-v1.ts')).href);
const { computeHelperEligibilityV1 } = await import(pathToFileURL(path.join(AFC, 'helper-eligibility-v1.ts')).href);

const REGISTRY_REVISION = 'helper-registry:v1:seed-12';
const FIXTURE_QUERIES = [
  'find references to FooRepository.update',
  'explain CAGRA indexing parameters',
  'why is qdrant cache stale after graphify?',
  'what does this ROS2 callback reference?',
  'show docs for semanticRevision',
  'find the Postgres HNSW definition',
];

async function main() {
  const registry = buildDefaultHelperRegistryV1(REGISTRY_REVISION);
  const snapshot = await observeHelperCapabilitySnapshotV1(registry); // REAL live probe

  const lspObs = snapshot.observations.find((o) => o.helperId === 'lsp-references');
  const semanticObs = snapshot.observations.find((o) => o.helperId === 'semantic-768');

  const results = FIXTURE_QUERIES.map((query) => {
    const kw = recognizeKeywordsV1({ query, vocabulary: DEFAULT_KEYWORD_VOCABULARY_V1, vocabularyRevision: DEFAULT_VOCABULARY_REVISION_V1 });
    const eligibility = computeHelperEligibilityV1({ registry, keywordRecognition: kw, capabilitySnapshot: snapshot });
    return {
      query,
      matchedTerms: kw.matches.map((m) => m.term),
      unmatchedTokens: kw.unmatchedTokens,
      eligible: eligibility.helpers.filter((h) => h.state === 'ELIGIBLE').map((h) => h.helperId),
      blocked: eligibility.helpers.filter((h) => h.state === 'BLOCKED').map((h) => h.helperId),
    };
  });

  const receipt = {
    schema: 'atlas.afc-helper-eligibility-live-proof.v1',
    generatedAt: new Date().toISOString(),
    registryChecksum: registry.checksum,
    capabilitySnapshot: {
      checksum: snapshot.checksum,
      lspReferencesAvailable: lspObs?.available ?? null,
      lspReferencesEvidence: lspObs?.evidenceRefs ?? [],
      semantic768Available: semanticObs?.available ?? null,
      semantic768Evidence: semanticObs?.evidenceRefs ?? [],
    },
    fixtureResults: results,
    authority: { databaseWrites: 0, qdrantWrites: 0, valkeyWrites: 0, rabbitmqPublishes: 0, graphifyRuns: 0 },
    status: 'AFC_HELPER_ELIGIBILITY_LIVE_PROOF_COMPLETE',
  };

  const outPath = path.join(REPO_ROOT, 'docs', 'reports', `afc-helper-eligibility-live-proof-v1-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(outPath, JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt, null, 2));
  console.log('\nFull receipt:', outPath);
}

main().catch((err) => { console.error('FATAL', err); process.exitCode = 1; });
