/**
 * YAML-driven, read-only Graphify -> ast-grep entity prefill.
 * No database, vector, graph, cache, or canonical entity writes.
 */
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deriveTreeNodeOccurrenceId } from './lib/tree-node-occurrence-v1.mjs';
import { buildAstEntityPrefillIdentityEnvelopeV1 } from './lib/ast-entity-identity-envelope-v1.mjs';
import { isSha256SourceRevisionV1, sourceBytesMatchRevisionV1 } from './lib/source-byte-revision-v1.mjs';
import { classifyAstPrefillDeclarationV1 } from './lib/ast-prefill-declaration-classification-v1.mjs';
import { resolveAstGrepExtractorRevisionV1 } from './lib/ast-grep-extractor-revision-v1.mjs';
import { ORF_AST_PREFILL_NODE_KIND_TO_SYMBOL_KIND_V1 } from './lib/orf-ast-kind-crosswalk-v1.mjs';
import { resolveSourceReadRootV1 } from './lib/source-read-root-v1.mjs';
import { resolveSourceRefPathV1 } from './lib/resolve-source-ref-path-v1.mjs';
import { matchExactSymbolVersionV1 } from './lib/match-exact-symbol-version-v1.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const configPath = path.resolve(ROOT, process.argv.find((a) => a.startsWith('--config='))?.slice(9) ?? '.okf/pipelines/ast-entity-prefill.yaml');
const all = process.argv.includes('--all');
const requestedLimit = Number(process.argv.find((a) => a.startsWith('--limit='))?.slice(8) ?? 100);
const limit = all ? 0 : Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : 100);
const workspaceRevision = process.argv.find((a) => a.startsWith('--workspace-revision='))?.slice(21) ?? null;
if (workspaceRevision && !/^sha256:[a-f0-9]{64}$/.test(workspaceRevision)) throw new Error('WORKSPACE_REVISION_INVALID');
const outputPath = path.resolve(ROOT, process.argv.find((a) => a.startsWith('--output='))?.slice(9) ?? 'docs/reports/ast-entity-prefill-graphify-v1.jsonl');
const admittedSnapshotMode = process.argv.includes('--admitted-snapshot');
const receiptPath = `${outputPath}.receipt.json`;
if (admittedSnapshotMode && !workspaceRevision) throw new Error('ADMITTED_SNAPSHOT_REQUIRES_WORKSPACE_REVISION');
if (admittedSnapshotMode && !process.argv.some((a) => a.startsWith('--output='))) throw new Error('ADMITTED_SNAPSHOT_REQUIRES_EXPLICIT_OUTPUT');
if (admittedSnapshotMode && (existsSync(outputPath) || existsSync(receiptPath))) throw new Error('ADMITTED_SNAPSHOT_OUTPUT_ALREADY_EXISTS');
const admission = admittedSnapshotMode
  ? JSON.parse(await fs.readFile(path.join(ROOT, 'docs/reports/workspace-revision-tournament-admission-v1.json'), 'utf8'))
  : null;
