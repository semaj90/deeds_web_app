import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { TreesitterChunkerChunkV1 } from './structural-symbol.js';

export const CANONICAL_CHUNK_V1 = 'atlas.canonical-chunk.v1' as const;
export const MARKDOWN_CHUNKER_REVISION_V1 = 'markdown-byte-sections:2026-09-04:v1' as const;

const revision = z.string().min(1);
const sha256 = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const canonicalChunkNamespaceSchema = z.enum(['CODE', 'DOCUMENT', 'OPENSPEC']);
export const chunkIdentityAuthoritySchema = z.enum([
  'UPSTREAM_STRUCTURAL_PROVENANCE',
  'SOURCE_GROUNDED_DESCRIPTOR',
]);

export const canonicalChunkV1Schema = z.object({
  schema: z.literal(CANONICAL_CHUNK_V1).default(CANONICAL_CHUNK_V1),
  descriptorId: z.string().min(1),
  namespace: canonicalChunkNamespaceSchema,
  sourceRef: z.string().min(1),
  sourceRevision: revision,
  workspaceRevision: revision,
  startByte: z.number().int().nonnegative(),
  endByte: z.number().int().nonnegative(),
  textChecksum: sha256,
  chunkerRevision: revision,
  identityAuthority: chunkIdentityAuthoritySchema,
  upstreamChunkId: z.string().min(1).optional(),
  upstreamNodeId: z.string().min(1).optional(),
  upstreamSymbolId: z.string().min(1).nullable().optional(),
  headingPath: z.array(z.string()).optional(),
  symbolName: z.string().min(1).optional(),
  nodeType: z.string().min(1).optional(),
  kind: z.string().min(1).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.endByte <= value.startByte) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endByte'], message: 'endByte must be > startByte' });
  }
  if (value.identityAuthority === 'UPSTREAM_STRUCTURAL_PROVENANCE' && !value.upstreamChunkId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['upstreamChunkId'], message: 'upstream structural provenance requires upstreamChunkId' });
  }
});

export type CanonicalChunkV1 = z.infer<typeof canonicalChunkV1Schema>;

