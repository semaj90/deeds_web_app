import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  buildKeywordBundle,
  buildQueryUnderstandingV1,
  buildQueryPlanV1,
  normalizeRetrievalSearchRequest,
  QueryPlanV1Schema,
} from '../../sveltekit-frontend/src/lib/server/retrieval/search-contract.ts';

const request = normalizeRetrievalSearchRequest({
  query: 'CandidateOrdinalMap pgvector source revision',
  lanes: ['lexical', 'dense', 'documentation'],
  finalTopK: 5,
  rerankTopK: 5,
  pageSize: 5,
});
const keywordBundle = buildKeywordBundle({ query: request.query });
const queryUnderstanding = buildQueryUnderstandingV1({ query: request.query, filters: request.filters });
const unbound = buildQueryPlanV1({ request, workspaceRevision: null });
const bound = buildQueryPlanV1({ request, workspaceRevision: 'sha256:fixture-frame' });

QueryPlanV1Schema.parse(unbound);
QueryPlanV1Schema.parse(bound);

const replay = buildQueryPlanV1({ request, workspaceRevision: 'sha256:fixture-frame' });
const report = {
  schema: 'atlas.search-fabric-contract-proof.v1',
  status: unbound.planChecksum !== bound.planChecksum && bound.planChecksum === replay.planChecksum
    ? 'SEARCH_FABRIC_CONTRACT_PROVEN'
    : 'SEARCH_FABRIC_CONTRACT_FAILED',
  queryPlan: {
    schema: bound.schema,
    checksum: bound.planChecksum,
    replayChecksum: replay.planChecksum,
    deterministicReplay: bound.planChecksum === replay.planChecksum,
    workspaceRevisionBound: bound.workspaceRevision,
  },
  keywordBundle: {
    schema: keywordBundle.schema,
    exactCount: keywordBundle.exactKeywords.length,
    normalizedCount: keywordBundle.normalizedKeywords.length,
    expandedCount: keywordBundle.expandedKeywords.length,
  },
  queryUnderstanding: {
    schema: queryUnderstanding.schema,
    identifierCount: queryUnderstanding.identifierTerms.length,
    pathCount: queryUnderstanding.pathTerms.length,
    ftsCount: queryUnderstanding.ftsTerms.length,
    trigramCount: queryUnderstanding.trigramTerms.length,
    semanticRepresentation: queryUnderstanding.semanticRepresentation,
    producerRevision: queryUnderstanding.producerRevision,
  },
  authority: {
    canonicalAuthority: false,
    writesPerformed: false,
    promotionAuthorized: false,
    sourcePromotionAttempted: false,
  },
  limitations: [
    'This proof validates only deterministic query planning and keyword decomposition.',
    'Postgres FTS, pgvector parity, source admission, and canonical promotion are separate gates.',
  ],
};

const output = resolve('docs/reports/search-fabric-contract-proof-v1.json');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...report, reportPath: output }, null, 2));
if (report.status !== 'SEARCH_FABRIC_CONTRACT_PROVEN') process.exitCode = 1;
