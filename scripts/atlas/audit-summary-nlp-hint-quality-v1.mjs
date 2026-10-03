#!/usr/bin/env node
/** Read-only, deterministic review of a bounded SUMMARY-NLP HINT proposal artifact. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { analyzeSummaryContaminationV1 } from './lib/summary-quality-v1.mjs';

const root = process.cwd();
const runDir = path.resolve(root, process.argv[2] ?? '.tmp/atlas/summary-nlp-hint-v1/20260926T0735Z');
const manifestPath = path.join(runDir, 'manifest.json');
const proposalPath = path.join(runDir, 'proposals.ndjson');
const shaBuffer = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const shaFile = async (file) => {
  const hash = crypto.createHash('sha256'); let bytes = 0;
  for await (const chunk of fs.createReadStream(file)) { hash.update(chunk); bytes += chunk.length; }
  return { sha256: `sha256:${hash.digest('hex')}`, bytes };
};
const eachJsonl = async (file, callback) => {
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) if (line.trim()) await callback(JSON.parse(line));
};

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (manifest.schema !== 'atlas.summary-hint-nlp-receipt.v1' || manifest.canonicalAuthority !== false
  || manifest.promotionAuthorized !== false || manifest.writes?.postgres !== 0
  || manifest.writes?.qdrant !== 0 || manifest.writes?.valkey !== 0) throw new Error('NONCANONICAL_NLP_PROPOSAL_RUN_REQUIRED');
const proposalHash = await shaFile(proposalPath);
if (proposalHash.sha256 !== manifest.proposalSha256) throw new Error('NLP_PROPOSAL_CHECKSUM_MISMATCH');
const proposalRows = [];
await eachJsonl(proposalPath, (row) => proposalRows.push(row));
if (proposalRows.length !== manifest.proposed || proposalRows.length !== 32) throw new Error('NLP_PROPOSAL_COUNT_MISMATCH');

const censusRoot = path.join(root, '.tmp/atlas/summary-search-census-v1');
let censusRun = null;
for (const dir of fs.readdirSync(censusRoot, { withFileTypes: true }).filter((item) => item.isDirectory())) {
  const file = path.join(censusRoot, dir.name, 'manifest.json');
  if (!fs.existsSync(file)) continue;
  const candidate = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (candidate.acceptedRootChecksum === manifest.inputCensusRootChecksum) { censusRun = { dir: path.join(censusRoot, dir.name), manifest: candidate }; break; }
}
if (!censusRun || censusRun.manifest.status !== 'SEALED' || censusRun.manifest.canonicalAuthority !== false) throw new Error('SEALED_INPUT_CENSUS_NOT_FOUND');
for (const shard of censusRun.manifest.acceptedShards) {
  const actual = await shaFile(path.join(censusRun.dir, shard.path));
  if (actual.sha256 !== shard.sha256) throw new Error(`INPUT_CENSUS_SHARD_CHECKSUM_MISMATCH:${shard.path}`);
}

const requestedRows = new Map(proposalRows.map((row) => [row.chunkRowId, row]));
const censusByChunkRowId = new Map();
for (const shard of censusRun.manifest.acceptedShards) await eachJsonl(path.join(censusRun.dir, shard.path), (row) => {
  if (requestedRows.has(row.identity?.chunkRowId)) {
    if (censusByChunkRowId.has(row.identity.chunkRowId)) throw new Error(`DUPLICATE_CHUNK_ROW_IN_INPUT_CENSUS:${row.identity.chunkRowId}`);
    censusByChunkRowId.set(row.identity.chunkRowId, row);
  }
});
if (censusByChunkRowId.size !== proposalRows.length) throw new Error('PROPOSAL_INPUT_CENSUS_RECONCILIATION_FAILED');

const genericTerms = new Set(['css', 'api', 'javascript', 'typescript', 'ui', 'json', 'redis', 'sqlite', 'indexeddb', 'vitest', 'kag']);
const findings = [];
const counts = { proposals: proposalRows.length, inputRowsReconciled: 0, censusDetectorPreviouslyClean: 0, sharedDetectorClean: 0, sharedDetectorBlocked: 0, promptOrReasoningResidue: 0,
  exactSpanEntities: 0, duplicateSpanEntities: 0, genericOrMislabelledEntities: 0, lowInformationEntities: 0,
  sourceRefMissing: 0, lineageBound: 0, unqualifiedHint: 0, emptyEntityLists: 0 };
for (const proposal of proposalRows) {
  if (proposal.schema !== 'atlas.summary-hint-nlp-proposal.v1' || proposal.canonicalAuthority !== false
    || proposal.summaryDigest !== proposal.inputDigest) throw new Error(`INVALID_NLP_PROPOSAL_ENVELOPE:${proposal.ordinal}`);
  const input = censusByChunkRowId.get(proposal.chunkRowId);
  if (input.identity?.sourceRef !== proposal.sourceRef) throw new Error(`PROPOSAL_SOURCE_REF_MISMATCH:${proposal.ordinal}`);
  const text = input.summary?.text;
  if (typeof text !== 'string' || shaBuffer(text) !== proposal.summaryDigest || proposal.trustState !== input.summary.state) throw new Error(`SUMMARY_BYTES_OR_TRUST_MISMATCH:${proposal.ordinal}`);
  counts.inputRowsReconciled++;
  if (input.summary.qualityClean === true) counts.censusDetectorPreviouslyClean++;
  const currentQuality = analyzeSummaryContaminationV1(text);
  if (currentQuality.clean) counts.sharedDetectorClean++;
  else counts.sharedDetectorBlocked++;
  if (proposal.trustState === 'LEGACY_HINT_LINEAGE_BOUND') counts.lineageBound++;
  if (proposal.trustState === 'LEGACY_HINT_UNQUALIFIED') counts.unqualifiedHint++;
  if (proposal.sourceRef == null) counts.sourceRefMissing++;
  if (proposal.entities.length === 0) counts.emptyEntityLists++;

  const residue = [];
  if (/<\/?start_of_turn(?:\s[^>]*)?>|<\|(?:start_of_turn|end_of_turn|channel)\|>/i.test(text)) residue.push('TURN_CONTROL_MARKER');
  if (/\bself[- ]correction\b|no changes needed|i will ensure the final output|the goal is to summarize this in\s+\d+[-–]\d+\s+sentences/i.test(text)) residue.push('PROMPT_OR_REASONING_RESIDUE');
  if (residue.length) counts.promptOrReasoningResidue++;
  const spans = new Set();
  const entityReviews = proposal.entities.map((entity) => {
    const exact = Number.isInteger(entity.start) && Number.isInteger(entity.end) && entity.start >= 0
      && entity.end > entity.start && entity.end <= text.length && text.slice(entity.start, entity.end) === entity.text;
    if (exact) counts.exactSpanEntities++;
    const spanKey = `${entity.start}:${entity.end}:${entity.text}`;
    const duplicate = spans.has(spanKey); spans.add(spanKey);
    if (duplicate) counts.duplicateSpanEntities++;
    const generic = genericTerms.has(String(entity.text).toLowerCase())
      || (entity.label === 'CODE_SYMBOL' && !/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(entity.text));
    const lowInfo = ['CARDINAL', 'ORDINAL', 'DATE'].includes(entity.label) && !generic;
    if (generic) counts.genericOrMislabelledEntities++;
    if (lowInfo) counts.lowInformationEntities++;
    return { text: entity.text, label: entity.label, span: [entity.start, entity.end], exactSpan: exact, duplicateSpan: duplicate,
      disposition: !exact ? 'REJECT_BAD_SPAN' : duplicate ? 'REJECT_DUPLICATE' : generic ? 'REJECT_GENERIC_OR_MISLABELLED' : lowInfo ? 'REJECT_LOW_INFORMATION' : 'REVIEW_FALSE_ENTITY_OR_USEFUL' };
  });
  findings.push({ ordinal: proposal.ordinal, chunkRowId: proposal.chunkRowId, sourceRef: proposal.sourceRef,
    trustState: proposal.trustState, summaryDigest: proposal.summaryDigest, residue, entityReviews,
    admission: 'HINT_ONLY_NOT_ADMITTED', acceptedForCanonicalEnrichment: false });
}

if (counts.proposals !== counts.inputRowsReconciled || counts.duplicateSpanEntities !== 0
  || counts.exactSpanEntities !== proposalRows.reduce((sum, row) => sum + row.entities.length, 0)) throw new Error(`NLP_QUALITY_CENSUS_INVARIANT_FAILED:${JSON.stringify(counts)}`);
const report = {
  schema: 'atlas.summary-hint-nlp-quality-review.v1', status: counts.promptOrReasoningResidue ? 'EXPANSION_BLOCKED_QUALITY_GAPS_FOUND' : 'BOUNDED_CANARY_REVIEWED',
  generatedAt: new Date().toISOString(), input: { proposalPath: path.relative(root, proposalPath).replaceAll('\\', '/'), proposalSha256: proposalHash.sha256,
    censusRootChecksum: manifest.inputCensusRootChecksum, censusPath: path.relative(root, censusRun.dir).replaceAll('\\', '/') },
  counts, aggregateDisposition: { accepted: 0, rejectedGenericOrMislabelled: counts.genericOrMislabelledEntities,
    rejectedLowInformation: counts.lowInformationEntities, manualReviewRequired: counts.exactSpanEntities - counts.genericOrMislabelledEntities - counts.lowInformationEntities,
    proposalAdmission: 'NONE; NLP fields remain suggestions' },
  findings, boundaries: { canonicalAuthority: false, postgresWrites: 0, qdrantWrites: 0, valkeyWrites: 0, rabbitmqPublishes: 0, llmCalls: 0 }
};
const out = path.join(root, 'docs/reports/summary-nlp-hint-quality-review-v2.json');
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ status: report.status, counts, reportPath: path.relative(root, out).replaceAll('\\', '/') }, null, 2));
