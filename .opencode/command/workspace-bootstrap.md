# Workspace Bootstrap

description: Refresh the local ACE context, daily summary, startup truth, MCP health, and semantic-index report before OpenCode work begins.

## Mission

Load the repo-local context, docs, reports, and bash tool inventory from the main repo. Do not rely on the external Claude-Mem plugin install or GitHub Actions.

## Required Order

1. Run `npm run opencode:bootstrap` from the repo root.
   - This should ensure Claude-Mem is launched detached when available.
2. Inspect the generated ACE context and daily TODO summary.
3. Verify MCP health and startup truth.
4. Use the loaded docs/reports and bash tools before reading whole files.

## Output

Return:

status:
loaded_context:
loaded_reports:
mcp_health:
startup_truth:
next_safe_action:

## Guardrails

- Do not mutate files beyond the bootstrap outputs.
- Do not commit or stage.
- Treat Woodpecker as optional only.
- Keep GitHub Actions removed unless a file is documentation-only.
