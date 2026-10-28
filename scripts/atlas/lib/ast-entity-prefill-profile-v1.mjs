export function validateAstEntityPrefillProfileV1(config) {
  const errors = [];
  if (!config || typeof config !== 'object' || Array.isArray(config)) return ['CONFIG_NOT_OBJECT'];
  if (config.schema !== 'atlas.ast-entity-prefill-pipeline.v1') errors.push('SCHEMA_ID_MISMATCH');
  if (config.source?.table !== 'atlas_packets') errors.push('SOURCE_TABLE_UNSUPPORTED');
  const identity = config.source?.identity;
  if (!Array.isArray(identity) || !['packet_key', 'source_ref', 'feature_id', 'title_id', 'tree_node_id'].every((field) => identity.includes(field))) {
    errors.push('SOURCE_IDENTITY_FIELDS_INCOMPLETE');
  }
  if (typeof config.source?.source_revision !== 'string' || !config.source.source_revision) errors.push('SOURCE_REVISION_OWNER_MISSING');
  if (config.extraction?.engine !== 'ast-grep-napi') errors.push('EXTRACTION_ENGINE_UNSUPPORTED');
  if (!Array.isArray(config.extraction?.languages) || config.extraction.languages.length === 0) errors.push('PARSER_LANGUAGES_MISSING');
  if (config.extraction?.identity_status !== 'candidate_only') errors.push('IDENTITY_STATUS_MUST_REMAIN_CANDIDATE_ONLY');
  if (config.lexical?.authority !== 'lexical_signal_only') errors.push('LEXICAL_AUTHORITY_INVALID');
  if (config.json?.authority !== 'payload_acceleration_only') errors.push('JSON_AUTHORITY_INVALID');
  if (config.nlp?.authority !== 'semantic_entities_only') errors.push('NLP_AUTHORITY_INVALID');
  if (config.embedding?.representation !== 'semantic_768' || config.embedding?.normalization !== 'L2_VECTOR') {
    errors.push('EMBEDDING_CONTRACT_MUST_REMAIN_SEMANTIC_768_L2_VECTOR');
  }
  if (config.embedding?.query_role !== 'QUERY' || config.embedding?.document_role !== 'DOCUMENT') errors.push('EMBEDDING_ROLE_CONTRACT_INVALID');
  if (config.output?.format !== 'ndjson') errors.push('OUTPUT_FORMAT_UNSUPPORTED');
  if (config.output?.canonical_writes !== false) errors.push('CANONICAL_WRITES_MUST_BE_DISABLED');
  return errors;
}
