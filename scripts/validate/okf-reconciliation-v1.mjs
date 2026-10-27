#!/usr/bin/env node
// Read-only OKF reconciliation by cause. Input: output of audit-okf-v02-bundle-v1.mjs. Output: .tmp/atlas only.
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { evaluateOkfProfileReadiness, extractOkfDeclaredDocument, normalizeOkfEvidencePath, probeOkfSyntax, reconcileOkfAudit, resolveOkfManifestBinding } from './okf-reconciliation-core.mjs';

const root = process.cwd();
const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const inputPath = path.resolve(root, arg('in', '.tmp/atlas/okf-v02-audit-reconcile-20261027.json'));
const outputPath = path.resolve(root, arg('out', '.tmp/atlas/okf-reconciliation-by-cause-20261027.json'));
const atlasTmp = path.resolve(root, '.tmp/atlas');
if (!outputPath.startsWith(`${atlasTmp}${path.sep}`)) { console.error('OKF_RECONCILIATION_OUTPUT_MUST_STAY_UNDER_TMP_ATLAS'); process.exit(2); }

const audit = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const auditBytes = fs.readFileSync(inputPath);
const requireFromFrontend = createRequire(path.resolve(root, 'sveltekit-frontend/package.json'));
const { parse: parseYaml } = requireFromFrontend('yaml');
const yamlPackage = JSON.parse(fs.readFileSync(path.resolve(root, 'sveltekit-frontend/node_modules/yaml/package.json'), 'utf8'));
const ajvPackage = JSON.parse(fs.readFileSync(path.resolve(root, 'sveltekit-frontend/node_modules/ajv/package.json'), 'utf8'));
const reconciliation = reconcileOkfAudit(audit.files);
const okfManifest = parseYaml(fs.readFileSync(path.resolve(root, '.okf/manifest.yaml'), 'utf8')) ?? {};
const manifestRegistries = okfManifest.registries ?? {};
const inventoryRows = [];
const fileEvidence = new Map();
for (const row of reconciliation.perFile) {
  const absolutePath = path.resolve(root, row.path);
  const relativeToRoot = path.relative(root, absolutePath);
  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot) || !fs.statSync(absolutePath).isFile()) {
    throw new Error(`OKF_FILE_NOT_REGULAR_OR_OUTSIDE_ROOT:${row.path}`);
  }
  const bytes = fs.readFileSync(absolutePath);
  const text = bytes.toString('utf8');
  const sha256 = `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
  inventoryRows.push(`${row.path}\t${sha256}\t${bytes.length}\n`);
  const auditRow = audit.files.find((item) => item.path === row.path);
  fileEvidence.set(row.path, {
    ...row,
    manifestBinding: resolveOkfManifestBinding(row.path, manifestRegistries),
    auditProfileApplied: audit.profile?.profileRevision ?? 'UNKNOWN_AUDIT_PROFILE',
    v02AuditScope: row.cause === 'EXTERNAL_SNAPSHOT_OUT_OF_PROFILE_SCOPE' ? 'EXTERNAL_SNAPSHOT_EXCLUDED_FROM_V02' : 'SUBJECT_TO_V02_AUDIT',
    intendedProfileApplicability: 'UNVERIFIED',
    declaredDocument: extractOkfDeclaredDocument(row.path, text, { parseYaml }),
    sourceByteLength: bytes.length,
    sourceSha256: sha256,
    exactReasonCodes: auditRow?.reasonCodes ?? [],
  });
}
inventoryRows.sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
const inventorySha256 = `sha256:${crypto.createHash('sha256').update(inventoryRows.join(''), 'utf8').digest('hex')}`;

const ownerValidationByFile = new Map();
const ownerReceiptPaths = [
  '.tmp/atlas/okf-language-profile-validation-20261027-v5.json',
  '.tmp/atlas/okf-domain-taxonomy-validation-20261027-v2.json',
  '.tmp/atlas/okf-keyword-corpus-validation-20261027-v2.json',
  '.tmp/atlas/okf-feature-relationships-profile-validation-20261027T1457.json',
  '.tmp/atlas/okf-concept-gap-live-20261027T2145.json',
  '.tmp/atlas/okf-code-exploration-index-validation-20261027-v1.json',
  '.tmp/atlas/okf-parent-atlas-code-explore-validation-20261027-v1.json',
  '.tmp/atlas/okf-code-capability-index-validation-20261027-v2.json',
  '.tmp/atlas/okf-dspy-corpus-current-validation-20261027-v1.json',
  '.tmp/atlas/okf-dspy-corpus-3.4.0-validation-20261027-v1.json',
  '.tmp/atlas/okf-dspy-corpus-current-validation-20261027-v2.json',
  '.tmp/atlas/okf-dspy-corpus-3.4.0-validation-20261027-v2.json',
];
const supersededOwnerReceiptPaths = [
  '.tmp/atlas/okf-domain-schema-mismatch-feature-intelligence-20261027.json',
  '.tmp/atlas/okf-domain-schema-mismatch-parent-atlas-execution-20261027.json',
  '.tmp/atlas/okf-domain-schema-mismatch-structured-value-20261027.json',
];
for (const receiptRelativePath of ownerReceiptPaths) {
  const receiptPath = path.resolve(root, receiptRelativePath);
  if (!fs.existsSync(receiptPath)) continue;
  const ownerReceipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  const entries = ownerReceipt.profiles ?? ownerReceipt.files ?? [ownerReceipt];
  for (const entry of entries) {
    const relativePath = normalizeOkfEvidencePath(entry.path ?? entry.documentPath);
    const current = fileEvidence.get(relativePath);
    if (!current) continue;
    const expectedSourceDigest = String(entry.sha256 ?? entry.documentSha256 ?? entry.sourceSha256 ?? '').replace(/^sha256:/, '');
    const sourceDigestMatches = expectedSourceDigest.length === 64 && current.sourceSha256.slice(7) === expectedSourceDigest;
    const schemaPath = normalizeOkfEvidencePath(entry.schemaPath) ?? (relativePath.startsWith('.okf/languages/') ? '.okf/schemas/language-profile-v1.schema.json' : null);
    const schemaSha256 = schemaPath && fs.existsSync(path.resolve(root, schemaPath))
      ? `sha256:${crypto.createHash('sha256').update(fs.readFileSync(path.resolve(root, schemaPath))).digest('hex')}`
      : null;
    const schemaDigestMatches = !entry.schemaSha256 || schemaSha256?.slice(7) === String(entry.schemaSha256).replace(/^sha256:/, '');
    const validatorPath = entry.validatorPath ?? ownerReceipt.validatorPath ?? null;
    const expectedValidatorDigest = String(entry.validatorSha256 ?? ownerReceipt.validatorSha256 ?? '').replace(/^sha256:/, '');
    const resolvedValidatorPath = validatorPath ? path.resolve(root, validatorPath) : null;
    const relativeValidatorPath = resolvedValidatorPath ? path.relative(root, resolvedValidatorPath) : null;
    const validatorPathSafe = Boolean(relativeValidatorPath && !relativeValidatorPath.startsWith('..') && !path.isAbsolute(relativeValidatorPath));
    const validatorSha256 = validatorPathSafe && fs.existsSync(resolvedValidatorPath) && fs.statSync(resolvedValidatorPath).isFile()
      ? `sha256:${crypto.createHash('sha256').update(fs.readFileSync(resolvedValidatorPath)).digest('hex')}`
      : null;
    const codeDependencies = entry.codeDependencies ?? ownerReceipt.codeDependencies ?? [];
    const verifiedCodeDependencies = Array.isArray(codeDependencies) ? codeDependencies.map((dependency) => {
      const dependencyPath = path.resolve(root, dependency.path ?? '');
      const relativeDependencyPath = path.relative(root, dependencyPath);
      const dependencyPathSafe = Boolean(dependency.path && !relativeDependencyPath.startsWith('..') && !path.isAbsolute(relativeDependencyPath));
      const dependencySha256 = dependencyPathSafe && fs.existsSync(dependencyPath) && fs.statSync(dependencyPath).isFile()
        ? `sha256:${crypto.createHash('sha256').update(fs.readFileSync(dependencyPath)).digest('hex')}`
        : null;
      const expectedDependencySha256 = String(dependency.sha256 ?? '').replace(/^sha256:/, '');
      return {
        path: dependency.path ?? null,
        sha256: dependencySha256,
        digestMatches: dependencyPathSafe && /^[a-f0-9]{64}$/.test(expectedDependencySha256) && dependencySha256?.slice(7) === expectedDependencySha256,
      };
    }) : [];
    const validatorDigestMatches = (!expectedValidatorDigest || (validatorPathSafe && validatorSha256?.slice(7) === expectedValidatorDigest))
      && Array.isArray(codeDependencies)
      && verifiedCodeDependencies.length === codeDependencies.length
      && verifiedCodeDependencies.every((dependency) => dependency.digestMatches);
    const ownerPass = (entry.valid === true || ownerReceipt.status === 'VALID' || entry.status === 'PASS')
      && (entry.errors?.length ?? 0) === 0;
    const validationKind = entry.validationKind ?? ownerReceipt.validationKind ?? (entry.schemaPath ? 'JSON_SCHEMA' : null);
    const ownerValidationStatus = !sourceDigestMatches
      ? 'STALE_SOURCE_EVIDENCE'
      : !validatorDigestMatches
        ? 'STALE_VALIDATOR_EVIDENCE'
      : !schemaDigestMatches
        ? 'STALE_SCHEMA_EVIDENCE'
        : (entry.errors?.length ?? 0) > 0
          ? validationKind === 'PROFILE_CONTRACT' ? 'PROFILE_CONTRACT_REJECTED' : 'SCHEMA_REJECTED'
          : ownerPass ? validationKind === 'PROFILE_CONTRACT' ? 'PASS_CURRENT_SOURCE_AND_PROFILE' : 'PASS_CURRENT_SOURCE_AND_SCHEMA' : 'VALIDATION_STATUS_UNPROVEN';
    ownerValidationByFile.set(relativePath, {
      status: ownerValidationStatus,
      profile: entry.profile ?? entry.language ?? ownerReceipt.profile ?? ownerReceipt.schema,
      validationKind,
      validatorReceipt: receiptRelativePath,
      validatorPath,
      validatorSha256: expectedValidatorDigest ? `sha256:${expectedValidatorDigest}` : null,
      validatorDigestMatches,
      codeDependencies: verifiedCodeDependencies,
      schemaPath,
      schemaSha256,
      sourceDigestMatches,
      schemaDigestMatches,
      errors: entry.errors ?? ownerReceipt.errors ?? [],
    });
  }
}
for (const receiptRelativePath of supersededOwnerReceiptPaths) {
  const receiptPath = path.resolve(root, receiptRelativePath);
  if (!fs.existsSync(receiptPath)) continue;
  const ownerReceipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  const entries = ownerReceipt.profiles ?? ownerReceipt.files ?? [ownerReceipt];
  for (const entry of entries) {
    const relativePath = normalizeOkfEvidencePath(entry.path ?? entry.documentPath);
    const current = fileEvidence.get(relativePath);
    if (!current) continue;
    const expectedSourceDigest = String(entry.sha256 ?? entry.documentSha256 ?? entry.sourceSha256 ?? '').replace(/^sha256:/, '');
    current.supersededOwnerValidationEvidence ??= [];
    current.supersededOwnerValidationEvidence.push({
      status: 'SUPERSEDED_SCHEMA_PROFILE',
      reason: 'The prior diagnostic applied a schema not bound to this manifest member; it is not an intended-profile validation.',
      receipt: receiptRelativePath,
      schemaPath: normalizeOkfEvidencePath(entry.schemaPath) ?? null,
      sourceDigestMatches: expectedSourceDigest.length === 64 && current.sourceSha256.slice(7) === expectedSourceDigest,
      errors: entry.errors ?? ownerReceipt.errors ?? [],
    });
  }
}
const Ajv = requireFromFrontend('ajv').default;
const Ajv2019 = requireFromFrontend('ajv/dist/2019').default;
const Ajv2020 = requireFromFrontend('ajv/dist/2020').default;
const validateSchemaDocument = (relativePath) => {
  const schema = JSON.parse(fs.readFileSync(path.resolve(root, relativePath), 'utf8'));
  const draft = schema[`${String.fromCharCode(36)}schema`] ?? '';
  const Validator = draft.includes('2020-12') ? Ajv2020 : draft.includes('2019-09') ? Ajv2019 : Ajv;
  const validator = new Validator({ strict: false, allErrors: true });
  const valid = validator.validateSchema(schema);
  return { valid, draft: draft || 'DRAFT_07_DEFAULT', errors: valid ? [] : validator.errors ?? [] };
};
const schemaDocuments = [
  ...fs.readdirSync(path.resolve(root, '.okf/schemas')).filter((name) => name.endsWith('.json')).map((name) => `.okf/schemas/${name}`),
  '.okf/corpora/keyword-corpus.schema.json',
];
for (const relativePath of schemaDocuments) {
  const source = fileEvidence.get(relativePath);
  if (!source) continue;
  const result = validateSchemaDocument(relativePath);
  ownerValidationByFile.set(relativePath, {
    status: result.valid ? 'PASS_SCHEMA_DOCUMENT_SELF_VALIDATION' : 'FAIL_SCHEMA_DOCUMENT_SELF_VALIDATION',
    profile: result.draft,
    validatorReceipt: 'current-reconciliation-run',
    validator: `ajv@${ajvPackage.version}`,
    schemaPath: relativePath,
    schemaSha256: source.sourceSha256,
    sourceDigestMatches: true,
    schemaDigestMatches: true,
    errors: result.errors,
  });
}
const catalogPath = '.okf/languages/tree-sitter-language-pack-catalog-v1.json';
const catalogSchemaPath = '.okf/schemas/tree-sitter-language-catalog-v1.schema.json';
const catalogEvidence = fileEvidence.get(catalogPath);
if (catalogEvidence) {
  const schema = JSON.parse(fs.readFileSync(path.resolve(root, catalogSchemaPath), 'utf8'));
  const draft = schema[`${String.fromCharCode(36)}schema`] ?? '';
  const Validator = draft.includes('2020-12') ? Ajv2020 : draft.includes('2019-09') ? Ajv2019 : Ajv;
  const validator = new Validator({ strict: false, allErrors: true });
  const valid = validator.validate(schema, JSON.parse(fs.readFileSync(path.resolve(root, catalogPath), 'utf8')));
  ownerValidationByFile.set(catalogPath, {
    status: valid ? 'PASS_CURRENT_SOURCE_AND_SCHEMA' : 'SCHEMA_REJECTED',
    profile: 'tree-sitter-language-catalog-v1',
    validatorReceipt: 'current-reconciliation-run',
    validator: `ajv@${ajvPackage.version}`,
    schemaPath: catalogSchemaPath,
    schemaSha256: `sha256:${crypto.createHash('sha256').update(fs.readFileSync(path.resolve(root, catalogSchemaPath))).digest('hex')}`,
    sourceDigestMatches: true,
    schemaDigestMatches: true,
    errors: valid ? [] : validator.errors ?? [],
  });
}
for (const [relativePath, evidence] of ownerValidationByFile) {
  fileEvidence.set(relativePath, { ...fileEvidence.get(relativePath), ownerValidation: evidence });
}

for (const [relativePath, evidence] of fileEvidence) {
  const text = fs.readFileSync(path.resolve(root, relativePath), 'utf8');
  evidence.syntaxObservation = {
    ...probeOkfSyntax(relativePath, text, { parseYaml }),
    sourceSha256: evidence.sourceSha256,
    schemaAsserted: false,
  };
}

const snapshotRoots = [];
for (const docsEntry of fs.readdirSync(path.resolve(root, '.okf/docs'), { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
  const snapshotsPath = path.resolve(root, '.okf/docs', docsEntry.name, 'snapshots');
  if (!fs.existsSync(snapshotsPath)) continue;
  for (const snapshotEntry of fs.readdirSync(snapshotsPath, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
    snapshotRoots.push(path.join(snapshotsPath, snapshotEntry.name));
  }
}
const snapshotRows = [];
const snapshotControlFiles = [];
const snapshotControlArtifacts = [];
for (const snapshotRoot of snapshotRoots) {
  const manifestPath = path.join(snapshotRoot, 'manifest.json');
  const receiptPath = path.join(snapshotRoot, 'receipt.json');
  const pagesPath = path.join(snapshotRoot, 'pages.jsonl');
  if (![manifestPath, receiptPath, pagesPath].every((filePath) => fs.existsSync(filePath))) {
    snapshotControlFiles.push({ path: path.relative(root, snapshotRoot).replaceAll('\\', '/'), status: 'SNAPSHOT_CONTROL_FILE_MISSING' });
    continue;
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  const relativePath = (filePath) => path.relative(root, filePath).replaceAll('\\', '/');
  snapshotControlFiles.push({
    path: relativePath(manifestPath), expectedSha256: receipt.manifestSha256 ?? null,
    worktreeSha256: `sha256:${crypto.createHash('sha256').update(fs.readFileSync(manifestPath)).digest('hex')}`,
    pagesManifestSha256: manifest.pagesManifestSha256 ?? null,
    worktreePagesManifestSha256: `sha256:${crypto.createHash('sha256').update(fs.readFileSync(pagesPath)).digest('hex')}`,
    schema: manifest.schema,
  });
  snapshotControlArtifacts.push(
    { path: relativePath(manifestPath), expectedSha256: receipt.manifestSha256 ?? null, artifactKind: 'manifest' },
    { path: relativePath(pagesPath), expectedSha256: manifest.pagesManifestSha256 ?? null, artifactKind: 'pages-manifest' },
    { path: relativePath(receiptPath), expectedSha256: null, manifestSha256: receipt.manifestSha256 ?? null, artifactKind: 'capture-receipt', receiptSchema: receipt.schema, receiptContractValid: receipt.canonicalAuthority === false && receipt.datastoreWritesPerformed === false },
  );
  for (const page of manifest.pages ?? []) {
    for (const [artifactKind, digestField] of [['rawHtml', 'rawHtmlSha256'], ['normalizedText', 'normalizedTextSha256']]) {
      const artifactPath = path.resolve(snapshotRoot, page.artifactRefs?.[artifactKind] ?? '');
      const relativeArtifactPath = relativePath(artifactPath);
      const relativeWithinSnapshot = path.relative(snapshotRoot, artifactPath);
      if (!relativeWithinSnapshot || relativeWithinSnapshot.startsWith('..') || path.isAbsolute(relativeWithinSnapshot)) {
        snapshotRows.push({ path: relativeArtifactPath, artifactKind, status: 'SNAPSHOT_ARTIFACT_PATH_INVALID', expectedSha256: page[digestField] ?? null });
        continue;
      }
      const bytes = fs.existsSync(artifactPath) ? fs.readFileSync(artifactPath) : null;
      const expectedSha256 = page[digestField] ?? null;
      const worktreeSha256 = bytes ? `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}` : null;
      const normalizedSha256 = bytes ? `sha256:${crypto.createHash('sha256').update(bytes.toString('utf8').replace(/\r\n/g, '\n'), 'utf8').digest('hex')}` : null;
      snapshotRows.push({ path: relativeArtifactPath, artifactKind, expectedSha256, worktreeSha256, normalizedSha256, status: !bytes ? 'SNAPSHOT_ARTIFACT_MISSING' : worktreeSha256 === expectedSha256 ? 'WORKTREE_BYTES_MATCH' : normalizedSha256 === expectedSha256 ? 'WORKTREE_EOL_TRANSFORMED' : 'WORKTREE_BYTES_MISMATCH' });
    }
  }
  for (const index of manifest.indexes ?? []) {
    const artifactPath = path.resolve(snapshotRoot, index.artifactRef ?? '');
    const relativeArtifactPath = relativePath(artifactPath);
    const relativeWithinSnapshot = path.relative(snapshotRoot, artifactPath);
    const bytes = fs.existsSync(artifactPath) ? fs.readFileSync(artifactPath) : null;
    const expectedSha256 = index.sha256 ?? null;
    const worktreeSha256 = bytes ? `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}` : null;
    const normalizedSha256 = bytes ? `sha256:${crypto.createHash('sha256').update(bytes.toString('utf8').replace(/\r\n/g, '\n'), 'utf8').digest('hex')}` : null;
    snapshotRows.push({ path: relativeArtifactPath, artifactKind: 'index', expectedSha256, worktreeSha256, normalizedSha256, status: !relativeWithinSnapshot || relativeWithinSnapshot.startsWith('..') || path.isAbsolute(relativeWithinSnapshot) ? 'SNAPSHOT_ARTIFACT_PATH_INVALID' : !bytes ? 'SNAPSHOT_ARTIFACT_MISSING' : worktreeSha256 === expectedSha256 ? 'WORKTREE_BYTES_MATCH' : normalizedSha256 === expectedSha256 ? 'WORKTREE_EOL_TRANSFORMED' : 'WORKTREE_BYTES_MISMATCH' });
  }
  if (manifest.discovery?.mapResponseSha256) {
    const artifactPath = path.join(snapshotRoot, 'indexes', 'firecrawl-map.json');
    const relativeArtifactPath = relativePath(artifactPath);
    const bytes = fs.existsSync(artifactPath) ? fs.readFileSync(artifactPath) : null;
    const expectedSha256 = manifest.discovery.mapResponseSha256;
    const worktreeSha256 = bytes ? `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}` : null;
    const normalizedSha256 = bytes ? `sha256:${crypto.createHash('sha256').update(bytes.toString('utf8').replace(/\r\n/g, '\n'), 'utf8').digest('hex')}` : null;
    snapshotRows.push({ path: relativeArtifactPath, artifactKind: 'discovery-map', expectedSha256, worktreeSha256, normalizedSha256, status: !bytes ? 'SNAPSHOT_ARTIFACT_MISSING' : worktreeSha256 === expectedSha256 ? 'WORKTREE_BYTES_MATCH' : normalizedSha256 === expectedSha256 ? 'WORKTREE_EOL_TRANSFORMED' : 'WORKTREE_BYTES_MISMATCH' });
  }
}
const snapshotPaths = [...new Set([...snapshotRoots.map((snapshotRoot) => path.relative(root, snapshotRoot).replaceAll('\\', '/'))])];
const gitTree = execFileSync('git', ['ls-tree', '-r', '-z', 'HEAD', '--', ...snapshotPaths], { cwd: root, maxBuffer: 16 * 1024 * 1024 });
const gitBlobByPath = new Map();
for (const entry of gitTree.toString('utf8').split('\0').filter(Boolean)) {
  const separator = entry.indexOf('\t');
  const metadata = entry.slice(0, separator).split(' ');
  gitBlobByPath.set(entry.slice(separator + 1), metadata[2]);
}
const gitObjectIds = [...new Set([...snapshotRows.map((row) => gitBlobByPath.get(row.path)), ...snapshotControlFiles.map((row) => gitBlobByPath.get(row.path)), ...snapshotControlArtifacts.map((row) => gitBlobByPath.get(row.path))].filter(Boolean))];
const gitBatch = execFileSync('git', ['cat-file', '--batch'], { cwd: root, input: `${gitObjectIds.join('\n')}\n`, encoding: null, maxBuffer: 512 * 1024 * 1024 });
const gitBlobShaById = new Map();
let gitBatchOffset = 0;
while (gitBatchOffset < gitBatch.length) {
  const headerEnd = gitBatch.indexOf(0x0a, gitBatchOffset);
  if (headerEnd < 0) throw new Error('SNAPSHOT_GIT_BLOB_HEADER_INVALID');
  const [objectId, objectType, byteLengthText] = gitBatch.subarray(gitBatchOffset, headerEnd).toString('ascii').split(' ');
  const byteLength = Number(byteLengthText);
  if (objectType !== 'blob' || !Number.isSafeInteger(byteLength) || byteLength < 0) throw new Error('SNAPSHOT_GIT_BLOB_DESCRIPTOR_INVALID');
  const contentStart = headerEnd + 1;
  const contentEnd = contentStart + byteLength;
  if (gitBatch[contentEnd] !== 0x0a) throw new Error('SNAPSHOT_GIT_BLOB_TERMINATOR_INVALID');
  gitBlobShaById.set(objectId, `sha256:${crypto.createHash('sha256').update(gitBatch.subarray(contentStart, contentEnd)).digest('hex')}`);
  gitBatchOffset = contentEnd + 1;
}
for (const row of snapshotRows) {
  const objectId = gitBlobByPath.get(row.path);
  row.gitBlobSha256 = objectId ? gitBlobShaById.get(objectId) ?? null : null;
  row.gitBlobMatchesManifest = row.gitBlobSha256 === row.expectedSha256;
  if (row.gitBlobMatchesManifest && row.status === 'WORKTREE_EOL_TRANSFORMED') row.status = 'GIT_BLOB_VERIFIED_WORKTREE_EOL_TRANSFORMED';
  else if (!row.gitBlobMatchesManifest) row.status = objectId ? 'SNAPSHOT_GIT_BLOB_DIGEST_MISMATCH' : row.worktreeSha256 === row.expectedSha256 ? 'SNAPSHOT_CONTROL_WORKTREE_BYTES_VERIFIED' : 'SNAPSHOT_ARTIFACT_NOT_TRACKED_AT_HEAD';
  const existing = fileEvidence.get(row.path);
  if (existing) {
    existing.ownerValidation = {
      status: row.status,
      profile: 'atlas.local-doc-snapshot-manifest.v1',
      validatorReceipt: 'snapshot manifest + immutable Git blob verification',
      schemaPath: null,
      schemaSha256: null,
      sourceDigestMatches: row.gitBlobMatchesManifest || row.worktreeSha256 === row.expectedSha256,
      schemaDigestMatches: true,
      errors: row.status.startsWith('GIT_BLOB_VERIFIED') || row.status === 'WORKTREE_BYTES_MATCH' ? [] : [row.status],
    };
  }
}
for (const row of snapshotControlFiles) {
  const objectId = gitBlobByPath.get(row.path);
  row.gitBlobSha256 = objectId ? gitBlobShaById.get(objectId) ?? null : null;
  row.gitBlobMatchesReceipt = row.gitBlobSha256 === row.expectedSha256;
  const snapshotRoot = path.dirname(path.resolve(root, row.path));
  const pagesPath = path.join(snapshotRoot, 'pages.jsonl');
  const pagesRelativePath = path.relative(root, pagesPath).replaceAll('\\', '/');
  const pagesObjectId = gitBlobByPath.get(pagesRelativePath);
  row.pagesManifestGitBlobSha256 = pagesObjectId ? gitBlobShaById.get(pagesObjectId) ?? null : null;
  row.pagesManifestMatchesManifest = row.worktreePagesManifestSha256 === row.pagesManifestSha256;
  row.status = row.gitBlobMatchesReceipt && row.pagesManifestMatchesManifest ? 'SNAPSHOT_CONTROL_EVIDENCE_VERIFIED' : 'SNAPSHOT_CONTROL_EVIDENCE_MISMATCH';
}
for (const row of snapshotControlArtifacts) {
  const currentPath = path.resolve(root, row.path);
  const currentBytes = fs.existsSync(currentPath) ? fs.readFileSync(currentPath) : null;
  row.worktreeSha256 = currentBytes ? `sha256:${crypto.createHash('sha256').update(currentBytes).digest('hex')}` : null;
  row.normalizedSha256 = currentBytes ? `sha256:${crypto.createHash('sha256').update(currentBytes.toString('utf8').replace(/\r\n/g, '\n'), 'utf8').digest('hex')}` : null;
  const objectId = gitBlobByPath.get(row.path);
  row.gitBlobSha256 = objectId ? gitBlobShaById.get(objectId) ?? null : null;
  const matchingManifest = snapshotControlFiles.find((control) => path.dirname(control.path) === path.dirname(row.path));
  row.gitBlobMatchesExpected = row.expectedSha256 === null || row.artifactKind === 'pages-manifest'
    ? Boolean(row.worktreeSha256 && row.expectedSha256 === row.worktreeSha256)
    : row.gitBlobSha256 === row.expectedSha256;
  row.status = row.artifactKind === 'capture-receipt'
    ? row.receiptContractValid && row.gitBlobSha256 && row.gitBlobSha256 === row.normalizedSha256 && row.manifestSha256 === matchingManifest?.gitBlobSha256 ? 'SNAPSHOT_RECEIPT_CONTRACT_VERIFIED' : 'SNAPSHOT_RECEIPT_INVALID'
    : row.artifactKind === 'pages-manifest'
      ? row.gitBlobSha256 ? row.gitBlobSha256 === row.expectedSha256 ? 'SNAPSHOT_CONTROL_GIT_BLOB_VERIFIED' : 'SNAPSHOT_CONTROL_WORKTREE_BYTES_VERIFIED_GIT_BLOB_DIFFERS' : row.gitBlobMatchesExpected ? 'SNAPSHOT_CONTROL_WORKTREE_BYTES_VERIFIED' : 'SNAPSHOT_CONTROL_WORKTREE_BYTES_MISMATCH'
      : row.gitBlobMatchesExpected ? 'SNAPSHOT_CONTROL_GIT_BLOB_VERIFIED' : 'SNAPSHOT_CONTROL_GIT_BLOB_MISMATCH';
  const current = fileEvidence.get(row.path);
  if (current) current.ownerValidation = {
    status: row.status,
    profile: row.artifactKind === 'capture-receipt' ? row.receiptSchema : 'atlas.local-doc-snapshot-manifest.v1',
    validatorReceipt: 'snapshot manifest + immutable Git blob verification',
    schemaPath: null,
    schemaSha256: null,
    sourceDigestMatches: row.status.includes('VERIFIED'),
    schemaDigestMatches: true,
    errors: row.status.includes('VERIFIED') ? [] : [row.status],
  };
}
const referencedSnapshotPaths = new Set([...snapshotRows.map((row) => row.path), ...snapshotControlArtifacts.map((row) => row.path)]);
const unreferencedSnapshotFiles = [...fileEvidence.keys()].filter((filePath) => filePath.includes('/snapshots/') && !referencedSnapshotPaths.has(filePath));
for (const relativePath of unreferencedSnapshotFiles) {
  const current = fileEvidence.get(relativePath);
  current.ownerValidation = {
    status: 'SNAPSHOT_ARTIFACT_NOT_REFERENCED_BY_MANIFEST',
    profile: 'atlas.local-doc-snapshot-manifest.v1',
    validatorReceipt: 'snapshot manifest + immutable Git blob verification',
    schemaPath: null,
    schemaSha256: null,
    sourceDigestMatches: false,
    schemaDigestMatches: true,
    errors: ['SNAPSHOT_ARTIFACT_NOT_REFERENCED_BY_MANIFEST'],
  };
}

// Which alternative vocabulary do the genuine records already carry? Observation only; no mapping is proposed.
const ALT = ['status', 'owner', 'evidence', 'authority', 'source', 'updated'];
const altVocabulary = {};
for (const row of reconciliation.perFile.filter((f) => f.cause === 'RECORD_MISSING_V02_FIELDS')) {
  try {
    const text = fs.readFileSync(path.resolve(root, row.path), 'utf8');
    const doc = row.path.endsWith('.md') ? parseYaml(text.slice(3, text.indexOf('\n---', 3))) : parseYaml(text);
    row.alternativeKeysPresent = ALT.filter((key) => doc && typeof doc === 'object' && key in doc);
    for (const key of row.alternativeKeysPresent) altVocabulary[key] = (altVocabulary[key] ?? 0) + 1;
  } catch { row.alternativeKeysPresent = []; row.parseNote = 'UNREADABLE_FOR_VOCABULARY_OBSERVATION'; }
}

const body = {
  schema: 'atlas.okf-reconciliation-by-cause.v1',
  sourceAudit: { sha256: `sha256:${crypto.createHash('sha256').update(auditBytes).digest('hex')}`, status: audit.status, considered: audit.filesConsidered, invalid: audit.invalidFiles, excluded: audit.excludedFiles },
  profile: audit.profile,
  validators: { audit: 'atlas-okf-v02-validation-profile-v1', yamlParser: `yaml@${yamlPackage.version}`, reconciliation: 'okf-reconciliation-by-cause-v1', gitBlobVerifier: 'git-ls-tree+cat-file-head-v1', ajv: `ajv@${ajvPackage.version}` },
  inventorySha256,
  counts: { total: reconciliation.total, invalid: audit.invalidFiles, excluded: audit.excludedFiles, unclassified: reconciliation.unclassified, reconciled: reconciliation.total === audit.filesConsidered && reconciliation.unclassified === 0 },
  byCause: reconciliation.byCause,
  sharedConfigurationFinding: reconciliation.sharedConfigurationFinding,
  recordAlternativeVocabulary: altVocabulary,
  snapshotVerification: {
    profile: 'atlas.local-doc-snapshot-manifest.v1',
    snapshots: snapshotControlFiles,
    controlArtifacts: snapshotControlArtifacts,
    referencedArtifacts: snapshotRows,
    unreferencedSnapshotFiles,
    counts: snapshotRows.reduce((counts, row) => { counts[row.status] = (counts[row.status] ?? 0) + 1; return counts; }, {}),
    controlStatusCounts: snapshotControlFiles.reduce((counts, row) => { counts[row.status] = (counts[row.status] ?? 0) + 1; return counts; }, {}),
  },
  ownerValidationCounts: [...fileEvidence.values()].reduce((counts, row) => { const status = row.ownerValidation?.status ?? 'OWNER_VALIDATION_MISSING'; counts[status] = (counts[status] ?? 0) + 1; return counts; }, {}),
  manifestBindingCounts: [...fileEvidence.values()].reduce((counts, row) => { const status = row.manifestBinding?.status ?? 'MANIFEST_BINDING_UNAVAILABLE'; counts[status] = (counts[status] ?? 0) + 1; return counts; }, {}),
  profileBindingCounts: [...fileEvidence.values()].reduce((counts, row) => {
    const status = row.ownerValidation?.status;
    const isSnapshotArtifact = row.path.startsWith('.okf/docs/') && row.path.includes('/snapshots/');
    const binding = isSnapshotArtifact && ['GIT_BLOB_VERIFIED_WORKTREE_EOL_TRANSFORMED', 'SNAPSHOT_CONTROL_EVIDENCE_VERIFIED', 'SNAPSHOT_CONTROL_GIT_BLOB_VERIFIED', 'SNAPSHOT_CONTROL_WORKTREE_BYTES_VERIFIED', 'SNAPSHOT_CONTROL_WORKTREE_BYTES_VERIFIED_GIT_BLOB_DIFFERS', 'SNAPSHOT_RECEIPT_CONTRACT_VERIFIED', 'WORKTREE_BYTES_MATCH'].includes(status)
      ? 'SNAPSHOT_INTEGRITY_ONLY'
      : status === 'SCHEMA_REJECTED' || status === 'PROFILE_CONTRACT_REJECTED'
      ? 'PROFILE_VALIDATION_REJECTED'
      : status === 'PASS_CURRENT_SOURCE_AND_SCHEMA' || status === 'PASS_CURRENT_SOURCE_AND_PROFILE'
        ? 'INTENDED_PROFILE_VALIDATED'
        : status === 'PASS_SCHEMA_DOCUMENT_SELF_VALIDATION'
          ? 'SCHEMA_DOCUMENT_SELF_VALIDATED_ONLY'
          : !row.ownerValidation
            ? 'PROFILE_OWNER_UNREGISTERED'
            : 'PROFILE_VALIDATION_NOT_ESTABLISHED';
    counts[binding] = (counts[binding] ?? 0) + 1;
    row.profileBindingStatus = binding;
    const manifestBindings = row.manifestBinding?.bindings ?? [];
    if (binding === 'PROFILE_OWNER_UNREGISTERED') row.profileBindingReason = manifestBindings.some((item) => item.status === 'MANIFEST_SCHEMA_DECLARED_OWNER_RECEIPT_REQUIRED')
      ? 'MANIFEST_LISTS_FILE_AND_SCHEMA_BUT_NO_CURRENT_OWNER_VALIDATION_RECEIPT'
      : manifestBindings.some((item) => item.status === 'MANIFEST_MEMBER_WITHOUT_SCHEMA_BINDING')
        ? 'MANIFEST_LISTS_FILE_WITHOUT_SCHEMA_BINDING_OR_CURRENT_OWNER_RECEIPT'
        : manifestBindings.some((item) => item.status === 'REGISTRY_PATH_NOT_LISTED')
          ? 'FILE_IS_UNLISTED_WITHIN_MANIFEST_REGISTRY_PATH'
          : 'NO_MATCHING_MANIFEST_REGISTRY_OR_OWNER_VALIDATOR_RECEIPT';
    if (binding === 'PROFILE_VALIDATION_REJECTED') row.profileBindingReason = 'REGISTERED_SCHEMA_REJECTED_DOCUMENT; PROFILE_APPLICABILITY_REQUIRES_OWNER_REVIEW';
    if (binding === 'SNAPSHOT_INTEGRITY_ONLY') row.profileBindingReason = 'SNAPSHOT_MANIFEST_AND_SOURCE_INTEGRITY_PROVEN; DOCUMENT_SCHEMA_NOT_ASSERTED';
    return counts;
  }, {}),
  files: reconciliation.perFile.map((row) => fileEvidence.get(row.path)),
  ...evaluateOkfProfileReadiness([...fileEvidence.values()], {
    unreferencedSnapshotFiles: unreferencedSnapshotFiles.length,
    unclassified: reconciliation.unclassified,
    inventoryReconciled: reconciliation.total === audit.filesConsidered,
  }),
  okfProfileValid: false,
  canonicalAuthority: false,
  safeToProject: false,
  writesPerformed: false,
};
const receiptSha256 = `sha256:${crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex')}`;
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify({ ...body, receiptSha256 }, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ status: body.status, counts: body.counts, byCause: Object.fromEntries(Object.entries(body.byCause).map(([k, v]) => [k, v.files])), sharedConfigurationFinding: body.sharedConfigurationFinding, recordAlternativeVocabulary: altVocabulary, receiptSha256, output: path.relative(root, outputPath) }, null, 2));
