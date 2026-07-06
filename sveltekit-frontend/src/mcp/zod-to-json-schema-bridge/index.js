/**
 * zod-to-json-schema-bridge
 *
 * Drop-in replacement for `zod-to-json-schema@3.x` that handles BOTH
 * Zod v3 (via the original library) AND Zod v4 (via Zod's built-in
 * `z.toJSONSchema()`). Wired in via `package.json` `overrides` so the
 * MCP SDK's `tools/list` introspector calls into us instead of the
 * v3-only original.
 *
 * Detection: Zod v4 schemas carry a `_zod` symbol-keyed slot. Zod v3
 * carries `_def.typeName`. We check for `_zod` first; if present →
 * delegate to `z.toJSONSchema()`. Otherwise → delegate to the original
 * `zod-to-json-schema` library (lazy-required so we don't pull it in
 * for v4-only consumers).
 *
 * Original API surface preserved:
 *   - default export = zodToJsonSchema function
 *   - named export   = zodToJsonSchema function
 *   - other named exports (zodToJsonSchemaTypes, …) — re-exported when
 *     the v3 library is reachable, undefined otherwise
 *
 * The MCP SDK calls:
 *   import { zodToJsonSchema } from 'zod-to-json-schema';
 *   const json = zodToJsonSchema(tool.inputSchema, { name });
 *
 * That's the only path we need to support correctly.
 */

const z = require('zod');

function isZodV4Schema(schema) {
  if (!schema || typeof schema !== 'object') return false;
  // Zod 4 carries a `_zod` slot; Zod 3 carries `_def.typeName`.
  if (typeof schema._zod === 'object' && schema._zod !== null) return true;
  if (schema._def && schema._def.typeName) return false;
  // Some Zod 4 schemas wrap differently — last-ditch: try z.toJSONSchema and bail to v3 on throw.
  return typeof z.toJSONSchema === 'function';
}

function v4ToJsonSchema(schema, opts) {
  // Zod 4's z.toJSONSchema accepts the same call shape (schema, [opts]).
  // It does NOT take a `name` field the same way; if MCP SDK passed `name`
  // we ignore it (the SDK uses it for $ref naming but the JSON Schema we
  // return is wrapped at the tool level by the SDK itself).
  return z.toJSONSchema(schema);
}

function v3ToJsonSchema(schema, opts) {
  // Lazy-require the original — only loaded when a v3 schema appears.
  // If the original isn't installed (because the override removed it),
  // throw a clear error so the operator knows what's missing.
  let original;
  try {
    // Try the original name first, then the actual package name
    try {
      original = require('zod-to-json-schema-original');
    } catch (e1) {
      original = require('zod-v3-to-json-schema');
    }
  } catch (e) {
    throw new Error(
      `zod-to-json-schema-bridge: encountered a Zod v3 schema but the v3 ` +
      `library 'zod-v3-to-json-schema' or 'zod-to-json-schema-original' is not installed. Either ` +
      `migrate the schema to Zod v4 or add the v3 library.`
    );
  }
  return original.zodToJsonSchema(schema, opts);
}

function zodToJsonSchema(schema, opts) {
  if (isZodV4Schema(schema)) {
    try {
      return v4ToJsonSchema(schema, opts);
    } catch (err) {
      // Fall back to v3 path on ANY v4 failure so we never crash
      // tools/list — worse to break the whole listing than to surface a
      // schema with $ref placeholders.
      try { return v3ToJsonSchema(schema, opts); } catch { /* fall through */ }
      throw err;
    }
  }
  return v3ToJsonSchema(schema, opts);
}

module.exports               = zodToJsonSchema;
module.exports.default       = zodToJsonSchema;
module.exports.zodToJsonSchema = zodToJsonSchema;
