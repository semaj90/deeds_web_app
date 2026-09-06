// Read-only diagnostic for parent-atlas-pass-fabric PF4D/PF4F: aggregate
// (not just sampled) population rate of pass_identity_hash/source_revision/
// pass_revision on analysis_pass_results. Fills a gap report-pass-fabric-proof.mts
// doesn't cover — its samples show individual nulls but not the aggregate rate.
import 'dotenv/config';
import { db, pgRows } from '../../src/lib/server/db/client.js';
import { sql } from 'drizzle-orm';

const rows = pgRows<any>(await db.execute(sql`
  SELECT
    count(*) FILTER (WHERE pass_identity_hash IS NOT NULL) AS with_identity_hash,
    count(*) FILTER (WHERE source_revision IS NOT NULL) AS with_source_revision,
    count(*) FILTER (WHERE pass_revision IS NOT NULL) AS with_pass_revision,
    count(*) AS total,
    max(created_at) AS newest_row
  FROM analysis_pass_results;
`));
console.log(JSON.stringify(rows[0], null, 2));
process.exit(0);
