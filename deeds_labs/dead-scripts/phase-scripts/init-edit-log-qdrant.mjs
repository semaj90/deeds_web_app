import { QdrantClient } from '@qdrant/js-client-rest';
import dotenv from 'dotenv';

dotenv.config();

const client = new QdrantClient({ url: process.env.QDRANT_URL || 'http://127.0.0.1:6333' });

async function initEditLogCollection() {
    const collectionName = 'phase89_edit_log';

    try {
        const collections = await client.getCollections();
        const exists = collections.collections.some(c => c.name === collectionName);

        if (exists) {
            console.log(`✅ Collection ${collectionName} already exists.`);
            return;
        }

        console.log(`Creating collection ${collectionName}...`);
        await client.createCollection(collectionName, {
            vectors: {
                size: 1024, // Using embeddinggemma:latest size
                distance: 'Cosine'
            }
        });
        console.log(`✅ Collection ${collectionName} created successfully.`);
    } catch (error) {
        console.error('❌ Error creating collection:', error);
    }
}

initEditLogCollection();
