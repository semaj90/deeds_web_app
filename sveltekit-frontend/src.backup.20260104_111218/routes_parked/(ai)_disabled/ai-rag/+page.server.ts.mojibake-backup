import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  // read authenticated user (may be undefined for guests)
  const user = locals.user;

  // Default/demo response shape
  const fallback = {
    documents: [],
    recentQueries: [],
    stats: {
      totalDocuments: 0,
      totalQueries: 0,
      avgResponseTime: 0,
    },
  };

  // Return demo data if not authenticated
  if (!user?.id) {
    return fallback;
  }

  try {
    // TODO: Replace the placeholders below with actual queries:
    // - query your pgvector/drizzle layer for user's RAG documents
    // - fetch recent queries and compute stats
    // Example:
    // const documents = await vectorService.getDocumentsForUser(user.id);
    // const recentQueries = await queryService.getRecentForUser(user.id);
    // const stats = computeStats(documents, recentQueries);

    // Placeholder return until real DB logic is implemented
    return {
      documents: [],
      recentQueries: [],
      stats: {
        totalDocuments: 0,
        totalQueries: 0,
        avgResponseTime: 0,
      },
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Failed to load RAG data:', message);
    return fallback;
  }
};
