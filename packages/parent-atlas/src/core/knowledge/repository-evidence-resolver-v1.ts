import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { TextDecoder } from 'node:util';
import type { AtlasEvidenceResolverV1 } from './evidence-resolver-v1.js';
import {
  buildResolvedEvidenceRefV1,
  type AtlasEvidenceResourceV1,
  type ResolvedEvidencePayloadV1,
} from './evidence-resource-v1.js';

export interface SourceRegistryEntryV1 {
  sourceRef: string;
  sourceRevision: string;
  workspaceRevision: string;
  sourceInventoryRevision: string;
  sourceContentChecksum: string;
}

export interface SourceRegistryReaderV1 {
  lookupSource(sourceRef: string): Promise<SourceRegistryEntryV1 | null>;
}

export interface RepositoryEvidenceResolverOptionsV1 {
  repositoryRoot: string;
  workspaceRevision: string;
  resolverRevision: string;
  sourceRegistry: SourceRegistryReaderV1;
}

function sha256Bytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function normalizeSourceRef(locator: string): string {
  if (locator.includes('\0')) throw new Error('SOURCE_REF_NUL_REJECTED');
  const posix = locator.replace(/\\/g, '/');
  if (!posix || path.posix.isAbsolute(posix) || /^[A-Za-z]:\//.test(posix)) throw new Error('SOURCE_REF_ABSOLUTE_REJECTED');
  const normalized = path.posix.normalize(posix);
  if (normalized === '.' || normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error('SOURCE_REF_TRAVERSAL_REJECTED');
  }
  if (normalized.startsWith('./')) return normalized.slice(2);
  return normalized;
}

function contained(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function assertNoSymlinkComponents(rootReal: string, sourceRef: string): Promise<string> {
  const parts = sourceRef.split('/').filter(Boolean);
  let current = rootReal;
  for (const part of parts) {
    current = path.join(current, part);
    let stat;
    try {
      stat = await lstat(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('SOURCE_FILE_NOT_FOUND');
      throw error;
    }
    if (stat.isSymbolicLink()) throw new Error('SOURCE_SYMLINK_REJECTED');
  }
  const candidateReal = await realpath(current);
  if (!contained(rootReal, candidateReal)) throw new Error('SOURCE_PATH_ESCAPES_REPOSITORY');
  return candidateReal;
}

function lineByteRange(bytes: Buffer, startLine: number, endLine: number): { startByte: number; endByte: number } {
  const starts = [0];
  for (let index = 0; index < bytes.length; index += 1) if (bytes[index] === 0x0a) starts.push(index + 1);
  if (startLine < 1 || endLine < startLine || startLine > starts.length || endLine > starts.length) throw new Error('SOURCE_LINE_RANGE_OUT_OF_BOUNDS');
  return { startByte: starts[startLine - 1] ?? 0, endByte: starts[endLine] ?? bytes.length };
}

function selectionForResource(bytes: Buffer, resource: AtlasEvidenceResourceV1): {
  bytes: Buffer;
  byteRange: { startByte: number; endByte: number } | null;
  lineRange: { startLine: number; endLine: number } | null;
} {
  let byteRange = resource.byteRange;
  const lineRange = resource.lineRange;
  if (lineRange) {
    const lineBytes = lineByteRange(bytes, lineRange.startLine, lineRange.endLine);
    if (byteRange && (byteRange.startByte !== lineBytes.startByte || byteRange.endByte !== lineBytes.endByte)) {
      throw new Error('SOURCE_RANGE_COORDINATE_MISMATCH');
    }
    byteRange = lineBytes;
  }
  if (!byteRange) return { bytes, byteRange: null, lineRange };
  if (byteRange.endByte > bytes.length) throw new Error('SOURCE_BYTE_RANGE_OUT_OF_BOUNDS');
  return { bytes: bytes.subarray(byteRange.startByte, byteRange.endByte), byteRange, lineRange };
}

export class RepositoryEvidenceResolverV1 implements AtlasEvidenceResolverV1 {
  readonly namespace = 'SOURCE' as const;
  readonly resolverRevision: string;
  private readonly repositoryRoot: string;
  private readonly workspaceRevision: string;
  private readonly sourceRegistry: SourceRegistryReaderV1;

  constructor(options: RepositoryEvidenceResolverOptionsV1) {
    if (!options.resolverRevision.trim()) throw new Error('SOURCE_RESOLVER_REVISION_REQUIRED');
    this.repositoryRoot = options.repositoryRoot;
    this.workspaceRevision = options.workspaceRevision;
    this.resolverRevision = options.resolverRevision;
    this.sourceRegistry = options.sourceRegistry;
  }

  async resolve(resource: AtlasEvidenceResourceV1, _previousEvidenceVersion?: string): Promise<ResolvedEvidencePayloadV1 | null> {
    if (resource.namespace !== 'SOURCE') throw new Error('SOURCE_RESOLVER_NAMESPACE_MISMATCH');
    const sourceRef = normalizeSourceRef(resource.locator);
    const registry = await this.sourceRegistry.lookupSource(sourceRef);
    if (!registry) return null;
    if (registry.sourceRef !== sourceRef) throw new Error('SOURCE_REGISTRY_REF_MISMATCH');
    if (registry.workspaceRevision !== this.workspaceRevision) throw new Error('SOURCE_WORKSPACE_REVISION_MISMATCH');
    if (!/^[a-f0-9]{64}$/.test(registry.sourceContentChecksum)) throw new Error('SOURCE_REGISTRY_CHECKSUM_INVALID');

    const rootReal = await realpath(this.repositoryRoot);
    const candidate = await assertNoSymlinkComponents(rootReal, sourceRef);
    const noFollow = typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0;
    let handle;
    try {
      handle = await open(candidate, constants.O_RDONLY | noFollow);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ELOOP') throw new Error('SOURCE_SYMLINK_REJECTED');
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }

    try {
      const before = await handle.stat();
      if (!before.isFile()) throw new Error('SOURCE_NOT_REGULAR_FILE');
      const bytes = await handle.readFile();
      const after = await handle.stat();
      if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
        throw new Error('SOURCE_FILE_CHANGED_DURING_READ');
      }
      const fullChecksum = sha256Bytes(bytes);
      if (fullChecksum !== registry.sourceContentChecksum) throw new Error('SOURCE_REGISTRY_CONTENT_MISMATCH');

      const selected = selectionForResource(bytes, resource);
      let content: string;
      try {
        content = new TextDecoder('utf-8', { fatal: true }).decode(selected.bytes);
      } catch {
        throw new Error('SOURCE_EVIDENCE_INVALID_UTF8');
      }
      const contentChecksum = sha256Bytes(selected.bytes);
      const evidence = buildResolvedEvidenceRefV1({
        resource,
        evidenceVersion: registry.sourceRevision,
        authorityRevision: registry.sourceInventoryRevision,
        sourceRevision: registry.sourceRevision,
        contentChecksum,
        resolvedByteRange: selected.byteRange,
        resolvedLineRange: selected.lineRange,
        stableSymbolId: null,
        symbolVersionId: null,
        resolutionMethod: 'EXACT_SOURCE_REVISION',
        resolverRevision: this.resolverRevision,
      });
      return { evidence, content };
    } finally {
      await handle.close();
    }
  }
}
