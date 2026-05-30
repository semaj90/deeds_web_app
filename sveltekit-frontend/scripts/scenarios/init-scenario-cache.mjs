import fetch from 'node-fetch';

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION = 'scenario_cache';
const DIM = 768;

async function run() {
  console.log(`Checking Qdrant collection: ${COLLECTION} at ${QDRANT_URL}`);
  const url = `${QDRANT_URL}/collections/${COLLECTION}`;
  try {
    const resp = await fetch(url);
    if (resp.status === 200) {
      console.log(`Collection ${COLLECTION} already exists.`);
      return;
    }
    
    console.log(`Creating collection ${COLLECTION}...`);
    const body = {
      vectors: { size: DIM, distance: 'Cosine' },
      optimizers_config: { indexing_threshold: 100 }
    };
    const createResp = await fetch(url, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!createResp.ok) {
      throw new Error(`Failed to create collection: ${await createResp.text()}`);
    }
    console.log(`Collection ${COLLECTION} created successfully!`);
  } catch (err) {
    console.error(`Error initializing Qdrant collection: ${err.message}`);
    process.exit(1);
  }
}

run();
