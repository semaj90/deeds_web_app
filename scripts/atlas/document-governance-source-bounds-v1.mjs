import { statSync } from 'node:fs';
import { relative, sep } from 'node:path';

export const MAX_TOC_SOURCE_BYTES = 16 * 1024 * 1024;

export function filterBoundedTocSources(candidates, repoRoot, maxBytes = MAX_TOC_SOURCE_BYTES) {
  const skipped = [];
  const included = candidates.filter((absolutePath) => {
    const sizeBytes = statSync(absolutePath).size;
    if (sizeBytes <= maxBytes) return true;
    skipped.push({
      path: relative(repoRoot, absolutePath).split(sep).join('/'),
      sizeBytes,
      maxBytes,
      reason: 'EXCEEDS_MAX_TOC_SOURCE_BYTES',
    });
    return false;
  });
  return { included, skipped };
}

export function buildTocSkipReceipt(skipped, totalCandidates, maxBytes = MAX_TOC_SOURCE_BYTES) {
  const sortedSkips = [...skipped]
    .map((s) => ({
      sourcePath: s.path,
      byteSize: s.sizeBytes,
      maxBytes: s.maxBytes ?? maxBytes,
      reason: s.reason ?? 'EXCEEDS_MAX_TOC_SOURCE_BYTES',
    }))
    .sort((a, b) => a.sourcePath.localeCompare(b.sourcePath));

  return {
    schema: 'atlas.toc-oversized-source-skips.v1',
    configuredMaxBytes: maxBytes,
    summary: {
      totalCandidates,
      includedCount: totalCandidates - skipped.length,
      skippedCount: skipped.length,
    },
    skips: sortedSkips,
  };
}
