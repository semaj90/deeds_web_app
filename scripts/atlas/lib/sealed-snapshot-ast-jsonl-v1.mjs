import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { extractSymbolsFromSource } from '../../graphify/lib/ts-ast-extractor.mjs';
import { extractJsonSymbols } from './json-symbol-extractor.mjs';
import { extractMarkdownSymbols } from './markdown-symbol-extractor.mjs';
import { decodeSourceTextEnvelope, decodedOffsetToRawByte, classifySourceKind } from './source-text-envelope.mjs';
import { isGraphifySymbolExcludedArtifactV2 } from './graphify-symbol-candidate-selection-v1.mjs';

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const parserVersions = Object.freeze({ typescript: ts.version, sourceTextEnvelope: 'SOURCE-TEXT-ENCODING-01' });

export function validateSealedSnapshotInventoryPlanV1(plan) {
  if (plan?.schema !== 'atlas.graphify-sealed-snapshot-inventory-plan.v1'
    || plan?.sourceScope !== 'repo:root'
    || !/^sha256:[0-9a-f]{64}$/.test(plan?.workspaceRevision ?? '')
    || !/^sha256:[0-9a-f]{64}$/.test(plan?.snapshotRevision ?? '')
    || !Array.isArray(plan?.rows)
    || plan.rows.length !== plan.selectedSourceCount
    || plan.rows.length !== plan.scopeSourceCount
    || plan.rows.some((row) => row.workspaceRevision !== plan.workspaceRevision)) {
    throw new Error('STAGING_PLAN_CONTRACT_INVALID');
  }
  return plan;
}

export function resolveContainedSnapshotFile(snapshotRoot, sourceRef) {
  if (typeof sourceRef !== 'string' || !sourceRef || sourceRef.includes('\\') || sourceRef.startsWith('/')
    || sourceRef.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error('STAGING_SOURCE_REF_INVALID');
  }
  const root = fs.realpathSync(snapshotRoot);
  const candidate = path.resolve(root, ...sourceRef.split('/'));
  const candidateRelative = path.relative(root, candidate);
  if (!candidateRelative || candidateRelative.startsWith('..') || path.isAbsolute(candidateRelative)) {
    throw new Error('STAGING_PATH_OUTSIDE_SNAPSHOT');
  }
  const resolved = fs.realpathSync(candidate);
  const resolvedRelative = path.relative(root, resolved);
  if (resolvedRelative.startsWith('..') || path.isAbsolute(resolvedRelative)) {
    throw new Error('STAGING_SYMLINK_OUTSIDE_SNAPSHOT');
  }
  return resolved;
}

function convertObservations(envelope, symbols) {
  return symbols.map((symbol) => {
    const startByte = decodedOffsetToRawByte(envelope, symbol.start_byte);
    const endByte = decodedOffsetToRawByte(envelope, symbol.end_byte);
    if (endByte < startByte || endByte > envelope.rawByteLength) {
      throw new Error('STAGING_AST_SPAN_OUT_OF_BOUNDS');
    }
    return {
      kind: symbol.kind,
      name: symbol.name,
      startByte,
      endByte,
      startLine: symbol.start_line,
      endLine: symbol.end_line,
      symbolFingerprint: symbol.ast_fingerprint,
      spanSha256: sha256(envelope.rawBytes.subarray(startByte, endByte)),
      parentChain: symbol.parent_chain,
    };
  });
}

export function stageSealedSnapshotSourceV1({ row, snapshotRoot, plan }) {
  const sourceRef = row.sourceRef;
  const common = {
    schema: 'atlas.staged-ast-source.v1',
    sourceRef,
    sourceRevision: row.codeSourceRevision,
    workspaceRevision: row.workspaceRevision,
    snapshotRevision: plan.snapshotRevision,
    byteLength: row.byteLength,
    contentSha256: row.contentHash,
    canonicalAuthority: false,
    databaseWrites: false,
  };
  try {
    const absolutePath = resolveContainedSnapshotFile(snapshotRoot, sourceRef);
    const rawBytes = fs.readFileSync(absolutePath);
    const rawDigest = sha256(rawBytes);
    if (rawBytes.length !== row.byteLength || rawDigest !== row.contentHash || row.codeSourceRevision !== `sha256:${rawDigest}`) {
      return { ...common, status: 'SOURCE_BYTES_MISMATCH', observedByteLength: rawBytes.length, observedContentSha256: rawDigest };
    }
    if (isGraphifySymbolExcludedArtifactV2(sourceRef)) {
      return { ...common, status: 'EXCLUDED_BY_EXISTING_POLICY', parserId: null, parserVersion: null, observations: [] };
    }
    const sourceKind = classifySourceKind(sourceRef);
    if (!sourceKind) {
      return { ...common, status: 'PARSER_UNSUPPORTED', parserId: null, parserVersion: null, observations: [] };
    }
    const envelope = decodeSourceTextEnvelope(rawBytes, sourceRef);
    envelope.rawByteLength = rawBytes.length;
    envelope.rawBytes = rawBytes;
    if (sourceRef === 'scripts/atlas/audit-qdrant-noise.mjs'
      && rawDigest === '11415c43f6c3280935addf25123222f2d3857d5e9d7c58f0a14e42a41d37c98a') {
      return { ...common, status: 'PARSER_STALL_KNOWN', parserId: 'typescript-compiler-api', parserVersion: parserVersions.typescript, sourceEncoding: envelope.sourceEncoding, errorCode: 'KNOWN_STALL_ON_MALFORMED_FROZEN_BYTES', observations: [] };
    }
    let parserId;
    let parserVersion;
    let symbols;
    if (sourceKind.documentKind === 'code') {
      parserId = 'typescript-compiler-api';
      parserVersion = parserVersions.typescript;
      symbols = extractSymbolsFromSource(envelope.text, sourceRef);
    } else if (sourceKind.documentKind === 'json') {
      parserId = 'typescript-json-ast';
      parserVersion = parserVersions.typescript;
      symbols = extractJsonSymbols(envelope.text, sourceRef);
    } else if (sourceKind.documentKind === 'markdown') {
      parserId = 'atlas-markdown-heading-extractor';
      parserVersion = 'v1';
      symbols = extractMarkdownSymbols(envelope.text, sourceRef);
    } else {
      return { ...common, status: 'INDEXED_OPAQUE_TEXT', parserId: 'source-text-envelope', parserVersion: parserVersions.sourceTextEnvelope, sourceEncoding: envelope.sourceEncoding, observations: [] };
    }
    return {
      ...common,
      status: 'PARSED',
      parserId,
      parserVersion,
      sourceEncoding: envelope.sourceEncoding,
      observations: convertObservations(envelope, symbols),
    };
  } catch (error) {
    return {
      ...common,
      status: 'PARSE_OR_READ_FAILED',
      parserId: null,
      parserVersion: null,
      errorCode: error instanceof Error ? error.message.slice(0, 180) : 'UNKNOWN_ERROR',
      observations: [],
    };
  }
}

export function summarizeStagedAstRowsV1(rows) {
  const statuses = {};
  let observationCount = 0;
  for (const row of rows) {
    statuses[row.status] = (statuses[row.status] ?? 0) + 1;
    observationCount += row.observations?.length ?? 0;
  }
  return { rowCount: rows.length, statuses, observationCount };
}
