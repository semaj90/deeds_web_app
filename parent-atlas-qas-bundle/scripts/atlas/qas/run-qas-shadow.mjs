#!/usr/bin/env node

// Deliberately read-only skeleton.
// Bind this to the repo's existing retrieval/SOM/receipt owners after the owner audit.
// Do not import a second graph/retrieval implementation here.

const args = new Set(process.argv.slice(2));
const json = args.has('--json');

const result = {
  schema: 'parent-atlas.qas.daily-shadow.v1',
  status: 'NOT_WIRED',
  requiredNextBindings: [
    'live Graphify revision',
    'existing SOM/domain route owner',
    'existing retrieval candidate owner',
    'exact canonical lookup owner',
    'ContextManifest/receipt owner',
    'recommendation/Kanban materializer'
  ],
  invariants: [
    'approximate selection cannot create canonical evidence',
    'QAS failure does not mutate Graphify truth',
    'adapter selection remains shadow/off by default'
  ]
};

if (json) console.log(JSON.stringify(result, null, 2));
else {
  console.log('QAS shadow runner is installed but intentionally NOT_WIRED.');
  for (const binding of result.requiredNextBindings) console.log(`- bind: ${binding}`);
}
