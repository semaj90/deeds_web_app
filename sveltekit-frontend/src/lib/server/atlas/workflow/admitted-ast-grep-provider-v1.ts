import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

import {
  assertCandidateOrdinalMapIntegrityV1,
  candidateOrdinalMapV1Schema,
  type CandidateOrdinalMapV1,
} from '../features/canonical-candidate-v1.js';
import { resolveAdmittedSourceRevisionV1 } from '../identity/admitted-source-revision-resolver-v1.js';
import {
  makeDefaultAstGrepRefinementHandlerV1,
  type ContextDagNodeHandlerV1,
} from './context-dag-handlers-v1.js';

function normalizeRelativeSourceRef(value: string): string {
  const normalized = value.replaceAll('\\', '/').replace(/^\.\/+/, '').trim();
  if (!normalized || path.posix.isAbsolute(normalized) || normalized.split('/').includes('..')) {
    throw new Error('AST_GREP_SOURCE_PATH_NOT_CONTAINED');
  }
  return normalized;
}

export async function readConfinedRepositorySourceBytesV1(repositoryRoot: string, sourceRef: string): Promise<Uint8Array> {
  const normalizedPath = normalizeRelativeSourceRef(sourceRef);
  const root = await realpath(path.resolve(repositoryRoot));
  const resolvedFile = await realpath(path.resolve(root, normalizedPath));
  const relative = path.relative(root, resolvedFile);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('AST_GREP_SOURCE_PATH_NOT_CONTAINED');
  }
  return readFile(resolvedFile);
}

export function createCandidateOrdinalSourceReaderV1(input: {
  repositoryRoot: string;
  ordinalMap: CandidateOrdinalMapV1;
}): (candidate: {
  candidateOrdinal: number;
  canonicalCandidateId: string;
  packetKey: string;
  sourceRef: string;
  sourceRevision: string;
  workspaceRevision: string;
}) => Promise<Uint8Array> {
  const ordinalMap = candidateOrdinalMapV1Schema.parse(input.ordinalMap);
  assertCandidateOrdinalMapIntegrityV1(ordinalMap);
  return async (candidate) => {
    const matches = ordinalMap.candidates.filter((entry) =>
      entry.candidateOrdinal === candidate.candidateOrdinal
      && entry.canonicalId === candidate.canonicalCandidateId
      && entry.packetKey === candidate.packetKey
      && entry.sourceRef === candidate.sourceRef
      && entry.sourceRevision === candidate.sourceRevision
      && entry.workspaceRevision === candidate.workspaceRevision);
    if (ordinalMap.workspaceRevision !== candidate.workspaceRevision || matches.length !== 1) {
      throw new Error('AST_GREP_ORDINAL_MAP_SOURCE_IDENTITY_MISMATCH');
    }
    return readConfinedRepositorySourceBytesV1(input.repositoryRoot, candidate.sourceRef);
  };
}

export function makeAdmittedAstGrepRefinementHandlerV1(input: {
  repositoryRoot: string;
  workspaceRevision: string;
  symbols: readonly string[];
  producerRevision: string;
  ordinalMap: unknown;
}): ContextDagNodeHandlerV1 {
  const rootPath = path.resolve(input.repositoryRoot);
  const normalizedWorkspaceRevision = input.workspaceRevision.trim();
  const ordinalMap = candidateOrdinalMapV1Schema.parse(input.ordinalMap);
  assertCandidateOrdinalMapIntegrityV1(ordinalMap);
  if (!normalizedWorkspaceRevision || !input.producerRevision.trim()) {
    throw new Error('AST_GREP_REQUEST_REVISION_REQUIRED');
  }
  if (ordinalMap.workspaceRevision !== normalizedWorkspaceRevision) {
    throw new Error('AST_GREP_ORDINAL_MAP_WORKSPACE_MISMATCH');
  }

  const sourceByPath = new Map<string, { sourceRef: string; sourceRevision: string }>();
  for (const candidate of ordinalMap.candidates) {
    if (!candidate.sourceRef) continue;
    let normalizedPath: string;
    try {
      normalizedPath = normalizeRelativeSourceRef(candidate.sourceRef);
    } catch {
      continue;
    }
    const existing = sourceByPath.get(normalizedPath);
    if (existing && (existing.sourceRef !== candidate.sourceRef
      || existing.sourceRevision !== candidate.sourceRevision)) {
      throw new Error('AST_GREP_ORDINAL_MAP_SOURCE_PATH_AMBIGUOUS');
    }
    sourceByPath.set(normalizedPath, {
      sourceRef: candidate.sourceRef,
      sourceRevision: candidate.sourceRevision,
    });
  }

  return makeDefaultAstGrepRefinementHandlerV1({
    symbols: input.symbols,
    producerRevision: input.producerRevision,
    resolveSourceBinding: async (filePath) => {
      const normalizedPath = normalizeRelativeSourceRef(filePath);
      const candidate = sourceByPath.get(normalizedPath);
      if (!candidate) return null;
      const binding = await resolveAdmittedSourceRevisionV1({
        sourceRef: candidate.sourceRef,
        workspaceRevision: normalizedWorkspaceRevision,
      });
      if (binding.sourceRevision !== candidate.sourceRevision) {
        throw new Error('AST_GREP_ORDINAL_MAP_SOURCE_REVISION_MISMATCH');
      }
      return {
        sourceRef: binding.sourceRef,
        workspaceRevision: binding.workspaceRevision,
        sourceRevision: binding.sourceRevision,
      };
    },
    readSourceBytes: async (filePath) => {
      const normalizedPath = normalizeRelativeSourceRef(filePath);
      if (!sourceByPath.has(normalizedPath)) throw new Error('AST_GREP_SOURCE_BINDING_NOT_RESOLVED');
      return readConfinedRepositorySourceBytesV1(rootPath, normalizedPath);
    },
  });
}
