// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  parseImportStatementV1, resolveImportSpecifierV1, resolveReferenceTargetV1, rootIdentifierOfV1, type ImportBindingV1,
} from './graphify-import-target-resolver-v1.js';

const known = new Set([
  'src/lib/server/atlas/lineage/packet-incidence-lineage-v1.ts',
  'src/lib/server/atlas/graph/graph-snapshot-source-revision-binding-v1.ts',
  'src/lib/server/db/client.ts',
  'src/lib/utils/index.ts',
  'src/lib/dup.ts',
  'src/lib/dup.tsx',
]);
const FROM = 'src/lib/server/atlas/lineage/graph-revision-snapshot-v1.ts';

describe('parseImportStatementV1', () => {
  it('parses named, aliased, type-only, default and namespace forms', () => {
    expect(parseImportStatementV1("import type { A, B as C } from './x.js';")).toEqual({
      specifier: './x.js',
      bindings: [
        { localName: 'A', importedName: 'A', specifier: './x.js', typeOnly: true },
        { localName: 'C', importedName: 'B', specifier: './x.js', typeOnly: true },
      ],
    });
    const mixed = parseImportStatementV1("import D, { type E, F } from '$lib/z';");
    expect(mixed?.bindings.map((b) => [b.localName, b.importedName, b.typeOnly])).toEqual([['E', 'E', true], ['F', 'F', false], ['D', 'default', false]]);
    expect(parseImportStatementV1("import * as N from 'node:crypto'")?.bindings).toEqual([{ localName: 'N', importedName: '*', specifier: 'node:crypto', typeOnly: false }]);
  });

  it('rejects side-effect imports and non-import text instead of guessing', () => {
    expect(parseImportStatementV1("import './side-effect.js';")).toBeNull();
    expect(parseImportStatementV1('{ PacketIncidenceExpectedV1 }')).toBeNull();
    expect(parseImportStatementV1('const x = 1;')).toBeNull();
  });
});

describe('resolveImportSpecifierV1', () => {
  it('maps a relative .js specifier to the known .ts file', () => {
    expect(resolveImportSpecifierV1(FROM, './packet-incidence-lineage-v1.js', known)).toMatchObject({
      status: 'RESOLVED', sourceRef: 'src/lib/server/atlas/lineage/packet-incidence-lineage-v1.ts',
    });
    expect(resolveImportSpecifierV1(FROM, '../graph/graph-snapshot-source-revision-binding-v1.js', known).status).toBe('RESOLVED');
  });

  it('resolves the $lib alias, directory indexes and extensionless specifiers', () => {
    expect(resolveImportSpecifierV1(FROM, '$lib/server/db/client', known).sourceRef).toBe('src/lib/server/db/client.ts');
    expect(resolveImportSpecifierV1(FROM, '$lib/utils', known).sourceRef).toBe('src/lib/utils/index.ts');
  });

  it('names every non-resolution and never guesses', () => {
    expect(resolveImportSpecifierV1(FROM, 'zod', known).status).toBe('EXTERNAL_PACKAGE');
    expect(resolveImportSpecifierV1(FROM, 'node:crypto', known).status).toBe('EXTERNAL_PACKAGE');
    expect(resolveImportSpecifierV1(FROM, './missing.js', known).status).toBe('NOT_FOUND');
    expect(resolveImportSpecifierV1(FROM, '../../../../../../escape.js', known).status).toBe('NOT_FOUND');
    expect(resolveImportSpecifierV1(FROM, '$lib/dup', known)).toMatchObject({ status: 'AMBIGUOUS', sourceRef: null });
  });
});

describe('resolveReferenceTargetV1', () => {
  const binding: ImportBindingV1 = { localName: 'buildX', importedName: 'buildPacketIncidenceLineageV1', specifier: './packet-incidence-lineage-v1.js', typeOnly: false };
  const base = {
    fromSourceRef: FROM,
    knownSourceRefs: known,
    bindingsByLocalName: new Map([['buildX', binding], ['NS', { localName: 'NS', importedName: '*', specifier: 'zod', typeOnly: false }]]),
    exportsBySourceRef: new Map([[
      'src/lib/server/atlas/lineage/packet-incidence-lineage-v1.ts',
      new Map([['buildPacketIncidenceLineageV1', ['sym:lineage#build']], ['twice', ['k1', 'k2']]]),
    ]]),
  };

  it('resolves a call through an import binding to the exact exported symbol', () => {
    const r = resolveReferenceTargetV1({ ...base, targetText: 'buildX' });
    expect(r).toMatchObject({ status: 'RESOLVED_SYMBOL', targetSymbolKey: 'sym:lineage#build', targetSourceRef: 'src/lib/server/atlas/lineage/packet-incidence-lineage-v1.ts' });
    expect(resolveReferenceTargetV1({ ...base, targetText: 'new buildX' }).status).toBe('RESOLVED_SYMBOL');
  });

  it('does not resolve builtins, members of locals, namespaces, or unproven exports', () => {
    expect(resolveReferenceTargetV1({ ...base, targetText: 'new Set' }).status).toBe('NOT_AN_IMPORT_BINDING');
    expect(resolveReferenceTargetV1({ ...base, targetText: 'packetKeys.map' }).status).toBe('NOT_AN_IMPORT_BINDING');
    expect(resolveReferenceTargetV1({ ...base, targetText: 'NS.object' }).status).toBe('NAMESPACE_OR_DEFAULT_UNPROVEN');
    const missingExport = { ...base, bindingsByLocalName: new Map([['q', { ...binding, localName: 'q', importedName: 'nope' }]]) };
    expect(resolveReferenceTargetV1({ ...missingExport, targetText: 'q' }).status).toBe('EXPORT_NOT_FOUND');
    const dupExport = { ...base, bindingsByLocalName: new Map([['t', { ...binding, localName: 't', importedName: 'twice' }]]) };
    expect(resolveReferenceTargetV1({ ...dupExport, targetText: 't' }).status).toBe('EXPORT_AMBIGUOUS');
    const external = { ...base, bindingsByLocalName: new Map([['z', { ...binding, localName: 'z', specifier: 'zod' }]]) };
    expect(resolveReferenceTargetV1({ ...external, targetText: 'z' }).status).toBe('SPECIFIER_UNRESOLVED');
  });

  it('extracts the root identifier only from plain call, member and new forms', () => {
    expect(rootIdentifierOfV1('await foo.bar')).toBe('foo');
    expect(rootIdentifierOfV1('  new Map')).toBe('Map');
    expect(rootIdentifierOfV1('(a || b)')).toBeNull();
  });
});
