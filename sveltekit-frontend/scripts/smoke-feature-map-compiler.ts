import { mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import assert from 'node:assert/strict';
import { compileFeatureMapFromFile } from '$lib/server/features/feature-map-compiler.js';

function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') {
    out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
    return out;
  }
  if (value && typeof value === 'object') {
    for (const entry of Object.values(value as Record<string, unknown>)) {
      collectStrings(entry, out);
    }
  }
  return out;
}

function isPointerLikeText(value: string): boolean {
  return /\b0x[a-f0-9]{8,}\b/i.test(value) || /\[native code\]/i.test(value);
}

async function main(): Promise<void> {
  const repoRoot = process.cwd();
  const tempRoot = join(tmpdir(), 'opencode');
  mkdirSync(tempRoot, { recursive: true });

  const svgPath = join(tempRoot, 'feature-map-smoke.svg');
  const markdownPath = join(tempRoot, 'feature-map-smoke.md');

  writeFileSync(svgPath, [
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">',
    '<rect x="8" y="8" width="48" height="48" rx="8" ry="8" />',
    '<path d="M16 32h32" />',
    '</svg>',
  ].join(''), 'utf8');

  writeFileSync(markdownPath, [
    '---',
    'featureId: feature:cs:topological-sort-corpus',
    'title: Topological Sort Corpus',
    'slug: topological-sort-corpus',
    'description: Compiler smoke for dependency ordering and graph synthesis.',
    'paths: [src/lib/server/features/feature-map-compiler.ts, src/lib/server/features/feature-map-store.ts, src/lib/server/features/feature-glyph-encoder.ts, src/lib/server/features/grpo-memory-stick.ts, src/lib/server/grpc/graph-ml-client.ts, src/lib/server/grpc/graph_ml.proto, src/routes/api/ace/rank/+server.ts, src/routes/api/synthesis/generate/+server.ts, tests/routes/auto/api/ace/rank.test.ts, memory/architecture/browser-context-lane.md, ' + svgPath.replace(/\\/g, '/') + ']',
    'tags: [feature-map, graphrag, ace]',
    '---',
    '',
    '# feature:cs:topological-sort-corpus',
    '',
    '- `src/lib/server/features/feature-map-compiler.ts`',
    '- `src/lib/server/features/feature-map-store.ts`',
    '- `src/lib/server/features/feature-glyph-encoder.ts`',
    '- `src/lib/server/features/grpo-memory-stick.ts`',
    '- `src/lib/server/grpc/graph-ml-client.ts`',
    '- `src/lib/server/grpc/graph_ml.proto`',
    '- `src/routes/api/ace/rank/+server.ts`',
    '- `src/routes/api/synthesis/generate/+server.ts`',
    '- `tests/routes/auto/api/ace/rank.test.ts`',
    '- `memory/architecture/browser-context-lane.md`',
    '- ' + svgPath.replace(/\\/g, '/'),
  ].join('\n'), 'utf8');

  const result = await compileFeatureMapFromFile({
    featureMarkdownPath: markdownPath,
    workspaceRoot: repoRoot,
    repoId: 'feature-map-smoke',
  });

  assert.ok(result.featureMap, 'FeatureMap produced');
  assert.ok(result.graphTriples.length > 0, 'graphTriples present');
  assert.ok(result.graphTriples.some((triple) => triple[1] === 'STATIC_IMPORTS'), 'static import mappings present');
  assert.ok(result.graphTriples.some((triple) => triple[1] === 'DYNAMIC_IMPORTS'), 'dynamic import mappings present');
  assert.ok(result.glyph.glyph instanceof Uint8Array && result.glyph.glyph.length === 64, 'glyph generated');
  assert.ok(result.aceContextPacketDraft && typeof result.aceContextPacketDraft === 'object', 'ACE context packet draft generated');
  assert.ok(result.memoryStick && typeof result.memoryStick.contextPacketHash === 'string', 'GRPO memory stick shape valid');

  const serialized = JSON.stringify(result.storeWrites);
  const strings = collectStrings(result.storeWrites);
  const pointerLike = strings.filter(isPointerLikeText);
  if (pointerLike.length > 0) {
    console.error(JSON.stringify(pointerLike.slice(0, 20), null, 2));
  }
  assert.ok(pointerLike.length === 0, 'no native pointer-looking values are serialized');
  assert.ok(!isPointerLikeText(serialized), 'serialized payload contains no pointer-like hex values');

  console.log(JSON.stringify({
    featureId: result.featureMap.featureId,
    graphTripleCount: result.graphTriples.length,
    tokenEstimate: result.tokenEstimate,
    glyphBytes: result.glyph.glyph.length,
    memoryStickHash: result.memoryStick.contextPacketHash.slice(0, 12),
  }, null, 2));

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
  process.exit(1);
});
