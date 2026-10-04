import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCodebaseFileLookupKeys, collapseDependencyRows, findDependencies } from './atlas-tools-mcp.mjs';

const ROOT = 'C:/Users/james/Videos/deeds-web-app';

test('every input form of one file resolves to the same canonical key', () => {
  const forms = [
    'src/hooks.server.ts',
    'sveltekit-frontend/src/hooks.server.ts',
    'sveltekit-frontend\\src\\hooks.server.ts',
    'C:/Users/james/Videos/deeds-web-app/sveltekit-frontend/src/hooks.server.ts',
    'C:\\Users\\james\\Videos\\deeds-web-app\\sveltekit-frontend\\src\\hooks.server.ts',
    'file:///C:/Users/james/Videos/deeds-web-app/sveltekit-frontend/src/hooks.server.ts',
    './src/hooks.server.ts',
  ];
  for (const form of forms) {
    const keys = buildCodebaseFileLookupKeys(form, ROOT);
    assert.equal(keys.canonical, 'src/hooks.server.ts', form);
    assert.ok(keys.pathKeys.includes('src/hooks.server.ts'), form);
    assert.ok(keys.filePathKeys.includes('sveltekit-frontend/src/hooks.server.ts'), form);
    assert.ok(keys.filePathKeys.includes(`${ROOT}/sveltekit-frontend/src/hooks.server.ts`), form);
  }
});

test('the file own case is kept in the indexed path key while canonical is lowercase', () => {
  const keys = buildCodebaseFileLookupKeys('src/lib/Example.ts', ROOT);
  assert.equal(keys.canonical, 'src/lib/example.ts');
  assert.deepEqual(keys.pathKeys, ['src/lib/Example.ts', 'src/lib/example.ts']);
  assert.ok(keys.lowerFilePathKeys.every((k) => k === k.toLowerCase()));
});

test('empty or non-path input yields no keys, and a symbol name is never rewritten into a path', () => {
  assert.equal(buildCodebaseFileLookupKeys('', ROOT), null);
  assert.equal(buildCodebaseFileLookupKeys('   ', ROOT), null);
  assert.equal(buildCodebaseFileLookupKeys(undefined, ROOT), null);
  assert.equal(buildCodebaseFileLookupKeys('planGraphifyEdgeReplayV1', ROOT).canonical, 'plangraphifyedgereplayv1');
});

test('a path segment that merely contains the folder name is not stripped', () => {
  const keys = buildCodebaseFileLookupKeys('src/lib/sveltekit-frontend/notes.ts', ROOT);
  assert.equal(keys.canonical, 'src/lib/sveltekit-frontend/notes.ts');
});

test('rows from both node families collapse to one deduplicated edge list and keep the duplicate flag honest', () => {
  const rows = [
    { nodePath: 'src/a.ts', flagged: null, type: 'IMPORTS', depPath: 'src/b.ts', depKind: 'CodebaseFile' },
    { nodeFilePath: `${ROOT}/sveltekit-frontend/src/a.ts`, flagged: 'ABSOLUTE_DUPLICATE', type: 'CALLS', depKind: 'Function', depName: 'helper' },
    { nodeFilePath: `${ROOT}/sveltekit-frontend/src/a.ts`, flagged: 'ABSOLUTE_DUPLICATE', type: 'CALLS', depKind: 'Function', depName: 'helper' },
    { nodePath: 'src/a.ts', flagged: null, type: null }, // OPTIONAL MATCH with no outgoing edge
    { nodePath: 'src/a.ts', flagged: null, type: 'IMPORTS', depFilePath: `${ROOT}/sveltekit-frontend/src/b.ts`, depKind: 'CodebaseFile' },
  ];
  const out = collapseDependencyRows(rows);
  assert.equal(out.length, 2); // IMPORTS src/b.ts (relative and absolute dep forms collapse), CALLS helper (duplicate row collapses)
  const imports = out.find((d) => d.type === 'IMPORTS');
  assert.equal(imports.depCanonical, 'src/b.ts');
  assert.equal(imports.viaFlaggedDuplicate, false);
  const calls = out.find((d) => d.type === 'CALLS');
  assert.equal(calls.depName, 'helper');
  assert.equal(calls.viaFlaggedDuplicate, true); // only ever reached through a duplicate-tagged node
});

function fakeDriver(scripted) {
  const queries = [];
  return {
    queries,
    session() {
      return {
        async run(cypher, params) {
          queries.push({ cypher, params });
          const rows = scripted.shift() ?? [];
          return { records: rows.map((row) => ({ toObject: () => row })) };
        },
        async close() {},
      };
    },
  };
}

