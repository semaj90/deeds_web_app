/**
 * YAML-driven, read-only Graphify -> ast-grep entity prefill.
 * No database, vector, graph, cache, or canonical entity writes.
 */
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deriveTreeNodeOccurrenceId } from './lib/tree-node-occurrence-v1.mjs';
import { isSha256SourceRevisionV1, sourceBytesMatchRevisionV1 } from './lib/source-byte-revision-v1.mjs';
import { classifyAstPrefillDeclarationV1 } from './lib/ast-prefill-declaration-classification-v1.mjs';
import { resolveAstGrepExtractorRevisionV1 } from './lib/ast-grep-extractor-revision-v1.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const configPath = path.resolve(ROOT, process.argv.find((a) => a.startsWith('--config='))?.slice(9) ?? '.okf/pipelines/ast-entity-prefill.yaml');
const all = process.argv.includes('--all');
const requestedLimit = Number(process.argv.find((a) => a.startsWith('--limit='))?.slice(8) ?? 100);
const limit = all ? 0 : Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : 100);
const workspaceRevision = process.argv.find((a) => a.startsWith('--workspace-revision='))?.slice(21) ?? null;
if (workspaceRevision && !/^sha256:[a-f0-9]{64}$/.test(workspaceRevision)) throw new Error('WORKSPACE_REVISION_INVALID');
const outputPath = path.resolve(ROOT, process.argv.find((a) => a.startsWith('--output='))?.slice(9) ?? 'docs/reports/ast-entity-prefill-graphify-v1.jsonl');
const { parse: parseYaml } = await import('yaml');
const { Lang, parse } = await import(pathToFileURL(path.join(ROOT, 'sveltekit-frontend/node_modules/@ast-grep/napi/index.js')).href);

const config = parseYaml(await fs.readFile(configPath, 'utf8'));
if (config?.schema !== 'atlas.ast-entity-prefill-pipeline.v1') throw new Error('invalid AST entity prefill YAML schema');
if (config.extraction?.engine !== 'ast-grep-napi') throw new Error('YAML must select ast-grep-napi');
if (config.embedding?.representation !== 'semantic_768' || config.embedding?.normalization !== 'L2_VECTOR') throw new Error('YAML embedding contract must remain semantic_768/L2_VECTOR');
const astGrepPackageMetadata = JSON.parse(await fs.readFile(path.join(ROOT, 'sveltekit-frontend/node_modules/@ast-grep/napi/package.json'), 'utf8'));
const astGrepExtractorRevision = resolveAstGrepExtractorRevisionV1(astGrepPackageMetadata);
const astPrefillPipelineRevision = 'atlas.ast-entity-prefill-yaml.v2';

