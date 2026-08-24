/**
 * YAML-driven, read-only Graphify -> ast-grep entity prefill.
 * No database, vector, graph, cache, or canonical entity writes.
 */
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const configPath = path.resolve(ROOT, process.argv.find((a) => a.startsWith('--config='))?.slice(9) ?? '.okf/pipelines/ast-entity-prefill.yaml');
const all = process.argv.includes('--all');
const requestedLimit = Number(process.argv.find((a) => a.startsWith('--limit='))?.slice(8) ?? 100);
const limit = all ? 0 : Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : 100);
const outputPath = path.resolve(ROOT, process.argv.find((a) => a.startsWith('--output='))?.slice(9) ?? 'docs/reports/ast-entity-prefill-graphify-v1.jsonl');
const { parse: parseYaml } = await import('yaml');
const { Lang, parse } = await import(pathToFileURL(path.join(ROOT, 'sveltekit-frontend/node_modules/@ast-grep/napi/index.js')).href);

const config = parseYaml(await fs.readFile(configPath, 'utf8'));
if (config?.schema !== 'atlas.ast-entity-prefill-pipeline.v1') throw new Error('invalid AST entity prefill YAML schema');
if (config.extraction?.engine !== 'ast-grep-napi') throw new Error('YAML must select ast-grep-napi');
if (config.embedding?.representation !== 'semantic_768' || config.embedding?.normalization !== 'L2_VECTOR') throw new Error('YAML embedding contract must remain semantic_768/L2_VECTOR');

function queryPackets() {
  const sql = `SELECT packet_key, source_ref, feature_id, title_id, tree_node_id,
    COALESCE(NULLIF(content_hash, ''), NULLIF(sha256, ''), CASE WHEN workspace_revision IS NOT NULL THEN 'workspace:' || workspace_revision::text END) AS source_revision,
    primary_domain, domain_class, ontology, packet_ontology,
    CASE WHEN source_dimension = 768 AND embedding IS NOT NULL THEN true ELSE false END AS semantic_present
    FROM atlas_packets
    WHERE source_kind = 'codebase_chunk' AND source_ref IS NOT NULL
      AND source_ref !~ '^(null|undefined|\\s*)$'
    ORDER BY source_ref, packet_key${limit ? ` LIMIT ${limit}` : ''};`;
  const raw = execFileSync('docker', ['exec', 'legal-ai-postgres', 'psql', '-U', 'legal_admin', '-d', 'legal_ai_db', '-At', '-F', '|', '-c', sql], { encoding: 'utf8', timeout: 30000 });
  return raw.trim().split(/\r?\n/).filter(Boolean).map((line) => {
    const [packet_key, source_ref, feature_id, title_id, tree_node_id, source_revision, primary_domain, domain_class, ontology, packet_ontology, semantic_present] = line.split('|');
    return {
      packet_key, source_ref, feature_id: feature_id || null, title_id: title_id || null,
      tree_node_id: tree_node_id || null, source_revision: source_revision || null,
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
      const name = node.children().find((child) => ['identifier', 'type_identifier', 'property_identifier', 'private_property_identifier', 'destructuring_pattern'].includes(child.kind()));
      if (name) {
        const range = node.range();
        const signature = node.text().split('{', 1)[0].trim().slice(0, 512);
        rows.push({
          schema: 'atlas.ast-entity-prefill-row.v2', ...packet,
          resolved_path: path.relative(ROOT, file).replaceAll('\\', '/'),
          language: path.extname(file).toLowerCase().replace('.', ''),
          symbol_name: name.text(), symbol_kind: entityKind,
          entity_kind: entityKind, entity_id: `${packet.packet_key}#${entityKind}:${name.text()}`,
          name: name.text(), signature, ast_kind: node.kind(),
          start_byte: utf8ByteOffset(text, range.start.index),
          end_byte: utf8ByteOffset(text, range.end.index),
          start_line: range.start.line + 1, start_column: range.start.column,
          end_line: range.end.line + 1, end_column: range.end.column,
          extractor: 'ast-grep', extractor_revision: 'ast-grep-napi-graphify-yaml-v2',
          identity_status: 'CANDIDATE', canonical_symbol_id: null, symbol_version_id: null,
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

const files = execFileSync('rg', ['--files', '--hidden', '--no-ignore', '-g', '!**/node_modules/**', '-g', '!.git/**', '-g', '!.gemini/**', '-g', '!.codex/**', '-g', '!.claude/**', '-g', '!.opencode/**'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).split(/\r?\n/).filter(Boolean);
const index = new Map(files.map((relative) => [relative.replaceAll('\\', '/'), path.resolve(ROOT, relative)]));
const packets = queryPackets();
const rows = [];
let unresolved = 0;
let filesResolved = 0;
const unresolvedSamples = [];
for (const packet of packets) {
  const file = resolveFile(packet.source_ref, index);
  if (!file) { unresolved += 1; if (unresolvedSamples.length < 10) unresolvedSamples.push(packet.source_ref); continue; }
  filesResolved += 1;
  rows.push(...extract(await fs.readFile(file, 'utf8'), file, { ...packet, resolved_path: path.relative(ROOT, file).replaceAll('\\', '/') }));
}
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''), 'utf8');
const packetIdentityResolved = packets.filter((packet) => packet.packet_key && packet.source_ref).length;
const featureResolved = packets.filter((packet) => packet.feature_id).length;
const revisionResolved = packets.filter((packet) => packet.source_revision).length;
const domainResolved = packets.filter((packet) => packet.primary_domain || packet.domain_class).length;
const ontologyResolved = packets.filter((packet) => packet.ontology || packet.packet_ontology).length;
const semanticResolved = packets.filter((packet) => packet.semantic_present).length;
const denominator = packets.length || 1;
console.log(JSON.stringify({
  schema: 'atlas.ast-entity-prefill-graphify-receipt.v2', config: path.relative(ROOT, configPath),
  packets_selected: packets.length, files_resolved: filesResolved, files_unresolved: unresolved,
  unresolved_samples: unresolvedSamples, entity_candidates: rows.length, ast_grep: true,
  canonical_writes: false, symbol_registry_resolved: 0, canonical_entity_resolved: 0,
  coverage: {
    structural_entity: filesResolved / denominator,
    packet_identity: packetIdentityResolved / denominator,
    feature_identity: featureResolved / denominator,
    source_revision: revisionResolved / denominator,
    symbol_registry: 0, domain: domainResolved / denominator,
    ontology: ontologyResolved / denominator, semantic_768: semanticResolved / denominator
  },
  output: outputPath
}, null, 2));
