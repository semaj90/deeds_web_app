import path from 'node:path';

/** Pure cause classification for the OKF v0.2 bundle audit. No I/O. */

export const OKF_CAUSES = Object.freeze([
  'EXTERNAL_SNAPSHOT_OUT_OF_PROFILE_SCOPE',
  'RECORD_MISSING_V02_FIELDS',
  'RECORD_FRONTMATTER_MISSING',
  'UNSUPPORTED_FILE_TYPE_SCHEMA_OR_CATALOG',
  'UNSUPPORTED_FILE_TYPE_OTHER',
  'UNCLASSIFIED',
]);

const SNAPSHOT_PATH = /^\.okf\/docs\/[^/]+\/snapshots\//;

export function normalizeOkfEvidencePath(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.replaceAll('\\', '/');
  if (normalized.startsWith('docs/.okf/')) return normalized;
  const docsMarker = '/docs/.okf/';
  const docsIndex = normalized.indexOf(docsMarker);
  if (docsIndex >= 0) return normalized.slice(docsIndex + 1);
  const marker = '/.okf/';
  const index = normalized.indexOf(marker);
  return index >= 0 ? `.okf/${normalized.slice(index + marker.length)}` : normalized;
}

/** @param {{path:string,status:string,reasonCodes?:string[]}} file */
export function classifyOkfFile(file) {
  const reasons = file.reasonCodes ?? [];
  if (SNAPSHOT_PATH.test(file.path)) return 'EXTERNAL_SNAPSHOT_OUT_OF_PROFILE_SCOPE';
  if (file.status === 'INVALID_V02_PROFILE' && reasons.some((r) => r.startsWith('REQUIRED_FIELD_MISSING:'))) return 'RECORD_MISSING_V02_FIELDS';
  if (file.status === 'INVALID_V02_PROFILE' && reasons.includes('MARKDOWN_FRONTMATTER_MISSING')) return 'RECORD_FRONTMATTER_MISSING';
  if (file.status === 'EXCLUDED_FROM_V02_PROFILE') {
    return /\.(json|jsonl)$/i.test(file.path) && /^\.okf\/(schemas|corpora|languages|domains|indexes)\//.test(file.path)
      ? 'UNSUPPORTED_FILE_TYPE_SCHEMA_OR_CATALOG'
      : 'UNSUPPORTED_FILE_TYPE_OTHER';
  }
  return 'UNCLASSIFIED';
}

export function resolveOkfManifestBinding(filePath, registries) {
  const normalizedFile = filePath.replaceAll('\\', '/');
  const bindings = [];
  for (const [registryName, registry] of Object.entries(registries ?? {})) {
    const registryPath = String(registry?.path ?? '').replaceAll('\\', '/').replace(/\/$/, '');
    const declaredEntries = Array.isArray(registry?.schemas) ? registry.schemas : [];
    const declaredEntry = declaredEntries.find((entry) => {
      const entryPath = typeof entry === 'string' ? entry : entry?.path ?? entry?.file;
      if (typeof entryPath !== 'string') return false;
      const normalizedEntry = entryPath.replaceAll('\\', '/');
      const joinedEntry = path.posix.normalize(path.posix.join('.okf', registryPath, normalizedEntry));
      return normalizedEntry === normalizedFile || joinedEntry === normalizedFile;
    });
    const withinRegistry = registryPath && (normalizedFile === `.okf/${registryPath}` || normalizedFile.startsWith(`.okf/${registryPath}/`));
    if (!declaredEntry && !withinRegistry) continue;
    const declaredEntryName = declaredEntry ? (typeof declaredEntry === 'string' ? declaredEntry : declaredEntry.path ?? declaredEntry.file) : null;
    const schemaReference = typeof registry?.schema_files?.[declaredEntryName] === 'string'
      ? registry.schema_files[declaredEntryName]
      : typeof registry?.schema_file === 'string' ? registry.schema_file : null;
    const schemaPath = schemaReference
      ? path.posix.normalize(path.posix.join('.okf', registryPath, schemaReference.replaceAll('\\', '/')))
      : null;
    bindings.push({
      registry: registryName,
      declaredMember: Boolean(declaredEntry),
      declaredEntry: declaredEntryName,
      schemaReference,
      schemaPath,
      status: !declaredEntry
        ? 'REGISTRY_PATH_NOT_LISTED'
        : schemaReference
          ? 'MANIFEST_SCHEMA_DECLARED_OWNER_RECEIPT_REQUIRED'
          : 'MANIFEST_MEMBER_WITHOUT_SCHEMA_BINDING',
    });
  }
  if (bindings.length === 0) return { registry: null, declaredMember: false, declaredEntry: null, schemaReference: null, schemaPath: null, bindings, status: 'NO_MANIFEST_REGISTRY_BINDING' };
  if (bindings.length > 1) return { registry: null, declaredMember: true, declaredEntry: null, schemaReference: null, schemaPath: null, bindings, status: 'MULTIPLE_MANIFEST_BINDINGS' };
  return { ...bindings[0], bindings };
}

