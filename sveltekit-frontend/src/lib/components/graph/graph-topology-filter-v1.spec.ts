import { describe, expect, it } from 'vitest';
import { filterGraphTopologyFilesV1, matchesGraphTopologyFilterV1 } from './graph-topology-filter-v1.js';

const files = [
  { rel: 'src/routes/+page.ts', imports: ['src/lib/server.ts'], fanIn: 2, isRoute: true, isTest: false, ssrUnsafe: false },
  { rel: 'src/lib/orphan.ts', imports: [], fanIn: 0, isRoute: false, isTest: false, ssrUnsafe: true },
  { rel: 'src/lib/feature.spec.ts', imports: ['vitest'], fanIn: 0, isRoute: false, isTest: true, ssrUnsafe: false },
];

describe('graph topology filters', () => {
  it('filters import and reverse-import topology without treating absent values as edges', () => {
    expect(filterGraphTopologyFilesV1(files, 'HAS_IMPORTS').map((file) => file.rel)).toEqual([
      'src/routes/+page.ts', 'src/lib/feature.spec.ts',
    ]);
    expect(filterGraphTopologyFilesV1(files, 'IMPORTED_BY').map((file) => file.rel)).toEqual(['src/routes/+page.ts']);
    expect(matchesGraphTopologyFilterV1({}, 'IMPORTED_BY')).toBe(false);
  });

  it('filters route, test, SSR-risk, and unfiltered views', () => {
    expect(filterGraphTopologyFilesV1(files, 'ROUTE').map((file) => file.rel)).toEqual(['src/routes/+page.ts']);
    expect(filterGraphTopologyFilesV1(files, 'TEST').map((file) => file.rel)).toEqual(['src/lib/feature.spec.ts']);
    expect(filterGraphTopologyFilesV1(files, 'SSR_UNSAFE').map((file) => file.rel)).toEqual(['src/lib/orphan.ts']);
    expect(filterGraphTopologyFilesV1(files, 'ALL')).toHaveLength(files.length);
  });
});
