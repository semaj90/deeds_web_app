# Skill: error-inference-research

Goal:
Diagnose validation/runtime errors and produce a safe repair plan by orchestrating a multi-step research workflow.

Order:
1. Read the exact error output provided by the user.
2. Classify error:
   - schema_contract
   - duplicate_id
   - missing_sourceRefs
   - missing_module
   - tool_schema_error
   - qdrant_empty
   - api_json_error
3. Search local repo first with rg.
4. Search ACE packet and ranking reports.
5. Search docs/atlas and MASTER TODO.
6. If local evidence is insufficient, use web_search / SearXNG.
7. Use web_fetch only for specific docs URLs.
8. Produce:
   - likely_cause
   - evidence
   - patch_targets
   - safe_next_command
   - do_not_do list

## Path Resolution Rule
Before editing any file, always resolve the real path.
### Known path rules
Skills live in:
```txt
.opencode/skills/
Ingest scripts live in:
scripts/ingest/
OpenCode utility scripts live in:
scripts/opencode/
### Fallback lookup
If a file is not found, run:
Get-ChildItem -Recurse -Force . -Filter "" |
  Select-Object FullName
For ACE validation files, prefer:
scripts/ingest/rank-cards.mjs
scripts/ingest/compress-cards.mjs
scripts/ingest/retrieval-pass.mjs
scripts/ingest/validate-ace-packet.mjs
For skills, prefer:
.opencode/skills/.md
### Do not do
- Do not create `scripts/opencode/skills/`.
- Do not patch `scripts/opencode/*` when the real target is `scripts/ingest/*`.
- Do not assume a file path after one failed edit.
- Do not use brittle `oldString` edits without reading the file first.

When local repo evidence is insufficient:

1. Check SearXNG:
```bash
curl "http://localhost:8080/search?q=opencode%20webfetch&format=json"
```
Check Local Deep Research config:
```bash
cd C:\Users\james\Downloads\Hermes-Ollama\local-deep-research-docker-desktop
echo %SEARXNG_INSTANCE%
```
Required env:
SEARXNG_INSTANCE=http://localhost:8080
SEARXNG_DELAY=2.0
Use SearXNG only for external docs/research, never as canonical repo truth.
Research output must become:
likely_cause
evidence
patch_targets
safe_next_command
do_not_do

The Local Deep Research docs say SearXNG is disabled until `SEARXNG_INSTANCE` is set, and recommend `SEARXNG_INSTANCE=http://localhost:8080` with optional `SEARXNG_DELAY=2.0`. They also show a Docker SearXNG instance mapped to `localhost:8080`. :contentReference[oaicite:0]{index=0}

## Runtime Config & SearXNG Gate
- use_ollama: true
- with_planning: true
- SEARXNG_INSTANCE: http://localhost:8080
- SEARXNG_DELAY: 2.0
- SearXNG is disabled unless SEARXNG_INSTANCE is configured and the smoke test passes.
- Before using SearXNG, run:
  `node scripts/opencode/smoke-searxng.mjs`

## Smoke Test Verification
- Behavior:
  1. read SEARXNG_INSTANCE or default http://localhost:8080
  2. GET /search?q=opencode%20webfetch&format=json
  3. fail if response is HTML
  4. fail if JSON parse fails
  5. pass if JSON has results array
- Command:
  `node scripts/opencode/smoke-searxng.mjs`

## Caveman Pipeline
validation error
→ error-inference subagent
→ local rg search
→ ACE/report inspection
→ SearXNG/web_search if needed
→ patch recommendation
→ safe command

Do not let the agent jump to milestone/finalize when validation fails. It should infer and repair.



## Repeated Patch Failure Rule
If an edit fails twice with:
- oldString not found
- multiple matches
- duplicate function declaration
- syntax check failure after patch

Then stop patching by oldString.

Required recovery:
1. Read the file with line numbers.
2. Identify the smallest broken section.
3. Rewrite the whole broken section by line range or generate a clean replacement file.
4. Run syntax check before execution.
5. Never assume a failed edit succeeded.

For JS/MJS:
- Always run `node --check <file>` before running the script.
- If duplicate function declarations exist, keep only the first valid declaration.
- If more than 3 duplicate helper blocks exist, restore from git or rewrite the whole helper region.
Add an OpenCode project manager skill

Create:

.opencode/skills/project-manager.md
# Skill: project-manager

Goal:
Coordinate repo tasks, retries, cache policy, and nightly summaries.

Rules:
- Local rg/search first.
- ACE packet second.
- SearXNG only after smoke passes.
- Never finalize failed validation.
- Never assume a failed edit succeeded.
- For repeated patch failure, switch to line-range rewrite or restore.

Hot file policy:
- Track files touched or searched repeatedly.
- Cache hot file summaries in Valkey/Redis.
- TTL:
  - validation errors: 1 day
  - active repair context: 1 day
  - hot docs/skills: 7 days
  - stable weekly summary: 30 days or cold storage

Daily/weekly summary:
- Once per night: summarize changed files, validation errors, and completed tasks.
- Once per week: compact into cold storage / archive summary.
- Do not store raw giant files in Redis.
- Store pointers/sourceRefs + compact summaries.
Add tool-calling rule
## Tool Calling Rule

Every shell/tool command must include:
- description
- command

Before editing:
1. `Test-Path <target>`
2. if missing, `Get-ChildItem -Recurse -Filter <filename>`
3. read target file
4. patch only after exact anchors are known
5. syntax/test before next step
For compress-cards.mjs, stop oldString edits

Tell OpenCode:

Do not use oldString edit anymore.

Use a script-based cleanup:

1. Read scripts/ingest/compress-cards.mjs.
2. Remove duplicate function blocks for:
   - fmt
   - extractSummary
   - compressCard
3. Keep first occurrence only.
4. Write file.
5. Run node --check.

Use a temporary repair script:

// scripts/opencode/repair-compress-cards-helpers.mjs
import fs from 'node:fs';

const file = 'scripts/ingest/compress-cards.mjs';
const src = fs.readFileSync(file, 'utf8');

const names = ['fmt', 'extractSummary', 'compressCard'];

function removeDuplicateFunctions(source, name) {
  const re = new RegExp(`function\\s+${name}\\s*\\(`, 'g');
  const matches = [...source.matchAll(re)];
  if (matches.length <= 1) return source;

  let out = source;
  for (let i = matches.length - 1; i >= 1; i--) {
    const start = matches[i].index;
    let depth = 0;
    let end = start;
    let seenBrace = false;

    for (; end < out.length; end++) {
      const ch = out[end];
      if (ch === '{') {
        depth++;
        seenBrace = true;
      } else if (ch === '}') {
        depth--;
        if (seenBrace && depth === 0) {
          end++;
          break;
        }
      }
    }

    out = out.slice(0, start) + '\n' + out.slice(end);
  }

  return out;
}

let next = src;
for (const name of names) {
  next = removeDuplicateFunctions(next, name);
}

fs.writeFileSync(file, next);
console.log('repaired duplicate helpers in', file);

Then run:

node scripts/opencode/repair-compress-cards-helpers.mjs
node --check scripts/ingest/compress-cards.mjs
node scripts/ingest/compress-cards.mjs --target-tokens 1000 --grouping cluster
node scripts/ingest/validate-ace-packet.mjs
 (New Section)

Purpose:
Use Local Deep Research + SearXNG only when local repo evidence is insufficient.

Runtime Config
use_ollama: true
with_planning: true
SEARXNG_INSTANCE=http://localhost:8080
SEARXNG_DELAY=2.0
Search Order
1. rg local repo search
2. ACE packet / retrieval-ranking-report inspection
3. docs/atlas / MASTER TODO inspection
4. Local Deep Research + SearXNG fallback
5. web_fetch only for exact URLs
SearXNG Smoke Test
`node scripts/opencode/smoke-searxng.mjs`

Expected:

JSON response
results array present
not HTML
Docker Networking Notes

For Docker Desktop on Windows:

do not rely on Linux --network host
explicitly map ports in docker-compose
localhost inside the container is not the Windows host
Research Output Contract

Every inference cycle must produce:

likely_cause
evidence
patch_targets
safe_next_command
do_not_do
Validation Failure Rule

Validation failures must NEVER trigger finalize/milestone automatically.

Instead:
validation error
→ classify
→ local rg search
→ ACE/report inspection
→ SearXNG fallback if needed
→ patch recommendation
→ rerun validator

## Before editing any file: explicit checklist
1. Test the requested path exists exactly as provided.
2. If missing, search known fallback paths (see "Fallback lookup" above).
3. Only patch the existing resolved path — do not create new files in new locations.
4. If multiple matches exist, prefer `scripts/ingest/` targets for ACE validation scripts, and `.opencode/skills/` for skill docs.
5. Never create or assume `scripts/opencode/skills/` — do not invent that directory.

## Current `compress-cards.mjs` task
For the active `compress-cards.mjs` issue, follow these steps before patching:

1. Run the path test to ensure the file exists exactly at `scripts/ingest/compress-cards.mjs`.

2. Inspect the top of the file to collect anchors and context:

```powershell
Get-Content scripts/ingest/compress-cards.mjs -TotalCount 260
```

3. Find exact code anchors (unique surrounding lines) before making edits.

4. Patch using the actual surrounding text (do not apply brittle string-replace patches without reading the file first).

Do NOT patch `scripts/opencode/*` when the real target is `scripts/ingest/*`. Always confirm the resolved path and prefer the ingest script when fixing ACE validation/packet processing.

