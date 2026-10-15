import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import Ajv from 'ajv';
import { parseDocument } from 'yaml';
import { z } from 'zod';
import { buildPacketClassLutV1 } from './residency/packet-class-lut-v1.js';

const MAX_CORPUS_BYTES = 1024 * 1024;
const MAX_PAGE_SIZE = 20;

const CorpusEntrySchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  terms: z.array(z.string().min(1)).min(1),
  definition: z.string().min(1),
  evidence_status: z.string().min(1),
  source_refs: z.array(z.string().min(1)).min(1),
  retrieval_policy: z.string().min(1),
}).passthrough();

const KeywordCorpusSchema = z.object({
  schema: z.literal('atlas.parent-atlas-agentic-retrieval-corpus.v1'),
  status: z.literal('reference_only'),
  authority: z.literal('derived_reference'),
  canonical_authority: z.literal(false),
  indexing: z.object({
    populated: z.literal(false),
    searchable: z.literal(false),
    qdrant_written: z.literal(false),
    admission_required: z.literal(true),
  }).strict(),
  entries: z.array(CorpusEntrySchema).min(1).max(256),
}).passthrough();

type KeywordCorpusEntry = z.infer<typeof CorpusEntrySchema>;

const CursorSchema = z.object({
  schema: z.literal('atlas.keyword-corpus-cursor.v1'),
  snapshotChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  queryChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  offset: z.number().int().nonnegative(),
}).strict();

export const KeywordCorpusSearchResultV1Schema = z.object({
  schema: z.literal('atlas.keyword-corpus-search.v1'),
  status: z.enum(['OK', 'INVALID_QUERY', 'STALE_CURSOR', 'INVALID_CURSOR', 'CORPUS_UNAVAILABLE', 'INVALID_CORPUS']),
  query: z.string(),
  corpusSnapshotChecksum: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  corpusStatus: z.literal('reference_only'),
  lutEncodingRevision: z.string().min(1).nullable(),
  items: z.array(z.object({
    entryId: z.string().regex(/^[a-z0-9-]+$/),
    lutCode: z.number().int().min(0).max(255),
    score: z.number().finite().nonnegative(),
    matchedTerms: z.array(z.string()),
    definition: z.string().min(1),
    evidenceStatus: z.string().min(1),
    sourceRefs: z.array(z.string().min(1)),
    retrievalPolicy: z.string().min(1),
  }).strict()).max(MAX_PAGE_SIZE),
  nextCursor: z.string().nullable(),
  totalMatches: z.number().int().nonnegative(),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
}).strict();

export type KeywordCorpusSearchResultV1 = z.infer<typeof KeywordCorpusSearchResultV1Schema>;

