Run MCP health checks.

1. Run `npm run check`.
2. Run `npm run audit:contracts`.
3. Verify:
   - http://127.0.0.1:8791/mcp
   - http://127.0.0.1:8792/mcp
   - http://127.0.0.1:8793/mcp
4. Verify cache trace writes.
5. Report broken MCP tools only. Do not delete tools.
