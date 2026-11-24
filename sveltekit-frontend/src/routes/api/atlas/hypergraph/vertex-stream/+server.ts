import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { pool } from '$lib/server/db/client.js';
import {
	HYPERGRAPH_VERTEX_STRIDE_BYTES,
	HYPERGRAPH_VERTEX_STRIDE_FLOATS,
} from '$lib/gpu/hypergraph-vertex-stream-v2.js';
import type { RequestHandler } from './$types';

const VertexInputSchema = z.object({
	worldX: z.number().finite(),
	worldY: z.number().finite(),
	manifoldZ: z.number().finite(),
	manifoldW: z.number().min(0).max(1),
	tileU: z.number().finite().default(0),
	tileV: z.number().finite().default(0),
	featureBitmask: z.number().int().nonnegative().default(0x1b),
	charProgress: z.number().min(0).max(1).default(1),
});

type VertexInput = z.infer<typeof VertexInputSchema>;

function packVerticesToBuffer(vertices: readonly VertexInput[]): ArrayBuffer {
	const buffer = new ArrayBuffer(vertices.length * HYPERGRAPH_VERTEX_STRIDE_BYTES);
	const view = new DataView(buffer);
	for (let i = 0; i < vertices.length; i++) {
		const v = vertices[i];
		const base = i * HYPERGRAPH_VERTEX_STRIDE_BYTES;
		view.setFloat32(base + 0, v.worldX, true);
		view.setFloat32(base + 4, v.worldY, true);
		view.setFloat32(base + 8, v.manifoldZ, true);
		view.setFloat32(base + 12, v.manifoldW, true);
		view.setFloat32(base + 16, v.tileU, true);
		view.setFloat32(base + 20, v.tileV, true);
		// Bytes 24..27 are raw uint32-le (never float32) to prevent NaN bit-pattern corruption in WGSL u32.
		view.setUint32(base + 24, v.featureBitmask >>> 0, true);
		view.setFloat32(base + 28, v.charProgress, true);
	}
	return buffer;
}

const PostVertexStreamRequestSchema = z.object({
	workspaceRevision: z.string().min(1).default('74ac7d8983e'),
	vertices: z.array(VertexInputSchema).min(1).max(4096),
});

/**
 * GET /api/atlas/hypergraph/vertex-stream
 * Returns stable JSON contract metadata, or streams PG18 atlas_topology_features
 * as 32-byte little-endian binary vertices when `?source=pg18` is passed.
 */
export const GET: RequestHandler = async ({ url }) => {
	if (url.searchParams.get('source') === 'pg18') {
		const rawLimit = Number(url.searchParams.get('limit') ?? 128);
		const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(512, Math.trunc(rawLimit))) : 128;
		try {
			const { rows } = await pool.query<{
				som_col: number | null;
				som_row: number | null;
				pagerank_score: number | null;
				karpathy_blend: number | null;
				kmeans_cluster: number | null;
				graph_degree: number | null;
			}>(
				`SELECT som_col, som_row, pagerank_score, karpathy_blend, kmeans_cluster, graph_degree
				 FROM atlas_topology_features
				 ORDER BY id ASC
				 LIMIT $1`,
				[limit]
			);
			const vertices: VertexInput[] = rows.map((r) => {
				const rawW = Number(r.karpathy_blend ?? 0.5);
				const manifoldW = Number.isFinite(rawW) ? Math.max(0, Math.min(1, rawW)) : 0.5;
				return {
					worldX: Number(r.som_col ?? 0),
					worldY: Number(r.som_row ?? 0),
					manifoldZ: Number(r.pagerank_score ?? 0),
					manifoldW,
					tileU: Number(r.kmeans_cluster ?? 0) / 64,
					tileV: Number(r.graph_degree ?? 0) / 64,
					featureBitmask: (r.graph_degree ?? 0) > 0 ? 0x1b : 0x03,
					charProgress: 1,
				};
			});
			const buffer = packVerticesToBuffer(vertices);
			return new Response(buffer, {
				status: 200,
				headers: {
					'Content-Type': 'application/octet-stream',
					'X-Vertex-Stride-Bytes': String(HYPERGRAPH_VERTEX_STRIDE_BYTES),
					'X-Vertex-Count': String(vertices.length),
					'X-Source': 'pg18:atlas_topology_features',
					'X-Canonical-Authority': 'false',
				},
			});
		} catch {
			return new Response(new ArrayBuffer(0), {
				status: 200,
				headers: {
					'Content-Type': 'application/octet-stream',
					'X-Vertex-Stride-Bytes': String(HYPERGRAPH_VERTEX_STRIDE_BYTES),
					'X-Vertex-Count': '0',
					'X-Degraded': 'true',
					'X-Canonical-Authority': 'false',
				},
			});
		}
	}

	return json({
		schema: 'atlas.hypergraph-vertex-stream.v2',
		strideBytes: HYPERGRAPH_VERTEX_STRIDE_BYTES,
		floatsPerVertex: HYPERGRAPH_VERTEX_STRIDE_FLOATS,
		fields: [
			'worldX',
			'worldY',
			'manifoldZ',
			'manifoldW',
			'tileU',
			'tileV',
			'featureBitmask',
			'charProgress',
		],
		canonicalAuthority: false,
		writesPerformed: false,
		nextSteps: [
			'Wire POST handler to Python pack_vertex_stream_for_web_worker_v2 on admitted PG18 snapshots.',
			'Connect browser caller via streamHypergraphVerticesToWorker() in WebGPUTopologyRenderer.svelte.',
		],
	});
};

/**
 * POST /api/atlas/hypergraph/vertex-stream
 * Packs validated 4D/Mode-7 vertices into 32-byte little-endian Float32 binary stream
 * matching `python/atlas_external_doc_hypergraph_v2.py::pack_vertex_stream_for_web_worker_v2`.
 *
 * NEXT STEP:
 *   Add a `snapshotChecksum` mode that queries admitted PG18 hyperedges and runs
 *   `pg18_arrow_ipc_roundtrip_v1.py` -> `pack_vertex_stream_for_web_worker_v2`.
 */
export const POST: RequestHandler = async ({ request }) => {
	let rawBody: unknown;
	try {
		rawBody = await request.json();
	} catch {
		return json({ error: 'INVALID_JSON_PAYLOAD' }, { status: 400 });
	}

	const parsed = PostVertexStreamRequestSchema.safeParse(rawBody);
	if (!parsed.success) {
		return json(
			{ error: 'VERTEX_STREAM_VALIDATION_FAILED', issues: parsed.error.issues },
			{ status: 400 }
		);
	}

	const { vertices, workspaceRevision } = parsed.data;
	const buffer = packVerticesToBuffer(vertices);

	return new Response(buffer, {
		status: 200,
		headers: {
			'Content-Type': 'application/octet-stream',
			'X-Vertex-Stride-Bytes': String(HYPERGRAPH_VERTEX_STRIDE_BYTES),
			'X-Vertex-Count': String(vertices.length),
			'X-Workspace-Revision': workspaceRevision,
			'X-Canonical-Authority': 'false',
		},
	});
};
