import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { buildFeatureDocumentIngestionPlan } from '$lib/server/atlas/feature-doc-ingestion.js';
import { ingestLocalRepositoryFeatureSources } from '$lib/server/atlas/feature-doc-local-ingestion.js';

const schema = z.object({
  featureId: z.string().min(1),
  skipDuplicates: z.boolean().default(true),
});

export const POST: RequestHandler = async ({ request, locals, fetch }) => {
  if (!locals.user?.id) {
    return json(
      {
        success: false,
        featureId: '',
        plan: null,
        ingestion: null,
        error: 'Unauthorized',
      },
      { status: 401 }
    );
  }

  const raw = await request.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return json(
      {
        success: false,
        featureId: String(raw?.featureId ?? ''),
        plan: null,
        ingestion: null,
        error: parsed.error.issues[0]?.message ?? 'Invalid request',
      },
      { status: 400 }
    );
  }

  try {
    const { featureId, skipDuplicates } = parsed.data;
    const { plan } = await buildFeatureDocumentIngestionPlan(featureId);

    if (
      plan.remoteCrawlSources.length === 0 &&
      plan.localRepositorySources.length === 0 &&
      plan.existingIndexedSources.length === 0
    ) {
      return json({
        success: false,
        featureId,
        plan,
        ingestion: {
          remote: null,
          local: [],
          reused: [],
        },
        error: 'No accepted feature document sources to ingest',
      });
    }

    const remoteUrls = plan.remoteCrawlSources
      .map((source) => source.canonicalUrl)
      .filter((url): url is string => Boolean(url));

    const remote = remoteUrls.length > 0
      ? await (async () => {
          const crawlResponse = await fetch('/api/library/crawl', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              urls: remoteUrls,
              corpusType: 'docs',
              jurisdiction: 'federal',
              skipDuplicates,
            }),
          });

          const body = await crawlResponse.json().catch(() => null);
          return {
            ok: crawlResponse.ok,
            status: crawlResponse.status,
            body,
          };
        })()
      : null;

    const local = await ingestLocalRepositoryFeatureSources({
      featureId,
      sources: plan.localRepositorySources
        .filter((source) => source.accepted && source.localPath)
        .map((source) => ({
          sourceRef: source.sourceRef,
          localPath: source.localPath!,
          sourceType: source.sourceType,
          authorityClass: source.authorityClass,
          title: source.title,
        })),
    });

    const ingestion = {
      remote: remote?.body ?? null,
      local,
      reused: plan.existingIndexedSources,
    };
    const localSucceeded = local.some((entry) => entry.accepted);
    const remoteSucceeded = remote ? remote.ok : true;
    const success = remoteSucceeded && (localSucceeded || local.length === 0 || remoteUrls.length > 0);

    return json(
      {
        success,
        featureId,
        plan,
        ingestion,
        error: success
          ? null
          : remote && !remote.ok
            ? remote.body?.error ?? `crawl_failed_${remote.status}`
            : 'feature_document_local_ingestion_failed',
      },
      { status: success ? 200 : (remote && !remote.ok ? remote.status : 500) }
    );
  } catch (error) {
    return json(
      {
        success: false,
        featureId: parsed.data.featureId,
        plan: null,
        ingestion: null,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
};
