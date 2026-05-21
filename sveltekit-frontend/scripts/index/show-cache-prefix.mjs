#!/usr/bin/env node
import fs from 'node:fs';
const p = 'memory/index/feature-summary.json';
const toon = 'memory/index/ace-prefix.toon';
const summary = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {};
console.log(JSON.stringify({
  cacheKey: 'deeds:v1:gemma4-rotorquant:ace-prefix:' + (summary.digest || 'no-index'),
  toonPrefixArtifact: fs.existsSync(toon) ? toon : null,
  stablePrefix: ['system rules', 'tool-use policy', 'repo architecture digest', 'feature-map schema', 'MCP endpoint list'],
  volatileSuffix: ['user query', 'git diff', 'retrieved snippets', 'test output']
}, null, 2));
