import { createHash } from 'node:crypto';

export const RETRIEVAL_TEXT_REVISION_V1 = 'atlas.retrieval-text.v1' as const;
export const RETRIEVAL_TEXT_MAX_SOURCE_CHARS_V1 = 4000;

export interface RetrievalTextInputV1 {
  canonicalChunkId: string;
  packetKey: string;
  sourceRef: string;
  sourceRevision: string;
  workspaceRevision: string;
  repositoryRelativePath: string;
  symbolName?: string;
  symbolKind?: string;
  summary?: string;
  keywords?: readonly string[];
  conceptIds?: readonly string[];
  imports?: readonly string[];
  exports?: readonly string[];
  calls?: readonly string[];
  sourceText?: string;
}

export interface RetrievalTextV1 {
  schema: 'atlas.retrieval-text.v1';
  templateRevision: typeof RETRIEVAL_TEXT_REVISION_V1;
  canonicalChunkId: string;
  packetKey: string;
  sourceRef: string;
  sourceRevision: string;
  workspaceRevision: string;
  sourceTextTruncated: boolean;
  text: string;
  textChecksum: string;
  canonicalAuthority: false;
  writesPerformed: false;
}

function cleanRequired(value: string, name: string): string {
  const result = value.trim();
  if (!result) throw new Error(`RetrievalTextV1 requires ${name}`);
  return result;
}

function cleanList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))].sort();
}

function cleanOptional(value: string | undefined): string | undefined {
  const result = value?.trim();
  return result || undefined;
}

function checksum(value: string): string {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

export function buildRetrievalTextV1(input: RetrievalTextInputV1): RetrievalTextV1 {
  const canonicalChunkId = cleanRequired(input.canonicalChunkId, 'canonicalChunkId');
  const packetKey = cleanRequired(input.packetKey, 'packetKey');
  const sourceRef = cleanRequired(input.sourceRef, 'sourceRef');
  const sourceRevision = cleanRequired(input.sourceRevision, 'sourceRevision');
  const workspaceRevision = cleanRequired(input.workspaceRevision, 'workspaceRevision');
  const repositoryRelativePath = cleanRequired(input.repositoryRelativePath, 'repositoryRelativePath').replaceAll('\\', '/');
  const sourceText = input.sourceText ?? '';
  const boundedSourceText = sourceText.slice(0, RETRIEVAL_TEXT_MAX_SOURCE_CHARS_V1);
  const fields = [
    `path: ${repositoryRelativePath}`,
    cleanOptional(input.symbolName) ? `symbol: ${cleanOptional(input.symbolName)}` : undefined,
    cleanOptional(input.symbolKind) ? `kind: ${cleanOptional(input.symbolKind)}` : undefined,
    cleanOptional(input.summary) ? `summary: ${cleanOptional(input.summary)}` : undefined,
    cleanList(input.keywords).length ? `keywords: ${cleanList(input.keywords).join(', ')}` : undefined,
    cleanList(input.conceptIds).length ? `concepts: ${cleanList(input.conceptIds).join(', ')}` : undefined,
    cleanList(input.imports).length ? `imports: ${cleanList(input.imports).join(', ')}` : undefined,
    cleanList(input.exports).length ? `exports: ${cleanList(input.exports).join(', ')}` : undefined,
    cleanList(input.calls).length ? `calls: ${cleanList(input.calls).join(', ')}` : undefined,
    boundedSourceText ? `source:\n${boundedSourceText}` : undefined,
  ].filter((value): value is string => Boolean(value));
  const text = fields.join('\n');
  return {
    schema: 'atlas.retrieval-text.v1',
    templateRevision: RETRIEVAL_TEXT_REVISION_V1,
    canonicalChunkId,
    packetKey,
    sourceRef,
    sourceRevision,
    workspaceRevision,
    sourceTextTruncated: sourceText.length > boundedSourceText.length,
    text,
    textChecksum: checksum(text),
    canonicalAuthority: false,
    writesPerformed: false,
  };
}
