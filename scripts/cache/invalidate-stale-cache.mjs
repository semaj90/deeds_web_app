async function runManualInvalidation() {
  console.log("🧹 Running manual cache invalidation checks...");
  
  const tsx = await import('tsx/esm/api').catch(() => null);
  if (tsx?.register) tsx.register();
  const {
    invalidateGraphCaches,
    invalidateDocumentsAtlasCaches,
    invalidateBifrostPrefixCachesByModel,
    invalidateBifrostSchemaCaches,
    invalidateQdrantCollectionCaches
  } = await import('../../sveltekit-frontend/src/lib/server/cache/cache-invalidation.ts');
  
  // Since this is a manual/cron wrapper, we'd normally fetch the latest digests
  // from our authoritative sources (e.g., hash the neo4j graph, hash the DB schema).
  // For now, we simulate finding new digests.
  
  const simulatedNewGraphDigest = `graph-digest-${Date.now()}`;
  const simulatedDocsDigest = `docs-digest-${Date.now()}`;
  const simulatedModelDigest = `model-gemma4-tq-digest-${Date.now()}`;
  const simulatedSchemaDigest = `schema-v2-${Date.now()}`;
  const simulatedQdrantDigest = `qdrant-collection-v3-${Date.now()}`;

  await invalidateGraphCaches(simulatedNewGraphDigest);
  await invalidateDocumentsAtlasCaches(simulatedDocsDigest);
  await invalidateBifrostPrefixCachesByModel('gemma4-tq', simulatedModelDigest);
  await invalidateBifrostSchemaCaches(simulatedSchemaDigest);
  await invalidateQdrantCollectionCaches(simulatedQdrantDigest);

  console.log("✅ Invalidation checks complete.");
  process.exit(0);
}

runManualInvalidation().catch(err => {
  console.error("❌ Failed to run invalidation:", err);
  process.exit(1);
});
