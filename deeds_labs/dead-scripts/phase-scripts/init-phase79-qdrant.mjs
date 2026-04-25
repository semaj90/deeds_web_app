import { QdrantClient } from '@qdrant/js-client-rest';

const client = new QdrantClient({ url: 'http://127.0.0.1:6333' });
const COLLECTION_NAME = 'phase78_solutions'; // Matches your script

async function init() {
  const exists = await client.collectionExists(COLLECTION_NAME);
  if (!exists) {
    console.log(`Creating collection: ${COLLECTION_NAME}`);
    await client.createCollection(COLLECTION_NAME, {
      vectors: { size: 768, distance: 'Cosine' }
    });
  } else {
    console.log(`✅ Collection ${COLLECTION_NAME} already exists.`);
  }
}
init().catch(console.error);