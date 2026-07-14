/**
 * /api/admin/packets/enrich-labels — Step 5 Feature Label Enrichment
 *
 * GET — run batch feature label enrichment
 * POST — get coverage report
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  batchEnrichPacketsWithLabels,
  getFeatureLabelCoverage,
} from '$lib/server/indexer/feature-label-enricher.js';

export const GET: RequestHandler = async ({ locals }) => {
  if (locals.user?.role !== 'admin') {
    return json({ error: 'Admin only' }, { status: 403 });
  }

  try {
    const startTime = Date.now();
    const result = await batchEnrichPacketsWithLabels(10000);
    const duration = Date.now() - startTime;

    return json({
      success: true,
      result,
      duration_ms: duration,
      message: `Enriched ${result.success}/${result.total} packets with feature labels in ${duration}ms`,
    });
  } catch (err) {
    return json(
      {
        error: 'Enrichment failed',
        details: (err as Error).message,
      },
      { status: 500 }
    );
  }
};

export const POST: RequestHandler = async ({ locals }) => {
  if (locals.user?.role !== 'admin') {
    return json({ error: 'Admin only' }, { status: 403 });
  }

  try {
    const coverage = await getFeatureLabelCoverage();

    return json({
      success: true,
      coverage,
      message: `Feature label coverage: ${coverage.coverage_percent.toFixed(1)}% (${coverage.with_labels}/${coverage.total_packets} packets)`,
    });
  } catch (err) {
    return json(
      {
        error: 'Coverage report failed',
        details: (err as Error).message,
      },
      { status: 500 }
    );
  }
};