function checksum(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function normalize(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('en-US').trim();
}

function tokenize(value: string): string[] {
  return normalize(value).match(/[\p{L}\p{N}_-]+/gu) ?? [];
}

function encodeCursor(value: z.infer<typeof CursorSchema>): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decodeCursor(value: string): z.infer<typeof CursorSchema> | null {
  try {
    return CursorSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
  } catch {
    return null;
  }
}

function createCorpusSchemaValidator(schema: object) {
  const ajv = new Ajv({ allErrors: true, strict: false });
  ajv.addFormat('date', {
    type: 'string',
    validate: (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
      && Number.isFinite(Date.parse(`${value}T00:00:00.000Z`))
      && new Date(`${value}T00:00:00.000Z`).toISOString().startsWith(value),
  });
  ajv.addFormat('date-time', {
    type: 'string',
    validate: (value: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
      && Number.isFinite(Date.parse(value)),
  });
  return ajv.compile(schema);
}

function scoreEntry(entry: KeywordCorpusEntry, query: string, queryTokens: readonly string[]) {
  const id = normalize(entry.id);
  const normalizedQuery = normalize(query);
  const terms = entry.terms.map(normalize);
  const fields = [id, ...terms, ...tokenize(entry.definition)];
  const matchedTerms = [...new Set(terms.filter((term) => term.includes(normalizedQuery) || queryTokens.some((token) => tokenize(term).includes(token))))].sort();
  let score = id === normalizedQuery ? 100 : 0;
  for (const term of terms) {
    if (term === normalizedQuery) score += 50;
    else if (term.includes(normalizedQuery) || normalizedQuery.includes(term)) score += 20;
    else score += queryTokens.filter((token) => tokenize(term).includes(token)).length * 5;
  }
  const definitionTokens = new Set(tokenize(entry.definition));
  score += queryTokens.filter((token) => definitionTokens.has(token)).length;
  if (fields.some((field) => field === normalizedQuery)) score += 10;
  return { score, matchedTerms };
}

function baseResult(query: string, status: KeywordCorpusSearchResultV1['status']): KeywordCorpusSearchResultV1 {
  return KeywordCorpusSearchResultV1Schema.parse({
    schema: 'atlas.keyword-corpus-search.v1',
    status,
    query,
    corpusSnapshotChecksum: null,
    corpusStatus: 'reference_only',
    lutEncodingRevision: null,
    items: [],
    nextCursor: null,
    totalMatches: 0,
    canonicalAuthority: false,
    writesPerformed: false,
  });
}

/** Search the small .okf vocabulary as a read-only reference corpus; not canonical retrieval. */
export function searchKeywordCorpusV1(input: {
  query: string;
  corpusPath: string;
  schemaPath: string;
  limit?: number;
  cursor?: string | null;
}): KeywordCorpusSearchResultV1 {
  const query = input.query.trim();
  if (!query || query.length > 512) return baseResult(query, 'INVALID_QUERY');
  let raw: string;
  let schemaRaw: string;
  try {
    const size = statSync(input.corpusPath).size;
    const schemaSize = statSync(input.schemaPath).size;
    if (size < 1 || size > MAX_CORPUS_BYTES || schemaSize < 1 || schemaSize > MAX_CORPUS_BYTES) return baseResult(query, 'CORPUS_UNAVAILABLE');
    raw = readFileSync(input.corpusPath, 'utf8');
    schemaRaw = readFileSync(input.schemaPath, 'utf8');
  } catch {
    return baseResult(query, 'CORPUS_UNAVAILABLE');
  }
  const document = parseDocument(raw, { uniqueKeys: true });
  if (document.errors.length) return baseResult(query, 'INVALID_CORPUS');
  const parsedCorpus = KeywordCorpusSchema.safeParse(document.toJS());
  if (!parsedCorpus.success) return baseResult(query, 'INVALID_CORPUS');
  const corpus = parsedCorpus.data;
  try {
    const schema = JSON.parse(schemaRaw) as object;
    const validate = createCorpusSchemaValidator(schema);
    if (!validate(document.toJS())) return baseResult(query, 'INVALID_CORPUS');
  } catch {
    return baseResult(query, 'INVALID_CORPUS');
  }
  if (new Set(corpus.entries.map((entry) => entry.id)).size !== corpus.entries.length) return baseResult(query, 'INVALID_CORPUS');

  const snapshotChecksum = checksum(raw);
  const queryChecksum = checksum(normalize(query));
  const cursor = input.cursor ? decodeCursor(input.cursor) : null;
  if (input.cursor && !cursor) return baseResult(query, 'INVALID_CURSOR');
  if (cursor && (cursor.snapshotChecksum !== snapshotChecksum || cursor.queryChecksum !== queryChecksum)) {
    const stale = baseResult(query, 'STALE_CURSOR');
    stale.corpusSnapshotChecksum = snapshotChecksum;
    return stale;
  }

  if (input.limit !== undefined && (!Number.isInteger(input.limit) || input.limit < 1)) return baseResult(query, 'INVALID_QUERY');
  const pageSize = Math.min(MAX_PAGE_SIZE, input.limit ?? 10);
  const queryTokens = [...new Set(tokenize(query))];
  const lut = buildPacketClassLutV1(corpus.entries.map((entry) => entry.id));
  const lutCodes = new Map(lut.entries.map((entry) => [entry.label, entry.code]));
  const ranked = corpus.entries.map((entry) => ({ entry, ...scoreEntry(entry, query, queryTokens) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id));
  const offset = cursor?.offset ?? 0;
  const page = ranked.slice(offset, offset + pageSize);
  const nextOffset = offset + page.length;
  const result = baseResult(query, 'OK');
  result.corpusSnapshotChecksum = snapshotChecksum;
  result.lutEncodingRevision = lut.encodingRevision;
  result.totalMatches = ranked.length;
  result.items = page.map(({ entry, score, matchedTerms }) => ({
    entryId: entry.id,
    lutCode: lutCodes.get(entry.id)!,
    score,
    matchedTerms,
    definition: entry.definition,
    evidenceStatus: entry.evidence_status,
    sourceRefs: entry.source_refs,
    retrievalPolicy: entry.retrieval_policy,
  }));
  if (nextOffset < ranked.length) {
    result.nextCursor = encodeCursor({
      schema: 'atlas.keyword-corpus-cursor.v1',
      snapshotChecksum,
      queryChecksum,
      offset: nextOffset,
    });
  }
  return KeywordCorpusSearchResultV1Schema.parse(result);
}
