import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { resolveGraphifySnapshotSourcePath } from './graphify-run-source-readback-v1.mjs';

const SHA256 = /^sha256:[a-f0-9]{64}$/i;

function digest(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

export function createGraphifySnapshotEvidenceBinderV1({ admission, manifest, snapshotRoot }) {
  if (admission?.status !== 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED' || admission.authority !== true) {
    throw new Error('GRAPHIFY_SNAPSHOT_ADMISSION_REQUIRED');
  }
  if (!SHA256.test(admission.workspaceRevision ?? '')
    || (manifest?.workspaceRevision != null && admission.workspaceRevision !== manifest.workspaceRevision)
    || admission.snapshotRevision !== manifest?.snapshotRevision
    || manifest?.canonicalAuthority !== false
    || manifest?.datastoreWritesPerformed !== false
    || !Array.isArray(manifest?.sources)) {
    throw new Error('GRAPHIFY_SNAPSHOT_MANIFEST_ADMISSION_MISMATCH');
  }
  const root = path.resolve(snapshotRoot ?? '');
  const expectedDirectory = manifest.snapshotRevision.replace(/^sha256:/i, '');
  if (!snapshotRoot || path.basename(root).toLowerCase() !== expectedDirectory.toLowerCase()) {
    throw new Error('GRAPHIFY_SNAPSHOT_ROOT_REVISION_MISMATCH');
  }

  const sources = new Map();
  for (const row of manifest.sources) {
    const sourceRef = typeof row.sourceRef === 'string' ? row.sourceRef : '';
    const sourceRevision = typeof row.sourceRevision === 'string' ? row.sourceRevision : '';
    const contentDigest = typeof row.contentDigest === 'string' ? row.contentDigest : '';
    const byteLength = row.byteLength;
    if (!sourceRef || !SHA256.test(sourceRevision) || !Number.isSafeInteger(byteLength) || byteLength < 0) {
      throw new Error('GRAPHIFY_SNAPSHOT_SOURCE_BINDING_INVALID');
    }
    const normalizedDigest = contentDigest.startsWith('sha256:') ? contentDigest : `sha256:${contentDigest}`;
    if (!SHA256.test(normalizedDigest) || normalizedDigest.toLowerCase() !== sourceRevision.toLowerCase()) {
      throw new Error('GRAPHIFY_SNAPSHOT_SOURCE_DIGEST_CONFLICT');
    }
    if (sources.has(sourceRef)) throw new Error('GRAPHIFY_SNAPSHOT_SOURCE_REF_DUPLICATE');
    sources.set(sourceRef, { sourceRef, sourceRevision, contentDigest: normalizedDigest, byteLength });
  }

  return {
    snapshotRoot: root,
    workspaceRevision: admission.workspaceRevision,
    read({ sourceRef, lineNumber = null, requiredText = null }) {
      const sourcePath = resolveGraphifySnapshotSourcePath(root, sourceRef);
      const bytes = readFileSync(sourcePath);
      return {
        ...this.bind({ sourceRef, bytes, lineNumber, requiredText }),
        bytes,
      };
    },
    bind({ sourceRef, bytes, lineNumber = null, requiredText = null }) {
      const source = sources.get(sourceRef);
      if (!source) throw new Error('GRAPHIFY_SNAPSHOT_SOURCE_NOT_IN_MANIFEST');
      if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) throw new Error('GRAPHIFY_SNAPSHOT_SOURCE_BYTES_REQUIRED');
      const sourceDigest = digest(bytes);
      if (bytes.byteLength !== source.byteLength || sourceDigest.toLowerCase() !== source.contentDigest.toLowerCase()) {
        throw new Error('GRAPHIFY_SNAPSHOT_SOURCE_READBACK_MISMATCH');
      }

      let evidenceSpan = null;
      let evidenceScope = 'FILE';
      if (lineNumber !== null) {
        if (!Number.isSafeInteger(lineNumber) || lineNumber < 1) throw new Error('GRAPHIFY_SNAPSHOT_LINE_NUMBER_INVALID');
        let startByte = 0;
        let currentLine = 1;
        while (currentLine < lineNumber) {
          const newline = Buffer.from(bytes).indexOf(0x0a, startByte);
          if (newline < 0) throw new Error('GRAPHIFY_SNAPSHOT_LINE_OUT_OF_RANGE');
          startByte = newline + 1;
          currentLine += 1;
        }
        let endByte = Buffer.from(bytes).indexOf(0x0a, startByte);
        if (endByte < 0) endByte = bytes.byteLength;
        if (endByte <= startByte) throw new Error('GRAPHIFY_SNAPSHOT_LINE_EVIDENCE_EMPTY');
        const lineBytes = Buffer.from(bytes).subarray(startByte, endByte);
        if (requiredText !== null && !lineBytes.toString('utf8').includes(String(requiredText))) {
          throw new Error('GRAPHIFY_SNAPSHOT_LINE_EVIDENCE_MISMATCH');
        }
        evidenceScope = 'LINE';
        evidenceSpan = {
          startByte,
          endByte,
          digest: digest(lineBytes),
        };
      } else if (requiredText !== null) {
        throw new Error('GRAPHIFY_SNAPSHOT_REQUIRED_TEXT_NEEDS_LINE');
      }

      return {
        sourceRef,
        sourceRevision: source.sourceRevision,
        workspaceRevision: this.workspaceRevision,
        contentDigest: source.contentDigest,
        byteLength: source.byteLength,
        evidenceScope,
        lineNumber,
        evidenceSpan,
      };
    },
  };
}
