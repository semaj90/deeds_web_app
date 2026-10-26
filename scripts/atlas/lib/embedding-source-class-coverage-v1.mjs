export const SOURCE_CLASS_COVERAGE_V1_CLASSES = Object.freeze([
  'FIRST_PARTY_SOURCE',
  'OPENSPEC_REQUIREMENTS',
  'EXTERNAL_DEPENDENCY',
  'GENERATED_SOURCE',
  'TELEMETRY_REPORT',
  'MODEL_ARTIFACT',
  'BINARY_ASSET',
  'ENVIRONMENT_CACHE',
  'UNKNOWN',
]);

const numericFields = [
  'chunkCount',
  'contentEmbeddingChunkCount',
  'embedding768ChunkCount',
  'sourceRevisionChunkCount',
  'workspaceRevisionChunkCount',
  'exactProvenContentEmbeddingChunks',
  'exactProvenEmbedding768Chunks',
  'provenLineageIdentityEmbedding768Chunks',
  'lineageSourceRefMatchEmbedding768Chunks',
  'uniqueBindingSnapshotEmbedding768Chunks',
  'multipleWorkspaceBindingEmbedding768Chunks',
  'missingBindingEmbedding768Chunks',
  'conflictingLineageEmbedding768Chunks',
];

function emptySummary(sourceClass) {
  return {
    sourceClass,
    physicalFiles: 0,
    physicalBytes: 0,
    databasePaths: 0,
    ...Object.fromEntries(numericFields.map(field => [field, 0])),
    modelRecipes: {},
  };
}

function emptyDatabaseMetricBucket() {
  return {
    databasePaths: 0,
    ...Object.fromEntries(numericFields.map(field => [field, 0])),
    modelRecipes: {},
  };
}

function accumulateDatabaseRow(bucket, row) {
  bucket.databasePaths += 1;
  for (const field of numericFields) {
    const value = row[field];
    if (!validCount(value)) throw new Error(`DATABASE_METRIC_INVALID:${field}`);
    bucket[field] += value;
  }
  let recipes;
  try {
    recipes = JSON.parse(row.modelRecipesJson);
  } catch {
    throw new Error('MODEL_RECIPES_JSON_INVALID');
  }
  if (!Array.isArray(recipes)) throw new Error('MODEL_RECIPES_SHAPE_INVALID');
  for (const recipe of recipes) {
    if (typeof recipe?.embeddingModel !== 'string'
      || (recipe.embeddingVersion !== null && typeof recipe.embeddingVersion !== 'string')
      || !validCount(recipe.embedding768ChunkCount)) throw new Error('MODEL_RECIPE_INVALID');
    const key = JSON.stringify([recipe.embeddingModel, recipe.embeddingVersion]);
    bucket.modelRecipes[key] = (bucket.modelRecipes[key] ?? 0) + recipe.embedding768ChunkCount;
  }
}

function validCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

