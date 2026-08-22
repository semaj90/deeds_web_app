export type PageResult<T> = {
  rows: T[];
  elapsedMs: number;
};

export type PageCheckpoint = {
  schemaVersion: 'atlas.page-checkpoint.v1';
  runId: string;
  cursorField: 'packet_id';
  lastDurableCursor: string | null;
  pagesCompleted: number;
  rowsCompleted: number;
  updatedAt: string;
};

export type PageProcessorOptions<T> = {
  runId: string;
  pageSize: number;
  initialCursor?: string | null;
  signal?: AbortSignal;
  loadPage: (cursor: string | null, pageSize: number) => Promise<PageResult<T>>;
  cursorOf: (row: T) => string;
  persistPage: (rows: readonly T[]) => Promise<void>;
  persistCheckpoint: (checkpoint: PageCheckpoint) => Promise<void>;
  onPage?: (event: {
    page: number;
    rows: number;
    elapsedMs: number;
    cursor: string;
  }) => void;
};

export async function processKeysetPages<T>(options: PageProcessorOptions<T>): Promise<PageCheckpoint> {
  if (!Number.isSafeInteger(options.pageSize) || options.pageSize < 1) {
    throw new Error(`Invalid pageSize: ${options.pageSize}`);
  }

  let cursor = options.initialCursor ?? null;
  let pagesCompleted = 0;
  let rowsCompleted = 0;

  for (;;) {
    throwIfAborted(options.signal);
    const page = await options.loadPage(cursor, options.pageSize);
    if (page.rows.length === 0) break;

    assertStrictlyIncreasing(page.rows, options.cursorOf, cursor);
    await options.persistPage(page.rows);

    cursor = options.cursorOf(page.rows[page.rows.length - 1]!);
    pagesCompleted += 1;
    rowsCompleted += page.rows.length;

    const checkpoint: PageCheckpoint = {
      schemaVersion: 'atlas.page-checkpoint.v1',
      runId: options.runId,
      cursorField: 'packet_id',
      lastDurableCursor: cursor,
      pagesCompleted,
      rowsCompleted,
      updatedAt: new Date().toISOString(),
    };

    await options.persistCheckpoint(checkpoint);
    options.onPage?.({ page: pagesCompleted, rows: page.rows.length, elapsedMs: page.elapsedMs, cursor });
  }

  return {
    schemaVersion: 'atlas.page-checkpoint.v1',
    runId: options.runId,
    cursorField: 'packet_id',
    lastDurableCursor: cursor,
    pagesCompleted,
    rowsCompleted,
    updatedAt: new Date().toISOString(),
  };
}

function assertStrictlyIncreasing<T>(rows: readonly T[], cursorOf: (row: T) => string, prior: string | null): void {
  let previous = prior;
  for (const row of rows) {
    const current = cursorOf(row);
    if (previous !== null && current <= previous) {
      throw new Error(`Non-monotonic keyset page: ${current} <= ${previous}`);
    }
    previous = current;
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error(`Operation aborted${signal.reason ? `: ${String(signal.reason)}` : ''}`);
  }
}
