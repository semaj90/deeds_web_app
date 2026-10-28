import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTaxonomy, buildResolver, censusLegacyLabels, normalizeLabel } from './domain-taxonomy-contract-v1.mjs';
import { classifyWithFanout, stripLeakage, groupSplit, assertNoGroupLeakage, MAX_LANES } from './domain-classification-dag-v1.mjs';

// Mirrors the 17 live domain_taxonomy_v1 ids/parents (read-only audit 2026-10-27). Fixture only.
const d = (id, label, parentId = null, extra = {}) => ({ id, label, parentId, description: `${label} domain`, ...extra });
const TAXONOMY = { version: 1, domains: [
  d('database', 'Database & Persistence'), d('database.postgresql', 'PostgreSQL', 'database'),
  d('devops', 'DevOps & Infrastructure'), d('devops.env-config', 'Environment Configuration', 'devops'), d('devops.process-mgmt', 'Process Management', 'devops'),
  d('frontend', 'Frontend & UI'), d('frontend.sveltekit', 'SvelteKit / Svelte', 'frontend'),
  d('graph', 'Graph & Topology'), d('gpu', 'GPU & CUDA Acceleration'), d('cache', 'Caching'), d('retrieval', 'Information Retrieval'),
  d('test', 'Testing'), d('auth', 'Authentication & Authorization'), d('api', 'API Design & Integration'),
  d('compiler', 'Compiler & Language Tooling'), d('machine-learning', 'Machine Learning'), d('error-handling', 'Error Handling & Recovery'),
], capabilities: [{ id: 'streaming', label: 'Streaming' }] };

const SHA = `sha256:${'a'.repeat(64)}`;
const item = (features = { imports: ['pg'] }) => ({ id: 'i1', sourceDigest: SHA, features });
const resolver = buildResolver(TAXONOMY);

test('taxonomy contract: valid document passes; structural defects are named', () => {
  assert.equal(validateTaxonomy(TAXONOMY).valid, true);
  assert.ok(validateTaxonomy({ ...TAXONOMY, domains: [...TAXONOMY.domains, d('database', 'dup')] }).errors.some((e) => e.startsWith('ID_DUPLICATE')));
  assert.ok(validateTaxonomy({ version: 1, domains: [d('x.y', 'XY', 'x')] }).errors.some((e) => e.startsWith('PARENT_MISSING')));
  assert.ok(validateTaxonomy({ version: 1, domains: [d('a', 'A'), d('a.b', 'AB', 'a'), d('a.b.c', 'ABC', 'a.b')] }).errors.some((e) => e.startsWith('ID_INVALID')));
  assert.ok(validateTaxonomy({ version: 1, domains: [d('a', 'Same'), d('b', 'same')] }).errors.some((e) => e.startsWith('NAME_COLLISION')));
  assert.ok(validateTaxonomy({ version: 1, domains: [d('a', 'A', null, { description: '' })] }).errors.some((e) => e.startsWith('DESCRIPTION_MISSING')));
  assert.ok(validateTaxonomy({ ...TAXONOMY, capabilities: [{ id: 'gpu', label: 'x' }] }).errors.some((e) => e.startsWith('CAPABILITY_COLLIDES')));
  assert.throws(() => buildResolver({ version: 0, domains: [] }), /TAXONOMY_INVALID/);
});

test('resolution is normalized-exact only; unknown labels abstain, never guess', () => {
  assert.equal(resolver.resolve('Information Retrieval').domainId, 'retrieval');
  assert.equal(resolver.resolve('  caching ').domainId, 'cache');
  assert.equal(resolver.resolve('PostgreSQL').broadDomain, 'database');
  assert.equal(resolver.resolve('PostgreSQL').fineRole, 'database.postgresql');
  assert.equal(resolver.resolve('MachineLearning').status, 'ABSTAIN');
  assert.equal(resolver.resolve('Graph').domainId, 'graph');
  assert.equal(resolver.resolve('rag_retrieval').status, 'ABSTAIN');
  assert.equal(resolver.resolve('').status, 'UNKNOWN');
  assert.equal(normalizeLabel('A  B_C/D'), 'a-b-c-d');
});

