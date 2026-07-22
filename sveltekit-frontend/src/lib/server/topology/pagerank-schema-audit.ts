/**
 * PageRank Schema Audit
 *
 * Validates that atlas_topology_index has the explicit PageRank
 * authority contract fields before materialization.
 */

interface ColumnContract {
  columnName: string;
  acceptedTypes: string[];
  nullable: boolean;
}

const REQUIRED_COLUMNS: ColumnContract[] = [
  {
    columnName: 'packet_key',
    acceptedTypes: ['text', 'character varying'],
    nullable: false
  },
  {
    columnName: 'pagerank_raw',
    acceptedTypes: ['double precision', 'real', 'numeric'],
    nullable: true
  },
  {
    columnName: 'pagerank_l1',
    acceptedTypes: ['double precision', 'real', 'numeric'],
    nullable: true
  },
  {
    columnName: 'authority_percentile',
    acceptedTypes: ['double precision', 'real', 'numeric'],
    nullable: true
  },
  {
    columnName: 'authority_band',
    acceptedTypes: ['text', 'character varying'],
    nullable: true
  },
  {
    columnName: 'pagerank_run_id',
    acceptedTypes: ['uuid'],
    nullable: true
  },
  {
    columnName: 'pagerank_contract_version',
    acceptedTypes: ['text', 'character varying'],
    nullable: true
  },
  {
    columnName: 'graph_snapshot_hash',
    acceptedTypes: ['text', 'character varying'],
    nullable: true
  },
  {
    columnName: 'pagerank_computed_at',
    acceptedTypes: ['timestamp with time zone', 'timestamp without time zone'],
    nullable: true
  }
];

export async function auditPageRankSchema(client: {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}): Promise<{
  compatible: boolean;
  missingColumns: string[];
  incompatibleColumns: string[];
}> {
  const result = await client.query(
    `
      SELECT
        column_name,
        data_type,
        is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'atlas_topology_index'
    `
  );

  const actual = new Map(
    result.rows.map(row => [
      row.column_name,
      {
        dataType: row.data_type,
        nullable: row.is_nullable === 'YES'
      }
    ])
  );

  const missingColumns: string[] = [];
  const incompatibleColumns: string[] = [];

  for (const required of REQUIRED_COLUMNS) {
    const found = actual.get(required.columnName);

    if (!found) {
      missingColumns.push(required.columnName);
      continue;
    }

    if (!required.acceptedTypes.includes(found.dataType)) {
      incompatibleColumns.push(
        `${required.columnName}: expected ${required.acceptedTypes.join(' or ')}, got ${found.dataType}`
      );
    }
  }

  return {
    compatible:
      missingColumns.length === 0 &&
      incompatibleColumns.length === 0,
    missingColumns,
    incompatibleColumns
  };
}
