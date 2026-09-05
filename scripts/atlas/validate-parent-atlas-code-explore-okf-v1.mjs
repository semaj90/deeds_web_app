#!/usr/bin/env node
/** Validate the declarative exploration index. No indexing, model, or datastore writes. */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manifestPath = path.join(root, '.okf', 'indexes', 'parent-atlas-code-explore.yaml');
const reportPath = path.join(root, 'docs', 'reports', 'parent-atlas-code-explore-okf-v1.json');
const require = createRequire(import.meta.url);
const { parse } = require(path.join(root, 'sveltekit-frontend', 'node_modules', 'yaml'));
const { z } = require(path.join(root, 'node_modules', 'zod'));
const s = z.string().min(1);
const schema = z.object({
  schema: z.literal('atlas.explore-index-definition.v1'), registry_id: s,
  status: z.literal('active'), owner: z.literal('parent-atlas'), purpose: s, authority: z.literal('derived_projection'), mutation_policy: z.literal('rebuildable_only'),
  scope: z.object({ roots: z.array(s).min(1), include_extensions: z.array(s).min(1), exclude_directories: z.array(s).min(1) }),
  identity: z.object({ required: z.array(s).min(4), optional: z.array(s), coordinates: z.object({ canonical: z.literal('utf8_byte'), protocol_adapter: z.literal('lsp_utf16'), lsp_is_canonical: z.literal(false) }), rule: s }),
  observers: z.object({ structural: z.object({ providers: z.array(s).min(2), authority: s }), semantic: z.object({ providers: z.array(s).min(3), authority: s }), language_model: z.object({ provider: z.literal('llama_server'), endpoint: s, model_policy: s, authority: s }) }),
  rules: z.array(z.object({ id: s, provider: z.literal('ast_grep'), fallback: z.literal('regex_discovery_only') })).min(1),
  projection: z.object({ fields: z.array(s).min(1), retrieval_lanes: z.object({ lexical_fts: z.object({ enabled: z.literal(true), owner: z.literal('postgresql18') }), lexical_trigram: z.object({ enabled: z.literal(true), owner: z.literal('postgresql18') }), structural_ast: z.object({ enabled: z.literal(true), owner: z.literal('search_runtime') }), semantic: z.object({ enabled: z.literal(false), representation: z.literal('semantic_768'), enablement_gate: s }), graph: z.object({ enabled: z.literal(false), enablement_gate: s }) }) }),
  context: z.object({ default_level_of_detail: z.literal('identity'), levels: z.array(s).min(2), max_selected_candidates: z.number().int().positive(), max_span_bytes: z.number().int().positive(), assembly_owner: z.literal('ace'), synthesis_owner: z.literal('ornith_1_5_llama_server') }),
  parameters: z.object({ query_limit: z.number().int().positive(), span_max_bytes: z.number().int().positive(), semantic_enabled: z.literal(false), external_search_on: s, cache_warming: s }),
  admission: z.object({ require_source_revision: z.literal(true), require_workspace_revision: z.literal(true), require_utf8_byte_span: z.literal(true), require_existing_canonical_identity: z.literal(true), permit_unqualified_rows: z.literal(false), canonical_authority: z.literal(false) }),
}).strict();
const text = await readFile(manifestPath, 'utf8');
const contract = schema.parse(parse(text));
const required = new Set(contract.identity.required);
if (!['source_ref', 'source_revision', 'workspace_revision', 'content_hash'].every((key) => required.has(key))) throw new Error('EXPLORE_IDENTITY_FIELDS_INCOMPLETE');
if (contract.context.max_span_bytes !== contract.parameters.span_max_bytes) throw new Error('EXPLORE_SPAN_LIMIT_MISMATCH');
const manifestChecksum = `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
const report = { schema: 'atlas.explore-index-contract-validation.v1', manifest: path.relative(root, manifestPath).replaceAll('\\', '/'), manifestChecksum, status: 'CONTRACT_VALID_UNPROVEN_RUNTIME', identityFieldsComplete: true, canonicalCoordinates: 'utf8_byte', lspProtocolCoordinates: 'lsp_utf16', semanticRepresentation: 'semantic_768', semanticProjectionEnabled: false, astGrepFallbackAuthority: 'discovery_only', canonicalAuthority: false, modelCalls: false, datastoreWrites: false, cacheWarming: false, nextGate: 'AST-EXPLORE-INDEX-ADAPTER-01', blockers: ['current workspace/source/chunk join is not exact', 'seed symbols lack revision and byte-span identity'] };
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ report: path.relative(root, reportPath).replaceAll('\\', '/'), status: report.status, manifestChecksum, writesPerformed: false }, null, 2));
