#!/usr/bin/env node

/**
 * Read-only census of legacy TypeScript/Svelte error-fixing surfaces.
 *
 * This deliberately does not run a checker, parse terminal prose, or modify
 * source files. It identifies mutation-capable legacy scripts so the governed
 * evidence-capture replacement can be implemented without accidentally
 * treating a large error count as authorization to edit the tree.
 */
import { existsSync, readFileSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const reportPath = resolve(ROOT, 'docs/reports/typescript-error-fixer-owner-audit-v1.json');
const candidates = [
  'scripts/batch-fix-ts-errors.mjs',
  'scripts/fix-files-4-5-6-batch.mjs',
  'scripts/fix-files-9-11-12-batch.mjs',
  'scripts/fix-files-13-15-16-batch.mjs',
  'scripts/fix-files-17-19-20-batch.mjs',
  'scripts/error-resolution/services/error-scanner.ts',
  'scripts/error-resolution/services/type-fixer.ts',
  'scripts/error-resolution/services/import-fixer.ts',
];

const sha256 = (value) => createHash('sha256').update(value, 'utf8').digest('hex');
const has = (source, pattern) => pattern.test(source);

const surfaces = candidates.map((relativePath) => {
  const absolutePath = resolve(ROOT, relativePath);
  if (!existsSync(absolutePath)) {
    return { path: relativePath, exists: false, classification: 'MISSING' };
  }
  const source = readFileSync(absolutePath, 'utf8');
  const mutationCapable = has(source, /writeFileSync|writeFile\s*\(|renameSync|unlinkSync/);
  const shellCapable = has(source, /execSync|spawnSync|execFileSync|child_process|execAsync/);
  const machineJsonReader = has(source, /JSON\.parse|output machine|parseSvelteCheckOutput/);
  return {
    path: relativePath,
    exists: true,
    sourceChecksum: `sha256:${sha256(source)}`,
    mutationCapable,
    shellCapable,
    machineJsonReader,
    classification: mutationCapable ? 'LEGACY_MUTATION_SURFACE'
      : machineJsonReader ? 'STRUCTURED_EVIDENCE_READER'
        : 'REVIEW_REQUIRED',
    governedEventOwner: false,
    writesPerformed: false,
  };
});

const legacyMutators = surfaces.filter((surface) => surface.classification === 'LEGACY_MUTATION_SURFACE');
const report = {
  schema: 'atlas.typescript-error-fixer-owner-audit.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_STATIC_OWNER_CENSUS',
  claim: 'No live TypeScript error count was executed or accepted by this audit.',
  surfaces,
  summary: {
    candidateCount: surfaces.length,
    legacyMutationSurfaceCount: legacyMutators.length,
    structuredEvidenceReaderCount: surfaces.filter((surface) => surface.classification === 'STRUCTURED_EVIDENCE_READER').length,
    governedReplayOwnerCount: 0,
  },
  replacementGate: 'AGENTIC-TYPESCRIPT-ERROR-EVIDENCE-REPLACEMENT-01',
  requiredNextProof: [
    'capture svelte-check machine JSON in bounded batches',
    'bind error fingerprints to explicit workspace/source revisions when available',
    'emit evidence-only TaskCandidate input with stable checksum',
    'route any mutation through WorkflowActionEventV1 approval and independent validation',
  ],
  separationRules: {
    webResearchEvidence: 'separate revisioned cold evidence; never repair authorization',
    aceBitfrost: 'context/residency descriptors only; never hidden thoughts or canonical error truth',
    canonicalAuthority: 'Postgres receipts and governed workflow events',
  },
  writesPerformed: false,
  safeToApply: false,
};

mkdirSync(dirname(reportPath), { recursive: true });
const temporaryPath = `${reportPath}.tmp-${process.pid}`;
writeFileSync(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
renameSync(temporaryPath, reportPath);
console.log(JSON.stringify({
  schema: report.schema,
  status: 'AUDIT_COMPLETE_REPLACEMENT_GATE_OPEN',
  legacyMutationSurfaceCount: report.summary.legacyMutationSurfaceCount,
  structuredEvidenceReaderCount: report.summary.structuredEvidenceReaderCount,
  writesPerformed: false,
  reportPath: 'docs/reports/typescript-error-fixer-owner-audit-v1.json',
}));
