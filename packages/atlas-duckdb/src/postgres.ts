type DuckDBConnection = any;

export interface PostgresAttachOptions {
  alias?: string;
  schema?: string;
}

export async function attachCanonicalPostgres(
  connection: DuckDBConnection,
  options: PostgresAttachOptions = {}
): Promise<string> {
  const schema = assertIdentifier(
    options.schema ?? 'public'
  );
  const alias = 'canonical_pg';

  const connectionString = buildConnectionString();

  await connection.run(`INSTALL postgres;`);
  await connection.run(`LOAD postgres;`);
  await connection.run(`
    ATTACH '${escapeSqlLiteral(connectionString)}' AS ${alias} (TYPE postgres, READ_ONLY);
  `);

  // Conservative PostgreSQL settings
  await connection.run(`
    SET pg_connection_limit = 8;
    SET pg_pages_per_task = 1000;
    SET pg_use_ctid_scan = true;
    SET pg_use_binary_copy = true;
  `);

  return alias;
}

function assertIdentifier(value: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(
      `Unsafe SQL identifier: ${value}`
    );
  }

  return value;
}

function buildConnectionString(): string {
  const host = process.env.PGHOST ?? '127.0.0.1';
  const port = process.env.PGPORT ?? '5434';
  const database = process.env.PGDATABASE ?? 'legal_ai_db';
  const user = process.env.PGUSER ?? 'legal_admin';
  const password = process.env.PGPASSWORD ?? '123456';

  return `dbname=${database} host=${host} port=${port} user=${user} password=${password}`;
}

function escapeSqlLiteral(value: string): string {
  return value.replaceAll("'", "''");
}
