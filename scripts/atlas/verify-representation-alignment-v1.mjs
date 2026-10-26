#!/usr/bin/env node
/**
 * REPRESENTATION-ALIGNMENT-CONFLICT-AUDIT-V2
 *
 * Compares the repository's governing canonical physical column with the
 * historical non-authoritative representation manifest. It does not qualify
 * the embedding recipe, source lineage, retrieval quality, or projections.
 *
 * Output: docs/reports/representation-alignment-audit-v2.json
 * Reads repository files only; never mutates database or projection state.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './connection-config.mjs';

const contractPath = path.join(REPO_ROOT, 'AGENTS.md');
const previousManifestPath = path.join(REPO_ROOT, 'docs/reports/representation-manifest-v1.json');
const auditOutputPath = path.join(REPO_ROOT, 'docs/reports/representation-alignment-audit-v2.json');
const contractText = fs.readFileSync(contractPath, 'utf8');
const previousManifestBytes = fs.readFileSync(previousManifestPath);
const previousManifest = JSON.parse(previousManifestBytes.toString('utf8'));
const contractMatch = contractText.match(/canonical dense owner is `codebase_chunk_index\.([a-zA-Z0-9_]+)`/i);

if (!contractMatch) throw new Error('GOVERNING_CANONICAL_COLUMN_NOT_FOUND');

const contractColumn = contractMatch[1];
const manifestCanonical = previousManifest.representations?.canonical?.physicalStorage;
const manifestColumn = manifestCanonical?.column ?? null;
const manifestType = manifestCanonical?.dataType ?? null;
const contractDigest = crypto.createHash('sha256').update(contractText).digest('hex');
const previousManifestDigest = crypto.createHash('sha256').update(previousManifestBytes).digest('hex');
const conflict = manifestColumn !== contractColumn;
const report = {
  schema: 'atlas.representation-alignment-audit.v2',
  generatedAt: new Date().toISOString(),
  canonicalAuthority: false,
  writesPerformed: false,
  status: conflict ? 'NONAUTHORITATIVE_MANIFEST_CONFLICT' : 'DECLARATIONS_ALIGNED_UNQUALIFIED',
  governingContract: {
    path: 'AGENTS.md',
    sha256: `sha256:${contractDigest}`,
    declaredCanonicalPhysicalColumn: `codebase_chunk_index.${contractColumn}`,
  },
  priorManifest: {
    path: 'docs/reports/representation-manifest-v1.json',
    schema: previousManifest.schema,
    sha256: `sha256:${previousManifestDigest}`,
    canonicalAuthority: previousManifest.canonicalAuthority === true,
    status: previousManifest.status,
    declaredCanonicalColumn: manifestColumn,
    declaredCanonicalDataType: manifestType,
  },
  resolution: {
    authority: 'AGENTS.md repository contract',
    canonicalPhysicalColumn: `codebase_chunk_index.${contractColumn}`,
    conflictingArtifactIsAuthoritative: false,
    representationRecipeQualified: false,
    sourceLineageQualified: false,
    requiredAction: 'Keep the historical v1 manifest immutable; issue a reviewed replacement only after recipe and lineage qualification.',
  },
};
const serialized = `${JSON.stringify(report, null, 2)}\n`;
fs.writeFileSync(auditOutputPath, serialized, 'utf8');
console.log(JSON.stringify({ status: report.status, canonicalColumn: report.resolution.canonicalPhysicalColumn, conflictingManifestColumn: manifestColumn, outputPath: auditOutputPath }, null, 2));
if (conflict) process.exitCode = 2;
