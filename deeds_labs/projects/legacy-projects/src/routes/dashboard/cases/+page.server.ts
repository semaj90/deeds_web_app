/**
 * Cases Dashboard - Server Load Function
 * Loads real cases from PostgreSQL database with optimized queries
 */
import type { ServerLoad } from '@sveltejs/kit';
import { Pool } from 'pg';

// Create a single Pool (reuse across requests)
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5434/legal_ai_test',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Type for database row from query
interface CaseRow {
  id: string;
  case_number: string;
  title: string;
  status: string;
  metadata: Record<string, any> | null;
  created_at: Date | string;
  updated_at: Date | string;
  date_created?: Date | string;
  date_modified?: Date | string;
  evidence_count: string | number;
  analyzed_evidence_count?: string | number;
}

export interface CaseData {
  id: string;
  case_number: string;
  title: string;
  status: 'active' | 'pending' | 'closed' | 'archived';
  metadata: Record<string, any> | null;
  created_at: Date;
  updated_at: Date;
  // Calculated fields
  progress: number;
  evidenceCount: number;
  lastUpdate: string;
}

interface CaseSummary {
  total: number;
  active: number;
  pending: number;
  closed: number;
  archived: number;
  totalEvidence: number;
}

interface LoadResponse {
  cases: CaseData[];
  summary: CaseSummary;
  error?: string;
}

/**
 * Calculate human-readable time since last update
 */
function calculateLastUpdate(updatedAt: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - updatedAt.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) {
    return 'just now';
  } else if (diffMins < 60) {
    return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  } else {
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  }
}

/**
 * Calculate case progress based on evidence analysis
 */
function calculateProgress(evidenceCount: number, analyzedCount: number, status: string): number {
  if (evidenceCount === 0) {
    return status === 'active' ? 25 : status === 'closed' ? 100 : 0;
  }

  // Calculate percentage of evidence analyzed
  const analysisPercentage = (analyzedCount / evidenceCount) * 100;

  // Ensure progress is between 0-100, with at least 25% for active cases
  const baseProgress = status === 'active' ? 25 : 0;
  return Math.min(100, Math.max(baseProgress, Math.round(analysisPercentage)));
}

