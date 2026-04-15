import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * POST /api/phase89/analysis
 * Returns Qdrant collection stats as the Phase89 knowledge analysis report.
 */
export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	try {
    const { qdrant } = await import('$lib/server/vector/qdrant-manager.js');
    const client = qdrant.client;

    const collectionNames = [
      'codebase_chunks_768',
      'evidence_items',
      'legal_documents',
      'legal_cases',
      'chat_messages',
      'embedding_cache',
    ];

    const collections: Array<{ name: string; points: number; segments: number; status: string }> =
      [];
    let totalPoints = 0;
    const tags = new Set<string>();

    for (const name of collectionNames) {
      try {
        const info = client ? await client.getCollection(name).catch(() => null) : null;
        const points = (info as any)?.points_count ?? 0;
        const segments = (info as any)?.segments_count ?? 0;
        const status = (info as any)?.status ?? (info ? 'green' : 'unavailable');
        collections.push({ name, points, segments, status });
        totalPoints += points;
        tags.add(name.split('_')[0]);
      } catch {
        collections.push({ name, points: 0, segments: 0, status: 'unavailable' });
      }
    }

    const healthy = collections.filter((c) => c.status === 'green' || c.points > 0);
    const recommendations: string[] = [];
    if (totalPoints === 0)
      recommendations.push('No vectors indexed — run codebase indexing to enable semantic search.');
    if (healthy.length < 3)
      recommendations.push('Several collections are empty — check embedding pipeline health.');
    if (healthy.length >= 4)
      recommendations.push(
        'Vector store looks healthy. Consider running a retrieval quality audit.'
      );

    return json({
      success: true,
      analysis: {
        metadata: {
          totalCollections: collections.length,
          totalPoints,
          uniqueTags: tags.size,
          healthyCollections: healthy.length,
        },
        knowledge: { collections },
        recommendations,
        analysis: `Phase89 knowledge base: ${totalPoints.toLocaleString()} indexed vectors across ${collections.length} collections.`,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('[phase89/analysis] Qdrant unavailable:', (e as Error).message);
    return json({
      success: false,
      analysis: {
        metadata: { totalCollections: 0, totalPoints: 0, uniqueTags: 0 },
        knowledge: { collections: [] },
        recommendations: ['Qdrant vector store is unavailable. Check Docker services.'],
        analysis: null,
      },
      timestamp: new Date().toISOString(),
    });
  }
};