const snapshotDigest = String(admission?.snapshotRevision ?? '').replace(/^sha256:/, '');
const sourceRead = resolveSourceReadRootV1({
  repoRoot: ROOT,
  env: admittedSnapshotMode ? {
    ATLAS_GRAPHIFY_SOURCE_SNAPSHOT_ROOT: path.join(ROOT, '.tmp', 'workspace-source-snapshots', snapshotDigest),
  } : process.env,
  workspaceRevision,
  admission,
});
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
    const bindingSql = `WITH packet_matches AS (
        SELECT source_ref, source_revision, workspace_revision_key, COUNT(*)::int AS packet_match_count,
          CASE WHEN COUNT(*) = 1 THEN MIN(packet_key) END AS packet_key,
          CASE WHEN COUNT(*) = 1 THEN MIN(feature_id::text) END AS feature_id,
          CASE WHEN COUNT(*) = 1 THEN MIN(title_id::text) END AS title_id,
          CASE WHEN COUNT(*) = 1 THEN MIN(tree_node_id::text) END AS tree_node_id,
          CASE WHEN COUNT(*) = 1 THEN MIN(primary_domain) END AS primary_domain,
          CASE WHEN COUNT(*) = 1 THEN MIN(domain_class) END AS domain_class,
          CASE WHEN COUNT(*) = 1 THEN (array_agg(ontology))[1] END AS ontology,
          CASE WHEN COUNT(*) = 1 THEN (array_agg(packet_ontology))[1] END AS packet_ontology,
          CASE WHEN COUNT(*) = 1 THEN bool_or(source_dimension = 768 AND embedding IS NOT NULL) ELSE false END AS semantic_present
        FROM public.atlas_packets
        WHERE source_ref IS NOT NULL AND source_revision IS NOT NULL AND workspace_revision_key = ${workspaceRevisionSql}
        GROUP BY source_ref, source_revision, workspace_revision_key
      ), admitted_bindings AS (
        SELECT canonical_source_ref AS source_ref, source_revision, workspace_revision
        FROM public.atlas_workspace_source_bindings
        WHERE repo_id = 'deeds-web-app' AND workspace_revision = ${workspaceRevisionSql}
          AND canonical_source_ref IS NOT NULL AND canonical_source_ref <> ''${bindingSourceRefClause}
        ORDER BY canonical_source_ref${limit ? ` LIMIT ${limit}` : ''}
      )
      SELECT json_build_object(
        'packet_key', p.packet_key, 'source_ref', b.source_ref, 'feature_id', p.feature_id,
        'title_id', p.title_id, 'tree_node_id', p.tree_node_id, 'source_revision', b.source_revision,
        'workspace_revision', b.workspace_revision, 'primary_domain', p.primary_domain,
        'domain_class', p.domain_class, 'ontology', p.ontology, 'packet_ontology', p.packet_ontology,
        'semantic_present', COALESCE(p.semantic_present, false), 'packet_match_count', COALESCE(p.packet_match_count, 0)
      )
      FROM admitted_bindings b
      LEFT JOIN packet_matches p ON p.source_ref = b.source_ref
        AND p.source_revision = b.source_revision AND p.workspace_revision_key = b.workspace_revision
      ORDER BY b.source_ref;`;
    const raw = execFileSync('docker', ['exec', 'legal-ai-postgres', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'legal_admin', '-d', 'legal_ai_db', '-At', '-c', `BEGIN READ ONLY; ${bindingSql} ROLLBACK;`], { encoding: 'utf8', timeout: 30000, maxBuffer: 32 * 1024 * 1024 });
    return raw.trim().split(/\r?\n/).filter((line) => line.startsWith('{')).map((line) => {
      const packet = JSON.parse(line);
      packet.identity_status = packet.packet_match_count === 1
        ? 'PACKET_IDENTITY_EXACT_CANDIDATE'
        : packet.packet_match_count > 1 ? 'PACKET_IDENTITY_AMBIGUOUS' : 'SOURCE_ONLY_UNBOUND';
      return packet;
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

function querySymbolVersions(revision) {
  const sql = `SELECT json_build_object(
      'packet_key', packet_key, 'source_ref', source_ref, 'source_revision', source_revision,
      'workspace_revision', workspace_revision, 'symbol_version_id', symbol_version_id,
      'stable_symbol_id', stable_symbol_id, 'qualified_name', qualified_name,
      'byte_start', byte_start, 'byte_end', byte_end
    )
    FROM public.atlas_symbol_versions
    WHERE workspace_revision = '${revision}'
    ORDER BY packet_key, byte_start, symbol_version_id;`;
  const raw = execFileSync('docker', ['exec', 'legal-ai-postgres', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'legal_admin', '-d', 'legal_ai_db', '-At', '-c', `BEGIN READ ONLY; ${sql} ROLLBACK;`], { encoding: 'utf8', timeout: 30000, maxBuffer: 16 * 1024 * 1024 });
  return raw.trim().split(/\r?\n/).filter((line) => line.startsWith('{')).map((line) => JSON.parse(line));
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

function utf8Boundary(sourceBytes, offset) {
  if (!Number.isInteger(offset) || offset < 0 || offset > sourceBytes.length) return false;
  const prefix = sourceBytes.subarray(0, offset);
  return Buffer.from(prefix.toString('utf8'), 'utf8').equals(prefix);
}

function extract(text, file, packet) {
  const language = languageFor(file);
  if (!language) return [];
  const root = parse(language, text).root();
  const kinds = new Map(Object.entries(ORF_AST_PREFILL_NODE_KIND_TO_SYMBOL_KIND_V1));
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
        const resolvedPath = path.relative(ROOT, file).replaceAll('\\', '/');
        const occurrenceId = deriveTreeNodeOccurrenceId({
          sourceRef: packet.source_ref, sourceRevision: packet.source_revision ?? '',
          nodeType: node.kind(), startByte, endByte,
        });
        rows.push({
          schema: 'atlas.ast-entity-prefill-row.v2',
          ...buildAstEntityPrefillIdentityEnvelopeV1(packet, occurrenceId),
          resolved_path: packet.resolved_path ?? resolvedPath,
          language: path.extname(file).toLowerCase().replace('.', ''),
          symbol_name: declaration.symbolName, symbol_kind: declaration.symbolKind,
          entity_kind: declaration.symbolKind,
          entity_id: packet.packet_key ? `${packet.packet_key}#${declaration.symbolKind}:${declaration.symbolName}` : null,
          name: declaration.symbolName, signature, ast_kind: node.kind(),
          start_byte: startByte,
          end_byte: endByte,
          start_line: range.start.line + 1, start_column: range.start.column,
          end_line: range.end.line + 1, end_column: range.end.column,
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
const files = execFileSync('rg', ['--files', '--hidden', '--no-ignore', '-g', '!**/node_modules/**', '-g', '!.git/**', '-g', '!.gemini/**', '-g', '!.codex/**', '-g', '!.claude/**', '-g', '!.opencode/**'], { cwd: sourceRead.root, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 }).split(/\r?\n/).filter(Boolean);
const index = new Map(files.map((relative) => [relative.replaceAll('\\', '/'), path.resolve(sourceRead.root, relative)]));
const packets = queryPackets();
const symbolVersions = admittedSnapshotMode ? querySymbolVersions(workspaceRevision) : [];
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
  const file = resolveSourceRefPathV1(sourceRead.root, packet.source_ref, index);
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
  const extracted = extract(sourceBytes.toString('utf8'), file, {
    ...packet,
    resolved_path: admittedSnapshotMode ? packet.source_ref : path.relative(ROOT, file).replaceAll('\\', '/'),
  });
  for (const row of extracted) {
    if (row.source_ref !== packet.source_ref || row.source_revision !== packet.source_revision
      || !utf8Boundary(sourceBytes, row.start_byte) || !utf8Boundary(sourceBytes, row.end_byte)
      || row.end_byte <= row.start_byte) {
      throw new Error(`AST_PREFILL_ROW_LINEAGE_OR_SPAN_INVALID:${packet.source_ref}`);
    }
  }
  rows.push(...extracted);
}
for (const row of rows) {
  const match = matchExactSymbolVersionV1(row, symbolVersions);
  row.symbol_match_status = match.status;
  row.canonical_symbol_id = match.canonicalSymbolId;
  row.symbol_version_id = match.symbolVersionId;
}
await fs.mkdir(path.dirname(outputPath), { recursive: true });
const outputText = rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : '');
await fs.writeFile(outputPath, outputText, {
  encoding: 'utf8',
  flag: admittedSnapshotMode ? 'wx' : 'w',
});
const sourceBindingRows = packets.map(({ source_ref: sourceRef, source_revision: sourceRevision }) => ({ sourceRef, sourceRevision }));
const sourceBindingChecksum = createHash('sha256').update(JSON.stringify(sourceBindingRows)).digest('hex');
const outputChecksum = createHash('sha256').update(outputText, 'utf8').digest('hex');
const packetIdentityResolved = packets.filter((packet) => packet.packet_key && packet.source_ref).length;
const featureResolved = packets.filter((packet) => packet.feature_id).length;
const domainResolved = packets.filter((packet) => packet.primary_domain || packet.domain_class).length;
const ontologyResolved = packets.filter((packet) => packet.ontology || packet.packet_ontology).length;
const semanticResolved = packets.filter((packet) => packet.semantic_present).length;
const denominator = packets.length || 1;
const packetWorkspaceRevisions = [...new Set(packets.map((packet) => packet.workspace_revision).filter(Boolean))].sort();
const receiptWorkspaceRevision = workspaceRevision
  ?? (packetWorkspaceRevisions.length === 1 ? packetWorkspaceRevisions[0] : null);
const receipt = {
  schema: 'atlas.ast-entity-prefill-graphify-receipt.v2', config: path.relative(ROOT, configPath),
  sourceBindingMode: Boolean(workspaceRevision), workspaceRevision: receiptWorkspaceRevision,
  sourceReadMode: sourceRead.mode, sourceReadSnapshotRevision: sourceRead.snapshotRevision,
  canonicalAuthority: false, datastoreWrites: false, projectionWrites: false,
  sourceBindingCount: sourceBindingRows.length, sourceBindingChecksum,
  parser: 'ast-grep-napi', parserRevision: astGrepExtractorRevision,
  prefillPipelineRevision: astPrefillPipelineRevision,
  outputRowCount: rows.length, outputChecksum: `sha256:${outputChecksum}`,
  packetWorkspaceRevisions,
  packets_selected: packets.filter((packet) => packet.packet_key).length,
  source_bindings_selected: packets.filter((packet) => !packet.packet_key).length,
  ambiguous_packet_bindings: packets.filter((packet) => packet.packet_match_count > 1).length,
  files_resolved: filesResolved, files_unresolved: unresolved,
  unresolved_samples: unresolvedSamples, files_revision_qualified: revisionQualifiedFiles,
  files_revision_unqualified: revisionsUnqualified, unqualified_revision_samples: unqualifiedRevisionSamples,
  files_revision_mismatch: revisionMismatches, revision_mismatch_samples: revisionMismatchSamples,
  entity_candidates: rows.length, ast_grep: true,
  canonical_writes: false,
  symbol_registry_resolved: rows.filter((row) => row.symbol_version_id).length,
  canonical_entity_resolved: rows.filter((row) => row.canonical_symbol_id).length,
  symbol_match_status_counts: Object.fromEntries([...new Set(rows.map((row) => row.symbol_match_status))]
    .sort().map((status) => [status, rows.filter((row) => row.symbol_match_status === status).length])),
  coverage: {
    structural_entity: revisionQualifiedFiles / denominator,
    packet_identity: packetIdentityResolved / denominator,
    feature_identity: featureResolved / denominator,
    source_revision: revisionQualifiedFiles / denominator,
    symbol_registry: rows.filter((row) => row.symbol_version_id).length / (rows.length || 1), domain: domainResolved / denominator,
    ontology: ontologyResolved / denominator, semantic_768: semanticResolved / denominator
  },
  output: outputPath
};
if (admittedSnapshotMode) {
  await fs.writeFile(receiptPath, `${JSON.stringify({ ...receipt, receiptPath }, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
}
console.log(JSON.stringify({ ...receipt, receiptPath: admittedSnapshotMode ? receiptPath : null }, null, 2));