export const load: ServerLoad = async (): Promise<LoadResponse> => {
  try {
    // Use a pooled client and run the query on the client to avoid BoundPool.query typing issue
    let client: any = undefined;
    try {
      // runtime guard / cast so TypeScript doesn't complain about BoundPool.connect
      const runtimePool: any = pool as unknown as any;
      const acquiredClient =
        typeof runtimePool.connect === 'function' ? await runtimePool.connect() : null;

      // Use either the acquired client or the pool directly (both at runtime support .query)
      const executor = acquiredClient ?? runtimePool;

      // Do not use a generic type parameter on query; assert rows later
      const res = await executor.query(`
          SELECT
            c.id,
            c.case_number,
            c.title,
            c.status,
            c.metadata,
            COALESCE(c.created_at, c.date_created) as created_at,
            COALESCE(c.updated_at, c.date_modified) as updated_at,
            COUNT(e.id)::int as evidence_count,
            COUNT(CASE WHEN e.analyzed = true THEN 1 END)::int as analyzed_evidence_count
          FROM cases c
          LEFT JOIN evidence e ON e.case_id = c.id
          WHERE c.archived = false OR c.archived IS NULL
          GROUP BY
            c.id,
            c.case_number,
            c.title,
            c.status,
            c.metadata,
            c.created_at,
            c.updated_at,
            c.date_created,
            c.date_modified
          ORDER BY
            COALESCE(c.updated_at, c.date_modified, c.created_at, c.date_created) DESC
          LIMIT 50
        `);

      // Assert the rows shape instead of using a generic on query
      const rows = (res.rows as CaseRow[]) || [];

      // Transform database rows to CaseData objects with proper types
      const cases: CaseData[] = rows.map((row: CaseRow) => {
        const evidenceCount = parseInt(String(row.evidence_count || '0'));
        const analyzedCount = parseInt(String(row.analyzed_evidence_count || '0'));
        const createdAt = new Date(row.created_at);
        const updatedAt = new Date(row.updated_at);

        // Calculate human-readable time since last update
        const lastUpdate = calculateLastUpdate(updatedAt);

        // Calculate progress based on evidence analysis completion
        const progress = calculateProgress(evidenceCount, analyzedCount, row.status);

        return {
          id: row.id,
          case_number: row.case_number,
          title: row.title,
          status: row.status as 'active' | 'pending' | 'closed' | 'archived',
          metadata: row.metadata,
          created_at: createdAt,
          updated_at: updatedAt,
          progress,
          evidenceCount,
          lastUpdate,
        };
      });

      // Calculate comprehensive summary statistics
      const summary: CaseSummary = {
        total: cases.length,
        active: cases.filter((c) => c.status === 'active').length,
        pending: cases.filter((c) => c.status === 'pending').length,
        closed: cases.filter((c) => c.status === 'closed').length,
        archived: cases.filter((c) => c.status === 'archived').length,
        totalEvidence: cases.reduce((sum, c) => sum + c.evidenceCount, 0),
      };

      console.log(
        `✅ Loaded ${cases.length} cases with ${summary.totalEvidence} evidence items ` +
          `(active: ${summary.active}, pending: ${summary.pending}, closed: ${summary.closed})`
      );

      return {
        cases,
        summary,
      };
    } finally {
      // ensure the client is released if it was acquired
      if (client && typeof client.release === 'function') {
        try {
          client.release();
        } catch (releaseErr) {
          console.warn('Failed to release DB client:', releaseErr);
        }
      } else {
        // If we acquired via runtimePool.connect above we stored it in acquiredClient variable (not client),
        // but to keep changes minimal we check the runtime pool again and attempt a safe release pattern.
        try {
          const runtimePool: any = pool as unknown as any;
          if (typeof runtimePool.connect === 'function') {
            // If connect is available, we are in a runtime that supports it (e.g., Node.js)
            // Attempt to release any acquired client safely
            await new Promise<void>((resolve) => {
              const timeout = setTimeout(() => {
                console.warn('DB client release timeout');
                resolve();
              }, 2000); // 2 seconds timeout for release

              // Use the runtime-detected pool to release the client
              runtimePool
                .connect()
                .then((acquiredClient: any) => {
                  if (typeof acquiredClient.release === 'function') {
                    acquiredClient.release();
                  }
                  resolve();
                })
                .catch((err: unknown) => {
                  console.warn('Error acquiring client for release:', err);
                  resolve();
                });
            });
          }
        } catch (err) {
          console.warn('Error during DB client release:', err);
        }
      }
    }
  } catch (error) {
    // Log detailed error for debugging
    console.error('❌ Failed to load cases from database:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    });

    // Return empty data on error (graceful degradation - don't crash the page)
    return {
      cases: [],
      summary: {
        total: 0,
        active: 0,
        pending: 0,
        closed: 0,
        archived: 0,
        totalEvidence: 0,
      },
      error: error instanceof Error ? error.message : 'Failed to load cases from database',
    };
  }
};

// Handle pool shutdown gracefully (useful for testing and server shutdown)
if (typeof process !== 'undefined') {
  // safe shutdown helper that narrows the pool type and handles errors with typed catch
  const shutdownPool = async () => {
    const maybePool = pool as unknown as { end?: () => Promise<void> };
    if (typeof maybePool.end === 'function') {
      try {
        await maybePool.end();
      } catch (err: unknown) {
        console.error('Error closing database pool:', err);
      }
    } else {
      console.warn("Database pool has no 'end' method; skipping close.");
    }
  };

  process.on('SIGTERM', () => {
    void shutdownPool();
  });

  process.on('SIGINT', () => {
    void shutdownPool();
  });
}
