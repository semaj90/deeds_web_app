import { AsyncLocalStorage } from 'node:async_hooks';

export interface ReadOnlyScopedQueryClient {
  query(queryText: string, values?: unknown[]): Promise<unknown>;
  release?: () => void;
}

export interface ReadOnlyScopedQueryPool<Client extends ReadOnlyScopedQueryClient> {
  connect(): Promise<Client>;
}

export function createReadOnlyQueryScope<Client extends ReadOnlyScopedQueryClient>(
  pool: ReadOnlyScopedQueryPool<Client>,
) {
  const storage = new AsyncLocalStorage<Client>();

  return {
    currentClient(): Client | undefined {
      return storage.getStore();
    },

    async run<T>(statementTimeoutMs: number, operation: () => Promise<T>): Promise<T> {
      if (!Number.isInteger(statementTimeoutMs) || statementTimeoutMs < 1 || statementTimeoutMs > 60_000) {
        throw new RangeError('statementTimeoutMs must be an integer between 1 and 60000');
      }

      const client = await pool.connect();
      let transactionOpen = false;
      try {
        await client.query('BEGIN READ ONLY');
        transactionOpen = true;
        await client.query("SELECT set_config('statement_timeout', $1, true)", [`${statementTimeoutMs}ms`]);
        return await storage.run(client, operation);
      } finally {
        try {
          if (transactionOpen) await client.query('ROLLBACK');
        } finally {
          client.release?.();
        }
      }
    },
  };
}
