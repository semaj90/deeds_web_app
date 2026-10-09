// @vitest-environment node
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/db/client.js', () => ({ db: {} }));
vi.mock('./admitted-source-revision-resolver-v1.js', () => ({ resolveAdmittedSourceRevisionV1: vi.fn() }));
vi.mock('./packet-identity-resolver.js', () => ({ resolvePacketKeyResolutionV2: vi.fn() }));

import {
  GroundedExtractionSourceBindingError,
  validateGroundedExtractionSourceBindingV1,
} from './grounded-extraction-source-binding-v1.js';

const text = 'export const answer = 42;';
const sourceRevision = `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
const workspaceRevision = `sha256:${'b'.repeat(64)}`;

const baseInput = () => ({
  packetKey: 'packet:legacy',
  sourceRef: 'src/example.ts',
  sourceRevision,
  workspaceRevision,
  submittedText: text,
  packetResolution: {
    canonicalPacketKey: 'packet:v2',
    storagePacketKey: 'packet:legacy',
    resolutionSource: 'LEGACY_ALIAS' as const,
    aliasEvidenceVersion: 'PACKET_KEY_V1_STORAGE_TO_V2@1' as const,
  },
  packetRows: [{ packetKey: 'packet:legacy', sourceRef: 'src/example.ts', sourceRevision }],
  admittedSource: {
    repoId: 'deeds-web-app',
    sourceRef: 'src/example.ts',
    sourceRevision,
    workspaceRevision,
    contentDigest: sourceRevision.slice('sha256:'.length),
    bindingChecksum: 'c'.repeat(64),
  },
});

describe('grounded extraction source binding', () => {
  it('emits a checksummed non-authoritative receipt for exact packet and source bindings', () => {
    const receipt = validateGroundedExtractionSourceBindingV1(baseInput());
    expect(receipt.status).toBe('VERIFIED_SOURCE_BINDING');
    expect(receipt.canonicalPacketKey).toBe('packet:v2');
    expect(receipt.packetResolutionSource).toBe('LEGACY_ALIAS');
    expect(receipt.submittedTextChecksum).toBe(sourceRevision);
    expect(receipt.canonicalAuthority).toBe(false);
    expect(receipt.writesPerformed).toBe(false);
    expect(receipt.checksum).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it.each([
    ['ambiguous packet rows', { packetRows: [...baseInput().packetRows, ...baseInput().packetRows] }, 'PACKET_ROW_MISSING_OR_AMBIGUOUS'],
    ['wrong packet source ref', { packetRows: [{ ...baseInput().packetRows[0]!, sourceRef: 'src/other.ts' }] }, 'PACKET_SOURCE_REF_MISMATCH'],
    ['stale packet source revision', { packetRows: [{ ...baseInput().packetRows[0]!, sourceRevision: `sha256:${'d'.repeat(64)}` }] }, 'SOURCE_REVISION_BINDING_MISMATCH'],
    ['wrong workspace binding', { admittedSource: { ...baseInput().admittedSource, workspaceRevision: `sha256:${'e'.repeat(64)}` } }, 'WORKSPACE_REVISION_BINDING_MISMATCH'],
    ['submitted bytes differ', { submittedText: `${text}\n` }, 'SOURCE_REVISION_BINDING_MISMATCH'],
  ])('rejects %s', (_label, override, code) => {
    expect(() => validateGroundedExtractionSourceBindingV1({ ...baseInput(), ...override }))
      .toThrow(new GroundedExtractionSourceBindingError(code));
  });
});
