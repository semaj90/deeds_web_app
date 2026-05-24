# Context Budget Skill

Use this skill whenever analyzing repository files, migrations, schemas, docs, or logs.

## Rules
1. Never ask the user to paste files that are already in the workspace.
2. Never use full-file read as the first operation.
3. Use rg/glob first.
4. Prefer commands that return filenames, line numbers, and 2–3 lines of context.
5. Build compact sourceRef-backed cards before reading more.
6. Read exact line ranges only after search narrows the target.
7. If MCP services are unavailable, fall back to bash rg/glob.
8. If a previous attempt failed, write an investigation card with:
   - query
   - result
   - error
   - next query
   - sourceRefs

## Preferred search commands:
- `rg --files`
- `rg -n --context 2 "PATTERN" path`
- `rg -n --json "PATTERN" path`
- `git diff -- path`

## Add an agent prompt line
In your antigravity / hermes-ace agent prompt, add:
If workspace files are needed, use rg/glob first. Do not ask the user to paste file contents. If MCP tools are unavailable, use allowed bash rg commands. Always produce compact sourceRef cards before reading full files.

## Tool Definition: trace.audit_sidecar_migrations
This is a new MCP tool to handle the sidecar audit workflow.

**Input:**
{
  paths?: string[];
  pattern?: string;
}

**Output:**
{
  cards: MigrationAuditCard[];
  missingFiles: string[];
  sourceRefs: string[];
}

**Note:** This tool is designed to work with plain `rg` if the MCP server is down, ensuring process continuity.
