import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import type {
  ExactPromotionSourceBytesV1,
  ExactPromotionSourceReadRequestV1,
  ExactPromotionSourceReaderV1,
} from './exact-promotion-postgres-executor.js';

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function normalizeSourceRef(sourceRef: string): string {
  return sourceRef.replace(/\\/g, '/').replace(/^\.\/+/, '').trim();
}

function unavailable(): ExactPromotionSourceBytesV1 {
  return {
    file_found: false,
    file_sha256: null,
    file_byte_length: null,
    span_found: false,
    span_sha256: null,
    span_byte_length: null,
    evidence_ref: null,
  };
}

/**
 * Build a source-byte reader rooted at one explicit repository/workspace path.
 * Tree-sitter offsets are byte offsets, so this reader hashes Buffer slices and
 * never converts source text to JS character offsets before selecting the span.
 */
export function createWorkspaceExactPromotionSourceReader(
  repoRoot: string,
): ExactPromotionSourceReaderV1 {
  if (!repoRoot.trim()) throw new Error('EXACT_PROMOTION_REPO_ROOT_REQUIRED');

  return async (request: ExactPromotionSourceReadRequestV1): Promise<ExactPromotionSourceBytesV1> => {
    const sourceRef = normalizeSourceRef(request.source_ref);
    if (!sourceRef || path.isAbsolute(sourceRef) || sourceRef.split('/').includes('..')) {
      return unavailable();
    }
    if (!Number.isSafeInteger(request.span_start) || !Number.isSafeInteger(request.span_end)
      || request.span_start < 0 || request.span_end < request.span_start) {
      return unavailable();
    }

    try {
      const root = await realpath(path.resolve(repoRoot));
      const candidate = await realpath(path.resolve(root, sourceRef));
      if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) return unavailable();

      const bytes = await readFile(candidate);
      if (request.span_end > bytes.byteLength) return unavailable();
      const span = bytes.subarray(request.span_start, request.span_end);

      return {
        file_found: true,
        file_sha256: sha256(bytes),
        file_byte_length: bytes.byteLength,
        span_found: true,
        span_sha256: sha256(span),
        span_byte_length: span.byteLength,
        evidence_ref: `workspace-bytes:${sourceRef}:${request.span_start}-${request.span_end}`,
      };
    } catch {
      return unavailable();
    }
  };
}
