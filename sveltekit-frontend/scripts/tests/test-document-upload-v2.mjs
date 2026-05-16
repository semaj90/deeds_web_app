/**
 * Document Upload Integration Test V2
 * Tests document upload → embedding → Qdrant indexing with valid session
 */

const BASE_URL = process.env.PUBLIC_APP_URL ?? (process.env.TEST_BASE_URL || 'http://localhost:5173');
const SESSION_ID = '00000000-0000-0000-0000-000000000001';

// ANSI colors
const green = '\x1b[32m';
const red = '\x1b[31m';
const yellow = '\x1b[33m';
const blue = '\x1b[34m';
const reset = '\x1b[0m';

function log(message, color = reset) {
  console.log(`${color}${message}${reset}`);
}

async function testDocumentUpload() {
  log('\n📤 Test: Upload Text Document with Valid Session', blue);

  try {
    // Create a test legal document
    const testContent = `Legal Case Summary - Contract Dispute

This document contains key information about a contract dispute case.

PARTIES:
- Plaintiff: ABC Corporation
- Defendant: XYZ Industries

KEY FACTS:
1. Contract signed on January 15, 2024
2. Payment of $50,000 was due on March 1, 2024
3. Defendant failed to make payment by deadline
4. Plaintiff sent demand letter on March 15, 2024

LEGAL CLAIMS:
- Breach of Contract (UCC § 2-601)
- Damages: $50,000 principal + $5,000 interest

RELEVANT STATUTES:
- UCC § 2-601 (Perfect Tender Rule)
- State Contract Law § 15.3 (Remedies for Breach)

TIMELINE:
2024-01-15: Contract execution
2024-03-01: Payment due date
2024-03-15: Default occurred
2024-03-20: Demand letter sent

This document is part of the case file for evidence review and analysis.`;

    const blob = new Blob([testContent], { type: 'text/plain' });
    const formData = new FormData();
    formData.append('file', blob, 'contract-dispute-summary.txt');
    formData.append('sessionId', SESSION_ID);
    formData.append('caseId', 'c9b79f5d-4a5e-4e8f-8f3c-1a2b3c4d5e6f');

    const response = await fetch(`${BASE_URL}/api/documents/upload`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      log(`❌ Upload failed: ${error.error || response.statusText}`, red);
      return null;
    }

    const result = await response.json();
    log(`✅ Upload successful!`, green);
    log(`  Document ID: ${result.documentId}`, reset);
    log(`  Attachment ID: ${result.attachmentId}`, reset);
    log(`  Session ID: ${SESSION_ID}`, reset);

    return {
      documentId: result.documentId,
      attachmentId: result.attachmentId
    };
  } catch (error) {
    log(`❌ Upload error: ${error.message}`, red);
    return null;
  }
}

async function waitForEmbedding(documentId, maxWait = 60000) {
  log('\n⏳ Waiting for document embedding...', blue);

  const startTime = Date.now();
  let lastCheck = '';

  while (Date.now() - startTime < maxWait) {
    try {
      // Check Qdrant for the document chunks
      const response = await fetch('http://localhost:6333/collections/chat_documents/points/scroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filter: {
            must: [{ key: 'documentId', match: { value: documentId } }]
          },
          limit: 100,
          with_payload: true
        })
      });

      if (response.ok) {
        const data = await response.json();
        const chunks = data.result?.points || [];

        if (chunks.length > 0) {
          log(`✅ Document embedded in Qdrant!`, green);
          log(`  Chunks indexed: ${chunks.length}`, reset);
          log(`  Sample chunk text: "${chunks[0].payload.text.slice(0, 100)}..."`, reset);
          log(`  Sample chunk metadata:`, reset);
          log(`    - chunkIndex: ${chunks[0].payload.chunkIndex}`, reset);
          log(`    - totalChunks: ${chunks[0].payload.totalChunks}`, reset);
          log(`    - fileName: ${chunks[0].payload.fileName}`, reset);
          return true;
        }
      }

      const elapsed = Math.round((Date.now() - startTime) / 1000);
      if (elapsed % 5 === 0 && lastCheck !== `${elapsed}s`) {
        lastCheck = `${elapsed}s`;
        log(`  Waiting... (${elapsed}s elapsed)`, yellow);
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      log(`⚠️  Error checking Qdrant: ${error.message}`, yellow);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  log(`⏱️  Timeout after ${maxWait / 1000}s`, yellow);
  return false;
}

async function verifyChatAttachment(attachmentId, documentId) {
  log('\n🔍 Verify Chat Attachment Record', blue);

  try {
    const { Pool } = await import('pg');
    const pool = new Pool({
      connectionString: 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
    });

    const result = await pool.query(
      'SELECT embedding_status, qdrant_id, file_name FROM chat_document_attachments WHERE id = $1',
      [attachmentId]
    );

    if (result.rows.length === 0) {
      log(`❌ Attachment record not found`, red);
      await pool.end();
      return false;
    }

    const attachment = result.rows[0];
    log(`✅ Attachment record found`, green);
    log(`  File name: ${attachment.file_name}`, reset);
    log(`  Embedding status: ${attachment.embedding_status}`, reset);
    log(`  Qdrant ID: ${attachment.qdrant_id}`, reset);

    await pool.end();
    return attachment.embedding_status === 'completed';
  } catch (error) {
    log(`❌ Database error: ${error.message}`, red);
    return false;
  }
}

async function testChatContext(sessionId) {
  log('\n💬 Test: Chat with Document Context', blue);
  log('⚠️  Full chat test requires SSE endpoint + auth', yellow);
  log('   Manual test steps:', reset);
  log('   1. Open chat UI with session: ' + sessionId, reset);
  log('   2. Send message: "What is this case about?"', reset);
  log('   3. Verify LLM response includes document excerpts', reset);
  log('   4. Check for citation like "According to contract-dispute-summary.txt"', reset);
}

async function main() {
  log('═══════════════════════════════════════════════════', blue);
  log('   Document Upload Integration Test V2', blue);
  log('   (with valid chat session)', blue);
  log('═══════════════════════════════════════════════════', blue);

  // Test 1: Upload document
  const uploadResult = await testDocumentUpload();

  if (uploadResult && uploadResult.documentId) {
    // Test 2: Wait for embedding
    const embedded = await waitForEmbedding(uploadResult.documentId);

    if (embedded && uploadResult.attachmentId) {
      // Test 3: Verify attachment record
      await verifyChatAttachment(uploadResult.attachmentId, uploadResult.documentId);
    }

    // Test 4: Chat context instructions
    await testChatContext(SESSION_ID);
  }

  log('\n✅ Document pipeline test complete!', green);
  log('\nNext steps:', blue);
  log('  1. Start chat UI: npm run dev', reset);
  log('  2. Navigate to chat with session:', reset);
  log('     http://localhost:5173/chat/' + SESSION_ID, reset);
  log('  3. Ask: "What is this case about?"', reset);
  log('  4. Verify document context is included in response', reset);
}

main().catch(console.error);
