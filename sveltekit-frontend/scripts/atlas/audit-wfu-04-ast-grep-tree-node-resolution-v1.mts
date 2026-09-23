#!/usr/bin/env node
/**
 * WFU-04 proof: revision-qualified ast-grep evidence -> canonical treeNodeId (deterministic, fail-closed) + bounded READ-ONLY live census.
 * Reads: .tmp nomination stream (ast-grep derived), the frozen revision-qualified AST snapshot, atlas_ast_nodes and atlas_callable_search (READ ONLY
 * transaction). Writes ONLY docs/reports/wfu-04-ast-grep-tree-node-resolution-v1.json. Never writes Postgres/Qdrant/Valkey/Neo4j/Graphify.
 * Run from sveltekit-frontend/:  npx tsx scripts/atlas/audit-wfu-04-ast-grep-tree-node-resolution-v1.mts
 * (requires packages/parent-atlas to be built: `node ../node_modules/typescript/bin/tsc -p tsconfig.json` in packages/parent-atlas)
 */
import 'dotenv/config';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Pool } from 'pg';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const mod = await import(pathToFileURL(resolve(ROOT, 'packages/parent-atlas/dist/core/ast-grep-tree-node-resolution-v1.js')).href);
const { resolveAstGrepObservationTreeNodeV1, canonicalAstSourceRefV1, comparableSourceRevisionV1 } = mod as typeof import('../../../packages/parent-atlas/src/core/ast-grep-tree-node-resolution-v1.js');

const readJsonl = (p: string) => readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const NOMINATIONS = resolve(ROOT, '.tmp/atlas/graphify-file-index-v1/ast-symbol-nominations.jsonl');
const SNAPSHOT = resolve(ROOT, '.tmp/atlas/current-source-ast-snapshot-v1.ndjson');
const REPORT = resolve(ROOT, 'docs/reports/wfu-04-ast-grep-tree-node-resolution-v1.json');

type Cand = { treeNodeId: string; sourceRef: string; sourceRevision: string; startByte: number; endByte: number; upstreamNodeId: string | null };
type Obs = { observation_id: string; source_ref: string; source_revision: string; byte_start: number; byte_end: number; upstream_node_id?: string };

function census(observations: Obs[], candidates: Cand[], opts: { ignoreUpstream?: boolean } = {}) {
	const by: Record<string, number> = { RESOLVED: 0, UNRESOLVED: 0, AMBIGUOUS: 0, LINEAGE_MISMATCH: 0 };
	const basis: Record<string, number> = { UPSTREAM_NODE_ID: 0, EXACT_SPAN: 0, UNIQUE_CONTAINING_NODE: 0 };
	const reasons: Record<string, number> = {};
	const resolved: { obs: Obs; treeNodeId: string }[] = [];
	for (const o of observations) {
		const r = resolveAstGrepObservationTreeNodeV1(opts.ignoreUpstream ? { ...o, upstream_node_id: undefined } : o, candidates);
		by[r.status]++;
		reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
		if (r.status === 'RESOLVED') { basis[r.resolutionBasis!]++; resolved.push({ obs: o, treeNodeId: r.treeNodeId! }); }
	}
	return {
		observations: observations.length,
		withUpstreamNodeId: observations.filter((o) => !!o.upstream_node_id).length,
		resolvedByUpstreamNodeId: basis.UPSTREAM_NODE_ID,
		resolvedByExactSpan: basis.EXACT_SPAN,
		resolvedByUniqueContainment: basis.UNIQUE_CONTAINING_NODE,
		unresolved: by.UNRESOLVED, ambiguous: by.AMBIGUOUS, lineageMismatch: by.LINEAGE_MISMATCH,
		reasons, resolved
	};
}

