# Copilot Workspace Rules

Use ripgrep for repo navigation.

Before reading or editing a file:
1. Run `pwd`.
2. Run `rg --files | rg "<filename>$"`.
3. Use `rg "<pattern>" sveltekit-frontend/` for content search.
4. Prefer `sveltekit-frontend/` as the active app root.
5. Do not assume `src/` exists at repo root.
6. Do not ask the user for a path until `rg` confirms no match.

For large context:
- Do not paste full files.
- Use TRACE MCP / ACE search first.
- Use compact chunk IDs, line ranges, and summaries.
- Tool output must stay under 800 tokens.

GitHub Copilot custom instructions are supported with this file. Use the repo-local `.github/agents/` folder for specialized agent profiles.
