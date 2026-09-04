import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const owners = [
  {
    parameterSchemaRef: 'param:graph-hop-bound',
    status: 'OWNER_FOUND',
    owner: 'sveltekit-frontend/src/lib/server/atlas/policy/oak-dag-owner-input-schemas-v1.ts::oakDagGraphExpandInputSchema',
    fields: ['maxHops', 'maxNodes', 'maxEdges', 'direction'],
    exactArtifactValidator: false,
  },
  {
    parameterSchemaRef: 'param:top-k',
    status: 'AMBIGUOUS_OWNER',
    owner: 'multiple retrieval request schemas expose topK/limit; no single exact kernel parameter validator found',
    fields: ['topK', 'limit'],
    exactArtifactValidator: false,
  },
  {
    parameterSchemaRef: 'param:token-budget',
    status: 'AMBIGUOUS_OWNER',
    owner: 'ACE/context schemas expose tokenBudget, but no exact kernel parameter validator found',
    fields: ['tokenBudget', 'maximumInput', 'remainingInput'],
    exactArtifactValidator: false,
  },
];
const body = {
  schema: 'atlas.kernel-parameter-schema-owners.v1',
  gate: 'DAG-PARAMETER-SCHEMA-OWNER-AUDIT-01',
  scope: 'read-only source audit; no runtime, database, cache, or artifact-store writes',
  owners,
  exactOwnerCount: owners.filter((owner) => owner.status === 'OWNER_FOUND' && owner.exactArtifactValidator).length,
  provenSourceOwnerCount: owners.filter((owner) => owner.status === 'OWNER_FOUND').length,
  classification: 'EXACT_PARAMETER_VALIDATORS_NOT_YET_DEFINED',
  canonicalAuthority: false,
  writesPerformed: false,
};
const checksum = createHash('sha256').update(JSON.stringify(body), 'utf8').digest('hex');
writeFileSync(resolve(root, 'docs/reports/kernel-parameter-schema-owners-v1.json'), `${JSON.stringify({ ...body, reportChecksum: `sha256:${checksum}` }, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ output: 'docs/reports/kernel-parameter-schema-owners-v1.json', classification: body.classification, provenSourceOwnerCount: body.provenSourceOwnerCount }, null, 2));