export function buildEmbeddingSourceClassCoverageV1({
  physicalClassTotals,
  databasePathRows,
  sourceClassByPath,
  ambiguousSourcePaths = new Set(),
  sourceClassInput = {},
}) {
  if (!Array.isArray(physicalClassTotals) || !Array.isArray(databasePathRows)
    || !(sourceClassByPath instanceof Map) || !(ambiguousSourcePaths instanceof Set)) {
    throw new Error('INPUT_SHAPE_INVALID');
  }

  const summaries = new Map(SOURCE_CLASS_COVERAGE_V1_CLASSES.map(value => [value, emptySummary(value)]));
  const unmatchedDatabaseMetrics = emptyDatabaseMetricBucket();
  const ambiguousDatabaseMetrics = emptyDatabaseMetricBucket();
  for (const total of physicalClassTotals) {
    if (!summaries.has(total?.sourceClass) || !validCount(total.files) || !validCount(total.bytes)) {
      throw new Error('PHYSICAL_CLASS_TOTAL_INVALID');
    }
    const summary = summaries.get(total.sourceClass);
    summary.physicalFiles = total.files;
    summary.physicalBytes = total.bytes;
  }

  const seenDatabasePaths = new Set();
  const unmatchedSamples = [];
  const ambiguousSamples = [];
  let unmatchedDatabasePathCount = 0;
  let ambiguousDatabasePathCount = 0;
  for (const row of databasePathRows) {
    const relativePath = row?.relativePath;
    if (typeof relativePath !== 'string' || !relativePath || seenDatabasePaths.has(relativePath)) {
      throw new Error('DATABASE_PATH_INVALID_OR_DUPLICATE');
    }
    seenDatabasePaths.add(relativePath);
    if (ambiguousSourcePaths.has(relativePath)) {
      ambiguousDatabasePathCount += 1;
      if (ambiguousSamples.length < 20) ambiguousSamples.push(relativePath);
      accumulateDatabaseRow(ambiguousDatabaseMetrics, row);
      continue;
    }
    const sourceClass = sourceClassByPath.get(relativePath);
    if (!sourceClass) {
      unmatchedDatabasePathCount += 1;
      if (unmatchedSamples.length < 20) unmatchedSamples.push(relativePath);
      accumulateDatabaseRow(unmatchedDatabaseMetrics, row);
      continue;
    }
    const summary = summaries.get(sourceClass);
    if (!summary) throw new Error('DATABASE_SOURCE_CLASS_INVALID');
    summary.databasePaths += 1;
    for (const field of numericFields) {
      const value = row[field];
      if (!validCount(value)) throw new Error(`DATABASE_METRIC_INVALID:${field}`);
      summary[field] += value;
    }
    let recipes;
    try {
      recipes = JSON.parse(row.modelRecipesJson);
    } catch {
      throw new Error('MODEL_RECIPES_JSON_INVALID');
    }
    if (!Array.isArray(recipes)) throw new Error('MODEL_RECIPES_SHAPE_INVALID');
    for (const recipe of recipes) {
      if (typeof recipe?.embeddingModel !== 'string'
        || (recipe?.embeddingVersion !== null && typeof recipe.embeddingVersion !== 'string')
        || !validCount(recipe.embedding768ChunkCount)) throw new Error('MODEL_RECIPE_INVALID');
      const key = JSON.stringify([recipe.embeddingModel, recipe.embeddingVersion]);
      summary.modelRecipes[key] = (summary.modelRecipes[key] ?? 0) + recipe.embedding768ChunkCount;
    }
  }

  const classifiedTotals = Object.fromEntries(numericFields.map(field => [field,
    [...summaries.values()].reduce((sum, row) => sum + row[field], 0)]));
  const totals = Object.fromEntries(numericFields.map(field => [field,
    classifiedTotals[field] + unmatchedDatabaseMetrics[field] + ambiguousDatabaseMetrics[field]]));
  return {
    schema: 'atlas.embedding-source-class-coverage.v1',
    status: 'SOURCE_CLASS_JOIN_DIAGNOSTIC_ONLY',
    canonicalAuthority: false,
    sourceQualified: false,
    productionAdmission: false,
    persistentWritesPerformed: false,
    physicalPathClassCounts: [...summaries.values()].map(row => ({
      sourceClass: row.sourceClass,
      physicalFiles: row.physicalFiles,
      physicalBytes: row.physicalBytes,
    })),
    sourceClasses: [...summaries.values()],
    databasePathCount: databasePathRows.length,
    uniqueDatabasePathCount: seenDatabasePaths.size,
    matchedDatabasePathCount: databasePathRows.length - unmatchedDatabasePathCount - ambiguousDatabasePathCount,
    unmatchedDatabasePathCount,
    unmatchedSamples,
    unmatchedDatabaseMetrics,
    ambiguousDatabasePathCount,
    ambiguousSamples,
    ambiguousDatabaseMetrics,
    classifiedDatabaseMetricTotals: classifiedTotals,
    databaseMetricTotals: totals,
    sourceClassInput,
    interpretation: 'Exact normalized path join to a frozen physical inventory classification. Embedding rows have no row-owned source/workspace revisions in the source census; external bindings and model tags are diagnostic only, not current-revision admission or proof of source-class semantic relevance.',
  };
}
