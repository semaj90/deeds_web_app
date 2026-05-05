/**
 * AGENTS.md envelope schema — the structured form of an AGENTS.md file
 * after parse-agents-md.ts extracts rules, tools, tags, and summary from
 * the markdown body.
 *
 * Mirrors the agent_context_files Postgres columns + the JSONB rules/tools
 * payload. Used by the indexer, the directory resolver, and ACE.
 */

import { z } from 'zod';

export const agentRuleSchema = z.object({
  rule:     z.string().min(1).max(2000),
  severity: z.enum(['low', 'medium', 'high']).default('medium'),
  tags:     z.array(z.string()).default([]),
});

export const agentToolPolicySchema = z.object({
  tool:    z.string().min(1).max(200),
  allowed: z.boolean(),
  scope:   z.string().default('unspecified'),
  reason:  z.string().optional(),
});

export const agentConstraintSchema = z.object({
  constraint: z.string().min(1).max(2000),
  applies_to: z.array(z.string()).default([]),
});

export const agentsMdEnvelopeSchema = z.object({
  kind:           z.literal('agents_md'),
  /** Stable cross-run key, e.g. `agents:src/lib/server/ai/AGENTS.md` */
  stable_key:     z.string().min(1).max(500),
  file_path:      z.string().min(1).max(500),
  directory_path: z.string().min(1).max(500),
  /** sha256 of normalised content — drives idempotent re-indexing */
  content_hash:   z.string().length(64),
  title:          z.string().max(300).optional(),
  summary:        z.string().max(2000).default(''),
  applies_to: z.object({
    directory: z.string(),
    children:  z.boolean().default(true),
  }),
  rules:          z.array(agentRuleSchema).default([]),
  tools:          z.array(agentToolPolicySchema).default([]),
  constraints:    z.array(agentConstraintSchema).default([]),
  semantic_tags:  z.array(z.string()).default([]),
  qdrant_tags:    z.array(z.string()).default([]),
  confidence:     z.number().min(0).max(1).default(0.75),
  schema_version: z.number().int().min(1).default(1),
});

export type AgentRule         = z.infer<typeof agentRuleSchema>;
export type AgentToolPolicy   = z.infer<typeof agentToolPolicySchema>;
export type AgentConstraint   = z.infer<typeof agentConstraintSchema>;
export type AgentsMdEnvelope  = z.infer<typeof agentsMdEnvelopeSchema>;

export const AGENTS_MD_SCHEMA_VERSION = 1;