// S01-09D bounded-replay aid: --source-ref=<path> (repeatable) restricts the query to exact source_ref values,
// so a proof/regression run can target the known-affected files without a full repo walk. Read-only; no schema change.
const sourceRefFilter = process.argv.filter((a) => a.startsWith('--source-ref=')).map((a) => a.slice(13));
function queryPackets() {
  const escapedRefs = sourceRefFilter.map((r) => `'${r.replace(/'/g, "''")}'`);
  const sourceRefClause = escapedRefs.length ? ` AND source_ref = ANY(ARRAY[${escapedRefs.join(',')}])` : '';
  const workspaceRevisionSql = workspaceRevision ? `'${workspaceRevision}'` : null;
  if (workspaceRevision) {
    const bindingSourceRefClause = escapedRefs.length ? ` AND canonical_source_ref = ANY(ARRAY[${escapedRefs.join(',')}])` : '';
    const bindingSql = `SELECT NULL::text AS packet_key, canonical_source_ref AS source_ref,
      NULL::text AS feature_id, NULL::text AS title_id, NULL::text AS tree_node_id,
      source_revision, workspace_revision, NULL::text AS primary_domain,
      NULL::text AS domain_class, NULL::text AS ontology, NULL::text AS packet_ontology,
      false AS semantic_present
      FROM atlas_workspace_source_bindings
      WHERE repo_id = 'deeds-web-app' AND workspace_revision = ${workspaceRevisionSql}
        AND canonical_source_ref IS NOT NULL AND canonical_source_ref <> ''${bindingSourceRefClause}
      ORDER BY canonical_source_ref${limit ? ` LIMIT ${limit}` : ''};`;
    const raw = execFileSync('docker', ['exec', 'legal-ai-postgres', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'legal_admin', '-d', 'legal_ai_db', '-At', '-F', '|', '-c', `BEGIN READ ONLY; ${bindingSql} ROLLBACK;`], { encoding: 'utf8', timeout: 30000 });
    return raw.trim().split(/\r?\n/).filter((line) => line && !['BEGIN', 'ROLLBACK'].includes(line)).map((line) => {
      const [packet_key, source_ref, feature_id, title_id, tree_node_id, source_revision, workspace_revision_value, primary_domain, domain_class, ontology, packet_ontology, semantic_present] = line.split('|');
      return {
        packet_key: packet_key || null, source_ref, feature_id: feature_id || null, title_id: title_id || null,
        tree_node_id: tree_node_id || null, source_revision: source_revision || null,
        workspace_revision: workspace_revision_value || null, primary_domain: primary_domain || null,
        domain_class: domain_class || null, ontology: ontology || null, packet_ontology: packet_ontology || null,
        semantic_present: semantic_present === 't', identity_status: 'SOURCE_ONLY_UNBOUND',
      };
    });
  }
  const sql = `SELECT packet_key, source_ref, feature_id, title_id, tree_node_id,
    source_revision, workspace_revision_key,
    primary_domain, domain_class, ontology, packet_ontology,
    CASE WHEN source_dimension = 768 AND embedding IS NOT NULL THEN true ELSE false END AS semantic_present
    FROM atlas_packets
    WHERE source_kind = 'codebase_chunk' AND source_ref IS NOT NULL
      AND source_ref !~ '^(null|undefined|\\s*)$'${sourceRefClause}
    ORDER BY source_ref, packet_key${limit ? ` LIMIT ${limit}` : ''};`;
  const raw = execFileSync('docker', ['exec', 'legal-ai-postgres', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'legal_admin', '-d', 'legal_ai_db', '-At', '-F', '|', '-c', `BEGIN READ ONLY; ${sql} ROLLBACK;`], { encoding: 'utf8', timeout: 30000 });
  return raw.trim().split(/\r?\n/).filter((line) => line && !['BEGIN', 'ROLLBACK'].includes(line)).map((line) => {
    const [packet_key, source_ref, feature_id, title_id, tree_node_id, source_revision, workspace_revision, primary_domain, domain_class, ontology, packet_ontology, semantic_present] = line.split('|');
    return {
      packet_key, source_ref, feature_id: feature_id || null, title_id: title_id || null,
      tree_node_id: tree_node_id || null, source_revision: source_revision || null,
      workspace_revision: workspace_revision || null,
      primary_domain: primary_domain || null, domain_class: domain_class || null,
      ontology: ontology || null, packet_ontology: packet_ontology || null,
      semantic_present: semantic_present === 't'
    };
  });
}

function languageFor(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.ts') return Lang.TypeScript;
  if (ext === '.tsx') return Lang.Tsx;
  if (['.js', '.jsx', '.mjs', '.cjs'].includes(ext)) return Lang.JavaScript;
  return null;
}

// ast-grep NAPI exposes range.index in the JS source-string coordinate space.
// Convert those offsets before persisting byte-grounded evidence.
function utf8ByteOffset(text, codeUnitOffset) {
  return Buffer.byteLength(text.slice(0, codeUnitOffset), 'utf8');
}

