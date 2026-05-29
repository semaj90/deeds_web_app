import 'dotenv/config';
import postgres from 'postgres';
import { QdrantClient } from '@qdrant/js-client-rest';
import { upsertValidated } from './lib/upsert-validated.mjs';
import { generateCachedEmbedding } from '../src/lib/ai/ollama-config';

const DATABASE_URL = process.env.DATABASE_URL;
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION_NAME = 'codemod_memories';
const EMBED_DIM = Number(process.env.EMBED_DIM ?? '384');

async function sync() {
    if (!DATABASE_URL) {
        console.error('❌ DATABASE_URL not set');
        process.exit(1);
    }

    const sql = postgres(DATABASE_URL);
    const qdrant = new QdrantClient({ url: QDRANT_URL });

    try {
        console.log('🔄 Starting Cluster Sync to Qdrant...');

        // 1. Fetch clusters from Postgres
        const clusters = await sql`
            SELECT id, cluster_id, message, code, category, affected_routes, count, file_path, embedding
            FROM error_cluster
            WHERE archived_at IS NULL;
        `;

        console.log(`📊 Found ${clusters.length} clusters to sync`);

        // 2. Ensure collection exists with correct size (384)
        try {
            await qdrant.getCollection(COLLECTION_NAME);
        } catch {
            console.log(`📝 Creating Qdrant collection: ${COLLECTION_NAME}`);
            await qdrant.createCollection(COLLECTION_NAME, {
                vectors: { size: 384, distance: 'Cosine' }
            });
        }

        let syncedCount = 0;
        let embeddedCount = 0;

        for (const cluster of clusters) {
          let vector = cluster.embedding;

          // 3. Generate embedding if missing in Postgres
          if (!vector) {
            console.log(`🧠 Generating missing embedding for cluster: ${cluster.cluster_id}`);
            try {
              vector = await generateCachedEmbedding(cluster.message);
              // Save back to Postgres
              await sql`
                        UPDATE error_cluster
                        SET embedding = ${JSON.stringify(vector)}::vector
                        WHERE id = ${cluster.id};
                    `;
              embeddedCount++;
            } catch (e) {
              console.error(`❌ Failed to embed cluster ${cluster.cluster_id}:`, e);
              continue;
            }
          } else if (typeof vector === 'string') {
            vector = JSON.parse(vector);
          }

          // 4. Upsert to Qdrant
          const payload = {
            cluster_id: cluster.cluster_id,
            error_code: cluster.code,
            message: cluster.message,
            category: cluster.category || 'unknown',
            affected_routes: cluster.affected_routes || [],
            occurrence_count: cluster.count,
            file_path: cluster.file_path,
            source: 'error_cluster_sync',
            timestamp: new Date().toISOString(),
            content: `Error ${cluster.code}: ${cluster.message}\nFile: ${cluster.file_path}`,
          };

          // Validate embedding before upsert
          if (!Array.isArray(vector) || vector.length !== EMBED_DIM) {
            console.warn(
              `⚠️ Skipping cluster ${cluster.cluster_id}: invalid embedding dim ${Array.isArray(vector) ? vector.length : typeof vector} (expected ${EMBED_DIM})`
            );
            continue;
          }

          await upsertValidated({
            client: qdrant,
            collection: COLLECTION_NAME,
            points: [{ id: cluster.id, vector: vector, payload }],
            expectedDim: EMBED_DIM,
            wait: true,
          });

          syncedCount++;
          if (syncedCount % 10 === 0) console.log(`✅ Synced ${syncedCount}/${clusters.length}...`);
        }

        console.log('\n✨ Sync Summary:');
        console.log(`   Total synced: ${syncedCount}`);
        console.log(`   New embeddings saved to DB: ${embeddedCount}`);
        console.log(`   Qdrant collection: ${COLLECTION_NAME}`);

    } catch (error) {
        console.error('❌ Sync failed:', error);
    } finally {
        await sql.end();
    }
}

sync().catch(console.error);