test('findDependencies reaches both families in one query and never claims canonical authority', async () => {
  const driver = fakeDriver([[
    { nodePath: 'src/a.ts', flagged: null, type: 'IMPORTS', depPath: 'src/b.ts', depKind: 'CodebaseFile' },
    { nodeFilePath: `${ROOT}/sveltekit-frontend/src/a.ts`, flagged: 'ABSOLUTE_DUPLICATE', type: 'CALLS', depKind: 'Function', depName: 'helper' },
  ]]);
  const result = await findDependencies({ target: 'sveltekit-frontend/src/a.ts' }, { driver });
  assert.equal(driver.queries.length, 1, 'phase A hit, so no fallback scan');
  assert.deepEqual(driver.queries[0].params.pathKeys, ['src/a.ts']);
  assert.equal(result.lookup.phase, 'A');
  assert.equal(result.lookup.failure, null);
  assert.deepEqual(result.lookup.nodesMatched.map((n) => n.family).sort(), ['filePath', 'path']);
  assert.equal(result.dependencies.length, 2);
  assert.equal(result.canonicalAuthority, false);
  assert.equal(result.writesPerformed, false);
  assert.equal(result.provenance.graphRevision, null);
  assert.equal(result.provenance.status, 'UNRESOLVED'); // a projection hit is not admitted evidence
});

test('a miss falls back to the case-insensitive scan, and a second miss is reported as PROJECTION_MISSING_FILE', async () => {
  const driver = fakeDriver([[], []]);
  const result = await findDependencies({ target: 'src/brand-new-file.ts' }, { driver });
  assert.equal(driver.queries.length, 2);
  assert.match(driver.queries[1].cypher, /toLower/);
  assert.equal(result.lookup.phase, 'B');
  assert.equal(result.lookup.failure, 'PROJECTION_MISSING_FILE');
  assert.deepEqual(result.dependencies, []);
});

test('a node with no outgoing edge is distinguished from a missing node', async () => {
  const driver = fakeDriver([[{ nodePath: 'src/leaf.ts', flagged: null, type: null }]]);
  const result = await findDependencies({ target: 'src/leaf.ts' }, { driver });
  assert.equal(result.lookup.failure, 'NO_OUTGOING_EDGES');
  assert.equal(result.lookup.nodesMatched.length, 1);
});

test('the row cap truncates and says so', async () => {
  const many = Array.from({ length: 600 }, (_, i) => ({ nodePath: 'src/hub.ts', flagged: null, type: 'IMPORTS', depPath: `src/dep-${i}.ts`, depKind: 'CodebaseFile' }));
  const driver = fakeDriver([many]);
  const result = await findDependencies({ target: 'src/hub.ts' }, { driver });
  assert.equal(result.lookup.truncated, true);
  assert.equal(result.dependencies.length, 500);
  assert.equal(result.lookup.rowCap, 500);
});

test('an empty target is rejected before any query is sent', async () => {
  const driver = fakeDriver([]);
  const result = await findDependencies({ target: '  ' }, { driver });
  assert.equal(driver.queries.length, 0);
  assert.equal(result.lookup.failure, 'EMPTY_TARGET');
});

test('an exact-key hit in only one family triggers the case-insensitive scan, whose superset replaces the partial result', async () => {
  const partial = [{ nodePath: 'src/lib/Example.ts', flagged: null, type: 'IMPORTS', depPath: 'src/b.ts', depKind: 'CodebaseFile' }];
  const superset = [
    ...partial,
    { nodeFilePath: `${ROOT}/sveltekit-frontend/src/lib/Example.ts`, flagged: 'ABSOLUTE_DUPLICATE', type: 'CALLS', depKind: 'Function', depName: 'helper' },
  ];
  const driver = fakeDriver([partial, superset]);
  const result = await findDependencies({ target: 'SRC/LIB/EXAMPLE.TS' }, { driver });
  assert.equal(driver.queries.length, 2);
  assert.equal(result.lookup.phase, 'B');
  assert.deepEqual(result.lookup.nodesMatched.map((n) => n.family).sort(), ['filePath', 'path']);
  assert.deepEqual(result.dependencies.map((d) => d.type).sort(), ['CALLS', 'IMPORTS']);
});

test('a file found in both families on the first query does not pay for the second scan', async () => {
  const both = [
    { nodePath: 'src/a.ts', flagged: null, type: 'IMPORTS', depPath: 'src/b.ts', depKind: 'CodebaseFile' },
    { nodeFilePath: 'sveltekit-frontend/src/a.ts', flagged: null, type: 'CALLS', depKind: 'Function', depName: 'f' },
  ];
  const driver = fakeDriver([both]);
  const result = await findDependencies({ target: 'src/a.ts' }, { driver });
  assert.equal(driver.queries.length, 1);
  assert.equal(result.lookup.phase, 'A');
});

test('a symbol name is reported as TARGET_NOT_A_PATH, not as a missing file', async () => {
  const driver = fakeDriver([[], []]);
  const result = await findDependencies({ target: 'planGraphifyEdgeReplayV1' }, { driver });
  assert.equal(result.lookup.failure, 'TARGET_NOT_A_PATH');
  const missing = await findDependencies({ target: 'src/not-there.ts' }, { driver: fakeDriver([[], []]) });
  assert.equal(missing.lookup.failure, 'PROJECTION_MISSING_FILE');
});
