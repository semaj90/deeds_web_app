#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const file = path.join(process.cwd(), 'opencode.json');
const block = `
ACE Resilient Tool Fallback Ladder + Semantic Variance Recovery:
If a tool call fails with SchemaError(Missing key ["description"]), retry once with:
- description: clear purpose of the command
- command: exact command
When searching for files by name:
- never use content Grep first
- use file discovery:
  rg --files -uu | rg "<filename-pattern>"
- if that fails, use:
  Get-ChildItem -Recurse -Force -File -Include <names> | Select-Object -ExpandProperty FullName
Retrieval order:
1. exact file discovery
2. rg confirmed paths
3. Qdrant tag search
4. Redis semantic cache
5. LangExtract entities
6. did-you-mean cosine match
7. ACE packet
8. Gemma4 stream

If exact match fails, add varianceRecovery to the ACE packet:
{
  "varianceRecovery": {
    "exactMatchFailed": true,
    "didYouMean": [],
    "qdrantTags": [],
    "langextractEntities": [],
    "semanticCacheHits": [],
    "nextSteps": []
  }
}
Do not manually inject fake metrics.
Do not read whole files.
Do not pretend MCP ran if it did not.
`;

const json = JSON.parse(fs.readFileSync(file, 'utf8'));

json.agent ??= {};

for (const name of ['atlas-context', 'hermes-ace']) {
  json.agent[name] ??= {
    description: `${name} agent`,
    model: json.model ?? 'turboquant/gemma4-tq',
    temperature: 0,
    steps: 8,
    prompt: ''
  };

  const current = String(json.agent[name].prompt ?? '');
  if (!current.includes('ACE Resilient Tool Fallback Ladder')) {
    json.agent[name].prompt = `${current.trim()}\n\n${block.trim()}`.trim();
  }
}

fs.writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
console.log(`Patched agent prompts in ${file}`);
