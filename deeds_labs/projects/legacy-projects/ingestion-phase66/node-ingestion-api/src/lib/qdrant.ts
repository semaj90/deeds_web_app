import { QdrantClient } from '@qdrant/js-client-rest';

const qdrantClient = new QdrantClient({
  url: process.env.QDRANT_URL || 'http://qdrant:6333',
  apiKey: process.env.QDRANT_API_KEY || ''
});

const COLLECTION_NAME = 'legal_documents';

export async function ensureCollectionExists() {
  try {
    // Check if collection exists
    const collections = await qdrantClient.getCollections();
    const exists = collections.collections.some(c => c.name === COLLECTION_NAME);

    if (!exists) {
      // Create collection with vector configuration
      await qdrantClient.createCollection(COLLECTION_NAME, {
        vectors: {
          size: 768, // embeddinggemma dimension
          distance: 'Cosine'
        }
      });

      console.log(`🗂️ Created Qdrant collection: ${COLLECTION_NAME}`);
    }
  } catch (error) {
    console.error('Qdrant collection creation error:', error);
    throw error;
  }
}

export async function storeDocumentChunks(chunks: any[], caseId: string) {
  try {
    await ensureCollectionExists();

    const points = chunks.map((chunk, index) => ({
      id: `${caseId}-${chunk.chunk_index}`,
      vector: chunk.embedding,
      payload: {
        case_id: caseId,
        document_id: chunk.document_id,
        chunk_index: chunk.chunk_index,
        content: chunk.content,
        page_number: chunk.page_number,
        section: chunk.section,
        tags: chunk.tags,
        metadata: chunk.metadata
      }
    }));

    await qdrantClient.upsert(COLLECTION_NAME, {
      wait: true,
      points
    });

    console.log(`🗂️ Stored ${chunks.length} chunks in Qdrant`);
  } catch (error) {
    console.error('Qdrant storage error:', error);
    throw error;
  }
}

export async function searchSimilar(queryVector: number[], limit: number = 10) {
  try {
    const searchResult = await qdrantClient.search(COLLECTION_NAME, {
      vector: queryVector,
      limit,
      with_payload: true,
      with_vector: false
    });

    return searchResult;
  } catch (error) {
    console.error('Qdrant search error:', error);
    throw error;
  }
}

export async function deleteDocumentChunks(documentId: string) {
  try {
    await qdrantClient.delete(COLLECTION_NAME, {
      filter: {
        must: [
          {
            key: 'document_id',
            match: { value: documentId }
          }
        ]
      }
    });

    console.log(`🗑️ Deleted chunks for document: ${documentId}`);
  } catch (error) {
    console.error('Qdrant delete error:', error);
    throw error;
  }
}

export async function checkQdrantConnection(): Promise<boolean> {
  try {
    await qdrantClient.getCollections();
    return true;
  } catch (error) {
    console.error('Qdrant connection check failed:', error);
    return false;
  }
}