import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import {
  processTelemetryEvent,
  getSpecDiagnosis,
  getAllDiagnosedSpecs,
  type RecommendationCard,
  type HMMHiddenState
} from '$lib/server/analysis/hmm-kanban-diagnoser.js';

// GET response structure:
// { success: boolean; data: any; error: string | null }
export const GET: RequestHandler = async ({ url }) => {
  const specId = url.searchParams.get('spec_id');

  try {
    if (specId) {
      const data = await getSpecDiagnosis(specId);
      return json({
        success: true,
        data: data ? {
          specId: data.specId,
          events: data.events,
          path: data.path,
          recommendation: data.recommendation
        } : null,
        error: null
      });
    } else {
      const specIds = await getAllDiagnosedSpecs();
      const allData: Array<{
        specId: string;
        events: string[];
        path: HMMHiddenState[];
        recommendation: RecommendationCard | null;
      }> = [];

      for (const id of specIds) {
        const data = await getSpecDiagnosis(id);
        if (data) {
          allData.push(data);
        }
      }

      return json({
        success: true,
        data: allData,
        error: null
      });
    }
  } catch (err) {
    console.error('[HMM API] GET error:', err);
    return json({
      success: false,
      data: specId ? null : [],
      error: err instanceof Error ? err.message : 'Internal Server Error'
    });
  }
};

const postSchema = z.object({
  specId: z.string().min(1),
  event: z.string().min(1)
});

export const POST: RequestHandler = async ({ request }) => {
  try {
    const rawBody = await request.json();
    const result = postSchema.safeParse(rawBody);

    if (!result.success) {
      return json({
        success: false,
        data: null,
        error: result.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      }, { status: 400 });
    }

    const { specId, event } = result.data;
    const diagnosis = await processTelemetryEvent(specId, event);

    return json({
      success: true,
      data: diagnosis,
      error: null
    });
  } catch (err) {
    console.error('[HMM API] POST error:', err);
    return json({
      success: false,
      data: null,
      error: err instanceof Error ? err.message : 'Internal Server Error'
    }, { status: 500 });
  }
};
