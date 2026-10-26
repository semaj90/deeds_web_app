#!/usr/bin/env node
/**
 * TITLE-WRITER-ALIGN-02 CLI: read-only. Reads the listed source files as TEXT and prints one verdict per writer.
 * Does not execute them, touch a database, or write anything. Exit code is always 0 (diagnostic, not a gate).
 * Usage: node scripts/atlas/audit-title-writers-v1.mjs [--json]
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { diagnoseTitleWriterV1 } from './lib/title-writer-compat-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const TITLE_WRITERS_V1 = Object.freeze([
  { id: 'generator.ace.title-id-generator', role: 'GENERATOR', file: 'sveltekit-frontend/src/lib/server/ace/title-id-generator.ts' },
  { id: 'declaration.atlas.packet-registry', role: 'VALIDATOR_DECLARATION', file: 'packages/atlas/lib/packet-registry.mjs' },
  { id: 'consumer.acp.packet-assembler', role: 'CONSUMER', file: 'sveltekit-frontend/src/lib/server/acp/packet-assembler.ts' },
  { id: 'consumer.acp.packet-materializer-pipeline', role: 'CONSUMER', file: 'sveltekit-frontend/src/lib/server/acp/packet-materializer-pipeline.ts' },
  { id: 'backfill.atlas.backfill-title-identity', role: 'BACKFILL', file: 'scripts/atlas/backfill-title-identity.mjs' },
  { id: 'backfill.phase-1-title-id-backfill', role: 'BACKFILL', file: 'scripts/phase-1-title-id-backfill.mjs' },
  { id: 'promotion.phase-1-promotion-batch', role: 'PROMOTION', file: 'scripts/phase-1-promotion-batch.mjs' },
  { id: 'label-join.derive-openspec-ids', role: 'LABEL_JOIN_WRITER', file: 'scripts/atlas/derive-openspec-ids.mjs' },
  { id: 'label-join.derive-gsd-ids', role: 'LABEL_JOIN_WRITER', file: 'scripts/atlas/derive-gsd-ids.mjs' },
  { id: 'consumer.ace.promotion-enrichment-service', role: 'CONSUMER', file: 'sveltekit-frontend/src/lib/server/ace/promotion-enrichment-service.ts' },
  { id: 'consumer.retrieval.hydrate-candidates', role: 'CONSUMER', file: 'sveltekit-frontend/src/lib/server/retrieval/hydrate-candidates.ts' },
  { id: 'reexport.ace.packet-io', role: 'REEXPORT', file: 'sveltekit-frontend/src/lib/server/ace/packet-io.ts' },
]);

/** Callers of generateTitleIdentity seen by name only (none outstanding after the 2026-10-11 read). */
export const TITLE_WRITERS_UNCLASSIFIED_V1 = Object.freeze([]);

export function runTitleWriterAuditV1(readText = (rel) => readFileSync(path.join(root, rel), 'utf8')) {
  const registryText = (() => { try { return readText('packages/atlas/lib/packet-registry.mjs'); } catch { return ''; } })();
  const registryVersion = /export const TITLE_GENERATOR_VERSION\s*=\s*'([^']+)'/.exec(registryText)?.[1] ?? null;
  const results = TITLE_WRITERS_V1.map((writer) => {
    try {
      return diagnoseTitleWriterV1(writer, readText(writer.file), { registryVersion });
    } catch (error) {
      return { schema: 'atlas.title-writer-compat.v1', id: writer.id, role: writer.role, file: writer.file,
        verdict: 'BLOCKED_FORMAT_OR_DERIVATION', findings: [{ block: 'FORMAT', code: 'SOURCE_UNREADABLE', detail: String(error.message) }],
        persistenceEligible: false, canonicalAuthority: false, writesPerformed: false };
    }
  });
  const generatorText = (() => { try { return readText('sveltekit-frontend/src/lib/server/ace/title-id-generator.ts'); } catch { return ''; } })();
  const runtimeVersion = /export const TITLE_GENERATOR_VERSION\s*=\s*'([^']+)'/.exec(generatorText)?.[1] ?? null;
  const crossChecks = [];
  if (registryVersion && runtimeVersion && registryVersion !== runtimeVersion) {
    crossChecks.push({ code: 'REGISTRY_VERSION_DIFFERS_FROM_RUNTIME_GENERATOR', registryVersion, runtimeVersion,
      detail: 'packet-registry.mjs says all title writers must import its version; the runtime generator declares its own' });
  }
  const counts = Object.fromEntries(['COMPATIBLE_READ_ONLY', 'BLOCKED_FORMAT_OR_DERIVATION', 'BLOCKED_AUTHORITY'].map((v) => [v, results.filter((r) => r.verdict === v).length]));
  return { schema: 'atlas.title-writer-audit.v1', registryVersion, runtimeVersion, crossChecks, counts, results, unclassified: TITLE_WRITERS_UNCLASSIFIED_V1, writesPerformed: false, canonicalAuthority: false };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = runTitleWriterAuditV1();
  if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else {
    for (const r of report.results) console.log(`${r.verdict.padEnd(30)} ${r.id}  [${r.findings.map((f) => f.code).join(', ') || '-'}]`);
    for (const x of report.crossChecks) console.log(`CROSS-CHECK ${x.code} registry=${x.registryVersion} runtime=${x.runtimeVersion}`);
    console.log(`counts: ${JSON.stringify(report.counts)}; unclassified (not read): ${report.unclassified.length}`);
  }
}
