import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const CLAIM_SCHEMA = 'atlas.okf-claim-freshness-audit.v1';

function sha256(value) {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(stable(value));
}

function scalar(value) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) return trimmed.slice(1, -1);
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed.slice(1, -1).split(',').map((item) => item.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  }
  return trimmed;
}

function parseFrontmatter(text) {
  if (!text.startsWith('---')) return {};
  const end = text.indexOf('\n---', 3);
  if (end < 0) return {};
  const lines = text.slice(3, end).split(/\r?\n/);
  const result = {};
  let listKey = null;
  for (const line of lines) {
    const listItem = line.match(/^\s+-\s+(.+)$/);
    if (listItem && listKey) {
      if (!Array.isArray(result[listKey])) result[listKey] = [];
      result[listKey].push(scalar(listItem[1]));
      continue;
    }
    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!match) continue;
    const [, key, value] = match;
    if (value === '') {
      result[key] = [];
      listKey = key;
    } else {
      result[key] = scalar(value);
      listKey = null;
    }
  }
  return result;
}

function walk(root) {
  const files = [];
  if (!fs.existsSync(root)) return files;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (/\.(?:md|okf|ya?ml|json)$/i.test(entry.name)) files.push(full);
  }
  return files.sort();
}

function asArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.length > 0) : typeof value === 'string' && value ? [value] : [];
}

const CLAIM_ID_MARKERS = new Set(['claimId', 'claim_id', 'claimRevision', 'claim_revision']);

function isClaimCandidate(file) {
  const text = fs.readFileSync(file, 'utf8');
  const frontmatter = parseFrontmatter(text);
  const frontmatterKeys = Object.keys(frontmatter);
  if (frontmatterKeys.some((key) => CLAIM_ID_MARKERS.has(key))) return true;
  if (frontmatterKeys.includes('evidenceRefs') || frontmatterKeys.includes('evidence_refs')) return true;
  if (!/\.json$/i.test(file)) return false;
  try {
    const parsed = JSON.parse(text);
    const values = Array.isArray(parsed) ? parsed : [parsed];
    return values.some((value) => value && typeof value === 'object' && Object.keys(value).some((key) => CLAIM_ID_MARKERS.has(key)));
  } catch {
    return false;
  }
}

function auditClaim(file, root, options) {
  const text = fs.readFileSync(file, 'utf8');
  const frontmatter = parseFrontmatter(text);
  const relativePath = path.relative(root, file).replaceAll('\\', '/');
  const claimId = frontmatter.claimId ?? frontmatter.claim_id ?? frontmatter.id ?? `okf:${relativePath}`;
  const sourceRef = frontmatter.sourceRef ?? frontmatter.source_ref ?? frontmatter.source ?? '';
  const sourceRevision = frontmatter.sourceRevision ?? frontmatter.source_revision ?? '';
  const workspaceRevision = frontmatter.workspaceRevision ?? frontmatter.workspace_revision ?? '';
  const evidenceRefs = asArray(frontmatter.evidenceRefs ?? frontmatter.evidence_refs);
  const evidenceChecksum = frontmatter.evidenceChecksum ?? frontmatter.evidence_checksum ?? '';
  const claimRevision = frontmatter.claimRevision ?? frontmatter.claim_revision ?? frontmatter.revision ?? '';
  const producerRevision = frontmatter.producerRevision ?? frontmatter.producer_revision ?? frontmatter.generatedBy ?? '';
  const canonicalAuthority = frontmatter.canonicalAuthority === true || frontmatter.authority === 'canonical';
  const missing = [];
  if (!claimId) missing.push('CLAIM_ID');
  if (!claimRevision) missing.push('CLAIM_REVISION');
  if (!sourceRef) missing.push('SOURCE_REF');
  if (!sourceRevision) missing.push('SOURCE_REVISION');
  if (!workspaceRevision) missing.push('WORKSPACE_REVISION');
  if (evidenceRefs.length === 0) missing.push('EVIDENCE_REFS');
  if (!evidenceChecksum) missing.push('EVIDENCE_CHECKSUM');
  if (!producerRevision) missing.push('PRODUCER_REVISION');
  const revisionMismatch = Boolean(
    (options.sourceRevision && sourceRevision && options.sourceRevision !== sourceRevision)
    || (options.workspaceRevision && workspaceRevision && options.workspaceRevision !== workspaceRevision),
  );
  const status = canonicalAuthority
    ? 'CANONICAL_AUTHORITY_FORBIDDEN'
    : revisionMismatch
      ? 'STALE_REVISION'
      : missing.length > 0
        ? 'UNRESOLVED_MISSING_FIELDS'
        : 'VALID_DERIVED_CLAIM';
  const identity = { claimId, claimRevision, sourceRef, sourceRevision, workspaceRevision, evidenceRefs, evidenceChecksum, producerRevision };
  return {
    path: relativePath,
    status,
    missing,
    claimId,
    claimIdSource: frontmatter.claimId || frontmatter.claim_id || frontmatter.id ? 'DECLARED' : 'DERIVED_PATH',
    canonicalAuthority: false,
    sourceRevision: sourceRevision || null,
    workspaceRevision: workspaceRevision || null,
    evidenceRefs,
    claimChecksum: sha256(canonicalJson(identity)),
    contentChecksum: sha256(text),
    writesPerformed: false,
  };
}

