import { createHash } from 'node:crypto';
import { z } from 'zod';

export const AceCardV2Schema = z.object({
  schema: z.literal('atlas.ace-card.v2'),
  cardId: z.string().min(1),
  cardChecksum: z.string().min(1),
  cardKind: z.enum(['SOURCE', 'SYMBOL', 'STRUCTURAL', 'SEMANTIC', 'GRAPH', 'RECEIPT', 'SUMMARY', 'OUTCOME']),
  candidateOrdinal: z.number().int().nonnegative().nullable(),
  workspaceRevision: z.string().startsWith('sha256:'),
  sourceRevision: z.string().startsWith('sha256:').nullable(),
  candidateSnapshotRevision: z.string().min(1),
  ordinalMapChecksum: z.string().min(1),
  sourceRef: z.string().min(1).nullable(),
  evidenceRefs: z.array(z.string().min(1)),
  title: z.string().min(1),
  lod0Identity: z.string().min(1),
  lod1Structural: z.string().nullable(),
  lod2Extractive: z.string().nullable(),
  lod3Semantic: z.string().nullable(),
  lexicalTerms: z.array(z.string().min(1)),
  concepts: z.array(z.string().min(1)),
  domains: z.array(z.string().min(1)),
  tokenEstimate: z.number().int().nonnegative(),
  canonicalAuthority: z.literal(false),
}).strict();

export type AceCardV2 = z.infer<typeof AceCardV2Schema>;

export type AceCardSelectionV2Result = {
  schema: 'atlas.ace-card-selection.v2';
  workspaceRevision: string;
  candidateSnapshotRevision: string;
  ordinalMapChecksum: string;
  queryTerms: string[];
  selected: AceCardV2[];
  rejected: Array<{ cardId: string; reason: string }>;
  tokenBudget: number;
  estimatedTokens: number;
  checksum: string;
  canonicalAuthority: false;
};

function checksum(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function terms(value: string): Set<string> {
  return new Set(value.toLowerCase().split(/[^a-z0-9_:-]+/).filter(Boolean));
}

export function selectAceCardsV2(input: {
  cards: AceCardV2[];
  query: string;
  workspaceRevision: string;
  candidateSnapshotRevision: string;
  ordinalMapChecksum: string;
  maxCards: number;
  tokenBudget: number;
}): AceCardSelectionV2Result {
  if (input.maxCards < 1 || input.tokenBudget < 1) throw new Error('ACE_CARD_SELECTION_LIMIT_INVALID');
  const queryTerms = [...terms(input.query)].sort();
  const querySet = new Set(queryTerms);
  const rejected: AceCardSelectionV2Result['rejected'] = [];
  const eligible = input.cards.flatMap((card) => {
    if (card.workspaceRevision !== input.workspaceRevision) { rejected.push({ cardId: card.cardId, reason: 'WORKSPACE_REVISION_MISMATCH' }); return []; }
    if (card.candidateSnapshotRevision !== input.candidateSnapshotRevision) { rejected.push({ cardId: card.cardId, reason: 'CANDIDATE_SNAPSHOT_MISMATCH' }); return []; }
    if (card.ordinalMapChecksum !== input.ordinalMapChecksum) { rejected.push({ cardId: card.cardId, reason: 'ORDINAL_MAP_CHECKSUM_MISMATCH' }); return []; }
    if (card.evidenceRefs.length === 0) { rejected.push({ cardId: card.cardId, reason: 'EVIDENCE_MISSING' }); return []; }
    const surface = terms([card.title, card.lod0Identity, card.lod1Structural ?? '', card.lod2Extractive ?? '', ...card.lexicalTerms, ...card.concepts, ...card.domains].join(' '));
    const overlap = [...querySet].filter((term) => surface.has(term)).length;
    return [{ card, score: overlap / Math.max(querySet.size, 1), evidenceKinds: new Set([card.cardKind]) }];
  });
  eligible.sort((a, b) => {
    const scoreOrder = b.score - a.score;
    if (scoreOrder !== 0) return scoreOrder;
    if (a.card.candidateOrdinal === null && b.card.candidateOrdinal !== null) return 1;
    if (a.card.candidateOrdinal !== null && b.card.candidateOrdinal === null) return -1;
    const ordinalOrder = (a.card.candidateOrdinal ?? Number.MAX_SAFE_INTEGER) - (b.card.candidateOrdinal ?? Number.MAX_SAFE_INTEGER);
    return ordinalOrder || a.card.cardId.localeCompare(b.card.cardId);
  });
  const selected: AceCardV2[] = [];
  let estimatedTokens = 0;
  const kinds = new Set<string>();
  for (const entry of eligible) {
    if (selected.length >= input.maxCards) break;
    if (estimatedTokens + entry.card.tokenEstimate > input.tokenBudget) { rejected.push({ cardId: entry.card.cardId, reason: 'TOKEN_BUDGET_EXCEEDED' }); continue; }
    if (entry.score === 0 && selected.length > 0 && kinds.has(entry.card.cardKind)) { rejected.push({ cardId: entry.card.cardId, reason: 'NO_QUERY_COVERAGE' }); continue; }
    selected.push(entry.card);
    kinds.add(entry.card.cardKind);
    estimatedTokens += entry.card.tokenEstimate;
  }
  const body = { workspaceRevision: input.workspaceRevision, candidateSnapshotRevision: input.candidateSnapshotRevision, ordinalMapChecksum: input.ordinalMapChecksum, queryTerms, selected: selected.map((card) => card.cardId), rejected, tokenBudget: input.tokenBudget, estimatedTokens, canonicalAuthority: false as const };
  return { schema: 'atlas.ace-card-selection.v2', ...body, selected, checksum: checksum(body), canonicalAuthority: false };
}
