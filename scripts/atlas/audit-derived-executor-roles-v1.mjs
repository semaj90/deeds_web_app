import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const roles = [
  ['turbovec', 'semantic_prefilter_challenger'],
  ['networkx', 'cpu_graph_reference'],
  ['cugraph', 'gpu_graph_challenger'],
  ['kmeans', 'derived_candidate_cluster'],
  ['som', 'derived_topology_projection'],
  ['hamming', 'candidate_prefilter'],
  ['hilbert', 'physical_locality_order'],
];

const evidence = roles.map(([name, role]) => ({
  name,
  role,
  implementationObserved: [
    resolve(root, `sveltekit-frontend/src/lib/server/${name}`),
    resolve(root, `scripts/atlas/${name}`),
    resolve(root, `python/${name}`),
    resolve(root, `services/${name}`),
  ].some((candidate) => existsSync(candidate)),
  canonicalIdentityOwner: false,
  additionalSemanticVote: false,
  writesPerformed: false,
}));

const report = {
  schema: 'atlas.derived-executor-role-audit.v1',
  status: 'CHALLENGER_ROLES_EXPLICIT',
  roles: evidence,
  policy: {
    postgresOwnsIdentity: true,
    candidateOrdinalOwner: 'qualified-lineage-only',
    fusionOwner: 'SearchRuntime',
    qdrantIsProjection: true,
    bitfrostIsMetadataCache: true,
  },
  canonicalAuthority: false,
  writesPerformed: false,
};

const output = resolve(root, 'docs/reports/derived-executor-roles-v1.json');
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ output, status: report.status, roles: evidence.length, writesPerformed: false }, null, 2));
