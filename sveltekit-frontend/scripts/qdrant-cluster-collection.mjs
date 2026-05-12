import { qdrant } from '../src/lib/server/vector/qdrant-manager.js';

async function main() {
  const collection = process.argv[2] || 'codebase_chunks_768';
  const k = parseInt(process.argv[3]) || 100;

  console.log(`🚀 Starting semantic clustering for collection: ${collection} (k=${k})`);
  
  try {
    const result = await qdrant.clusterCollection({
      collection,
      k,
      vectorName: 'content'
    });
    
    console.log('✅ Clustering complete!');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('❌ Clustering failed:', error);
    process.exit(1);
  }
}

main();
