import pg from 'pg';
const { Client } = pg;

async function run() {
    const dbUrl = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db';
    const client = new Client({ connectionString: dbUrl });
    await client.connect();
    
    console.log('✅ Connected to database!');
    
    const tables = [
        'rag_query_cache',
        'qdrant_centroid_clusters',
        'qdrant_cluster_members',
        'llm_summary_cache',
        'kag_dag_runs',
        'kag_dag_nodes',
        'kag_dag_edges',
        'directory_cluster_checkpoints'
    ];

    for (const table of tables) {
        const res = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = $1;
        `, [table]);
        
        if (res.rows.length > 0) {
            console.log(`\n📌 Table: ${table} verified (${res.rows.length} columns)`);
        } else {
            console.log(`\n❌ Table: ${table} NOT FOUND!`);
        }
    }
    
    await client.end();
}
run().catch(console.error);
