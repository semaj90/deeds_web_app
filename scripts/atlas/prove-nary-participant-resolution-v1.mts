#!/usr/bin/env npx tsx
/**
 * prove-nary-participant-resolution-v1.mts  (NARY-PARTICIPANT-RESOLUTION-01, READ-ONLY)
 *
 * Traces ONE real SvelteKit API route through the existing authoritative owners and writes a
 * deterministic qualification receipt. It never writes to any store and never converts a literal
 * (route path, schema name, auth call) into a canonical id: a participant resolves only through a
 * live canonical owner row (atlas_ast_nodes / atlas_packets); everything else is a diagnostic.
 *
 * Reused owners: graph/participant-resolver-v1.ts (resolveParticipantObservationsV1),
 * language/api-contract-observation-v1.ts + graph/api-contract-nary-proposal-v1.ts (not invoked when
 * no grounded observation exists, and the receipt says so).
 *
 * Usage: npx tsx scripts/atlas/prove-nary-participant-resolution-v1.mts [src/routes/.../+server.ts]
 * Output: .tmp/atlas/nary-participant-resolution-receipt-v1.json
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import {
  resolveParticipantObservationsV1,
  type CanonicalParticipantOwnerV1,
  type ParticipantObservationV1,
} from '../../sveltekit-frontend/src/lib/server/atlas/graph/participant-resolver-v1.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const frontendRoot = path.join(repoRoot, 'sveltekit-frontend');
const routeRel = (process.argv[2] ?? 'src/routes/api/ace/summarize/+server.ts').replace(/\\/g, '/');
if (!/^src\/routes\/[A-Za-z0-9_.\-/()[\]+]+\/\+server\.ts$/.test(routeRel) || routeRel.includes('..')) {
  throw new Error(`REFUSING: not a frontend-relative +server.ts route path: ${routeRel}`);
}

type Span = { startByte: number; endByte: number; method: 'REGEX_BYTE_SCAN'; structural: false };
function scan(bytes: Buffer, re: RegExp): Array<{ match: string; span: Span; groups: Record<string, string> }> {
  const text = bytes.toString('utf8');
  const out: Array<{ match: string; span: Span; groups: Record<string, string> }> = [];
  for (const m of text.matchAll(re)) {
    const startByte = Buffer.byteLength(text.slice(0, m.index!), 'utf8');
    out.push({
      match: m[0],
      span: { startByte, endByte: startByte + Buffer.byteLength(m[0], 'utf8'), method: 'REGEX_BYTE_SCAN', structural: false },
      groups: { ...(m.groups ?? {}) },
    });
  }
  return out;
}

async function main() {
  const abs = path.join(frontendRoot, routeRel);
  const bytes = fs.readFileSync(abs);
  const diskSha = crypto.createHash('sha256').update(bytes).digest('hex');
  const sourceRevision = `sha256:${diskSha}`;

  // ---- textual participant mentions (exact byte spans, but NOT structural proof) ------------
  const handlers = scan(bytes, /export\s+(?:const|async\s+function|function)\s+(?<name>GET|POST|PUT|PATCH|DELETE)\b/g);
  const schemas = scan(bytes, /(?:const|let)\s+(?<name>\w+)\s*=\s*z\.(?:object|strictObject)\(/g);
  const auth = scan(bytes, /\b(?<name>requireAdmin|requireAuth)\s*\(/g);
  const userGuard = scan(bytes, /locals\.user\b/g);
  const imports = scan(bytes, /import\s+\{[^}]*\b(?<names>requireAdmin|requireAuth)\b[^}]*\}\s+from\s+'(?<from>[^']+)'/g);

  // ---- live canonical owners (read-only transaction) ---------------------------------------
  const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1 });
  const client = await pool.connect();
  let astRows: Array<Record<string, unknown>> = [];
  let packetRows: Array<Record<string, unknown>> = [];
  let authDefRows: Array<Record<string, unknown>> = [];
  try {
    await client.query('BEGIN READ ONLY');
    astRows = (await client.query(
      `SELECT tree_node_id, node_kind, qualified_symbol, start_byte, end_byte, source_revision, workspace_id,
              source_content_hash, parser_name, parser_language
         FROM public.atlas_ast_nodes WHERE relative_path = $1 ORDER BY node_kind, qualified_symbol`, [routeRel])).rows;
    packetRows = (await client.query(
      `SELECT packet_key, source_ref FROM public.atlas_packets WHERE source_ref = ANY($1) ORDER BY packet_key`,
      [[routeRel, `sveltekit-frontend/${routeRel}`]])).rows;
    const authName = auth[0]?.groups.name;
    if (authName) {
      authDefRows = (await client.query(
        `SELECT tree_node_id, node_kind, qualified_symbol, relative_path, start_byte, end_byte, source_revision, source_content_hash
           FROM public.atlas_ast_nodes WHERE qualified_symbol = $1 AND relative_path LIKE 'src/lib/server/%' ORDER BY relative_path`, [authName])).rows;
    }
    await client.query('ROLLBACK');
  } finally {
    client.release();
    await pool.end();
  }

  // ---- owners come ONLY from live rows -----------------------------------------------------
  const owners: CanonicalParticipantOwnerV1[] = [
    ...astRows.map((r) => ({
      canonicalId: String(r.tree_node_id), entityType: 'ast_node', sourceRef: routeRel,
      ...(r.source_revision ? { entityRevision: String(r.source_revision) } : {}),
    })),
    ...authDefRows.map((r) => ({
      canonicalId: String(r.tree_node_id), entityType: 'ast_node', sourceRef: String(r.relative_path),
      ...(r.source_revision ? { entityRevision: String(r.source_revision) } : {}),
    })),
    ...packetRows.map((r) => ({ canonicalId: String(r.packet_key), entityType: 'packet', sourceRef: String(r.source_ref) })),
  ];

  const handlerName = handlers[0]?.groups.name;
  const handlerRow = astRows.find((r) => r.node_kind === 'route' && r.qualified_symbol === handlerName);
  const fileRow = astRows.find((r) => r.node_kind === 'file');
  const authDef = authDefRows.length === 1 ? authDefRows[0] : null; // 0 or >1 definitions: never pick one
  const schemaRow = astRows.find((r) => schemas[0] && r.qualified_symbol === schemas[0].groups.name);

  const obs = (revision: string | null): ParticipantObservationV1[] => [
    { field: 'route', role: 'ROUTE', entityType: 'ast_node', canonicalId: fileRow ? String(fileRow.tree_node_id) : null,
      entityRevision: revision, sourceRef: routeRel, evidenceRefs: [`${routeRel}#file`], literalValue: routeRel },
    { field: 'handler', role: 'HANDLER', entityType: 'ast_node', canonicalId: handlerRow ? String(handlerRow.tree_node_id) : null,
      entityRevision: revision, sourceRef: routeRel,
      evidenceRefs: handlers[0] ? [`${routeRel}#bytes=${handlers[0].span.startByte}-${handlers[0].span.endByte}`] : [], literalValue: handlerName ?? null },
    { field: 'inputSchema', role: 'INPUT_SCHEMA', entityType: 'ast_node', canonicalId: schemaRow ? String(schemaRow.tree_node_id) : null,
      entityRevision: revision, sourceRef: routeRel,
      evidenceRefs: schemas[0] ? [`${routeRel}#bytes=${schemas[0].span.startByte}-${schemas[0].span.endByte}`] : [], literalValue: schemas[0]?.groups.name ?? null },
    { field: 'auth', role: 'AUTH_REQUIREMENT', entityType: 'ast_node', canonicalId: authDef ? String(authDef.tree_node_id) : null,
      entityRevision: revision, sourceRef: authDef ? String(authDef.relative_path) : null,
      evidenceRefs: auth[0] ? [`${routeRel}#bytes=${auth[0].span.startByte}-${auth[0].span.endByte}`] : [], literalValue: auth[0]?.groups.name ?? null },
  ];
  const identityOnly = resolveParticipantObservationsV1(obs(null), owners);
  const revisionQualified = resolveParticipantObservationsV1(obs(sourceRevision), owners);

  const nodeCount = astRows.length;
  const nullSpan = astRows.filter((r) => r.start_byte == null || r.end_byte == null).length;
  const nullRevision = astRows.filter((r) => r.source_revision == null).length;
  const nullWorkspace = astRows.filter((r) => r.workspace_id == null).length;
  const contentHashes = [...new Set(astRows.map((r) => String(r.source_content_hash)))];
  const blockers = [
    ...(nodeCount === 0 ? ['NO_AST_NODES_FOR_ROUTE'] : []),
    ...(nullSpan > 0 ? [`AST_NODES_WITHOUT_BYTE_SPAN:${nullSpan}/${nodeCount}`] : []),
    ...(nullRevision > 0 ? [`AST_NODES_WITHOUT_SOURCE_REVISION:${nullRevision}/${nodeCount}`] : []),
    ...(nullWorkspace > 0 ? [`AST_NODES_WITHOUT_WORKSPACE_ID:${nullWorkspace}/${nodeCount}`] : []),
    ...(packetRows.length === 0 ? ['NO_PACKET_FOR_ROUTE_SOURCE_REF'] : []),
    ...identityOnly.resolutions.filter((x) => x.status !== 'RESOLVED').map((x) => `PARTICIPANT_${x.field.toUpperCase()}_${x.status}:${x.reasonCode}`),
    ...(authDefRows.length === 0 && auth[0] ? ['AUTH_DEFINITION_NOT_IN_AST_INDEX'] : []),
    ...(authDefRows.length > 1 ? [`AUTH_DEFINITION_AMBIGUOUS:${authDefRows.length}`] : []),
    'NO_GROUNDED_API_CONTRACT_OBSERVATION: observeSvelteKitHttpContractV1 needs an AstGrepStructuralCandidateV1 (treeNodeId, symbolVersionId, revisions, byte span); none can be built from this index',
  ];
  const receipt = {
    schema: 'atlas.nary-participant-resolution-receipt.v1',
    task: 'NARY-PARTICIPANT-RESOLUTION-01',
    mode: 'READ_ONLY',
    writesPerformed: false,
    canonicalAuthority: false,
    route: { path: routeRel, bytes: bytes.length, sourceRevision },
    textualMentions: {
      note: 'exact byte spans from a regex scan; NOT structural proof and never used to mint ids',
      handler: handlers.map((h) => ({ name: h.groups.name, ...h.span })),
      inputSchema: schemas.map((s) => ({ name: s.groups.name, ...s.span })),
      auth: auth.map((a) => ({ name: a.groups.name, ...a.span })),
      userGuard: userGuard.length,
      authImportFrom: imports[0]?.groups.from ?? null,
    },
    liveOwners: {
      astNodes: astRows.map((r) => ({ kind: r.node_kind, symbol: r.qualified_symbol, treeNodeId: r.tree_node_id, startByte: r.start_byte, endByte: r.end_byte, sourceRevision: r.source_revision })),
      astContentHashes: contentHashes,
      astContentHashMatchesDiskSha256: contentHashes.some((h) => h === diskSha || h === sourceRevision),
      packets: packetRows,
      authDefinitions: authDefRows.map((r) => ({ path: r.relative_path, kind: r.node_kind, treeNodeId: r.tree_node_id })),
    },
    resolution: {
      identityOnly: { status: identityOnly.status, resolutions: identityOnly.resolutions.map((x) => ({ field: x.field, status: x.status, reason: x.reasonCode, canonicalId: x.canonicalId ?? null, literal: x.literalValue ?? null })) },
      revisionQualified: { status: revisionQualified.status, resolutions: revisionQualified.resolutions.map((x) => ({ field: x.field, status: x.status, reason: x.reasonCode })) },
    },
    proposal: null,
    admissible: false,
    blockers,
  };
  const out = path.join(repoRoot, '.tmp/atlas/nary-participant-resolution-receipt-v1.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({
    route: routeRel, sourceRevision,
    identityOnly: identityOnly.resolutions.map((x) => `${x.field}=${x.status}(${x.reasonCode})`),
    revisionQualified: revisionQualified.status,
    astNodes: nodeCount, nullSpan, nullRevision, packets: packetRows.length, authDefinitions: authDefRows.length,
    admissible: false, blockers,
  }, null, 2));
  console.log(`RECEIPT ${path.relative(repoRoot, out)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
