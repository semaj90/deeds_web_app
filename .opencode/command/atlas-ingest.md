Run local atlas ingestion.

Steps:
1. Run `node scripts/atlas/health-deep.mjs --json`.
2. Run `node scripts/atlas/build-parent-atlas.mjs --root . --out docs/atlas/parent-master-atlas.json`.
3. Run `node scripts/atlas/smoke-sourcerefs.mjs`.
4. Report installed, wired, sourceRefs valid, and whether further research is needed.

Do not edit application code.

OpenCode custom commands are prompt files you can run from the TUI.

For your first version: do not start with MCP. Use OpenCode commands that run Node scripts. Add MCP later after the atlas scripts are stable.