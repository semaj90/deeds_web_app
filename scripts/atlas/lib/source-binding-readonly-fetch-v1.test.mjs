import test from 'node:test';
import { createSourceBindingResolverV1 } from './source-binding-resolver-v1.mjs';
import assert from 'node:assert/strict';
import { SOURCE_BINDING_READONLY_SQL_V1,
  fetchSourceBindingRowsReadOnlyV1,
  fetchSourceBindingRowsForScopesV1,
  assertSourceBindingScopeV1,
} from './source-binding-readonly-fetch-v1.mjs';
const workspaceRevision = `sha256:${'a'.repeat(64)}`;
const scope = {workspaceRevision, sourceRef: 'src/a.ts'};
const mock = (rows=[],fail=false) => {
  const calls=[];
  return {calls, async query(sql,args){calls.push({sql,args});if(fail && sql.includes('SELECT')) throw Error('READ_FAILURE');return sql.includes('SELECT')?{rows}:{rows:[]}},release(){calls.push({sql:'RELEASE'})}};
};
test('exact scoped read-only transaction and rollback',async()=>{
  const client=mock([{canonical_source_ref:scope.sourceRef}]);
  assert.equal((await fetchSourceBindingRowsReadOnlyV1(client,scope)).length,1);
  assert.match(client.calls[0].sql,/REPEATABLE READ READ ONLY/);
  assert.match(client.calls[3].sql,/WHERE workspace_revision = \$1/);
  assert.deepEqual(client.calls[3].args,[workspaceRevision,scope.sourceRef]);
  assert.match(client.calls.at(-1).sql,/ROLLBACK/);
  assert.equal(client.calls.some(x=>/INSERT|UPDATE|DELETE|COMMIT/i.test(x.sql)),false);
});
test('failure always rolls back',async()=>{
  const client=mock([],true);
  await assert.rejects(fetchSourceBindingRowsReadOnlyV1(client,scope),/READ_FAILURE/);
  assert.equal(client.calls.at(-1).sql,'ROLLBACK');
});
test('two rows remain visible for ambiguity rejection',async()=>{
  const client=mock([{},{}]);
  assert.equal((await fetchSourceBindingRowsReadOnlyV1(client,scope)).length,2);
});
test('rejects invalid scopes before transaction',async()=>{
  for(const sourceRef of ['../secret','/etc/passwd','$lib/a.ts','C:\\x','', 'a\0b']) {
    assert.throws(()=>assertSourceBindingScopeV1({...scope,sourceRef}));
  }
  const client=mock();
  await assert.rejects(fetchSourceBindingRowsReadOnlyV1(client,{...scope,workspaceRevision:'none'}));
  assert.equal(client.calls.length,0);
});
test('bounded connection ownership releases on each scope',async()=>{
  const clients=[];
  const out=await fetchSourceBindingRowsForScopesV1(async()=>{const c=mock();clients.push(c);return c;},[scope,scope]);
  assert.deepEqual(out,[[],[]]);
  assert.equal(clients.length,2);
  for(const c of clients) assert.equal(c.calls.at(-1).sql,'RELEASE');
  await assert.rejects(fetchSourceBindingRowsForScopesV1(async()=>mock(),Array(21).fill(scope)),/BOUNDED/);
});
test('SQL selects producer_revision (needed for the operator producer allowlist), is parameterized, bounded and read-only', () => {
  assert.match(SOURCE_BINDING_READONLY_SQL_V1, /producer_revision/);
  assert.match(SOURCE_BINDING_READONLY_SQL_V1, /LIMIT 2/);
  assert.doesNotMatch(SOURCE_BINDING_READONLY_SQL_V1, /INSERT|UPDATE|DELETE|\$\{/i);
});
test('composes with the pure resolver: scoped snapshot -> resolved binding; allowlist needs the producer column; ambiguity fails closed', async () => {
  const hex = 'b'.repeat(64);
  const row = { repo_id: 'deeds-web-app', workspace_revision: workspaceRevision, canonical_source_ref: scope.sourceRef, source_revision: `sha256:${hex}`,
    content_digest: hex, binding_checksum: 'c'.repeat(64), byte_length: '42', producer_revision: 'graphify-current-source-batch-v1:abc' };
  const rows = await fetchSourceBindingRowsReadOnlyV1(mock([row]), scope);
  const fetchScoped = () => rows;
  const trusted = createSourceBindingResolverV1(fetchScoped, { trustedProducerPrefixes: ['graphify-current-source-batch-v1:'] });
  assert.equal(trusted(scope).sourceRevision, `sha256:${hex}`);
  const other = createSourceBindingResolverV1(fetchScoped, { trustedProducerPrefixes: ['graphify-execution-membership-v2:'] });
  assert.equal(other(scope), null);
  const twoRows = await fetchSourceBindingRowsReadOnlyV1(mock([row, { ...row, repo_id: 'other' }]), scope);
  assert.equal(createSourceBindingResolverV1(() => twoRows)(scope), null);
});
