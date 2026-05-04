# nes-arch — Path-First Codebase Context (NES-Architecture Memory Bank)

You are an agent with access to a **NES-architecture-style codebase memory bank**:

| Bank | Backed by | Contents | TTL | Latency |
|------|-----------|----------|-----|---------|
| **tiny RAM**     | Redis `agents:dir:*`           | rendered AGENTS.md per directory | 24h | <5ms |
| **bank-switched ROM** | Qdrant `codebase_chunks_768` | 768-dim semantic vectors | persistent | ~30ms |
| **cartridge ROM** | CouchDB `wiki:note:dir:*` (mirrored) | full ClusterNote JSON | persistent | ~50ms |
| **PPU**          | LibTorch CUDA N-API addon       | batch cosine + SOM + PageRank | n/a | <10ms (GPU) |

This skill is the **path-first lookup**: given a file or directory, walk UP the tree to the nearest `AGENTS.md` (per the [agents.md spec](https://agents.md)) and return its rendered context. Cursor / Codex / Aider / Claude Code all read these files — this skill makes the same context queryable from any agentic loop in the project.

## Constructor

`/nes-arch <path-or-action> [filter]`

| Slot 1 | Examples | Behaviour |
|--------|----------|-----------|
| `<file path>` | `src/lib/server/ace/agent.ts` | Walk up to nearest AGENTS.md, return rendered markdown |
| `<dir path>`  | `src/routes/api/cases` | Same, but starting at this dir |
| `inspect`     | `inspect routes/api`   | List Redis keys + lengths matching filter |
| `inspect:kag` | `inspect:kag server`   | Underlying ClusterNote JSON; useful when AGENTS.md looks empty |
| `regen`       | `regen` (or `regen --root-only`) | Run `npm run agents:write` to rebuild on-disk + Redis mirror |
| `health`      | `health` | Show Redis key counts, last regen time, gate snapshot |

If `$ARGUMENTS` is blank, run `health`.

## Path resolution (walk-up rule)

1. Normalise: strip leading `sveltekit-frontend/`, drop trailing filename if it has an extension.
2. Try `agents:dir:<rel>` in Redis.
3. If miss: drop the last path segment, retry. Repeat to repo root.
4. Final fallback: `agents:root` (always present after first `npm run agents:write`).
5. If even root is missing → tell user to run `npm run agents:write`.

This is the **same logic** that the in-process `getAgentsMdQuickHit()` and the Gemma4 `agents_md` tool use. Use this skill to debug from the outside; use the tool from inside agentic loops.

## Output (file/dir mode)

Print:
1. The resolved key (so the user sees which level matched)
2. The rendered markdown verbatim
3. A one-line audit summary extracted from it (auth/Zod/SSR/Svelte4/localhost counts)
4. Suggested next actions: which existing tool to invoke if any gate is failing

Example:
```
Resolved: agents:dir:src/lib/server/ace  (TTL 18h 23m)

# AGENTS.md — `src/lib/server/ace`
> Directory audit: src/lib/server/ace
## Snapshot
- server module directory with 17 files...
- Audit score: 95/100
- 🟠 hardcoded localhost: 1
- Tags: src lib server zod db-schema
...

📊 Audit summary: 95/100 — only signal is 1 hardcoded localhost (G11)
🔧 Suggested next: /deep-audit src/lib/server/ace code dry-fix  →  proposes the fix
```

## Output (inspect mode)

```
📦 agents:dir:* keys: 248
📦 agents:root:       present

  agents:dir:src/lib/server/ace                          1842 chars  TTL=66432s
  agents:dir:src/lib/server/ace-tooling                  1734 chars  TTL=66432s
  agents:dir:src/lib/server/db                           2103 chars  TTL=66432s
  ...
```

Use `inspect:kag` when `inspect` shows healthy keys but the rendered AGENTS.md looks empty — this peeks at the underlying ClusterNote JSON to confirm whether the indexer captured data the renderer expected. Likely culprits: `representativeFiles` empty, `topologicalNeighbors` not populated, etc.

## Output (regen mode)

Run `cd sveltekit-frontend && npm run agents:write`. Stream the output. After completion, also run `npm run nes:inspect:agents` to confirm the Redis mirror is up.

## Output (health mode)

Combine three checks:
1. `npm run smoke:graphify` — 5 pillars (graph JSON, Redis fast cache, KAG notes, Qdrant, ACE fallback)
2. `npm run nes:inspect:agents` — count of `agents:dir:*` + presence of `agents:root`
3. Last `agents:write` timestamp from `agents:root` content (look for the `<!-- generated: ISO -->` line)

If anything is stale (>24h) or missing, suggest the regen command.

## Tools used (call these, don't reimplement)

- **`Bash(redis-cli ...)`** — only as last resort; prefer `npm run nes:inspect:*` which uses ioredis with the right env handling
- **`Bash(npm run agents:write)`** — regen
- **`Bash(npm run smoke:graphify)`** — health
- **`Bash(npm run index:codebase:fast)`** — re-index source if `codebase-graph.json` is stale (< 24h check)

## Examples

```
/nes-arch src/lib/server/ace/agent.ts                  # path → AGENTS.md
/nes-arch src/routes/api/cases                         # dir → AGENTS.md
/nes-arch inspect routes/api                           # list keys
/nes-arch inspect:kag server                           # peek underlying KAG notes
/nes-arch regen                                        # full rebuild
/nes-arch regen --root-only                            # only root file
/nes-arch health                                       # full diagnostic
/nes-arch                                              # default = health
```

## When to invoke this skill

- **Before editing files in an unfamiliar directory** — same rule as the in-process tool, just with human-readable output
- **When a `/deep-audit` run shows mysterious gate failures** — check the per-dir AGENTS.md for cluster context the audit didn't surface
- **When ACE responses feel context-poor** — verify `agents:dir:*` is populated and the right key resolves for the working file
- **After a big `git pull`** — graph + AGENTS.md are likely stale; run `regen`

## Why "nes-arch"?

The project uses NES-style memory naming throughout (e.g. `2KB scratch RAM`, `40KB total budget`, `bank-switching` for SOM clusters). This skill formalises the same pattern at the agent-context layer:

- Tiny hot RAM (Redis `agents:dir:*`) is what your inner loop hits — like the NES's 2KB internal RAM
- Bank-switched ROM (Qdrant) is the deep semantic search you page in on demand
- Cartridge ROM (CouchDB / disk AGENTS.md) is the source of truth that gets bank-loaded into RAM at boot

The mental model is: **don't burn rounds re-deriving context from cold storage when the rendered banner is already in tiny RAM.**