function sha256Bytes(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function descriptorId(parts: readonly unknown[]): string {
  return `chunk-desc:${createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 40)}`;
}

function exactSlice(bytes: Uint8Array, startByte: number, endByte: number): Uint8Array {
  if (startByte < 0 || endByte <= startByte || endByte > bytes.byteLength) {
    throw new Error(`CHUNK_BYTE_SPAN_INVALID:${startByte}:${endByte}:${bytes.byteLength}`);
  }
  return bytes.subarray(startByte, endByte);
}

export function adaptStructuralChunkToCanonicalChunkV1(input: {
  chunk: TreesitterChunkerChunkV1;
  sourceBytes: Uint8Array;
  sourceRevision: string;
  workspaceRevision: string;
  chunkerRevision: string;
}): CanonicalChunkV1 {
  const { chunk } = input;
  const slice = exactSlice(input.sourceBytes, chunk.byte_start, chunk.byte_end);
  const checksum = sha256Bytes(slice);
  const expected = `sha256:${chunk.content_hash}`;
  if (checksum !== expected) {
    throw new Error(`STRUCTURAL_CHUNK_TEXT_CHECKSUM_MISMATCH:${chunk.upstream_chunk_id}`);
  }

  return canonicalChunkV1Schema.parse({
    descriptorId: descriptorId([
      'CODE',
      input.sourceRevision,
      chunk.byte_start,
      chunk.byte_end,
      input.chunkerRevision,
      checksum,
      chunk.upstream_chunk_id,
    ]),
    namespace: 'CODE',
    sourceRef: chunk.source_ref,
    sourceRevision: input.sourceRevision,
    workspaceRevision: input.workspaceRevision,
    startByte: chunk.byte_start,
    endByte: chunk.byte_end,
    textChecksum: checksum,
    chunkerRevision: input.chunkerRevision,
    identityAuthority: 'UPSTREAM_STRUCTURAL_PROVENANCE',
    upstreamChunkId: chunk.upstream_chunk_id,
    upstreamNodeId: chunk.upstream_node_id,
    upstreamSymbolId: chunk.upstream_symbol_id,
    symbolName: chunk.symbol_name,
    nodeType: chunk.node_type,
    kind: chunk.kind,
  });
}

type Heading = { level: number; text: string; startByte: number };

function markdownHeadings(bytes: Uint8Array): Heading[] {
  const headings: Heading[] = [];
  let start = 0;
  for (let i = 0; i <= bytes.byteLength; i += 1) {
    const atEnd = i === bytes.byteLength;
    const atLf = !atEnd && bytes[i] === 0x0a;
    if (!atEnd && !atLf) continue;
    const lineEnd = atLf ? i + 1 : i;
    const line = Buffer.from(bytes.subarray(start, lineEnd)).toString('utf8').replace(/\r?\n$/, '');
    const match = /^(#{1,6})[ \t]+(.+?)\s*#*\s*$/.exec(line);
    if (match) headings.push({ level: match[1].length, text: match[2], startByte: start });
    start = lineEnd;
  }
  return headings;
}

function headingPathAt(headings: readonly Heading[], index: number): string[] {
  const stack: Array<{ level: number; text: string }> = [];
  for (let i = 0; i <= index; i += 1) {
    const current = headings[i];
    while (stack.length > 0 && stack[stack.length - 1].level >= current.level) stack.pop();
    stack.push({ level: current.level, text: current.text });
  }
  return stack.map((entry) => entry.text);
}

export function segmentMarkdownSourceV1(input: {
  namespace: 'DOCUMENT' | 'OPENSPEC';
  sourceRef: string;
  sourceRevision: string;
  workspaceRevision: string;
  sourceBytes: Uint8Array;
  chunkerRevision?: string;
}): CanonicalChunkV1[] {
  const chunkerRevision = input.chunkerRevision ?? MARKDOWN_CHUNKER_REVISION_V1;
  const bytes = input.sourceBytes;
  if (bytes.byteLength === 0) return [];

  const headings = markdownHeadings(bytes);
  const spans: Array<{ startByte: number; endByte: number; headingPath: string[] }> = [];

  if (headings.length === 0) {
    spans.push({ startByte: 0, endByte: bytes.byteLength, headingPath: [] });
  } else {
    if (headings[0].startByte > 0) {
      spans.push({ startByte: 0, endByte: headings[0].startByte, headingPath: [] });
    }
    for (let i = 0; i < headings.length; i += 1) {
      spans.push({
        startByte: headings[i].startByte,
        endByte: i + 1 < headings.length ? headings[i + 1].startByte : bytes.byteLength,
        headingPath: headingPathAt(headings, i),
      });
    }
  }

  return spans
    .filter((span) => span.endByte > span.startByte)
    .map((span) => {
      const checksum = sha256Bytes(exactSlice(bytes, span.startByte, span.endByte));
      return canonicalChunkV1Schema.parse({
        descriptorId: descriptorId([
          input.namespace,
          input.sourceRef,
          input.sourceRevision,
          span.startByte,
          span.endByte,
          chunkerRevision,
          checksum,
        ]),
        namespace: input.namespace,
        sourceRef: input.sourceRef,
        sourceRevision: input.sourceRevision,
        workspaceRevision: input.workspaceRevision,
        startByte: span.startByte,
        endByte: span.endByte,
        textChecksum: checksum,
        chunkerRevision,
        identityAuthority: 'SOURCE_GROUNDED_DESCRIPTOR',
        headingPath: span.headingPath,
      });
    });
}

export function rejectUnprovenStructuredSegmentationV1(format: 'JSON' | 'YAML'): never {
  throw new Error(`STRUCTURED_BYTE_SEGMENTATION_UNPROVEN:${format}`);
}

export function canonicalChunkReplayChecksumV1(chunks: readonly CanonicalChunkV1[]): string {
  const normalized = chunks
    .map((chunk) => canonicalChunkV1Schema.parse(chunk))
    .sort((a, b) => a.startByte - b.startByte || a.endByte - b.endByte || a.descriptorId.localeCompare(b.descriptorId));
  return sha256Bytes(Buffer.from(JSON.stringify(normalized), 'utf8'));
}
