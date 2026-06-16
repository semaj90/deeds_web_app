export function hasTable(tableName, tableSet) {
  return Boolean(tableName) && tableSet instanceof Set && tableSet.has(String(tableName).trim().toLowerCase());
}

export function hasColumn(columnName, columnSet) {
  return Boolean(columnName) && columnSet instanceof Set && columnSet.has(String(columnName).trim().toLowerCase());
}

export function existingColumns(columns, columnSet) {
  return Array.isArray(columns)
    ? columns.filter((column) => hasColumn(column, columnSet))
    : [];
}

export function safeSelect(tableName, columns, columnSet) {
  const selected = existingColumns(columns, columnSet);
  return selected.length > 0 ? `select ${selected.join(', ')} from ${tableName}` : `select * from ${tableName}`;
}

export function safeMetadata(row) {
  if (!row || typeof row !== 'object') return {};
  const metadata = row.metadata ?? row.metadata_json ?? row.payload ?? row.payload_json;
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) return metadata;
  if (typeof metadata === 'string' && metadata.trim()) {
    try {
      const parsed = JSON.parse(metadata);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

export function safeJsonObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

export function safePayload(row) {
  if (!row || typeof row !== 'object') return {};
  const payload = row.payload ?? row.payload_json ?? row.qdrant_payload;
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) return payload;
  if (typeof payload === 'string' && payload.trim()) {
    try {
      const parsed = JSON.parse(payload);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

export function normalizeSourceRef(value) {
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

export function normalizeFilePath(value) {
  return String(value ?? '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\.\.\//, '')
    .replace(/^deeds-web-app\//i, '')
    .replace(/^sveltekit-frontend\//i, '')
    .replace(/\/{2,}/g, '/')
    .trim();
}

export function canonicalPacketKey(row) {
  if (row && typeof row === 'object') {
    const candidate = row.packet_key ?? row.packetKey ?? row.packet_id ?? row.packetId ?? row.id;
    return String(candidate ?? '').trim();
  }
  return String(row ?? '').trim();
}

export const PACKET_LEDGER_TABLES = [
  'atlas_codebase_packets',
  'atlas_feature_packets',
  'atlas_packets',
];

export const PACKET_SCHEMA_FIELDS = [
  'packet_key',
  'source_ref',
  'feature_id',
  'feature_label',
  'file_path',
  'community_id',
  'community_source',
  'community_confidence',
  'summary',
  'metadata',
  'tags',
  'lineage_version',
  'ledger_type',
  'canonical',
  'payload_backfilled_at',
  'domain_class',
  'tree_node_id',
  'som_cluster',
  'som_row',
  'som_col',
  'som_index',
  'kmeans_cluster',
];

export function packetFieldAliases(fieldName) {
  const aliases = {
    packet_key: ['packet_key', 'packetKey', 'packet_id', 'packetId', 'id'],
    source_ref: ['source_ref', 'sourceRef', 'canonical_source_ref', 'canonicalSourceRef', 'sourceRefs', 'source_refs', 'file_path', 'filePath', 'path', 'rel_path', 'relPath'],
    feature_id: ['feature_id', 'featureId', 'feature_ids', 'featureIds', 'feature'],
    feature_label: ['feature_label', 'featureLabel', 'label', 'title', 'name', 'turbovecLabel'],
    file_path: ['file_path', 'filePath', 'rel_path', 'relPath', 'path'],
    community_id: ['community_id', 'communityId'],
    community_source: ['community_source', 'communitySource'],
    community_confidence: ['community_confidence', 'communityConfidence'],
    summary: ['summary', 'summary_text', 'summaryText'],
    metadata: ['metadata', 'metadata_json', 'payload', 'payload_json', 'qdrant_payload'],
    tags: ['tags', 'tag_list', 'tagList'],
    lineage_version: ['lineage_version', 'lineageVersion'],
    ledger_type: ['ledger_type', 'ledgerType'],
    canonical: ['canonical'],
    payload_backfilled_at: ['payload_backfilled_at', 'payloadBackfilledAt'],
    domain_class: ['domain_class', 'domainClass', 'domain'],
    tree_node_id: ['tree_node_id', 'treeNodeId'],
    som_cluster: ['som_cluster', 'somCluster', 'cluster_id', 'clusterId'],
    som_row: ['som_row', 'somRow'],
    som_col: ['som_col', 'somCol'],
    som_index: ['som_index', 'somIndex'],
    kmeans_cluster: ['kmeans_cluster', 'kmeansCluster'],
  };
  return aliases[fieldName] ?? [fieldName];
}

export function packetFieldValue(row, fieldName) {
  if (!row || typeof row !== 'object' || !fieldName) return undefined;
  for (const alias of packetFieldAliases(fieldName)) {
    const value = row[alias];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  const metadata = safeMetadata(row);
  for (const alias of packetFieldAliases(fieldName)) {
    const value = metadata[alias];
    if (value !== undefined && value !== null && String(value).trim?.() !== '') return value;
  }
  const payload = safePayload(row);
  for (const alias of packetFieldAliases(fieldName)) {
    const value = payload[alias];
    if (value !== undefined && value !== null && String(value).trim?.() !== '') return value;
  }
  return undefined;
}

export function preferredPacketLedgerTable(existingTables = []) {
  const tableSet = existingTables instanceof Set
    ? existingTables
    : new Set(Array.isArray(existingTables) ? existingTables.map((table) => String(table).trim().toLowerCase()) : []);
  for (const candidate of PACKET_LEDGER_TABLES) {
    if (tableSet.has(candidate.toLowerCase())) return candidate;
  }
  return PACKET_LEDGER_TABLES[PACKET_LEDGER_TABLES.length - 1];
}
