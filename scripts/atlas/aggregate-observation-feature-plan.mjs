#!/usr/bin/env node

/**
 * Read-only packet-level aggregation for the ORF projection.
 *
 * AST entities are symbol-level, while ORF-2 is keyed by packet_key and
 * feature_revision. This emits a deterministic review artifact and never
 * calls the live materializer.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const featureRevision = 'atlas-ast-entity-prefill-v2';
const inputPath = path.join(root, '.tmp/atlas/graphify-file-index-v1/ast-entity-identity.jsonl');
const domainPath = path.join(root, '.tmp/atlas/graphify-file-index-v1/ast-entity-okf-domain.jsonl');
const outputPath = path.join(root, '.tmp/atlas/graphify-file-index-v1/observation-feature-projection-plan.jsonl');
const reportPath = path.join(root, 'docs/reports/atlas-observation-feature-aggregation-v1.json');

const readJsonl = async (file) => (await fs.readFile(file, 'utf8'))
  .split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const unique = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
const digest = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
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

const identity = await readJsonl(inputPath);
const domains = await readJsonl(domainPath);
const domainBySubject = new Map(domains.map((row) => [row.subject_ref, row]));
const groups = new Map();

for (const row of identity) {
  if (!row.packet_key || !row.source_ref) continue;
  const key = `${row.packet_key}\0${featureRevision}`;
  const group = groups.get(key) ?? [];
  group.push(row);
  groups.set(key, group);
}

const projections = [...groups.values()].map((rows) => {
  const first = rows[0];
  const domainRows = rows.map((row) => domainBySubject.get(
    `${row.packet_key}#${row.entity_id ?? `${row.symbol_kind}:${row.symbol_name}:${row.start_byte}`}`,
  )).filter(Boolean);
  const primaryDomains = unique(domainRows.map((row) => row.domain_id));
  const fallbackCount = domainRows.filter((row) => !row.domain_id).length;
  const astObservationKinds = unique(rows.flatMap((row) => {
    const kind = String(row.symbol_kind ?? '').toLowerCase();
    const astKind = String(row.ast_kind ?? '').toLowerCase();
    return [astKinds.get(kind), astKinds.get(astKind)];
  }));
  const flattenedTags = unique([
    ...primaryDomains.map((domain) => `domain=${domain}`),
    ...(fallbackCount ? ['domain=general'] : []),
    ...astObservationKinds.map((kind) => `ast=${kind.toLowerCase()}`),
  ]);
  const plan = {
    schema: 'atlas.observation-feature-projection-plan-row.v1',
    packetKey: first.packet_key,
    featureRevision,
    sourceRef: first.source_ref,
    sourceRevision: first.source_revision ?? null,
    treeNodeId: first.tree_node_id ?? null,
    symbolCount: rows.length,
    symbolNames: unique(rows.map((row) => row.symbol_name)),
    symbolKinds: unique(rows.map((row) => row.symbol_kind)),
    astObservationKinds,
    primaryDomains,
    fallbackDomainCount: fallbackCount,
    flattenedTags,
    canonicalWrite: false,
  };
  return { ...plan, inputDigest: digest(plan) };
}).sort((a, b) => a.packetKey.localeCompare(b.packetKey));

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(outputPath, projections.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');
const report = {
  schema: 'atlas.observation-feature-aggregation-receipt.v1',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  writes: false,
  inputIdentityRows: identity.length,
  inputDomainRows: domains.length,
  outputProjectionRows: projections.length,
  aggregatedSymbolRows: projections.reduce((sum, row) => sum + row.symbolCount, 0),
  collisionRowsReduced: identity.length - projections.length,
  fallbackProjectionRows: projections.filter((row) => row.fallbackDomainCount > 0).length,
  outputPath,
  planChecksum: digest(projections),
  sample: projections.slice(0, 5),
  nextGate: 'REVIEW_AGGREGATED_PLAN_BEFORE_MATERIALIZER_APPLY',
};
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