test('legacy label census shows how much of the live distribution resolves without guessing (counts from 2026-10-27 read-only audit)', () => {
  const legacy = { Graph: 7716, documentation: 6782, Other: 5441, UI: 4365, test: 4228, gpu: 3876, compiler: 3766, tool: 3695, frontend: 3190, database: 2515, graph: 2350, MachineLearning: 2341, retrieval: 2306, rag_retrieval: 1805, agent: 1536, backend: 1495, cache: 1385, 'Classification failed': 21 };
  const out = censusLegacyLabels(resolver, legacy);
  assert.equal(out.byLabel.Graph.status, 'ASSIGNED');
  assert.equal(out.byLabel.documentation.status, 'ABSTAIN');
  assert.equal(out.byLabel['Classification failed'].status, 'ABSTAIN');
  assert.ok(out.abstain > 0 && out.assigned > 0, 'only part of the legacy distribution resolves exactly, so no mass relabel is possible');
  assert.equal(out.assigned + out.abstain + out.unknown, Object.values(legacy).reduce((a, b) => a + b, 0));
});

test('DAG: deterministic rule wins first, is a proposal, and never carries canonical flags', async () => {
  const out = await classifyWithFanout({ item: item(), resolver, router: () => ({ domainId: 'database', rule: 'imports-pg' }), classifier: () => { throw new Error('must not run'); } });
  assert.equal(out.status, 'PROPOSAL_ONLY');
  assert.equal(out.basis, 'DETERMINISTIC_RULE');
  assert.equal(out.canonicalIdentity, false);
  assert.equal(out.canonicalAuthority, false);
  assert.equal(out.relationPersisted, false);
});

test('DAG: confidence gate accepts, rejects, or fans out; invalid domains from a classifier are errors not labels', async () => {
  const run = (conf, extra = {}) => classifyWithFanout({ item: item(), resolver, router: () => null, classifier: () => ({ domainId: 'graph', confidence: conf }), ...extra });
  assert.equal((await run(0.95)).basis, 'CLASSIFIER');
  assert.equal((await run(0.2)).reason, 'CONFIDENCE_BELOW_REJECT');
  assert.equal((await run(0.6)).reason, 'NO_LANE_AGREEMENT');
  const bad = await classifyWithFanout({ item: item(), resolver, router: () => null, classifier: () => ({ domainId: 'made-up', confidence: 0.99 }) });
  assert.equal(bad.status, 'ABSTAIN');
  assert.ok(bad.receipt.errors.some((e) => e.startsWith('CLASSIFIER_UNKNOWN_DOMAIN')));
  assert.equal((await run(0.6, { thresholds: { accept: 0.3, reject: 0.5 } })).reason, 'THRESHOLDS_INVALID');
});

test('DAG: missing source digest abstains before any model runs', async () => {
  const out = await classifyWithFanout({ item: { id: 'x', sourceDigest: 'nope', features: {} }, resolver, router: () => { throw new Error('no'); }, classifier: () => { throw new Error('no'); } });
  assert.equal(out.reason, 'SOURCE_DIGEST_MISSING');
});