export function probeOkfSyntax(filePath, text, { parseYaml, parseJson = JSON.parse }) {
  const extension = path.extname(filePath).toLowerCase();
  let candidateText = text;
  let parser = null;
  let validStatus = null;
  let invalidStatus = null;
  if (extension === '.json') {
    parser = parseJson;
    validStatus = 'JSON_SYNTAX_VALID';
    invalidStatus = 'JSON_SYNTAX_INVALID';
  } else if (extension === '.yaml' || extension === '.yml') {
    parser = parseYaml;
    validStatus = 'YAML_SYNTAX_VALID';
    invalidStatus = 'YAML_SYNTAX_INVALID';
  } else if (extension === '.md') {
    if (!text.startsWith('---')) return { status: 'MARKDOWN_BODY_PROFILE_UNASSERTED', parser: null, error: null };
    const end = text.indexOf('\n---', 3);
    if (end <= 0) return { status: 'MARKDOWN_FRONTMATTER_UNTERMINATED', parser: 'yaml', error: null };
    candidateText = text.slice(3, end);
    parser = parseYaml;
    validStatus = 'MARKDOWN_FRONTMATTER_SYNTAX_VALID';
    invalidStatus = 'MARKDOWN_FRONTMATTER_SYNTAX_INVALID';
  } else {
    return { status: 'SYNTAX_PROBE_NOT_APPLICABLE', parser: null, error: null };
  }
  try {
    if (typeof parser !== 'function') throw new Error('PARSER_UNAVAILABLE');
    parser(candidateText);
    return { status: validStatus, parser: extension === '.json' ? 'JSON.parse' : 'yaml', error: null };
  } catch (error) {
    return { status: invalidStatus, parser: extension === '.json' ? 'JSON.parse' : 'yaml', error: `${error.name ?? 'Error'}:${error.message ?? 'PARSE_ERROR'}` };
  }
}

export function extractOkfDeclaredDocument(filePath, text, { parseYaml, parseJson = JSON.parse }) {
  const extension = path.extname(filePath).toLowerCase();
  let source = null;
  let candidateText = text;
  if (extension === '.json') source = 'json';
  else if (extension === '.yaml' || extension === '.yml') source = 'yaml';
  else if (extension === '.md') {
    if (!text.startsWith('---')) return { status: 'DECLARATION_NO_FRONTMATTER', source: null, type: null, schema: null, version: null, id: null };
    const end = text.indexOf('\n---', 3);
    if (end <= 0) return { status: 'DECLARATION_FRONTMATTER_UNTERMINATED', source: 'yaml-frontmatter', type: null, schema: null, version: null, id: null };
    candidateText = text.slice(3, end);
    source = 'yaml-frontmatter';
  } else {
    return { status: 'DECLARATION_UNSUPPORTED_FORMAT', source: null, type: null, schema: null, version: null, id: null };
  }
  try {
    const parser = source === 'json' ? parseJson : parseYaml;
    if (typeof parser !== 'function') throw new Error('PARSER_UNAVAILABLE');
    const document = parser(candidateText);
    if (!document || typeof document !== 'object' || Array.isArray(document)) {
      return { status: 'DECLARATION_NOT_OBJECT', source, type: null, schema: null, version: null, id: null };
    }
    return {
      status: 'DECLARATION_PARSED',
      source,
      type: typeof document.type === 'string' ? document.type : null,
      schema: typeof document.schema === 'string' ? document.schema : typeof document.$schema === 'string' ? document.$schema : null,
      version: typeof document.version === 'string' || typeof document.version === 'number' ? document.version : null,
      id: typeof document.id === 'string' ? document.id : typeof document.corpusId === 'string' ? document.corpusId : typeof document.registry_id === 'string' ? document.registry_id : null,
    };
  } catch {
    return { status: 'DECLARATION_SYNTAX_INVALID', source, type: null, schema: null, version: null, id: null };
  }
}

