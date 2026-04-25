import dotenv from 'dotenv';
import postgres from 'postgres';

dotenv.config();

const sql = postgres(process.env.DATABASE_URL);

async function checkClusters() {
  try {
    const owner = await sql`
      SELECT tableowner FROM pg_tables WHERE tablename = 'error_clusters';
    `;
    console.log('👑 Table Owner:', owner);

    const clusters = await sql`
      SELECT id, kind, severity, member_count, error_pattern
      FROM error_clusters
      ORDER BY member_count DESC
      LIMIT 10;
    `;    console.log('🔍 Error Clusters:');
    if (clusters.length === 0) {
      console.log('   No clusters found.');
    } else {
      console.table(clusters);
    }
  } catch (err) {
    console.error('❌ Error querying clusters:', err);
  } finally {
    await sql.end();
  }
}

checkClusters();
