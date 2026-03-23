import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';

const layoutSchema = z.object({
	caseId: z.string().uuid(),
	evidenceData: z.any().optional(),
	layoutType: z.enum(['force', 'grid', 'radial', 'timeline', 'hierarchical']).default('force')
});

/** POST /api/v1/ai/generate-layout — Generate smart node positions for evidence canvas */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const raw = await request.json();
		const parsed = layoutSchema.safeParse(raw);
		if (!parsed.success) {
			return json({ error: parsed.error.issues[0]?.message }, { status: 400 });
		}

		const { evidenceData, layoutType } = parsed.data;
		const nodes = Array.isArray(evidenceData) ? evidenceData : [];
		const positions: Record<string, { x: number; y: number }> = {};
		const count = nodes.length || 1;

		switch (layoutType) {
			case 'grid': {
				const cols = Math.ceil(Math.sqrt(count));
				nodes.forEach((node: any, i: number) => {
					positions[node.id || `node-${i}`] = {
						x: 100 + (i % cols) * 200,
						y: 100 + Math.floor(i / cols) * 180
					};
				});
				break;
			}
			case 'radial': {
				const cx = 500, cy = 400, radius = Math.min(300, count * 30);
				nodes.forEach((node: any, i: number) => {
					const angle = (2 * Math.PI * i) / count;
					positions[node.id || `node-${i}`] = {
						x: cx + radius * Math.cos(angle),
						y: cy + radius * Math.sin(angle)
					};
				});
				break;
			}
			case 'timeline': {
				nodes.forEach((node: any, i: number) => {
					positions[node.id || `node-${i}`] = {
						x: 100 + i * 180,
						y: 300 + (i % 2 === 0 ? 0 : 80)
					};
				});
				break;
			}
			default: {
				// Force-directed initial placement (random with spacing)
				nodes.forEach((node: any, i: number) => {
					positions[node.id || `node-${i}`] = {
						x: 200 + Math.random() * 600,
						y: 150 + Math.random() * 500
					};
				});
			}
		}

		return json({ positions });
	} catch (err) {
		console.error('[/api/v1/ai/generate-layout] error:', err);
		return json({ positions: {} }, { status: 500 });
	}
};
