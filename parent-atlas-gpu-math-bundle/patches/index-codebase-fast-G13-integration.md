# `index-codebase-fast.mjs` G13 integration note

Confirmed bad shape:

```js
for (const f of files) {
  const srcKey = f.imports.join(' ') + ' ' + f.dynImports.join(' ');
  for (const name of Object.keys(exportImportCounts)) {
    if (srcKey.includes(name)) exportImportCounts[name]++;
  }
}
```

Do not merely hide the loop behind a helper. Remove this N x K substring scan.

## Required parser-side addition

During import extraction, capture binding identifiers separately from module paths:

```js
file.importedNames = [
  // import { foo, bar as baz } from './m'
  'foo',
  'bar',
  // import defaultThing from './d'
  'defaultThing',
];
```

Keep `imports`/`dynImports` for graph edges. `importedNames` is a different semantic field.

Then:

```js
import { buildImportedNameSet } from './graphify/g13-dead-export-index.mjs';

const importedNames = buildImportedNameSet(files);
for (const name of Object.keys(exportImportCounts)) {
  exportImportCounts[name] = importedNames.has(name) ? 1 : 0;
}
```

If counts greater than one are required, build `Map<string, number>` in one pass over
`file.importedNames`; never loop every file against every exported name.

Also wrap post-scan stages with `StageProfiler` using names:

- `SCAN_FILES`
- `G13_DEAD_EXPORT_INDEX`
- `G19_FAN_IN`
- `G16_TEST_PAIRING`
- `G20_CYCLE_ANALYSIS`
- `SERIALIZE_GRAPH`
- `ATOMIC_PUBLISH`
