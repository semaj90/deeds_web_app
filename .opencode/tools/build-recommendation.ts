/**
 * STUB: Build a repair recommendation from error context.
 *
 * Note: This is a development-time stub in .opencode/ (gitignored).
 * Not currently wired to the active MCP server.
 * To activate: add to src/mcp/server.ts tool definitions and handlers.
 */

export async function buildRecommendation(input: {
  intent: string;
  domain: string;
  subdomain?: string;
  errorSummary?: string;
  evidenceLines?: string[];
  patchTargets?: string[];
  proposedFix?: string;
}) {
  return {
    likely_cause: 'Unknown error pattern',
    evidence: input.evidenceLines ?? [],
    patch_targets: input.patchTargets ?? [],
    proposed_fix: input.proposedFix ?? null,
    safe_next_command: 'npm run audit:errors',
    do_not_do: ['force-push', 'delete database', 'skip validation'],
    intent: input.intent,
    confidence: 0.4,
  };
}
