import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db';
const sql = postgres(connectionString);

async function main() {
  try {
    const clusters = await sql`SELECT COUNT(*) as total_clusters, COUNT(file_path) as clusters_with_filepath FROM error_cluster`;
    console.log('Clusters:', clusters);

    const suggestions = await sql`SELECT COUNT(*) as total_suggestions FROM error_suggestions`;
    console.log('Suggestions:', suggestions);

    const joined = await sql`
      SELECT COUNT(*) as suggestions_with_filepath
      FROM error_suggestions es
      JOIN error_cluster ec ON es.cluster_id = ec.cluster_id
      WHERE ec.file_path IS NOT NULL
    `;
    console.log('Suggestions linked to FilePath:', joined);

    const sample = await sql`SELECT cluster_id, file_path FROM error_cluster WHERE file_path IS NOT NULL LIMIT 5`;
    console.log('Sample Clusters with FilePath:', sample);

  } catch (e) {
    console.error(e);
  }
  process.exit(0);
}

main();