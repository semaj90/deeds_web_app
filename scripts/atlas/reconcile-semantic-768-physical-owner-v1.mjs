#!/usr/bin/env node
/**
 * SEMANTIC-768-PHYSICAL-OWNER-01
 *
 * Read-only adjudication over the existing semantic writer census. The
 * physical semantic_768 storage owner is already frozen by
 * SemanticRepresentationV1 as codebase_chunk_index.content_embedding
 * (halfvec(768)); this gate decides whether exactly one current mutation
 * writer satisfies the revision-qualified canonical lineage contract.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_CENSUS = 'docs/reports/semantic-768-writer-ownership-v1.json';
const DEFAULT_OUT = 'docs/reports/semantic-768-physical-owner-v1.json';
const PHYSICAL_OWNER = Object.freeze({
  table: 'codebase_chunk_index',
  column: 'content_embedding',
  storageType: 'halfvec(768)',
  representationId: 'semantic_768',
  dimensions: 768,
});

const CLASSIFICATIONS = Object.freeze([
  'CANONICAL_CURRENT_WRITER',
  'DELEGATES_TO_CANONICAL_WRITER',
  'READ_ONLY_CONSUMER',
  'DERIVED_PROJECTION',
  'LEGACY_WRITER',
  'CHALLENGER',
  'MIGRATION_ARTIFACT',
  'TEST_ONLY',
  'DEAD_ORPHAN',
  'UNRESOLVED',
]);

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function readJson(relativePath) {
  const absolute = path.resolve(ROOT, relativePath);
  if (!fs.existsSync(absolute)) throw new Error(`REPORT_REQUIRED:${relativePath}`);
  return JSON.parse(fs.readFileSync(absolute, 'utf8'));
}

function readSource(relativePath) {
  const absolute = path.resolve(ROOT, relativePath.replaceAll('\\', '/'));
  try {
    if (!fs.statSync(absolute).isFile()) return '';
    return fs.readFileSync(absolute, 'utf8');
  } catch {
    return '';
  }
}

function has(source, pattern) {
  return pattern.test(source);
}

function isKnownHistoricalPhysicalMigration(normalizedPath) {
  return /(?:^|\/)(?:reembed-corpus-document-prefix-v1|sem768-admission-dry-\d+|apply-lineage-qualified-semantic-768-backfill-v1)\.mjs$/i.test(normalizedPath);
}

export function inspectWriterContract(writer, source) {
  const normalizedPath = writer.path.replaceAll('\\', '/');
  const isTest = /(?:^|\/)(?:test|tests|__tests__|fixtures?)(?:\/|\.|$)|\.spec\.|\.test\./i.test(normalizedPath);
  const isMigration = /backfill|migration|reembed|phase\d+|apply-lineage-qualified|ingest-/i.test(normalizedPath);
  const isLegacySurface = writer.surface === 'codebase_chunk_index.content_embedding_768'
    || writer.surface === 'atlas_packets.embedding';
  const isPhysicalOwnerSurface = writer.surface === 'codebase_chunk_index.content_embedding';
  const knownHistoricalPhysicalMigration = isPhysicalOwnerSurface && isKnownHistoricalPhysicalMigration(normalizedPath);

  const evidence = {
    canonicalChunkId: has(source, /canonical_chunk_id|canonicalChunkId/i),
    packetKey: has(source, /packet_key|packetKey/i),
    workspaceRevision: has(source, /workspace_revision|workspaceRevision/i),
    sourceRevision: has(source, /source_revision|sourceRevision/i),
    embeddingModelRevision: has(source, /upstreamRevision|modelRevision|embedding_model_revision|embeddingModelRevision|embedding_version/i),
    representationRevision: has(source, /representation_revision|representationRevision|bindingChecksum|representationId/i),
    dimensions768: has(source, /(?:halfvec\s*\(\s*768\s*\)|dimension\s*[=:]\s*768|dimensions\s*[=:]\s*768|length\s*!==\s*768|\bcontent_embedding\b(?!_768))/i),
    readbackIdentity: has(source, /readback/i)
      && has(source, /vector_dims\s*\(|dimensions/i)
      && has(source, /embedding_version|representationRevision/i),
    physicalOwnerWrite: has(source, /(?:UPDATE\s+(?:public\.)?codebase_chunk_index|INSERT\s+INTO\s+(?:public\.)?codebase_chunk_index)[\s\S]{0,2400}\bcontent_embedding\b(?!_768)\s*=/i)
      || has(source, /\bcontent_embedding\b(?!_768)\s*=\s*\$\d+::halfvec\(768\)/i),
    explicitApplyGuard: has(source, /--apply|\bAPPLY\b|EXPLICIT_[A-Z0-9_]*AUTHORIZATION_REQUIRED|ATLAS_AUTHORIZE_/i),
    sourceWorkspaceWriteGuard: has(source, /(?:WHERE|EXISTS\s*\()[\s\S]{0,3200}(source_revision|sourceRevision)[\s\S]{0,3200}(workspace_revision|workspaceRevision)/i),
    provenLineageJoin: has(source, /atlas_packet_chunk_lineage/i)
      && has(source, /revision_status\s*=\s*['"]PROVEN['"]/i)
      && has(source, /atlas_workspace_source_bindings/i),
  };

  const requiredLineage = [
    'canonicalChunkId',
    'packetKey',
    'workspaceRevision',
    'sourceRevision',
    'embeddingModelRevision',
    'representationRevision',
    'dimensions768',
    'readbackIdentity',
    'physicalOwnerWrite',
    'explicitApplyGuard',
    'sourceWorkspaceWriteGuard',
    'provenLineageJoin',
  ];
  const missingRequiredEvidence = requiredLineage.filter((key) => !evidence[key]);

  let classification;
  let reason;
  if (writer.kind !== 'MUTATION_WRITER') {
    classification = 'READ_ONLY_CONSUMER';
    reason = 'Surface is not mutation-capable in the current writer census.';
  } else if (isTest) {
    classification = 'TEST_ONLY';
    reason = 'Mutation-capable text exists only in a test/fixture surface.';
  } else if (isLegacySurface) {
    classification = isMigration ? 'MIGRATION_ARTIFACT' : 'LEGACY_WRITER';
    reason = `Writes ${writer.surface}, which is not the frozen physical semantic_768 owner.`;
  } else if (!isPhysicalOwnerSurface) {
    classification = 'DERIVED_PROJECTION';
    reason = `Writer targets ${writer.surface}, not ${PHYSICAL_OWNER.table}.${PHYSICAL_OWNER.column}.`;
  } else if (knownHistoricalPhysicalMigration) {
    classification = 'MIGRATION_ARTIFACT';
    reason = 'Historical/reconciliation writer for the physical semantic column; not admitted as the current operator path.';
  } else if (missingRequiredEvidence.length === 0) {
    classification = 'CANONICAL_CURRENT_WRITER';
    reason = 'Writer targets the frozen physical owner and exposes the full revision-qualified canonical writer contract.';
  } else {
    classification = 'UNRESOLVED';
    reason = `Writer targets the physical owner but lacks required canonical writer evidence: ${missingRequiredEvidence.join(', ')}.`;
  }

  if (!CLASSIFICATIONS.includes(classification)) throw new Error(`UNKNOWN_WRITER_CLASSIFICATION:${classification}`);

  return {
    path: writer.path,
    surface: writer.surface,
    censusKind: writer.kind,
    censusRole: writer.role,
    revisionQualifiedByCensus: writer.revisionQualified === true,
    guardedByCensus: writer.guarded === true,
    canonicalLineageQualifiedByCensus: writer.canonicalLineageQualified === true,
    independentReadbackByCensus: writer.independentReadback === true,
    explicitApplyByCensus: writer.explicitApply === true,
    productionReachableCandidate: writer.productionReachableCandidate === true,
    classification,
    evidence,
    missingRequiredEvidence,
    reason,
  };
}

export function evaluateSemanticPhysicalOwner(census, sourceReader = readSource) {
  const surfaces = (census.writers ?? []).map((writer) => inspectWriterContract(writer, sourceReader(writer.path)));
  const canonicalWriters = surfaces.filter((surface) => surface.classification === 'CANONICAL_CURRENT_WRITER');
  const unresolvedCurrentWriters = surfaces.filter((surface) =>
    surface.classification === 'UNRESOLVED'
    && surface.surface === `${PHYSICAL_OWNER.table}.${PHYSICAL_OWNER.column}`
    && surface.censusKind === 'MUTATION_WRITER');

  const blockers = [];
  if (canonicalWriters.length !== 1) blockers.push(`CANONICAL_CURRENT_WRITER_COUNT:${canonicalWriters.length}`);
  if (unresolvedCurrentWriters.length !== 0) blockers.push(`UNRESOLVED_CURRENT_WRITERS:${unresolvedCurrentWriters.length}`);

  const status = blockers.length === 0
    ? 'SEMANTIC_768_PHYSICAL_OWNER_PROVEN'
    : 'SEMANTIC_768_PHYSICAL_OWNER_BLOCKED';

  const reportBase = {
    schema: 'atlas.semantic-768-physical-owner.v1',
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY_RECONCILIATION',
    status,
    physicalOwner: PHYSICAL_OWNER,
    physicalOwnerResolved: true,
    canonicalCurrentWriter: canonicalWriters.length === 1 ? canonicalWriters[0].path : null,
    canonicalCurrentWriterCount: canonicalWriters.length,
    unresolvedCurrentWriters: unresolvedCurrentWriters.map((surface) => surface.path),
    unresolvedCurrentWriterCount: unresolvedCurrentWriters.length,
    migrationArtifacts: surfaces.filter((surface) => surface.classification === 'MIGRATION_ARTIFACT').map((surface) => surface.path),
    legacyWriters: surfaces.filter((surface) => surface.classification === 'LEGACY_WRITER').map((surface) => surface.path),
    surfaces,
    blockers,
    sourceReport: DEFAULT_CENSUS,
    authority: false,
    writesPerformed: false,
    nextGate: status === 'SEMANTIC_768_PHYSICAL_OWNER_PROVEN'
      ? 'RICH-CHUNK-CONTRACT-01'
      : 'CANONICAL_SEMANTIC_WRITER_LINEAGE_CLOSURE',
  };

  return { ...reportBase, checksum: sha256(canonicalJson(reportBase)) };
}

async function main() {
  const censusPath = argValue('census', DEFAULT_CENSUS);
  const outputPath = argValue('out', DEFAULT_OUT);
  const noReport = process.argv.includes('--no-report');
  const census = readJson(censusPath);
  const report = evaluateSemanticPhysicalOwner(census);

  if (!noReport) {
    const absoluteOut = path.resolve(ROOT, outputPath);
    fs.mkdirSync(path.dirname(absoluteOut), { recursive: true });
    fs.writeFileSync(absoluteOut, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }

  console.log(JSON.stringify({
    status: report.status,
    physicalOwner: report.physicalOwner,
    canonicalCurrentWriter: report.canonicalCurrentWriter,
    canonicalCurrentWriterCount: report.canonicalCurrentWriterCount,
    unresolvedCurrentWriterCount: report.unresolvedCurrentWriterCount,
    blockers: report.blockers,
    reportPath: noReport ? null : outputPath,
    writesPerformed: false,
  }, null, 2));

  if (report.status !== 'SEMANTIC_768_PHYSICAL_OWNER_PROVEN') process.exitCode = 2;
}

const invokedAsScript = process.argv[1]
  ? import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
  : false;
if (invokedAsScript) main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
