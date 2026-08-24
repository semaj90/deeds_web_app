#!/usr/bin/env node

/**
 * Read-only ORF materialization planner.
 *
 * This deliberately does not import the SvelteKit writer or connect to
 * PostgreSQL. It validates the existing AST/domain artifacts against the
 * packet-key observation-row shape before a bounded apply is considered.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = new Map(process.argv.slice(2).map((value) => {
  const [key, ...rest] = value.replace(/^--/, '').split('=');
  return [key, rest.join('=') || ''];
}));
const limit = Math.max(1, Number(args.get('limit') || 100));
const featureRevision = String(args.get('feature-revision') || 'atlas-ast-entity-prefill-v2');
const artifactRoot = path.join(root, '.tmp/atlas/graphify-file-index-v1');
const files = {
  identity: path.join(artifactRoot, 'ast-entity-identity.jsonl'),
  domain: path.join(artifactRoot, 'ast-entity-okf-domain.jsonl'),
};

const readJsonl = async (file) => {
  const text = await fs.readFile(file, 'utf8');
  return text.split(/\r?\n/).filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`Invalid JSONL at ${file}:${index + 1}: ${error.message}`);
    }
  });
};

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const unique = (values) => [...new Set(values.filter((value) => typeof value === 'string' && value.trim()))]
  .map((value) => value.trim()).sort((a, b) => a.localeCompare(b));

const astKinds = new Map([
  ['function', 'FUNCTION_DECL'], ['function_declaration', 'FUNCTION_DECL'],
  ['method', 'FUNCTION_DECL'], ['method_definition', 'FUNCTION_DECL'],
  ['class', 'CLASS_DECL'], ['class_declaration', 'CLASS_DECL'],
  ['interface', 'INTERFACE_DECL'], ['interface_declaration', 'INTERFACE_DECL'],
  ['type', 'TYPE_ALIAS'], ['type_alias_declaration', 'TYPE_ALIAS'],
  ['enum', 'TYPE_ALIAS'], ['enum_declaration', 'TYPE_ALIAS'],
  ['variable', 'VARIABLE_DECL'], ['variable_declarator', 'VARIABLE_DECL'],
  ['constant', 'VARIABLE_DECL'],
]);

const toSubject = (row) => row.entity_id || row.subject_ref || [
  row.packet_key,
  row.symbol_kind || row.entity_kind || 'unknown',
  row.symbol_name || row.name || 'unknown',
].join('#');

const identity = await readJsonl(files.identity);
const domains = await readJsonl(files.domain);
const domainBySubject = new Map(domains.map((row) => [toSubject(row), row]));
const domainByFallback = new Map(domains.map((row) => [
  [row.packet_key, row.symbol_name || row.name, row.symbol_kind || row.entity_kind].join('|'),
  row,
]));

const reasonCounts = new Map();
const addReason = (reason) => reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1);
const planned = [];
for (const row of identity.slice(0, limit)) {
  const subject = toSubject(row);
  const domain = domainBySubject.get(subject) || domainByFallback.get([
    row.packet_key, row.symbol_name || row.name, row.symbol_kind || row.entity_kind,
  ].join('|'));
  const observations = unique([
    astKinds.get(String(row.symbol_kind || '').toLowerCase()),
    astKinds.get(String(row.ast_kind || '').toLowerCase()),
  ]);
  const primaryDomain = typeof domain?.domain_id === 'string' && domain.domain_id.trim()
    ? domain.domain_id.trim()
    : null;
  const fallbackDomain = primaryDomain ? null : (domain ? 'general' : null);
  const blockers = [];
  if (!row.packet_key) blockers.push('missing_packet_key');
  if (!row.source_ref) blockers.push('missing_source_ref');
  // ORF stores sourceVersionReceiptId as optional. Keep source revision
  // lineage visible in coverage, but do not invent a hard blocker here.
  if (!observations.length) blockers.push('unmapped_ast_kind');
  if (!domain) blockers.push('missing_domain_candidate');
  if (blockers.length) blockers.forEach(addReason);
  planned.push({
    packetKey: row.packet_key || null,
    sourceRef: row.source_ref || null,
    treeNodeId: row.tree_node_id || null,
    sourceRevision: row.source_revision || null,
    symbolName: row.symbol_name || row.name || null,
    symbolKind: row.symbol_kind || row.entity_kind || null,
    astObservationKinds: observations,
    domainId: primaryDomain,
    fallbackDomainId: fallbackDomain,
    classificationStatus: primaryDomain ? 'PRIMARY_CANDIDATE' : (fallbackDomain ? 'FALLBACK_CANDIDATE' : 'MISSING'),
    identityStatus: row.identity_status || 'CANDIDATE',
    eligible: blockers.length === 0,
    blockers,
  });
}

const eligible = planned.filter((row) => row.eligible);
const keyGroups = new Map();
for (const row of eligible) {
  const key = `${row.packetKey}\0${featureRevision}`;
  const group = keyGroups.get(key) ?? [];
  group.push(row);
  keyGroups.set(key, group);
}
const collisionGroups = [...keyGroups.values()].filter((group) => group.length > 1);
const report = {
  schema: 'atlas.observation-feature-materialization-plan.v1',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  writes: false,
  sourceArtifacts: files,
  inputIdentityRows: identity.length,
  inputDomainRows: domains.length,
  examinedRows: planned.length,
  eligibleRows: eligible.length,
  featureRevision,
  projectedUniqueRows: keyGroups.size,
  primaryKeyCollisionGroups: collisionGroups.length,
  primaryKeyCollisionRows: collisionGroups.reduce((total, group) => total + group.length - 1, 0),
  collisionSamples: collisionGroups.slice(0, 5).map((group) => ({
    packetKey: group[0].packetKey,
    featureRevision,
    symbolCount: group.length,
    symbols: group.slice(0, 8).map((row) => `${row.symbolKind}:${row.symbolName}`),
  })),
  blockedRows: planned.length - eligible.length,
  coverage: {
    packetKey: planned.filter((row) => row.packetKey).length,
    sourceRef: planned.filter((row) => row.sourceRef).length,
    sourceRevision: planned.filter((row) => row.sourceRevision && !row.sourceRevision.endsWith('_PENDING')).length,
    astObservationKind: planned.filter((row) => row.astObservationKinds.length).length,
    domainCandidate: planned.filter((row) => row.domainId).length,
    domainFallback: planned.filter((row) => row.fallbackDomainId).length,
  },
  blockers: Object.fromEntries([...reasonCounts.entries()].sort(([a], [b]) => a.localeCompare(b))),
  sampleEligible: eligible.slice(0, 5),
  planChecksum: sha256(JSON.stringify(planned)),
  nextGate: eligible.length > 0 ? 'REVIEW_ORF_PLAN_BEFORE_APPLY' : 'REPAIR_INPUT_ARTIFACTS',
};

const out = path.join(root, 'docs/reports/atlas-observation-feature-materialization-plan-v1.json');
await fs.mkdir(path.dirname(out), { recursive: true });
await fs.writeFile(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
