import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outputPath = path.join(root, 'docs', 'reports', 'graph-identity-contracts-audit-v1.json');
const owners = [
  { id: 'parse_node_id', source: 'sveltekit-frontend/src/lib/server/atlas/identity/graph-identity-contracts.ts', marker: 'type ParseNodeId', role: 'AST parse occurrence', revisionBound: true, forbidden: ['symbol_id', 'symbol_version_id'] },
  { id: 'symbol_id', source: 'sveltekit-frontend/src/lib/server/atlas/identity/graph-identity-contracts.ts', marker: 'type SymbolId', role: 'logical symbol identity', revisionBound: false, forbidden: ['symbol_version_id', 'parse_node_id'] },
  { id: 'symbol_version_id', source: 'sveltekit-frontend/src/lib/server/atlas/identity/graph-identity-contracts.ts', marker: 'type SymbolVersionId', role: 'revision-qualified symbol occurrence', revisionBound: true, forbidden: ['symbol_id', 'parse_node_id'] },
  { id: 'chunk_id', source: 'sveltekit-frontend/src/lib/server/atlas/identity/graph-identity-contracts.ts', marker: 'type ChunkId', role: 'retrieval chunk identity', revisionBound: true, forbidden: ['packet_key', 'qdrant_point_id'] },
  { id: 'packet_key', source: 'sveltekit-frontend/src/lib/server/atlas/identity/graph-identity-contracts.ts', marker: 'type PacketKey', role: 'canonical packet join identity', revisionBound: false, forbidden: ['qdrant_point_id', 'graph_node_key'] },
  { id: 'concept_id', source: 'sveltekit-frontend/src/lib/server/atlas/identity/graph-identity-contracts.ts', marker: 'type ConceptId', role: 'ontology concept reference', revisionBound: false, forbidden: ['packet_key', 'symbol_id'] },
  { id: 'graph_node_key', source: 'packages/parent-atlas/src/core/graph-node-key-v1.ts', marker: 'graphNodeKeyV1Schema', role: 'derived graph projection address', revisionBound: false, forbidden: ['packet_key', 'symbol_id', 'symbol_version_id', 'parse_node_id'] },
];
const supportFiles = [
  'sveltekit-frontend/src/lib/server/atlas/identity/tree-node-occurrence-v1.ts',
  'sveltekit-frontend/src/lib/server/atlas/identity/symbol-revision-qualification-v1.ts',
  'sveltekit-frontend/src/lib/server/atlas/identity/symbol-identity-audit-v1.ts',
];
const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const fileChecksum = (relativePath) => sha256(fs.readFileSync(path.join(root, relativePath)));

const contracts = owners.map((owner) => {
  const fullPath = path.join(root, owner.source);
  const exists = fs.existsSync(fullPath);
  const source = exists ? fs.readFileSync(fullPath, 'utf8') : '';
  return {
    ...owner,
    exists,
    markerFound: exists && source.includes(owner.marker),
    sourceChecksum: exists ? fileChecksum(owner.source) : null,
    authority: owner.id === 'graph_node_key' ? 'PROJECTION_ONLY' : owner.id === 'concept_id' ? 'ONTOLOGY_REFERENCE_UNVERIFIED' : 'IDENTITY_CONTRACT_DEFINITION',
  };
});
const support = supportFiles.map((source) => ({ source, exists: fs.existsSync(path.join(root, source)), sourceChecksum: fs.existsSync(path.join(root, source)) ? fileChecksum(source) : null }));
const definitionsProven = contracts.every((contract) => contract.exists && contract.markerFound) && support.every((entry) => entry.exists);
const report = {
  schema: 'atlas.graph-identity-contracts-audit.v1',
  generatedAt: new Date().toISOString(),
  status: definitionsProven ? 'DEFINITION_CONTRACTS_PROVEN_POPULATION_UNPROVEN' : 'BLOCKED_MISSING_CONTRACT_DEFINITION',
  proofLevel: definitionsProven ? 'STATIC_SOURCE_PROVEN' : 'NOT_PROVEN',
  authority: false,
  writesPerformed: false,
  canonicalWrites: false,
  contracts,
  support,
  invariants: [
    'parse_node_id is an AST occurrence and is not symbol_id or symbol_version_id.',
    'symbol_version_id is revision-bound and is not symbol_id.',
    'packet_key is a join identity and is never manufactured from a projection address.',
    'graph_node_key is a derived projection address and never substitutes for canonical identity.',
    'This audit proves definitions only; live population and cross-revision continuity remain separate gates.',
  ],
  likely_cause: 'Identity definitions existed across several Atlas seams, but the OpenSpec task lacked one current source audit and stable task identity.',
  evidence: ['source marker audit', ...contracts.map((contract) => contract.source), ...supportFiles],
  patch_targets: ['scripts/atlas/audit-graph-identity-contracts-v1.mjs', 'sveltekit-frontend/src/lib/server/atlas/identity/graph-identity-contracts.ts'],
  safe_next_command: 'node scripts/atlas/audit-graph-identity-contracts-v1.mjs',
  smoke_command: 'node scripts/atlas/audit-graph-identity-contracts-v1.mjs && node -e "const r=require(\'docs/reports/graph-identity-contracts-audit-v1.json\'); if(r.status!==\'DEFINITION_CONTRACTS_PROVEN_POPULATION_UNPROVEN\') process.exit(1)"',
  report_path: 'docs/reports/graph-identity-contracts-audit-v1.json',
};
report.checksum = sha256(JSON.stringify(report));
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ schema: report.schema, status: report.status, proofLevel: report.proofLevel, contractCount: contracts.length, reportPath: outputPath }, null, 2));