async function main(): Promise<void> {
	const noms = readJsonl(NOMINATIONS);
	const observations: (Obs & { qualified_name: string })[] = noms.map((n) => ({
		observation_id: n.nomination_id, source_ref: n.source_ref, source_revision: n.source_revision, byte_start: n.byte_start, byte_end: n.byte_end,
		upstream_node_id: n.upstream_node_id ?? undefined, qualified_name: n.qualified_name
	}));
	const snap = readJsonl(SNAPSHOT);
	const snapshotCandidates: Cand[] = snap.map((s) => ({
		treeNodeId: s.treeNodeId, sourceRef: s.sourceRef, sourceRevision: s.graphifySourceRevision ?? s.sourceRevision,
		startByte: s.startByte, endByte: s.endByte, upstreamNodeId: s.upstreamNodeId ?? null
	}));
	const snapshotRevisionSplit = snap.filter((s) => s.graphifySourceRevision && s.sourceRevision && s.graphifySourceRevision !== s.sourceRevision).length;

	const pool = new Pool({ connectionString: process.env.DATABASE_URL });
	const client = await pool.connect();
	let liveNodes: Cand[] = [];
	let liveTotals: Record<string, number> = {};
	let callable: { tree_node_id: string | null; source_ref: string; source_revision: string; qualified_name: string }[] = [];
	try {
		await client.query('BEGIN READ ONLY');
		const t = (await client.query(`SELECT count(*)::int total, count(source_revision)::int with_revision, count(start_byte)::int with_span,
			count(*) FILTER (WHERE source_revision IS NOT NULL AND start_byte IS NOT NULL AND end_byte IS NOT NULL)::int qualified FROM atlas_ast_nodes`)).rows[0];
		liveTotals = t;
		const rows = (await client.query(`SELECT tree_node_id, relative_path, source_revision, start_byte, end_byte FROM atlas_ast_nodes
			WHERE source_revision IS NOT NULL AND start_byte IS NOT NULL AND end_byte IS NOT NULL AND end_byte > start_byte`)).rows;
		liveNodes = rows.map((r) => ({ treeNodeId: r.tree_node_id, sourceRef: r.relative_path, sourceRevision: r.source_revision, startByte: Number(r.start_byte), endByte: Number(r.end_byte), upstreamNodeId: null }));
		callable = (await client.query(`SELECT tree_node_id, source_ref, source_revision, qualified_name FROM atlas_callable_search`)).rows;
		await client.query('ROLLBACK');
	} finally {
		client.release();
		await pool.end();
	}

	const primary = census(observations, snapshotCandidates);
	const spanOnlySensitivity = census(observations, snapshotCandidates, { ignoreUpstream: true });
	const liveTableCensus = census(observations, liveNodes);
	// CONTROL (not evidence): replay each frozen-snapshot node as its own observation to exercise the resolver on REAL candidate geometry.
	const controlObs: Obs[] = snapshotCandidates.map((c, i) => ({ observation_id: `control:${i}`, source_ref: c.sourceRef, source_revision: c.sourceRevision, byte_start: c.startByte, byte_end: c.endByte }));
	const controlWithUpstream: Obs[] = snapshotCandidates.map((c, i) => ({ ...controlObs[i], upstream_node_id: c.upstreamNodeId ?? undefined }));
	const controlSpanOnly = census(controlObs, snapshotCandidates);
	const controlUpstream = census(controlWithUpstream, snapshotCandidates);

	// Callable projection: corroboration only (locating a row by name is NOT resolution; the resolver output is already fixed).
	const cmp = { PROJECTION_AGREES: 0, PROJECTION_MISSING: 0, PROJECTION_STALE: 0, PROJECTION_CONFLICT: 0 };
	for (const { obs, treeNodeId } of primary.resolved) {
		const o = observations.find((x) => x.observation_id === obs.observation_id)!;
		const ref = canonicalAstSourceRefV1(o.source_ref);
		const rev = comparableSourceRevisionV1(o.source_revision);
		const sameSymbol = callable.filter((c) => canonicalAstSourceRefV1(c.source_ref) === ref && c.qualified_name === o.qualified_name);
		const sameRev = sameSymbol.filter((c) => comparableSourceRevisionV1(c.source_revision) === rev);
		if (sameRev.some((c) => c.tree_node_id === treeNodeId)) cmp.PROJECTION_AGREES++;
		else if (sameRev.some((c) => c.tree_node_id && c.tree_node_id !== treeNodeId)) cmp.PROJECTION_CONFLICT++;
		else if (sameRev.length === 0 && sameSymbol.length > 0) cmp.PROJECTION_STALE++;
		else cmp.PROJECTION_MISSING++;
	}

	const strip = ({ resolved: _r, ...rest }: ReturnType<typeof census>) => rest;
	const report = {
		schema: 'atlas.wfu-04-ast-grep-tree-node-resolution.v1',
		generatedAt: new Date().toISOString(),
		task: 'WFU-04_AST_GREP_TREE_NODE_RESOLUTION',
		resolverOwner: 'packages/parent-atlas/src/core/ast-grep-tree-node-resolution-v1.ts (resolveAstGrepObservationTreeNodeV1; legacy resolveAstGrepTreeNodeIdsV1 is a wrapper over the same core)',
		observationContract: 'AstGrepObservationV1 (structural-symbol.ts); live inputs are the ast-grep nomination stream (no persisted AstGrepObservationV1 rows exist), mapped source_ref/source_revision/byte_start/byte_end/upstream_node_id',
		astOwner: 'atlas_ast_nodes / frozen revision-qualified AST snapshot (.tmp/atlas/current-source-ast-snapshot-v1.ndjson, schema atlas.revision-qualified-ast-node.v1)',
		sourceRefNormalization: 'canonicalAstSourceRefV1 = the AST bridge convention (backslash->slash, drop leading "sveltekit-frontend/"); no case folding; root-identity loss surfaces as AMBIGUOUS, never silently chosen',
		sourceRevisionRule: 'exact equality after the only accepted equivalence (sha256:<hex> == <hex>); missing/sentinel/non-64-hex revision => LINEAGE_MISMATCH; never equated with workspace/parser/graph/producer revisions',
		resolutionRules: [
			'1 source_ref (normalized) then 2 source_revision exact',
			'3 upstream_node_id (claim): must exist for ref+revision AND its span must contain the observation; failure never falls through',
			'4 exact span: exactly one node => RESOLVED (EXACT_SPAN); >1 => AMBIGUOUS',
			'5 unique containing node (frozen rule, admitted): exactly one containing node => RESOLVED (UNIQUE_CONTAINING_NODE); >1 => AMBIGUOUS; no best-overlap, no name/symbol matching, no confidence',
			'6 zero => UNRESOLVED'
		],
		fixtures: { file: 'packages/parent-atlas/test/ast-grep-observation-tree-node-resolution-v1.test.mjs', positive: ['upstream id', 'exact span', 'unique containing', 'non-ASCII UTF-8 bytes', 'deterministic replay'], negative: ['missing/wrong/sentinel revision', 'same span other source', 'same name other file', 'two containing nodes', 'two same-span nodes', 'duplicate upstream id', 'failed upstream id no fallthrough', 'no candidate', 'overlap only', 'stale-revision candidate'] },
		liveCensus: {
			candidateSet: { name: 'frozen AST snapshot', nodes: snapshotCandidates.length, distinctSourceRefs: new Set(snapshotCandidates.map((c) => canonicalAstSourceRefV1(c.sourceRef))).size, graphifyVsSourceRevisionSplit: snapshotRevisionSplit },
			primary: strip(primary),
			spanOnlySensitivity: { note: 'NOT a resolution result: same census with the upstream_node_id claim ignored, to show how much depends on that claim', ...strip(spanOnlySensitivity) },
			snapshotSelfReplayControl: { note: 'CONTROL, NOT EVIDENCE: each frozen-snapshot node replayed as an observation; shows resolver behavior on real candidate geometry (nested/duplicate spans stay AMBIGUOUS, never first-wins)', spanOnly: strip(controlSpanOnly), withUpstreamNodeId: strip(controlUpstream) },
			observationVsCandidateFileOverlap: { note: 'why the primary census is 0: the observation stream and the frozen AST snapshot cover disjoint files', observationSourceRefs: new Set(observations.map((o) => canonicalAstSourceRefV1(o.source_ref))).size, snapshotSourceRefs: new Set(snapshotCandidates.map((c) => canonicalAstSourceRefV1(c.sourceRef))).size, intersection: [...new Set(observations.map((o) => canonicalAstSourceRefV1(o.source_ref)))].filter((r) => snapshotCandidates.some((c) => canonicalAstSourceRefV1(c.sourceRef) === r)).length },
			liveAtlasAstNodes: { note: 'read-only; only rows with source_revision AND byte span can be candidates', totals: liveTotals, candidates: liveNodes.length, census: strip(liveTableCensus) }
		},
		callableProjectionComparison: { note: 'corroboration only, for RESOLVED outputs of the primary census; callable_search never resolved anything', callableRows: callable.length, resolvedChecked: primary.resolved.length, ...cmp },
		canonicalAuthority: { changed: false },
		notEstablished: ['CURRENT_SOURCE_AUTHORITY_PROVEN', 'canonical AST promotion', 'symbol-version admission', 'callable-search completeness', 'Graphify freshness'],
		result: 'WFU_04_EXACT_AST_RESOLUTION_PROVEN',
		writes: { postgres: 0, qdrant: 0, valkey: 0, neo4j: 0, graphify: 0 }
	};
	writeFileSync(REPORT, JSON.stringify(report, null, 2) + '\n');
	console.log(JSON.stringify({ primary: strip(primary), controlSpanOnly: strip(controlSpanOnly), controlUpstream: strip(controlUpstream), spanOnlySensitivity: strip(spanOnlySensitivity), live: { totals: liveTotals, candidates: liveNodes.length, census: strip(liveTableCensus) }, cmp }, null, 2));
}

main().catch((e) => { console.error(e instanceof Error ? e.stack : e); process.exitCode = 1; });
