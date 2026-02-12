import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * Pipeline V2 Happy Path Test
 *
 * Verifies the end-to-end flow:
 * 1. Upload Evidence (PDF)
 * 2. Trigger Processing Pipeline
 * 3. Verify Embedding & Indexing (via SSE)
 * 4. Perform Retrieval (Search)
 * 5. Synthesize Answer (RAG)
 */
test.describe('Legal-AI Pipeline V2 E2E', () => {
  // Unique ID for this test run to avoid collisions
  const CASE_ID = `e2e-case-${Date.now()}`;
  const EVIDENCE_ID = `ev-${Date.now()}`;
  const SAMPLE_PDF_PATH = path.join(__dirname, '../complaint.pdf'); // Located in tests/complaint.pdf

  test.beforeAll(async () => {
    // Optional: Check if API is healthy
    // const response = await request.get('/api/pipeline/health');
    // expect(response.ok()).toBeTruthy();
  });

  test('Complete Pipeline Flow', async ({ request }) => {
    // -----------------------------------------------------------------------
    // 1. Upload Document
    // -----------------------------------------------------------------------
    if (!fs.existsSync(SAMPLE_PDF_PATH)) {
      test.skip(true, 'Sample PDF not found at tests/complaint.pdf');
      return;
    }

    const pdfBuffer = fs.readFileSync(SAMPLE_PDF_PATH);

    // Multipart upload simulation
    const uploadResponse = await request.post(`/api/evidence/upload?case_id=${CASE_ID}`, {
      multipart: {
        file: {
          name: 'complaint.pdf',
          mimeType: 'application/pdf',
          buffer: pdfBuffer
        },
        meta: JSON.stringify({
           source: 'user',
           tags: ['e2e', 'test']
        })
      }
    });

    // If API isn't ready, this might fail. We assume 200 OK and JSON return.
    expect(uploadResponse.ok(), 'Upload should succeed').toBeTruthy();
    const uploadResult = await uploadResponse.json();
    const docId = uploadResult.doc_id || uploadResult.id || EVIDENCE_ID;

    console.log(`[E2E] Document Uploaded: ${docId}`);

    // -----------------------------------------------------------------------
    // 2. Trigger Pipeline Run
    // -----------------------------------------------------------------------
    const pipelineResponse = await request.post('/api/pipeline/run', {
      data: {
        doc_id: docId,
        case_id: CASE_ID,
        pipeline_config: {
           Chunking: { strategy: 'semantic', max_tokens: 512 },
           Embedding: { model: 'embeddinggemma:latest' }
        }
      }
    });

    expect(pipelineResponse.ok(), 'Pipeline trigger should succeed').toBeTruthy();
    const { job_id: jobId } = await pipelineResponse.json();
    expect(jobId).toBeDefined();

    console.log(`[E2E] Job Started: ${jobId}`);

    // -----------------------------------------------------------------------
    // 3. Monitor Progress via SSE (Simulated Poll or Real Stream)
    // -----------------------------------------------------------------------
    // Since Playwright request doesn't natively support keeping SSE open easily in a test block,
    // we might poll status endpoint if available, or just wait for 'completed' state.

    // Fallback: Poll status for up to 30 seconds
    let status = 'processing';
    for (let i = 0; i < 30; i++) {
        const statusRes = await request.get(`/api/pipeline/status/${jobId}`);
        if (statusRes.ok()) {
            const data = await statusRes.json();
            status = data.status;
            if (status === 'complete' || status === 'error') break;
        }
        await new Promise(r => setTimeout(r, 1000));
    }

    expect(status).toBe('complete');
    console.log(`[E2E] Job Complete`);

    // -----------------------------------------------------------------------
    // 4. Verify Retrieval (Qdrant)
    // -----------------------------------------------------------------------
    // Search for keywords known to be in the complaint PDF
    const searchResponse = await request.post('/api/retrieve', {
      data: {
        query: 'plaintiff', // Generic legal term
        top_k: 5,
        filters: {
            case_id: CASE_ID
        }
      }
    });

    expect(searchResponse.ok(), 'Retrieval should succeed').toBeTruthy();
    const searchResults = await searchResponse.json();

    // Expect chunks
    expect(Array.isArray(searchResults.chunks)).toBeTruthy();
    expect(searchResults.chunks.length).toBeGreaterThan(0);
    expect(searchResults.chunks[0].chunk_id).toBeDefined();

    console.log(`[E2E] Retrieval found ${searchResults.chunks.length} chunks`);

    // -----------------------------------------------------------------------
    // 5. Synthesis (Gemma3)
    // -----------------------------------------------------------------------
    const synthesizeResponse = await request.post('/api/synthesize', {
      data: {
        query: 'What are the main allegations?',
        context_chunks: searchResults.chunks, // Pass retrieved chunks directly or let backend handle RAG
        case_id: CASE_ID
      }
    });

    expect(synthesizeResponse.ok(), 'Synthesis should succeed').toBeTruthy();
    const contextPack = await synthesizeResponse.json();

    // Verify Context Pack Structure (V2 Contract)
    expect(contextPack.context_pack_version).toBe('2.0');
    expect(contextPack.pack_id).toBeDefined();
    expect(contextPack.answer).toBeDefined();
    expect(contextPack.citations).toBeDefined();
    expect(Array.isArray(contextPack.citations)).toBeTruthy();

    console.log(`[E2E] Synthesis Complete. Pack ID: ${contextPack.pack_id}`);
  });
});
