const SOURCE_REF_ALIASES = [
  'source_ref',
  'sourceRef',
  'sourceRefs',
  'file_path',
  'filePath',
  'relative_path',
  'relPath',
  'path',
];

const FEATURE_ID_ALIASES = [
  'feature_id',
  'featureId',
  'feature_ids',
  'featureIds',
  'feature',
  'feature_label',
  'featureLabel',
];

const FEATURE_LABEL_ALIASES = ['feature_label', 'featureLabel', 'label', 'title', 'name'];

const HIGHER_HOP_ALIASES = {
  somCluster: ['som_cluster', 'somCluster', 'centroid_id', 'centroidId', 'cluster_id', 'clusterId', 'group_id', 'groupId'],
  glyphRecord: ['glyph_record', 'glyphRecord', 'glyph_records', 'glyphRecords', 'glyph', 'glyphs'],
  qdrantHit: ['qdrant_point_id', 'qdrantPointId', 'point_id', 'pointId', 'id', 'qdrantHits', 'qdrant_hits'],
  redisHotKey: ['redis_hot_key', 'redisHotKey', 'promptCacheKey', 'semanticCacheKey', 'packetCacheKey', 'cacheKey', 'redisKey'],
  neo4jNode: ['neo4j_node', 'neo4jNode', 'node_id', 'nodeId', 'graph_node', 'graphNode', 'filePath', 'sourceRef'],
};

function normalizeSourceRef(value) {
  return String(value ?? '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\.\.\//, '')
    .replace(/^deeds-web-app\//i, '')
    .replace(/^sveltekit-frontend\//i, '')
    .replace(/\/{2,}/g, '/')
    .trim()
    .toLowerCase();
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  return [value];
}

function firstDefined(row, aliases) {
  for (const alias of aliases) {
    const value = row?.[alias];
    if (Array.isArray(value)) {
      const candidate = value.find((item) => String(item ?? '').trim());
      if (candidate !== undefined) return candidate;
      continue;
    }
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return undefined;
}

function canonicalSourceRef(row) {
  return normalizeSourceRef(
    firstDefined(row, SOURCE_REF_ALIASES) ??
      toArray(row?.sourceRefs)[0] ??
      '',
  );
}

function canonicalSourceRefs(row) {
  const refs = [];
  for (const alias of SOURCE_REF_ALIASES) {
    for (const item of toArray(row?.[alias])) refs.push(normalizeSourceRef(item));
  }
  const canonical = canonicalSourceRef(row);
  if (canonical) refs.push(canonical);
  return [...new Set(refs.filter(Boolean))];
}

function canonicalFeatureId(row) {
  const value = firstDefined(row, FEATURE_ID_ALIASES);
  return String(value ?? '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\.\.\//, '')
    .replace(/\/{2,}/g, '/')
    .trim();
}

function canonicalFeatureLabel(row, featureLabelIndex = new Map(), registryLabelIndex = new Map()) {
  const fromRow = firstDefined(row, FEATURE_LABEL_ALIASES);
  if (String(fromRow ?? '').trim()) return String(fromRow).trim();
  const featureId = canonicalFeatureId(row);
  if (featureId && featureLabelIndex.has(featureId)) return featureLabelIndex.get(featureId);
  if (featureId && registryLabelIndex.has(featureId)) return registryLabelIndex.get(featureId);
  if (featureId) {
    return featureId
      .replace(/[_-]+/g, ' ')
      .replace(/\b(\w)/g, (match) => match.toUpperCase())
      .replace(/\s+/g, ' ')
      .trim();
  }
  return '';
}

function higherHopPresence(row) {
  return {
    somCluster: HIGHER_HOP_ALIASES.somCluster.some((alias) => row?.[alias] !== undefined && row?.[alias] !== null && String(row?.[alias]).trim() !== ''),
    glyphRecord: HIGHER_HOP_ALIASES.glyphRecord.some((alias) => row?.[alias] !== undefined && row?.[alias] !== null && String(row?.[alias]).trim() !== ''),
    qdrantHit: HIGHER_HOP_ALIASES.qdrantHit.some((alias) => row?.[alias] !== undefined && row?.[alias] !== null && String(row?.[alias]).trim() !== ''),
    redisHotKey: HIGHER_HOP_ALIASES.redisHotKey.some((alias) => row?.[alias] !== undefined && row?.[alias] !== null && String(row?.[alias]).trim() !== ''),
    neo4jNode: HIGHER_HOP_ALIASES.neo4jNode.some((alias) => row?.[alias] !== undefined && row?.[alias] !== null && String(row?.[alias]).trim() !== ''),
  };
}

export {
  FEATURE_ID_ALIASES,
  FEATURE_LABEL_ALIASES,
  HIGHER_HOP_ALIASES,
  SOURCE_REF_ALIASES,
  canonicalFeatureId,
  canonicalFeatureLabel,
  canonicalSourceRef,
  canonicalSourceRefs,
  higherHopPresence,
  normalizeSourceRef,
};
