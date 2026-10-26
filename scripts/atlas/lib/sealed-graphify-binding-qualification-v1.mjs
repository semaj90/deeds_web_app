import { createHash } from 'node:crypto';

const digestPattern = /^(?:sha256:)?([a-f0-9]{64})$/i;

function normalizeDigest(value) {
  const match = digestPattern.exec(String(value ?? '').trim());
  return match ? match[1].toLowerCase() : null;
}

function normalizeRef(value) {
  return String(value ?? '').replaceAll('\\', '/');
}

export function qualifySealedGraphifyBindingsV1(input) {
  const expectedRows = Array.isArray(input.sources) ? input.sources : [];
  const observedRows = Array.isArray(input.bindingRows) ? input.bindingRows : [];
  const workspaceRevision = String(input.workspaceRevision ?? '');
  const repositoryId = String(input.repositoryId ?? '');
  if (!workspaceRevision || !repositoryId || expectedRows.length === 0) {
    throw new Error('SEALED_GRAPHIFY_BINDING_INPUT_INVALID');
  }

  const expectedByRef = new Map();
  for (const source of expectedRows) {
    const sourceRef = normalizeRef(source.sourceRef);
    if (!sourceRef || expectedByRef.has(sourceRef)) {
      throw new Error(`SEALED_GRAPHIFY_BINDING_EXPECTED_REF_DUPLICATE_OR_EMPTY:${sourceRef}`);
    }
    const contentDigest = normalizeDigest(source.contentDigest);
    if (!contentDigest || source.sourceRevision !== `sha256:${contentDigest}`) {
      throw new Error(`SEALED_GRAPHIFY_BINDING_EXPECTED_REVISION_INVALID:${sourceRef}`);
    }
    expectedByRef.set(sourceRef, { ...source, sourceRef, contentDigest });
  }

  const observedByRef = new Map();
  for (const row of observedRows) {
    const sourceRef = normalizeRef(row.canonical_source_ref);
    const rows = observedByRef.get(sourceRef) ?? [];
    rows.push(row);
    observedByRef.set(sourceRef, rows);
  }

  const classifications = [];
  for (const [sourceRef, expected] of expectedByRef) {
    const matches = observedByRef.get(sourceRef) ?? [];
    if (matches.length === 0) {
      classifications.push({ sourceRef, status: 'MISSING', reasons: ['BINDING_ROW_ABSENT'] });
      continue;
    }
    if (matches.length !== 1) {
      classifications.push({ sourceRef, status: 'DUPLICATE', reasons: ['BINDING_ROW_DUPLICATE'] });
      continue;
    }
    const observed = matches[0];
    const reasons = [];
    if (String(observed.repo_id) !== repositoryId) reasons.push('REPOSITORY_ID');
    if (String(observed.workspace_revision) !== workspaceRevision) reasons.push('WORKSPACE_REVISION');
    if (String(observed.source_revision) !== expected.sourceRevision) reasons.push('SOURCE_REVISION');
    if (normalizeDigest(observed.content_digest) !== expected.contentDigest) reasons.push('CONTENT_DIGEST');
    if (Number(observed.byte_length) !== Number(expected.byteLength)) reasons.push('BYTE_LENGTH');
    classifications.push({ sourceRef, status: reasons.length === 0 ? 'EXACT' : 'MISMATCH', reasons });
  }

  const counts = { exact: 0, missing: 0, duplicate: 0, mismatch: 0 };
  for (const row of classifications) {
    if (row.status === 'EXACT') counts.exact += 1;
    else if (row.status === 'MISSING') counts.missing += 1;
    else if (row.status === 'DUPLICATE') counts.duplicate += 1;
    else counts.mismatch += 1;
  }
  const qualifiedSourceRefs = classifications.filter((row) => row.status === 'EXACT').map((row) => row.sourceRef);
  const checksum = createHash('sha256')
    .update(JSON.stringify(classifications.map(({ sourceRef, status, reasons }) => [sourceRef, status, reasons])), 'utf8')
    .digest('hex');
  return {
    schema: 'atlas.sealed-graphify-binding-qualification.v1',
    workspaceRevision,
    repositoryId,
    expectedSourceCount: expectedRows.length,
    observedBindingRowCount: observedRows.length,
    counts,
    qualifiedSourceRefs,
    classifications,
    checksum,
    writesPerformed: false,
    canonicalAuthority: false,
  };
}
