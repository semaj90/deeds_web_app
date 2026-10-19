import { existsSync, readFileSync } from 'node:fs';
import { resolve, normalize, isAbsolute } from 'node:path';
import type { CandidateSourceSpanV1, SourceFetchPortV1 } from './topk-evidence-fetch-v1.js';

export interface LiveSourceFetchOptionsV1 {
  baseDirectories?: readonly string[];
  spanResolver?: (candidate: {
    ordinal: number;
    canonicalId: string;
    packetKey: string | null;
    treeNodeId: string | null;
    symbolVersionId: string | null;
  }) => CandidateSourceSpanV1 | null;
}

const UNSAFE_SOURCE_REF = /\0|\.\.|\/\//;

/**
 * Production-ready, read-only SourceFetchPortV1 implementation.
 * Safely resolves relative sourceRef paths against configured repository boundaries
 * and reads immutable current source bytes without modifying files or database tables.
 */
export class LiveSourceFetchPortV1 implements SourceFetchPortV1 {
  private readonly searchRoots: readonly string[];
  private readonly spanResolver?: LiveSourceFetchOptionsV1['spanResolver'];

  constructor(options: LiveSourceFetchOptionsV1 = {}) {
    const cwd = process.cwd();
    this.searchRoots = (options.baseDirectories && options.baseDirectories.length > 0)
      ? options.baseDirectories.map((dir) => resolve(dir))
      : [
          resolve(cwd),
          resolve(cwd, 'sveltekit-frontend'),
          resolve(cwd, '..'),
          resolve(cwd, '..', 'sveltekit-frontend'),
        ];
    this.spanResolver = options.spanResolver;
  }

  readBytes(sourceRef: string): Uint8Array | null {
    if (!sourceRef || typeof sourceRef !== 'string') return null;
    if (UNSAFE_SOURCE_REF.test(sourceRef)) return null;

    // Reject windows drive letters or root paths in sourceRef
    if (isAbsolute(sourceRef) || /^[A-Za-z]:/.test(sourceRef)) return null;

    const normalizedRelative = normalize(sourceRef).replace(/^(\.[\/\\])+/, '');

    for (const root of this.searchRoots) {
      const fullPath = resolve(root, normalizedRelative);
      // Ensure resolved path stays inside root directory
      if (!fullPath.startsWith(root)) continue;

      if (existsSync(fullPath)) {
        try {
          const buffer = readFileSync(fullPath);
          return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        } catch {
          return null;
        }
      }
    }

    return null;
  }

  lookupSpan(candidate: {
    ordinal: number;
    canonicalId: string;
    packetKey: string | null;
    treeNodeId: string | null;
    symbolVersionId: string | null;
  }): CandidateSourceSpanV1 | null {
    if (this.spanResolver) {
      return this.spanResolver(candidate);
    }
    return null;
  }
}

export function createLiveSourceFetchPortV1(options: LiveSourceFetchOptionsV1 = {}): SourceFetchPortV1 {
  return new LiveSourceFetchPortV1(options);
}