function resolveFile(sourceRef, index) {
  const normalized = String(sourceRef).replaceAll('\\', '/').replace(/^\.\//, '');
  const candidates = [
    path.join(ROOT, 'sveltekit-frontend', normalized),
    path.join(ROOT, normalized),
  ];
  for (const direct of candidates) {
    if (direct.startsWith(ROOT) && existsSync(direct)) return direct;
  }
  for (const base of [path.join(ROOT, 'sveltekit-frontend'), ROOT]) {
    const direct = path.resolve(base, normalized);
    if (direct.startsWith(ROOT) && existsSync(direct)) return direct;
  }
  if (index.has(normalized)) return index.get(normalized);
  const matches = [...index.entries()].filter(([relative]) => relative.endsWith(`/${normalized}`));
  return matches.length === 1 ? matches[0][1] : null;
}

function extract(text, file, packet) {
  const language = languageFor(file);
  if (!language) return [];
  const root = parse(language, text).root();
  const kinds = new Map([
    ['function_declaration', 'function'], ['generator_function_declaration', 'function'],
    ['class_declaration', 'class'], ['method_definition', 'method'],
    ['variable_declarator', 'variable'], ['interface_declaration', 'interface'],
    ['type_alias_declaration', 'type'], ['enum_declaration', 'enum'],
  ]);
  const rows = [];
  function visit(node) {
    const entityKind = kinds.get(node.kind());
    if (entityKind) {
      const name = node.kind() === 'variable_declarator'
        ? node.field('name')
        : node.children().find((child) => ['identifier', 'type_identifier', 'property_identifier', 'private_property_identifier'].includes(child.kind()));
      const declaration = classifyAstPrefillDeclarationV1({
        nodeKind: node.kind(),
        nameNodeKind: name?.kind() ?? null,
        nameText: name?.text()?.trim() ?? '',
        valueNodeKind: node.field('value')?.kind() ?? null,
        entityKind,
      });
      if (name && declaration) {
        const range = node.range();
        const signature = node.text().split('{', 1)[0].trim().slice(0, 512);
        const startByte = utf8ByteOffset(text, range.start.index);
        const endByte = utf8ByteOffset(text, range.end.index);
        // S01-09D forward fix: `...packet` below carries the PACKET's own tree_node_id, which is one value per
        // FILE, not per declaration (root cause: docs/reports/tree-node-occurrence-producer-census-v1.json).
        // Every declaration row must override it with a genuinely declaration-scoped occurrence id, derived from
        // (sourceRef, sourceRevision, nodeType, startByte, endByte) -- never inherited verbatim from the packet.
        const resolvedPath = path.relative(ROOT, file).replaceAll('\\', '/');
        const occurrenceId = deriveTreeNodeOccurrenceId({
          sourceRef: packet.source_ref, sourceRevision: packet.source_revision ?? '',
          nodeType: node.kind(), startByte, endByte,
        });
        rows.push({
          schema: 'atlas.ast-entity-prefill-row.v2', ...packet,
          resolved_path: resolvedPath,
          language: path.extname(file).toLowerCase().replace('.', ''),
          symbol_name: declaration.symbolName, symbol_kind: declaration.symbolKind,
          entity_kind: declaration.symbolKind,
          entity_id: packet.packet_key ? `${packet.packet_key}#${declaration.symbolKind}:${declaration.symbolName}` : null,
          name: declaration.symbolName, signature, ast_kind: node.kind(),
          start_byte: startByte,
          end_byte: endByte,
          start_line: range.start.line + 1, start_column: range.start.column,
          end_line: range.end.line + 1, end_column: range.end.column,
          // Declaration-scoped occurrence identity (S01-09D) -- overrides the packet-level tree_node_id the
          // `...packet` spread above would otherwise leave file-scoped. packet_tree_node_id preserves the
          // original packet-level value for provenance/debugging only; it is never used as occurrence identity.
          tree_node_id: occurrenceId,
          tree_node_occurrence_id: occurrenceId,
          packet_tree_node_id: packet.tree_node_id ?? null,
          extractor: 'ast-grep', extractor_revision: astGrepExtractorRevision,
          prefill_pipeline_revision: astPrefillPipelineRevision,
          identity_status: packet.identity_status ?? 'CANDIDATE', canonical_symbol_id: null, symbol_version_id: null,
          canonical_write: false, classification_status: 'PENDING_ENCODER',
          lexical_lane: config.lexical.compatibility_alias, json_lane: config.json.parser,
          nlp_lane: config.nlp.engine, embedding_representation: config.embedding.representation,
          embedding_normalization: config.embedding.normalization
        });
      }
    }
    for (const child of node.children()) visit(child);
  }
  visit(root);
  return rows;
}

// Buffer raised 32MB -> 128MB (incidental, unrelated to S01-09D's identity fix): the repo's full --hidden
// --no-ignore file listing now exceeds the old limit and was throwing ERR_CHILD_PROCESS_STDIO_MAXBUFFER.
const files = execFileSync('rg', ['--files', '--hidden', '--no-ignore', '-g', '!**/node_modules/**', '-g', '!.git/**', '-g', '!.gemini/**', '-g', '!.codex/**', '-g', '!.claude/**', '-g', '!.opencode/**'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 }).split(/\r?\n/).filter(Boolean);
const index = new Map(files.map((relative) => [relative.replaceAll('\\', '/'), path.resolve(ROOT, relative)]));
const packets = queryPackets();
const rows = [];
let unresolved = 0;
let filesResolved = 0;
let revisionQualifiedFiles = 0;
let revisionMismatches = 0;
let revisionsUnqualified = 0;
const unresolvedSamples = [];
const revisionMismatchSamples = [];
const unqualifiedRevisionSamples = [];
for (const packet of packets) {
  const file = resolveFile(packet.source_ref, index);
  if (!file) { unresolved += 1; if (unresolvedSamples.length < 10) unresolvedSamples.push(packet.source_ref); continue; }
  filesResolved += 1;
  const sourceBytes = await fs.readFile(file);
  if (!isSha256SourceRevisionV1(packet.source_revision)) {
    revisionsUnqualified += 1;
    if (unqualifiedRevisionSamples.length < 10) unqualifiedRevisionSamples.push({ sourceRef: packet.source_ref, sourceRevision: packet.source_revision ?? null });
    continue;
  }
  if (!sourceBytesMatchRevisionV1(sourceBytes, packet.source_revision)) {
    revisionMismatches += 1;
    if (revisionMismatchSamples.length < 10) revisionMismatchSamples.push({ sourceRef: packet.source_ref, sourceRevision: packet.source_revision ?? null });
    continue;
  }
  revisionQualifiedFiles += 1;
  rows.push(...extract(sourceBytes.toString('utf8'), file, { ...packet, resolved_path: path.relative(ROOT, file).replaceAll('\\', '/') }));
}
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''), 'utf8');
const packetIdentityResolved = packets.filter((packet) => packet.packet_key && packet.source_ref).length;
const featureResolved = packets.filter((packet) => packet.feature_id).length;
const domainResolved = packets.filter((packet) => packet.primary_domain || packet.domain_class).length;
const ontologyResolved = packets.filter((packet) => packet.ontology || packet.packet_ontology).length;
const semanticResolved = packets.filter((packet) => packet.semantic_present).length;
const denominator = packets.length || 1;
const packetWorkspaceRevisions = [...new Set(packets.map((packet) => packet.workspace_revision).filter(Boolean))].sort();
const receiptWorkspaceRevision = workspaceRevision
  ?? (packetWorkspaceRevisions.length === 1 ? packetWorkspaceRevisions[0] : null);