test('DAG: uncertain items fan out to at most three advisory lanes; agreement is required', async () => {
  const lane = (domainId, confidence = 0.8) => async () => ({ domainId, confidence, evidenceRefs: ['ref:1'] });
  const base = { item: item(), resolver, router: () => null, classifier: () => ({ domainId: 'graph', confidence: 0.6 }) };
  const agree = await classifyWithFanout({ ...base, lanes: { EMBEDDING_SIMILARITY: lane('graph'), GRAPH_NEIGHBOR: lane('graph'), LOCAL_NLP: lane('cache') } });
  assert.equal(agree.domainId, 'graph');
  assert.match(agree.basis, /^AGREEMENT:CLASSIFIER\+/);
  assert.equal(agree.receipt.laneReceipts.length, 3);
  const disagree = await classifyWithFanout({ ...base, classifier: () => ({ domainId: 'graph', confidence: 0.6 }), lanes: { EMBEDDING_SIMILARITY: lane('cache'), GRAPH_NEIGHBOR: lane('gpu') } });
  assert.equal(disagree.reason, 'NO_LANE_AGREEMENT');
  assert.equal(MAX_LANES, 3);
});

test('DAG: lane budget, unknown lanes, timeouts, invalid output and identity fields are contained as error receipts', async () => {
  const slow = () => new Promise((resolve) => setTimeout(resolve, 200));
  const base = { item: item(), resolver, router: () => null, classifier: () => ({ domainId: 'graph', confidence: 0.6 }) };
  const out = await classifyWithFanout({ ...base, laneBudget: { maxLanes: 3, timeoutMs: 20 }, lanes: {
    EMBEDDING_SIMILARITY: slow,
    GRAPH_NEIGHBOR: async () => ({ domainId: 'graph', confidence: 0.9, evidenceRefs: [], packetKey: 'packet:x' }),
    LOCAL_NLP: async () => ({ domainId: 'nope', confidence: 0.9, evidenceRefs: ['r'] }),
    EXTRA_LANE: async () => ({}),
  } });
  assert.equal(out.status, 'ABSTAIN');
  const errs = out.receipt.errors.join('|');
  assert.match(errs, /LANE_NOT_ALLOWED:EXTRA_LANE/);
  assert.match(errs, /LANE_TIMEOUT/);
  assert.match(errs, /LANE_RETURNED_IDENTITY_FIELDS:packetKey/);
  assert.match(errs, /LANE_RESULT_INVALID/);
  const capped = await classifyWithFanout({ ...base, laneBudget: { maxLanes: 1, timeoutMs: 50 }, lanes: { EMBEDDING_SIMILARITY: async () => ({ domainId: 'graph', confidence: 0.7, evidenceRefs: ['r'] }), GRAPH_NEIGHBOR: async () => ({ domainId: 'graph', confidence: 0.7, evidenceRefs: ['r'] }) } });
  assert.equal(capped.receipt.laneReceipts.length, 1);
  assert.match(capped.receipt.errors.join('|'), /LANE_BUDGET_EXCEEDED/);
});

test('leakage: identity, provenance and label fields are stripped from model inputs', () => {
  const { features, removedLeakageFields } = stripLeakage({ imports: ['x'], packetKey: 'p', sourceRef: 's', sourceRevision: 'r', domainClass: 'graph', goldLabel: 'g', tokens: 3 });
  assert.deepEqual(features, { imports: ['x'], tokens: 3 });
  assert.deepEqual(removedLeakageFields, ['domainClass', 'goldLabel', 'packetKey', 'sourceRef', 'sourceRevision']);
});

test('sampling: group-aware split is deterministic and never splits a file family across partitions', () => {
  const items = Array.from({ length: 600 }, (_, i) => ({ id: i, family: `fam-${i % 60}`, dir: `d${i % 7}` }));
  const a = groupSplit(items, (x) => x.family);
  const b = groupSplit([...items].reverse(), (x) => x.family);
  assert.equal(assertNoGroupLeakage(a, (x) => x.family).leaked, false);
  assert.deepEqual(a.test.map((x) => x.id).sort((p, q) => p - q), b.test.map((x) => x.id).sort((p, q) => p - q));
  assert.equal(a.train.length + a.validation.length + a.test.length, 600);
  assert.ok(a.train.length > a.test.length);
  const naive = { train: items.slice(0, 300), validation: [], test: items.slice(300) };
  assert.equal(assertNoGroupLeakage(naive, (x) => x.family).leaked, true);
});