export function auditOkfClaims({ root, sourceRevision, workspaceRevision } = {}) {
  const sourceRoot = path.resolve(root ?? path.resolve(process.cwd(), 'docs/okf'));
  const allArtifacts = walk(sourceRoot);
  const claimFiles = allArtifacts.filter(isClaimCandidate);
  const ignoredArtifacts = allArtifacts
    .filter((file) => !claimFiles.includes(file))
    .map((file) => ({ path: path.relative(sourceRoot, file).replaceAll('\\', '/'), reason: 'NO_CLAIM_METADATA' }));
  const claims = claimFiles.map((file) => auditClaim(file, sourceRoot, { sourceRevision, workspaceRevision }));
  const counts = Object.fromEntries([...new Set(claims.map((claim) => claim.status))].sort().map((status) => [status, claims.filter((claim) => claim.status === status).length]));
  return {
    schema: CLAIM_SCHEMA,
    status: claims.length === 0
      ? 'NO_CLAIM_ARTIFACTS_FOUND'
      : claims.every((claim) => claim.status === 'VALID_DERIVED_CLAIM')
        ? 'CLAIM_FRESHNESS_PROVEN_DERIVED_ONLY'
        : 'CLAIM_FRESHNESS_REVIEW_REQUIRED',
    sourceRoot,
    generatedAt: new Date().toISOString(),
    summary: { scannedArtifacts: allArtifacts.length, ignoredArtifacts: ignoredArtifacts.length, claimCandidates: claims.length, totalClaims: claims.length, validClaims: claims.filter((claim) => claim.status === 'VALID_DERIVED_CLAIM').length, staleClaims: claims.filter((claim) => claim.status === 'STALE_REVISION').length, unresolvedClaims: claims.filter((claim) => claim.status !== 'VALID_DERIVED_CLAIM').length, statusCounts: counts },
    claims,
    ignoredArtifacts,
    indexChecksum: sha256(canonicalJson(claims.map((claim) => ({ path: claim.path, claimChecksum: claim.claimChecksum, status: claim.status })))),
    canonicalAuthority: false,
    promotionAuthorized: false,
    writesPerformed: false,
  };
}

function main() {
  const root = process.argv[2] ?? path.resolve(process.cwd(), 'docs/okf');
  const output = process.argv[3] ?? path.resolve(process.cwd(), 'docs/reports/okf-claim-freshness-v1.json');
  const report = auditOkfClaims({ root, sourceRevision: process.env.ATLAS_SOURCE_REVISION, workspaceRevision: process.env.ATLAS_WORKSPACE_REVISION });
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ schema: report.schema, status: report.status, totalClaims: report.summary.totalClaims, validClaims: report.summary.validClaims, unresolvedClaims: report.summary.unresolvedClaims, writesPerformed: false, output }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
