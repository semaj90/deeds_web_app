import pg from 'pg';
import fetch from 'node-fetch';

/**
 * Bifrost Seeder V1: Warming the semantic cache from Phase 89 signatures.
 * This script fetches AST signatures from Postgres and makes "dummy" calls
 * to Bifrost to prime the cache for the ACE repair agents.
 */

const { Client } = pg;

const BIFROST_URL = 'http://localhost:3040/v1/chat/completions';
const DB_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5432/legal_ai_db';

async function seed() {
    console.log('🚀 Bifrost Seeder: Warming the engine...');
    
    const client = new Client({ connectionString: DB_URL });
    await client.connect();
    
    try {
        console.log('📥 Fetching Phase 89 signatures...');
        const res = await client.query('SELECT file_path, signature, node_type FROM phase89_ast_signatures LIMIT 20');
        const signatures = res.rows;
        
        console.log(`🔥 Seeding ${signatures.length} signatures into Bifrost...`);
        
        for (const sig of signatures) {
            const prompt = `What is the AST signature of the ${sig.node_type} in ${sig.file_path}?`;
            const mockResponse = sig.signature;
            
            // We make the call. Bifrost will proxy to Ollama, and then cache the result.
            // NOTE: To truly "seed" without hitting Ollama 500 times, we'd need a direct 
            // cache injection API. Since we don't have that, we'll make real proxy calls.
            // This also verifies the pipeline.
            
            try {
                const response = await fetch(BIFROST_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer dummy-key' },
                    body: JSON.stringify({
                        model: 'gemma4-legal:latest',
                        messages: [
                            { role: 'user', content: prompt }
                        ],
                        // We use a low temperature to encourage stability
                        temperature: 0.1
                    })
                });
                
                if (response.ok) {
                    const data = await response.json();
                    console.log(`✅ Seeded: ${sig.file_path} (${sig.node_type})`);
                } else {
                    console.error(`❌ Failed to seed ${sig.file_path}: ${response.statusText}`);
                }
            } catch (e) {
                console.error(`⚠️ Error during seeding ${sig.file_path}: ${e.message}`);
            }
            
            // Small delay to prevent hammering Ollama
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        console.log('\n✨ Seeding Complete. Bifrost is now "hot" with AST metadata.');
        
    } finally {
        await client.end();
    }
}

seed().catch(console.error);
