#!/usr/bin/env node
// pretooluse-deny.mjs — Claude Code PreToolUse hook.
//
// Reads the tool-use payload from stdin, applies the destructive-action
// deny-list from docs/architecture/claude-code-agent-os.md, and either
// allows the call or returns a JSON refusal that Claude Code respects.
//
// Per Anthropic docs: only PreToolUse can modify or block. Subagent
// `tools:` declarations are hints, not sandboxes — this hook is the
// actual security boundary.
//
// Wired via .claude/settings.json hooks.PreToolUse[].
//
// Output protocol (stdout JSON):
//   { "permissionDecision": "allow"|"deny"|"ask", "reason": "..." }
//
// Exit code 0 always; the JSON tells Claude Code what to do.

import { readFileSync } from 'node:fs';

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  // No stdin → permissive (don't break tool use just because the hook fired with no payload).
  process.stdout.write(JSON.stringify({ permissionDecision: 'allow' }));
  process.exit(0);
}

const tool = input.tool_name ?? input.tool ?? '';
const ti   = input.tool_input ?? input.input ?? {};

// ── Deny patterns ──────────────────────────────────────────────────
//
// Each entry: { tool match, body match (regex), reason }.
// Match against tool first; if names match, test the body regex.
// First match wins.

const RULES = [
  // ── Bash deny-list ──
  { tool: 'Bash', re: /\bnpm\s+run\s+db:push\b/i,
    reason: 'npm run db:push uses drizzle-kit push which can DROP tables. Use drizzle-kit migrate after writing a migration. See drizzle-schema-review skill.' },
  { tool: 'Bash', re: /\bdrizzle-kit\s+push\b/i,
    reason: 'drizzle-kit push can silently drop tables not in schema (kg_nodes incident). Use drizzle-kit migrate. See CLAUDE.md "Database Migration Safety".' },
  { tool: 'Bash', re: /\bpsql[^|]*-c\s+["'`].*\b(DROP\s+(TABLE|COLUMN|SCHEMA|DATABASE)|TRUNCATE|DELETE\s+FROM)\b/i,
    reason: 'Destructive psql -c command. Land destructive changes via a reviewed migration in drizzle/, not ad-hoc.' },
  // Match `rm -rf` / `rm -fr` / `rm -r -f` against critical roots.
  // `\/(?:$|\s|\*)` matches bare `/` (root), `/ ...`, or `/*` — but NOT `/tmp/x`.
  // `~(?:$|\s|\/)` matches bare `~`, `~ ...`, or `~/...`.
  // `\*(?:$|\s)` matches bare `*` (cwd glob).
  // `(deeds_labs|next_steps|memory|drizzle|src)\b` matches critical project dirs.
  { tool: 'Bash', re: /\brm\s+(-(?:rf?|fr?|r\s+-f|f\s+-r))\s+(\/(?:$|\s|\*)|\$HOME|~(?:$|\s|\/)|\*(?:$|\s)|deeds_labs|next_steps|memory|drizzle|src)/,
    reason: 'rm -rf against critical paths is hard-blocked. Targets: /, $HOME, ~, *, deeds_labs/, next_steps/, memory/, drizzle/, src/. (Move to deeds_labs/ (gitignored) is permanent deletion — it is NOT archival. See CLAUDE.md "deeds_labs/ is gitignored".)' },
  { tool: 'Bash', re: /\btaskkill\b.*\/F\b/i,
    reason: 'taskkill /F kills processes without cleanup. Confirm what is running first (Get-Process / `npm run dev:monitor:probe`); use SIGTERM equivalent before /F.' },
  { tool: 'Bash', re: /\bgit\s+push\s+(--force|-f)\b/,
    reason: 'git push --force can overwrite remote work. Confirm explicitly with the operator before force-pushing; never force-push to main/master.' },
  { tool: 'Bash', re: /\bgit\s+reset\s+--hard\b/,
    reason: 'git reset --hard discards uncommitted work. Stash or commit first; only proceed when the operator has approved discarding state.' },
  { tool: 'Bash', re: /\bgit\s+commit\b.*--no-verify\b/,
    reason: 'Skipping pre-commit hooks (--no-verify) is forbidden unless the operator explicitly asked. Investigate hook failures instead.' },
  { tool: 'Bash', re: /\bdocker\s+(rm|rmi|volume\s+rm|system\s+prune)\b.*-(f|-force|-volumes)/,
    reason: 'Forced docker removal can destroy named volumes (legal-ai-redis data, postgres data). Confirm volumes are stopped + backed up first.' },
  { tool: 'Bash', re: /\bredis-cli[^|]*\b(FLUSHDB|FLUSHALL|CONFIG\s+SET\s+save)\b/i,
    reason: 'Redis FLUSHDB/FLUSHALL wipes the cache including gpu:karpathy:* and ace:* keys. Run a targeted DEL pattern instead.' },

  // ── Edit/Write deny-list ──
  // Byte-frozen reconstruction files (G01/G02/G05 hashes) — require explicit operator intent.
  { tool: ['Edit', 'Write'], re: null,
    pathRe: /(memory[\\/]reconstruction[\\/]demo-scene\.py|memory[\\/]reconstruction[\\/]aesthetic-presets\.json|src[\\/]lib[\\/]server[\\/]reconstruction[\\/]scene-compiler\.ts)/i,
    reason: 'Reconstruction compiler / preset / generated python is byte-hash-frozen by validator gates G01/G02/G05. Editing breaks legal admissibility of demo scenes. If the change is intentional, the operator must regenerate the hashes in the same commit and acknowledge the breaking change.' },
  // MCP registry files — require plan mode acknowledgement.
  { tool: ['Edit', 'Write'], re: null,
    pathRe: /(src[\\/]mcp[\\/]trace-mcp-server\.ts|src[\\/]lib[\\/]server[\\/]db[\\/]schema-postgres\.ts)/i,
    reason: 'High-blast-radius file (TRACE MCP registry or canonical Drizzle schema). Confirm with the operator that this edit was planned; small changes here ripple through gates G33/G34/G29.' },
];

function matchesTool(rule, tool) {
  if (Array.isArray(rule.tool)) return rule.tool.includes(tool);
  return rule.tool === tool;
}

for (const rule of RULES) {
  if (!matchesTool(rule, tool)) continue;
  // Body match (Bash) vs path match (Edit/Write).
  if (rule.re) {
    const cmd = ti.command ?? '';
    if (rule.re.test(cmd)) {
      process.stdout.write(JSON.stringify({
        permissionDecision: 'deny',
        reason: `[pretooluse-deny] ${rule.reason}`,
      }));
      process.exit(0);
    }
  } else if (rule.pathRe) {
    const fp = ti.file_path ?? ti.path ?? '';
    if (rule.pathRe.test(fp)) {
      process.stdout.write(JSON.stringify({
        permissionDecision: 'ask',
        reason: `[pretooluse-deny] ${rule.reason}`,
      }));
      process.exit(0);
    }
  }
}

// Default: allow.
process.stdout.write(JSON.stringify({ permissionDecision: 'allow' }));
process.exit(0);