console.log(JSON.stringify({
  schema: 'atlas.ast-entity-prefill-graphify-receipt.v2', config: path.relative(ROOT, configPath),
  sourceBindingMode: Boolean(workspaceRevision), workspaceRevision: receiptWorkspaceRevision,
  packetWorkspaceRevisions,
  packets_selected: packets.filter((packet) => packet.packet_key).length,
  source_bindings_selected: packets.filter((packet) => !packet.packet_key).length,
  files_resolved: filesResolved, files_unresolved: unresolved,
  unresolved_samples: unresolvedSamples, files_revision_qualified: revisionQualifiedFiles,
  files_revision_unqualified: revisionsUnqualified, unqualified_revision_samples: unqualifiedRevisionSamples,
  files_revision_mismatch: revisionMismatches, revision_mismatch_samples: revisionMismatchSamples,
  entity_candidates: rows.length, ast_grep: true,
  canonical_writes: false, symbol_registry_resolved: 0, canonical_entity_resolved: 0,
  coverage: {
    structural_entity: revisionQualifiedFiles / denominator,
    packet_identity: packetIdentityResolved / denominator,
    feature_identity: featureResolved / denominator,
    source_revision: revisionQualifiedFiles / denominator,
    symbol_registry: 0, domain: domainResolved / denominator,
    ontology: ontologyResolved / denominator, semantic_768: semanticResolved / denominator
  },
  output: outputPath
}, null, 2));
