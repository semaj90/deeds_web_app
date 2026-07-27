import { tracedQuery } from '$lib/server/db/client.js';

function isMissingRelationError(message: string): boolean {
  return /relation\s+"[^"]+"\s+does not exist/i.test(message);
}

function isFeatureArrayOperatorError(message: string): boolean {
  return /operator does not exist:\s*text\[\]\s*@>\s*jsonb/i.test(message);
}

export async function countFeatureScopedRows(args: {
  label: string;
  table: string;
  featureColumn?: string;
  relatedColumn?: string;
  featureId: string;
}): Promise<number> {
  const {
    label,
    table,
    featureColumn = 'feature_id',
    relatedColumn = 'related_feature_ids',
    featureId,
  } = args;

  const primaryQuery = `SELECT count(*)::int AS count
    FROM ${table}
   WHERE ${featureColumn} = $1
      OR ${relatedColumn} @> to_jsonb(ARRAY[$1]::text[])`;
  const fallbackQuery = `SELECT count(*)::int AS count
    FROM ${table}
   WHERE ${featureColumn} = $1`;

  try {
    const result = await tracedQuery(label, primaryQuery, [featureId]);
    return Number(result.rows[0]?.count ?? 0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isMissingRelationError(message)) {
      return 0;
    }
    if (isFeatureArrayOperatorError(message)) {
      const result = await tracedQuery(`${label}.feature_only`, fallbackQuery, [featureId]);
      return Number(result.rows[0]?.count ?? 0);
    }
    throw error;
  }
}

export async function selectFeatureScopedRows<T = Record<string, unknown>>(args: {
  label: string;
  table: string;
  select: string;
  orderBy: string;
  limit: number;
  featureColumn?: string;
  relatedColumn?: string;
  featureId: string;
}): Promise<T[]> {
  const {
    label,
    table,
    select,
    orderBy,
    limit,
    featureColumn = 'feature_id',
    relatedColumn = 'related_feature_ids',
    featureId,
  } = args;

  const primaryQuery = `SELECT ${select}
    FROM ${table}
   WHERE ${featureColumn} = $1
      OR ${relatedColumn} @> to_jsonb(ARRAY[$1]::text[])
   ORDER BY ${orderBy}
   LIMIT $2`;
  const fallbackQuery = `SELECT ${select}
    FROM ${table}
   WHERE ${featureColumn} = $1
   ORDER BY ${orderBy}
   LIMIT $2`;

  try {
    const result = await tracedQuery(label, primaryQuery, [featureId, limit]);
    return result.rows as T[];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isMissingRelationError(message)) {
      return [];
    }
    if (isFeatureArrayOperatorError(message)) {
      const result = await tracedQuery(`${label}.feature_only`, fallbackQuery, [featureId, limit]);
      return result.rows as T[];
    }
    throw error;
  }
}
