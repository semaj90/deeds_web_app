#!/usr/bin/env node
/** Validate the code-exploration OKF definition without promoting its population. */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const definition = path.join(root, '.okf', 'indexes', 'code-exploration.yaml');
const reportPath = path.join(root, 'docs', 'reports', 'code-exploration-index-contract-v1.json');
const require = createRequire(import.meta.url);
const { parse } = require(path.join(root, 'sveltekit-frontend', 'node_modules', 'yaml'));
const { z } = require(path.join(root, 'node_modules', 'zod'));
const text = await readFile(definition, 'utf8');
const nonEmpty = z.string().min(1);
const schema = z.object({
  schema: z.literal('atlas.code-exploration-index.v1'), version: z.literal(1),
  index: z.object({ id: z.literal('parent-atlas-code-exploration'), owner: z.literal('parent-atlas'), role: z.literal('rebuildable_agent_exploration_projection'), authority: z.literal('derived'), canonical_store: z.literal('postgresql18'), principles: z.array(nonEmpty).min(1) }),
  source: z.object({ seed: z.object({ path: nonEmpty, role: z.literal('discovery_seed'), authoritative: z.literal(false) }), structural_authority: z.array(nonEmpty).min(2) }),
  identity: z.object({ required: z.array(nonEmpty).min(4), promotion_keys: z.array(nonEmpty).min(1), coordinates: z.object({ canonical: z.literal('utf8_byte'), fields: z.array(nonEmpty).length(2), line_role: nonEmpty, lsp_role: z.literal('transport_only_utf16') }) }),
  providers: z.object({ tree_sitter: z.object({ role: z.literal('structural_authority') }), ast_grep: z.object({ role: z.literal('exact_observation') }), regex: z.object({ role: z.literal('discovery_only'), retrieval_admission: z.literal(false) }) }),
  admission: z.object({ require_exact_source_ref: z.literal(true), require_source_revision: z.literal(true), require_workspace_revision: z.literal(true), require_canonical_utf8_span: z.literal(true), require_canonical_join: z.literal(true), reject: z.array(nonEmpty).min(1) }),
  retrieval: z.object({ metadata_only_default: z.literal(true), lanes: z.object({ exact_symbol: z.object({ enabled: z.literal(true) }), structural: z.object({ enabled: z.literal(true) }), lexical: z.object({ enabled: z.literal(true) }), semantic: z.object({ enabled: z.literal(false), representation: z.literal('semantic_768'), enable_when: nonEmpty }) }) }),
  context: z.object({ default_lod: z.literal('identity'), limits: z.object({ candidates: z.number().int().min(1).max(50), promoted_spans: z.number().int().min(1).max(8), span_bytes: z.number().int().min(256).max(16384), total_source_bytes: z.number().int().min(1024).max(65536) }), full_file: z.object({ enabled_by_default: z.literal(false), explicit_promotion_required: z.literal(true) }) }),
}).strict();
const value = schema.parse(parse(text));
const required = new Set(value.identity.required);
if (!['source_ref', 'source_revision', 'workspace_revision', 'content_hash'].every((key) => required.has(key))) throw new Error('CODE_EXPLORATION_IDENTITY_INCOMPLETE');
const report = { schema: 'atlas.code-exploration-index-contract-receipt.v1', definition: '.okf/indexes/code-exploration.yaml', definitionChecksum: `sha256:${createHash('sha256').update(text).digest('hex')}`, valid: true, semanticAdmission: false, astExplore02: 'BLOCKED_UPSTREAM', currentPopulationAdmitted: 0, writes: 0, canonicalAuthority: false, modelCalls: false, status: 'CONTRACT_PROVEN_POPULATION_UNADMITTED', blockers: ['current source/chunk/workspace join is not exact', 'existing symbol seed lacks revision and canonical byte spans'] };
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ report: path.relative(root, reportPath).replaceAll('\\', '/'), status: report.status, astExplore02: report.astExplore02, writes: 0 }, null, 2));

