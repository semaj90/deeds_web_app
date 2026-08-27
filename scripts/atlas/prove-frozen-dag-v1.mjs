import assert from 'node:assert/strict';
import { applyExecutionEvent, assertMutationTransition, buildFrozenDag, deriveReadySet, replayExecutionEvents, sha256 } from './lib/frozen-dag-v1.mjs';

const input = {
  dagId: 'dag-lab-ts-error-repair',
  dagRevision: 'dag:r1',
  kernelRevision: 'kernel:r1',
  nodes: [
    { nodeId: 'resolve', functionId: 'resolve_error_target' },
    { nodeId: 'ast', functionId: 'inspect_ast' },
    { nodeId: 'semantic', functionId: 'search_semantic' },
    { nodeId: 'hydrate', functionId: 'hydrate_source' },
    { nodeId: 'verify', functionId: 'typecheck' },
  ],
  edges: [
    { from: 'resolve', to: 'ast' }, { from: 'resolve', to: 'semantic' },
    { from: 'ast', to: 'hydrate' }, { from: 'semantic', to: 'hydrate' }, { from: 'hydrate', to: 'verify' },
  ],
};

const first = buildFrozenDag(input);
const second = buildFrozenDag(input);
const permuted = buildFrozenDag({
  ...input,
  nodes: [...input.nodes].reverse(),
  edges: [...input.edges].reverse(),
});
assert.deepEqual(first.topologicalGenerations, [['resolve'], ['ast', 'semantic'], ['hydrate'], ['verify']]);
assert.deepEqual(first.topologicalOrder, ['resolve', 'ast', 'semantic', 'hydrate', 'verify']);
assert.equal(first.generationSemantics, 'longest_dependency_distance_from_source');
assert.equal(first.checksum, second.checksum);
assert.equal(first.checksum, permuted.checksum);
assert.deepEqual(deriveReadySet(first, []), ['resolve']);

assert.throws(() => buildFrozenDag({ ...input, edges: [...input.edges, { from: 'verify', to: 'resolve' }] }), /DAG_CYCLE_DETECTED/);

let state = replayExecutionEvents([{ nodeId: 'resolve', status: 'STARTED' }, { nodeId: 'resolve', status: 'FINALIZED' }]);
assert.deepEqual(deriveReadySet(first, Object.values(state)), ['ast', 'semantic']);
state = applyExecutionEvent(state, { nodeId: 'ast', status: 'STARTED', mutation: 'NONE' });
assert.equal(state.ast.status, 'STARTED');
assert.equal(assertMutationTransition('NONE', 'PROPOSED'), 'PROPOSED');
assert.equal(assertMutationTransition('PROPOSED', 'AUTHORIZED'), 'AUTHORIZED');
assert.equal(assertMutationTransition('AUTHORIZED', 'APPLIED_TEMP'), 'APPLIED_TEMP');
assert.equal(assertMutationTransition('APPLIED_TEMP', 'VALIDATED'), 'VALIDATED');
assert.equal(assertMutationTransition('VALIDATED', 'ROLLED_BACK'), 'ROLLED_BACK');
assert.throws(() => assertMutationTransition('NONE', 'PROMOTED'), /INVALID_MUTATION_TRANSITION/);

const receipt = {
  schema: 'atlas.frozen-dag-proof-receipt.v1',
  status: 'PROVEN',
  readOnly: true,
  dagChecksum: first.checksum,
  topologicalOrder: first.topologicalOrder,
  topologicalGenerations: first.topologicalGenerations,
  generationSemantics: first.generationSemantics,
  replayStateChecksum: sha256(state),
  mutationTransitions: ['NONE>PROPOSED', 'PROPOSED>AUTHORIZED', 'AUTHORIZED>APPLIED_TEMP', 'APPLIED_TEMP>VALIDATED', 'VALIDATED>ROLLED_BACK'],
};
console.log(JSON.stringify(receipt, null, 2));
