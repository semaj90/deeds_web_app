export const SEARCH_INPUT_COLUMNS = Object.freeze([
  'relative_path', 'symbol', 'ast_symbols', 'ast_imports', 'ast_exports',
  'summary', 'content', 'semantic_tags',
]);

export const STORAGE_OBSERVATION_QUERIES = Object.freeze({
  extensions: `SELECT wanted.name, installed.extversion AS installed_version,
    available.default_version AS available_version
    FROM unnest(ARRAY['vector','vectorscale','pg_vectorsearch','pg_trgm','pg_search','pgai','ai','hll']) AS wanted(name)
    LEFT JOIN pg_extension installed ON installed.extname = wanted.name
    LEFT JOIN pg_available_extensions available ON available.name = wanted.name
    ORDER BY wanted.name`,
  columns: `SELECT column_name, data_type, udt_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'codebase_chunk_index'
    AND column_name IN ('search_vector','content_embedding','content_embedding_768') ORDER BY column_name`,
  triggers: `SELECT trigger_row.tgname AS name, trigger_row.tgenabled AS enabled,
    (trigger_row.tgtype & 16) <> 0 AS on_update,
    (trigger_row.tgtype & 4) <> 0 AS on_insert,
    ARRAY(SELECT attribute.attname FROM unnest(trigger_row.tgattr::smallint[]) AS selected(attnum)
      JOIN pg_attribute attribute ON attribute.attrelid = trigger_row.tgrelid AND attribute.attnum = selected.attnum
      ORDER BY attribute.attname) AS update_columns,
    procedure.proname AS function_name, pg_get_triggerdef(trigger_row.oid) AS definition,
    pg_get_functiondef(procedure.oid) AS function_definition
    FROM pg_trigger trigger_row JOIN pg_proc procedure ON procedure.oid = trigger_row.tgfoid
    WHERE trigger_row.tgrelid = 'public.codebase_chunk_index'::regclass AND NOT trigger_row.tgisinternal
    ORDER BY trigger_row.tgname`,
  indexes: `SELECT index_relation.relname AS name, access_method.amname AS method,
    index_row.indisvalid AS valid, index_row.indisready AS ready,
    index_row.indisunique AS unique, index_row.indisprimary AS primary,
    pg_get_indexdef(index_row.indexrelid) AS definition,
    pg_get_expr(index_row.indpred, index_row.indrelid) AS predicate,
    pg_relation_size(index_row.indexrelid) AS bytes, index_relation.reloptions AS options,
    usage.idx_scan AS scans, usage.idx_tup_read AS tuples_read, usage.idx_tup_fetch AS tuples_fetched,
    io.idx_blks_read AS blocks_read, io.idx_blks_hit AS blocks_hit
    FROM pg_index index_row JOIN pg_class index_relation ON index_relation.oid = index_row.indexrelid
    JOIN pg_am access_method ON access_method.oid = index_relation.relam
    LEFT JOIN pg_stat_all_indexes usage ON usage.indexrelid = index_row.indexrelid
    LEFT JOIN pg_statio_all_indexes io ON io.indexrelid = index_row.indexrelid
    WHERE index_row.indrelid = 'public.codebase_chunk_index'::regclass ORDER BY index_relation.relname`,
  statistics: `SELECT clock_timestamp() AS observed_at, database_stats.stats_reset,
    table_stats.n_live_tup, table_stats.n_dead_tup, table_stats.n_tup_upd, table_stats.n_tup_hot_upd,
    table_stats.last_vacuum, table_stats.last_autovacuum, table_stats.last_analyze, table_stats.last_autoanalyze,
    pg_table_size(table_stats.relid) AS table_bytes, pg_indexes_size(table_stats.relid) AS index_bytes
    FROM pg_stat_user_tables table_stats CROSS JOIN pg_stat_database database_stats
    WHERE table_stats.relid = 'public.codebase_chunk_index'::regclass AND database_stats.datname = current_database()`,
});

export function summarizeStorageObservations(observations, errors = []) {
  const triggers = observations.triggers ?? [];
  const searchTriggers = triggers.filter((trigger) => trigger.function_name === 'compute_codebase_chunk_search_vector');
  const expected = [...SEARCH_INPUT_COLUMNS].sort();
  const narrowed = searchTriggers.some((trigger) => ['O', 'A'].includes(trigger.enabled)
    && trigger.on_update && trigger.on_insert
    && JSON.stringify([...trigger.update_columns].sort()) === JSON.stringify(expected));
  const broadUpdate = searchTriggers.some((trigger) => trigger.on_update
    && ['O', 'A'].includes(trigger.enabled) && trigger.update_columns.length === 0);
  const indexes = observations.indexes ?? [];
  const ftsColumn = (observations.columns ?? []).find((column) => column.column_name === 'search_vector');
  const gin = indexes.filter((index) => index.method === 'gin' && index.valid && index.ready
    && /\(search_vector\)/.test(index.definition));
  return {
    ...observations,
    errors,
    status: errors.length ? 'INCOMPLETE_OBSERVATIONS' : 'READ_ONLY_OBSERVATIONS_CAPTURED',
    searchVectorType: ftsColumn?.udt_name ?? null,
    ftsGinIndexes: gin.map((index) => index.name),
    searchTrigger: {
      status: errors.some((error) => error.section === 'triggers') ? 'UNPROVEN_QUERY_FAILED'
        : broadUpdate ? 'BROAD_UPDATE_TRIGGER_PRESENT' : narrowed ? 'SEARCH_INPUT_FILTER_OBSERVED' : 'EXPECTED_FILTER_NOT_OBSERVED',
      expectedColumns: SEARCH_INPUT_COLUMNS,
      functionDependencyReviewRequired: true,
    },
    hnswIndexes: indexes.filter((index) => index.method === 'hnsw').map((index) => index.name),
    bloatAssessment: 'NOT_MEASURED',
    consolidation: 'REVIEW_ONLY_NO_DROP_RECOMMENDATIONS',
    statisticsCaveat: 'Counters are cumulative since reset and may be missing or stale; zero scans or tuple estimates do not prove an unused index, empty table, or bloat.',
    databaseWrites: false,
    promotionEligible: false,
  };
}

export function collectStorageObservations(query) {
  const observations = {};
  const errors = [];
  for (const [section, sql] of Object.entries(STORAGE_OBSERVATION_QUERIES)) {
    try {
      const result = JSON.parse(query(`SELECT COALESCE(jsonb_agg(observation), '[]'::jsonb) FROM (${sql}) observation`));
      if (!Array.isArray(result)) throw new Error('EXPECTED_ROW_ARRAY');
      observations[section] = result;
    } catch (error) {
      observations[section] = [];
      errors.push({ section, message: String(error.message).slice(0, 250) });
    }
  }
  return summarizeStorageObservations(observations, errors);
}
