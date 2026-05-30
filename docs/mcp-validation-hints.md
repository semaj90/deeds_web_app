# MCP Tool Validation Hints

## Quick Reference

When an MCP tool returns a validation error, use the schema inspector to see exactly what inputs are required:

```bash
# Show schema for any tool
npm run mcp:verify-json-rpc -- --schema=TOOL_NAME

# Examples:
npm run mcp:verify-json-rpc -- --schema=context.build_kv_packet
npm run mcp:verify-json-rpc -- --schema=trace.kag_search
npm run mcp:verify-json-rpc -- --schema=graph.expand_neighborhood
```

## Common Validation Errors

### ❌ Missing Required Parameter

**Error:** `invalid input: missing required field 'query'`

**Cause:** Required parameters were not provided in the tool arguments.

**Fix:** Check the schema to see all required fields:

```bash
npm run mcp:verify-json-rpc -- --schema=trace.kag_search
```

Then include all [REQUIRED] fields in your tool call.

### ❌ Wrong Parameter Type

**Error:** `validation error: 'query' must be a string`

**Cause:** Parameter was passed with the wrong type (e.g., array instead of string, number instead of string).

**Fix:** Check the Input Schema type for each parameter:

```
Input Schema:
  - query (string) [REQUIRED]
  - limit (number) [optional]
```

Always match the expected type.

### ❌ Invalid Enum Value

**Error:** `validation error: 'sortBy' must be one of: 'relevance', 'date', 'score'`

**Cause:** An enum parameter was given a value not in the allowed list.

**Fix:** Use the schema inspector to see allowed values:

```
Input Schema:
  - sortBy (string) [optional]
    Allowed values: relevance, date, score
```

### ❌ Array Element Type Mismatch

**Error:** `validation error: 'tags' array elements must be strings`

**Cause:** Array was provided but elements don't match the expected type.

**Fix:** Ensure all array elements are the correct type:

```typescript
// ❌ WRONG: mixing types
{ tags: ["legal", 123, "contract"] }

// ✅ CORRECT: all strings
{ tags: ["legal", "contract", "evidence"] }
```

## Debugging Workflow

1. **Run verification with schema:**
   ```bash
   npm run mcp:verify-json-rpc -- --schema=YOUR_TOOL_NAME
   ```

2. **Check Input Schema section:**
   - Look for `[REQUIRED]` markers
   - Note the type in parentheses: `(string)`, `(number)`, `(boolean)`, `(array)`
   - Check for Allowed values if enum

3. **Update your tool call:**
   - Include all `[REQUIRED]` fields
   - Match types exactly
   - Use allowed enum values only
   - Keep array elements homogeneous

4. **Test with `--call` flag (future):**
   ```bash
   npm run mcp:verify-json-rpc -- --call=TOOL_NAME --args='{"key":"value"}'
   ```

## Common MCP Tools and Their Signatures

### `context.build_kv_packet`
```
Description: Build a context key-value packet for semantic search
Input Schema:
  - query (string) [REQUIRED] — The search query
```

### `trace.kag_search`
```
Description: Knowledge-Augmented Generation search
Input Schema:
  - query (string) [REQUIRED] — Search query
  - limit (number) [optional] — Max results (default: 5)
```

### `graph.expand_neighborhood`
```
Description: Expand a node's neighbors in the code graph
Input Schema:
  - nodeId (string) [REQUIRED] — Node identifier
  - depth (number) [optional] — Expansion depth (default: 1)
  - includeEdgeTypes (array) [optional] — Filter edge types
```

### `topology.search_near`
```
Description: Search for topology nodes near coordinates
Input Schema:
  - x (number) [REQUIRED] — X coordinate
  - y (number) [REQUIRED] — Y coordinate
  - radius (number) [optional] — Search radius (default: 10)
```

## Pro Tips

- **List all tools:** `npm run mcp:trace:tools` (shows 127+ available tools)
- **Check availability:** `npm run mcp:trace:health` (confirms MCP server is up)
- **Test a tool:** `npm run test:mcp` (runs comprehensive tests)
- **VS Code integration:** Task `🧪 MCP JSON-RPC 2.0 Verification` runs on startup

## For Tool Developers

When adding a new MCP tool, ensure:

1. **All parameters have descriptions** — shows up in the schema inspector
2. **Mark required vs optional** — clients check for `[REQUIRED]` tags
3. **Document enum values** — listed under "Allowed values"
4. **Use simple types** — string, number, boolean, array (complex objects need custom handling)
5. **Validate early** — reject invalid input with clear error messages that match the pattern: `validation error: field 'X' must be Y`

Example tool schema in Zod:

```typescript
const myToolInput = z.object({
  query: z.string().describe('The search query'),
  limit: z.number().optional().describe('Max results'),
  sortBy: z.enum(['relevance', 'date', 'score']).optional()
    .describe('Sort order')
});
```
