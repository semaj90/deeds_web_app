#!/usr/bin/env node
/**
 * OPENCODE-GENERATED-AGENTS-OWNER-01 — read-only producer ownership audit.
 *
 * Identifies the producer, consumers, and safe-relocation status of the large
 * generated frontend AGENTS.md artifact. It never rewrites the artifact,
 * archives content, calls a model, or writes a datastore.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const target = resolve(ROOT, 'sveltekit-frontend/AGENTS.md');
const reportPath = resolve(ROOT, 'docs/reports/opencode-generated-agents-owner-v1.json');
const rel = (file) => relative(ROOT, file).replaceAll('\\', '/');
const digest = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

if (!existsSync(target)) throw new Error(`GENERATED_AGENTS_TARGET_MISSING:${rel(target)}`);
const bytes = readFileSync(target);
const text = bytes.toString('utf8');
const lines = text ? text.split(/\r?\n/).length - (text.endsWith('\n') ? 1 : 0) : 0;

const preservedArtifact = resolve(ROOT, 'docs/reports/sveltekit-frontend-full-repository-index-v1.md');
const candidatePaths = [
  resolve(ROOT, 'scripts/agents/generate-monorepo-agents.mjs'),
  resolve(ROOT, 'scripts/atlas/append-dir-agents-llms.mjs'),
];
const currentGeneratorCandidates = candidatePaths
  .filter((file) => existsSync(file))
  .filter((file) => {
    const candidate = readFileSync(file, 'utf8');
    return candidate.includes('Full Repository Index')
      || candidate.includes('LLM jump table')
      || candidate.includes('agents:write');
  })
  .map(rel);
const knownAppendOnlyProducer = 'scripts/atlas/append-dir-agents-llms.mjs';
const hasKnownAppendOnlyProducer = currentGeneratorCandidates.includes(knownAppendOnlyProducer);
const hasFormerCommand = text.includes('npm run agents:write');
const hasGeneratedMarkers = ['Full Repository Index', 'LLM jump table'].some((marker) => text.includes(marker));

const report = {
  schema: 'atlas.opencode-generated-agents-owner.v1',
  generatedAt: new Date().toISOString(),
  target: rel(target),
  sourceArtifact: {
    checksum: digest(bytes),
    byteCount: bytes.byteLength,
    lineCount: lines,
    generatedMarkers: hasGeneratedMarkers,
    formerProducerCommandPresent: hasFormerCommand,
  },
  preservedArtifact: existsSync(preservedArtifact) ? {
    path: rel(preservedArtifact),
    checksum: digest(readFileSync(preservedArtifact)),
    byteCount: readFileSync(preservedArtifact).byteLength,
  } : null,
  producerStatus: currentGeneratorCandidates.length === 0 ? 'ORPHANED_GENERATOR' : 'ACTIVE_GENERATOR_REVIEW_REQUIRED',
  producerRefs: currentGeneratorCandidates,
  currentConsumers: ['OpenCode AGENTS.md directory walk-up discovery'],
  regenerationPaths: hasKnownAppendOnlyProducer ? [knownAppendOnlyProducer] : [],
  safeToRelocate: hasFormerCommand && !currentGeneratorCandidates.some((file) => file.includes('generate-monorepo-agents')),
  preservationRequired: true,
  writesPerformed: { filesystem: true, postgres: false, qdrant: false, neo4j: false, valkey: false, modelCalls: false },
  canonicalAuthority: false,
  status: hasFormerCommand && currentGeneratorCandidates.length === 0 && existsSync(preservedArtifact)
    ? 'ORPHANED_GENERATOR_RELOCATION_SAFE'
    : 'PRODUCER_REVIEW_REQUIRED',
  nextGate: 'PRESERVE_GENERATED_ARTIFACT_THEN_REDUCE_AMBIENT_AGENTS_CONTEXT',
};

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: report.status,
  producerStatus: report.producerStatus,
  artifactBytes: bytes.byteLength,
  artifactLines: lines,
  producerRefs: currentGeneratorCandidates,
  reportPath,
}, null, 2));
