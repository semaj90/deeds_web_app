import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';

const nodeSchema = z.object({
	id: z.string(),
	x: z.number(),
	y: z.number(),
	label: z.string().optional(),
	type: z.string().optional()
});

const connectionSchema = z.object({
	id: z.string(),
	fromNodeId: z.string().optional(),
	toNodeId: z.string().optional(),
	source: z.string().optional(),
	target: z.string().optional()
});

const magnetizeSchema = z.object({
	nodes: z.array(nodeSchema).max(500),
	connections: z.array(connectionSchema).max(2000),
	caseId: z.string().uuid().optional()
});

/**
 * POST /api/evidence/ai/magnetize — Compute force-directed layout forces for evidence board nodes.
 * Uses spring-embedder physics: connected nodes attract, unconnected nodes repel.
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const raw = await request.json();
		const parsed = magnetizeSchema.safeParse(raw);
		if (!parsed.success) {
			return json(
				{ message: parsed.error.issues[0]?.message ?? 'Invalid input' },
				{ status: 400 }
			);
		}

		const { nodes, connections } = parsed.data;
		if (nodes.length === 0) {
			return json({ forces: [] });
		}

		// Build adjacency set for O(1) connection lookup
		const adjacency = new Set<string>();
		for (const conn of connections) {
			const from = conn.fromNodeId || conn.source || '';
			const to = conn.toNodeId || conn.target || '';
			if (from && to) {
				adjacency.add(`${from}:${to}`);
				adjacency.add(`${to}:${from}`);
			}
		}

		const REPULSION = 5000;
		const ATTRACTION = 0.01;
		const MAX_FORCE = 30;

		const forces = nodes.map((node) => {
			let dx = 0;
			let dy = 0;

			for (const other of nodes) {
				if (other.id === node.id) continue;

				const diffX = node.x - other.x;
				const diffY = node.y - other.y;
				const dist = Math.sqrt(diffX * diffX + diffY * diffY) || 1;

				// Repulsion (Coulomb's law)
				const repForce = REPULSION / (dist * dist);
				dx += (diffX / dist) * repForce;
				dy += (diffY / dist) * repForce;

				// Attraction for connected nodes (Hooke's law)
				const key = `${node.id}:${other.id}`;
				if (adjacency.has(key)) {
					const attForce = ATTRACTION * dist;
					dx -= (diffX / dist) * attForce;
					dy -= (diffY / dist) * attForce;
				}
			}

			// Clamp forces
			const mag = Math.sqrt(dx * dx + dy * dy);
			if (mag > MAX_FORCE) {
				dx = (dx / mag) * MAX_FORCE;
				dy = (dy / mag) * MAX_FORCE;
			}

			return { id: node.id, dx: Math.round(dx * 10) / 10, dy: Math.round(dy * 10) / 10 };
		});

		return json({ forces });
	} catch (err) {
		console.error('[/api/evidence/ai/magnetize] error:', err);
		return json({ forces: [], message: 'Magnetization failed' }, { status: 500 });
	}
};
