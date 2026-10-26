#!/usr/bin/env node
import { resolve } from 'node:path';
import { writeCutileLevel2Fixtures } from './ace-radix-01/write-cutile-level2-fixtures.mjs';

const output = resolve('.tmp/atlas/cuda134-simt/fixtures');
const fixtures = writeCutileLevel2Fixtures(output);
console.log(JSON.stringify({
  schema: 'atlas.cuda134-simt-fixtures.v1',
  output,
  fixtureCount: fixtures.length,
  sizes: fixtures.map(({ n }) => n),
  writes: 'ignored_local_fixtures_only',
  canonicalStoresMutated: false,
}, null, 2));