const ACCEPTED_PROFILE_EVIDENCE = new Set([
  'PASS_CURRENT_SOURCE_AND_SCHEMA',
  'PASS_CURRENT_SOURCE_AND_PROFILE',
  'PASS_SCHEMA_DOCUMENT_SELF_VALIDATION',
  'WORKTREE_BYTES_MATCH',
  'GIT_BLOB_VERIFIED_WORKTREE_EOL_TRANSFORMED',
  'SNAPSHOT_CONTROL_EVIDENCE_VERIFIED',
  'SNAPSHOT_CONTROL_GIT_BLOB_VERIFIED',
  'SNAPSHOT_CONTROL_WORKTREE_BYTES_VERIFIED',
  'SNAPSHOT_CONTROL_WORKTREE_BYTES_VERIFIED_GIT_BLOB_DIFFERS',
  'SNAPSHOT_RECEIPT_CONTRACT_VERIFIED',
]);

export function evaluateOkfProfileReadiness(files, { unreferencedSnapshotFiles = 0, unclassified = 0, inventoryReconciled = true } = {}) {
  const statuses = files.map((file) => file.ownerValidation?.status ?? 'OWNER_VALIDATION_MISSING');
  const blocker = unclassified > 0
    ? 'OKF_FILE_CAUSE_UNCLASSIFIED'
    : !inventoryReconciled
      ? 'OKF_INVENTORY_RECONCILIATION_FAILED'
      : unreferencedSnapshotFiles > 0
        ? 'SNAPSHOT_ARTIFACTS_UNREFERENCED'
        : statuses.includes('STALE_SOURCE_EVIDENCE')
          ? 'OKF_OWNER_RECEIPT_SOURCE_STALE'
          : statuses.includes('STALE_VALIDATOR_EVIDENCE')
            ? 'OKF_OWNER_RECEIPT_VALIDATOR_STALE'
            : statuses.includes('STALE_SCHEMA_EVIDENCE')
              ? 'OKF_OWNER_RECEIPT_SCHEMA_STALE'
               : statuses.includes('SCHEMA_REJECTED') || statuses.includes('PROFILE_CONTRACT_REJECTED')
                ? 'OKF_INTENDED_PROFILE_REJECTED_REQUIRES_OWNER_REVIEW'
                : statuses.includes('FAIL_SCHEMA_DOCUMENT_SELF_VALIDATION')
                  ? 'OKF_SCHEMA_DOCUMENT_INVALID'
                  : statuses.includes('OWNER_VALIDATION_MISSING')
                    ? 'OKF_INTENDED_PROFILE_OWNER_VALIDATION_MISSING'
                    : statuses.some((status) => !ACCEPTED_PROFILE_EVIDENCE.has(status))
                      ? 'OKF_OWNER_VALIDATION_STATUS_UNRECOGNIZED'
                      : 'NONE';
  return {
    status: blocker === 'NONE' ? 'OKF_PROFILE_RECONCILIATION_READ_ONLY_VERIFIED' : 'OKF_PROFILE_RECONCILIATION_INCOMPLETE',
    firstUnresolvedBlocker: blocker,
    profileApplicabilityStatus: blocker === 'NONE' ? 'APPLICABLE' : 'PARTIAL',
  };
}

export function reconcileOkfAudit(files) {
  const byCause = Object.fromEntries(OKF_CAUSES.map((cause) => [cause, { files: 0, invalid: 0, excluded: 0, reasonCodes: {} }]));
  const perFile = files.map((file) => {
    const cause = classifyOkfFile(file);
    const row = byCause[cause];
    row.files += 1;
    if (file.status === 'INVALID_V02_PROFILE') row.invalid += 1;
    if (file.status === 'EXCLUDED_FROM_V02_PROFILE') row.excluded += 1;
    for (const reason of file.reasonCodes ?? []) row.reasonCodes[reason] = (row.reasonCodes[reason] ?? 0) + 1;
    return { path: file.path, status: file.status, cause, reasonCodes: file.reasonCodes ?? [] };
  });
  const snapshots = byCause.EXTERNAL_SNAPSHOT_OUT_OF_PROFILE_SCOPE.files;
  return {
    total: files.length,
    byCause,
    perFile,
    unclassified: byCause.UNCLASSIFIED.files,
    sharedConfigurationFinding: {
      snapshotFiles: snapshots,
      shareOfCohort: files.length ? Number((snapshots / files.length).toFixed(4)) : 0,
      conclusion: snapshots > 0
        ? 'PROFILE_APPLIED_TO_EXTERNAL_DOC_SNAPSHOTS: the v0.2 front-matter profile walks .okf/docs/*/snapshots, which are immutable crawled pages and not OKF records.'
        : 'NO_SHARED_CONFIGURATION_FINDING',
    },
  };
}
