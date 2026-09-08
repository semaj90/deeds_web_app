import { z } from 'zod';

/**
 * TraceMcpToolCensusV1 — reconciles two genuinely different measurements of the TRACE MCP
 * (src/mcp/trace-mcp-server.ts, :8788) tool surface, instead of treating them as competing
 * counts of the same population:
 *
 *   - STATIC methodology (REGISTER_TOOL_SOURCE_SCAN): a literal-string scan of
 *     `server.registerTool('name', ...)` calls whose name argument appears directly inside
 *     trace-mcp-server.ts's own source text. This is what docs/TRACE-MCP-TOOLS-AUDIT.json's
 *     `totalTools` has always measured — it cannot see registrations delegated to an imported
 *     `registerXTools(server, ...)` function, even though those are equally static and
 *     source-attributable, just not textually present in this one file.
 *   - RUNTIME methodology (MCP_TOOLS_LIST): a live `tools/list` JSON-RPC call against the
 *     actually running server. This is what a real MCP client sees and can invoke — the
 *     authoritative count for "what can a client call right now."
 *
 * These are not in conflict when they differ. The admission criterion for a healthy census is
 * NOT staticCount === runtimeCount — it is unexplainedRuntimeTools.length === 0 AND
 * duplicateRuntimeToolNames.length === 0. A runtime-only tool is expected and fine as long as its
 * source is found and classified; only a genuinely unexplained or duplicated name is a real
 * problem.
 */

export const TraceMcpToolClassificationSchema = z.enum([
	/** Registered via a delegated `registerXTools(server, ...)` call from another source file —
	 *  fully static and source-attributable, just not a literal registerTool() call inside
	 *  trace-mcp-server.ts itself, so the STATIC methodology's single-file scan misses it. */
	'DELEGATED_MODULE_REGISTRATION',
	/** An explicit bare-name backward-compatibility alias for a namespaced tool (e.g. `trace_search`
	 *  aliasing `kb.trace_search`), gated by a feature flag in source (e.g. MCP_LEGACY_ALIASES). */
	'COMPATIBILITY_ALIAS',
	/** Registered from a runtime-computed name (e.g. built from config, not a source literal) —
	 *  distinct from DELEGATED_MODULE_REGISTRATION, which is still a literal name, just in another file. */
	'RUNTIME_GENERATED',
	/** Injected by a third-party plugin/SDK mechanism outside this repo's own registration calls. */
	'PLUGIN_INJECTED',
	/** A tool whose namespace groups it under a specific domain expansion not covered by the above. */
	'DYNAMIC_DOMAIN_TOOL',
	/** No source location found for this runtime tool name — a real gap requiring investigation. */
	'UNEXPLAINED',
]);
export type TraceMcpToolClassification = z.infer<typeof TraceMcpToolClassificationSchema>;

export const TraceMcpRuntimeOnlyToolV1Schema = z
	.object({
		name: z.string().min(1),
		classification: TraceMcpToolClassificationSchema,
		sourceFiles: z.array(z.string().min(1)),
	})
	.strict();
export type TraceMcpRuntimeOnlyToolV1 = z.infer<typeof TraceMcpRuntimeOnlyToolV1Schema>;

export const TraceMcpToolCensusV1Schema = z
	.object({
		schema: z.literal('trace-mcp.tool-census.v1'),
		capturedAt: z.string().datetime(),
		serverRevision: z.string().min(1).nullable(),
		serverHealth: z.enum(['HEALTHY', 'DEGRADED', 'UNREACHABLE']),
		static: z
			.object({
				methodology: z.literal('REGISTER_TOOL_SOURCE_SCAN'),
				sourceFile: z.string().min(1),
				count: z.number().int().nonnegative(),
				namesChecksum: z.string().regex(/^[a-f0-9]{64}$/),
			})
			.strict(),
		runtime: z
			.object({
				methodology: z.literal('MCP_TOOLS_LIST'),
				endpoint: z.string().min(1),
				count: z.number().int().nonnegative(),
				namesChecksum: z.string().regex(/^[a-f0-9]{64}$/),
			})
			.strict(),
		reconciliation: z
			.object({
				sharedCount: z.number().int().nonnegative(),
				staticOnlyCount: z.number().int().nonnegative(),
				runtimeOnlyCount: z.number().int().nonnegative(),
				staticOnlyNames: z.array(z.string()),
				runtimeOnlyTools: z.array(TraceMcpRuntimeOnlyToolV1Schema),
				duplicateRuntimeToolNames: z.array(z.string()),
				unexplainedRuntimeTools: z.array(z.string()),
			})
			.strict()
			.superRefine((val, ctx) => {
				if (val.runtimeOnlyTools.length !== val.runtimeOnlyCount) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: 'runtimeOnlyTools length must match runtimeOnlyCount',
					});
				}
				const unexplainedFromTools = val.runtimeOnlyTools
					.filter((t) => t.classification === 'UNEXPLAINED')
					.map((t) => t.name)
					.sort();
				if (JSON.stringify(unexplainedFromTools) !== JSON.stringify([...val.unexplainedRuntimeTools].sort())) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: 'unexplainedRuntimeTools must exactly match UNEXPLAINED-classified runtimeOnlyTools',
					});
				}
			}),
		admission: z
			.object({
				/** The only real pass/fail gate — NOT staticCount === runtimeCount. */
				unexplainedRuntimeToolsIsZero: z.boolean(),
				duplicateRuntimeToolNamesIsZero: z.boolean(),
				verdict: z.enum(['PASS', 'FAIL']),
			})
			.strict()
			.superRefine((val, ctx) => {
				const expectedVerdict =
					val.unexplainedRuntimeToolsIsZero && val.duplicateRuntimeToolNamesIsZero ? 'PASS' : 'FAIL';
				if (val.verdict !== expectedVerdict) {
					ctx.addIssue({ code: z.ZodIssueCode.custom, message: `verdict must be ${expectedVerdict}` });
				}
			}),
	})
	.strict();
export type TraceMcpToolCensusV1 = z.infer<typeof TraceMcpToolCensusV1Schema>;
